import axios from 'axios';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
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

export async function sendMail(opts: { to: string; subject: string; html: string }) {
  const token = await getAccessToken();
  const sender = process.env.MS_GRAPH_SENDER;

  await axios.post(
    `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
    {
      message: {
        subject: opts.subject,
        body: { contentType: 'HTML', content: opts.html },
        toRecipients: [{ emailAddress: { address: opts.to } }],
      },
      saveToSentItems: true,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}
