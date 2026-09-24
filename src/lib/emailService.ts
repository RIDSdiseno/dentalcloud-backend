import nodemailer from 'nodemailer';
import { sendMail as sendViaGlobalGraph } from './mailer';
import { getEmailConfigForClinica, type ResolvedEmailConfig } from './emailConfigService';
import { buildAppointmentConfirmationEmailHtml } from './emailTemplates/appointmentEmail';

// Mismo formato que ya esperaba mailer.ts (Graph): contenido en base64 —
// así los llamadores existentes (cartola, consentimiento firmado) no tienen
// que armar el adjunto distinto según a quién termine yendo el correo.
type MailAttachment = { filename: string; contentBytes: string; contentType: string };

// Capa única de envío para todo el sistema. Hoy soporta dos "providers" por
// debajo, sin exponerlos al llamador:
//  - SMTP propio de la clínica (nodemailer), si hay una ClinicaEmailConfig
//    habilitada y completa.
//  - El remitente global compartido (Microsoft Graph, soporte@rids.cl —
//    src/lib/mailer.ts, sin tocar), como fallback si la clínica no configuró
//    nada. Nunca debe faltar un correo sólo porque la clínica aún no
//    configuró su propio SMTP.
// A futuro, otros providers (Microsoft 365 OAuth, Google OAuth) se agregan
// como una rama más de `sendViaSmtp`/`sendViaGlobalGraph` sin tocar `send`.
async function sendViaSmtp(
  config: ResolvedEmailConfig,
  opts: { to: string; subject: string; html: string; attachments?: MailAttachment[] }
) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUsername, pass: config.smtpPassword },
  });
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.contentBytes,
      encoding: 'base64' as const,
      contentType: a.contentType,
    })),
  });
}

// TLDs reservados por RFC 2606 específicamente para que NUNCA resuelvan a un
// buzón real (.invalid, .test, .example) — usados por datos de prueba/demo
// (ej. pacientes fake tipo nombre.apellido.0916.1@demo-fordent.invalid). Si
// se intenta mandar ahí, Microsoft Graph lo entrega igual y rebota de vuelta
// al remitente global (soporte@rids.cl), inundándolo de "no se pudo
// entregar" — se corta acá antes de intentar, en vez de depender de que cada
// generador de datos de prueba use un dominio real.
const UNDELIVERABLE_TEST_TLDS = ['.invalid', '.test', '.example'];

function isUndeliverableTestDomain(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1] ?? '';
  return UNDELIVERABLE_TEST_TLDS.some((tld) => domain.endsWith(tld));
}

export async function send(params: {
  to: string;
  subject: string;
  html: string;
  clinicaId: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  if (isUndeliverableTestDomain(params.to)) {
    console.warn(`Correo omitido — dominio de prueba no entregable: ${params.to}`);
    return;
  }
  const config = await getEmailConfigForClinica(params.clinicaId);
  if (config) {
    await sendViaSmtp(config, params);
    return;
  }
  await sendViaGlobalGraph(params);
}

export async function sendAppointmentConfirmation(params: {
  clinicaId: string;
  patientEmail: string;
  patientFirstName: string;
  professionalName: string;
  startAt: Date;
  clinicaNombre: string;
  clinicaLogoUrl?: string | null;
  confirmUrl?: string | null;
}): Promise<void> {
  const html = buildAppointmentConfirmationEmailHtml({
    patientFirstName: params.patientFirstName,
    professionalName: params.professionalName,
    startAt: params.startAt,
    clinicaNombre: params.clinicaNombre,
    clinicaLogoUrl: params.clinicaLogoUrl,
    confirmUrl: params.confirmUrl,
  });
  await send({
    to: params.patientEmail,
    subject: `Confirmación de tu cita – ${params.clinicaNombre}`,
    html,
    clinicaId: params.clinicaId,
  });
}

// A diferencia de `send`, esto SIEMPRE prueba la configuración SMTP
// guardada de la clínica (nunca cae al remitente global) — el objetivo es
// verificar que lo que se guardó realmente funciona, no confirmar que "algo"
// puede enviar correos.
export async function sendTestEmail(params: { clinicaId: string; to: string }): Promise<void> {
  const config = await getEmailConfigForClinica(params.clinicaId);
  if (!config) {
    const error = new Error('Guarda y habilita la configuración de correo antes de enviar una prueba');
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }
  await sendViaSmtp(config, {
    to: params.to,
    subject: 'Correo de prueba — configuración de correo saliente',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #0f172a;">Configuración de correo funcionando</h2>
        <p>Este es un correo de prueba enviado desde <strong>${config.fromName}</strong> (${config.fromEmail}).</p>
        <p style="font-size: 13px; color: #64748b;">Si lo recibiste, tu configuración de correo saliente quedó correctamente configurada.</p>
      </div>
    `,
  });
}
