import prisma from './prisma';
import { decryptSecret } from './emailCrypto';

export type ResolvedEmailConfig = {
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
};

// Devuelve la config SMTP propia de la clínica sólo si existe, está
// habilitada y tiene los campos mínimos para armar un transporter — si
// falta cualquiera de esos, se trata como "sin configurar" (null) para que
// el llamador use el remitente global en vez de fallar.
export async function getEmailConfigForClinica(clinicaId: string): Promise<ResolvedEmailConfig | null> {
  const config = await prisma.clinicaEmailConfig.findUnique({ where: { clinicaId } });
  if (!config || !config.enabled) return null;
  if (!config.smtpHost || !config.smtpPort || !config.smtpUsername || !config.smtpPasswordEncrypted) return null;
  if (!config.fromEmail || !config.fromName) return null;

  return {
    provider: config.provider,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    smtpUsername: config.smtpUsername,
    smtpPassword: decryptSecret(config.smtpPasswordEncrypted),
    fromEmail: config.fromEmail,
    fromName: config.fromName,
  };
}
