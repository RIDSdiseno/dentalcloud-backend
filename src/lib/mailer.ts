import axios from 'axios';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const { data } = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MS_GRAPH_CLIENT_ID ?? '',
      client_secret: process.env.MS_GRAPH_CLIENT_SECRET ?? '',
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

function isAuthError(err: unknown): boolean {
  return axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403);
}

type MailAttachment = { filename: string; contentBytes: string; contentType: string };

async function sendViaGraph(
  token: string,
  opts: { to: string; subject: string; html: string; attachments?: MailAttachment[] }
) {
  const sender = process.env.MS_GRAPH_SENDER;
  await axios.post(
    `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
    {
      message: {
        subject: opts.subject,
        body: { contentType: 'HTML', content: opts.html },
        toRecipients: [{ emailAddress: { address: opts.to } }],
        ...(opts.attachments?.length
          ? {
              attachments: opts.attachments.map((a) => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: a.filename,
                contentBytes: a.contentBytes,
                contentType: a.contentType,
              })),
            }
          : {}),
      },
      saveToSentItems: true,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function sendMail(opts: { to: string; subject: string; html: string; attachments?: MailAttachment[] }) {
  const token = await getAccessToken();
  try {
    await sendViaGraph(token, opts);
  } catch (err) {
    // El token cacheado puede haber sido emitido antes de que se otorgara/cambiara
    // un permiso de la app en Azure — Graph responde 401/403 igual aunque las
    // credenciales sean válidas. Se descarta el cache y se reintenta una vez con
    // un token recién emitido, en vez de esperar a que expire (hasta ~1 hora) o
    // depender de un reinicio manual del proceso.
    if (!isAuthError(err)) throw err;
    const freshToken = await getAccessToken(true);
    await sendViaGraph(freshToken, opts);
  }
}
