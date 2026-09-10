import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { encryptSecret } from '../lib/emailCrypto';
import { sendTestEmail } from '../lib/emailService';

const VALID_PROVIDERS = ['smtp'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicConfig(config: {
  id: string;
  provider: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpPasswordEncrypted: string | null;
  fromEmail: string | null;
  fromName: string | null;
  enabled: boolean;
  updatedAt: Date;
} | null) {
  if (!config) return null;
  const { smtpPasswordEncrypted, ...rest } = config;
  return { ...rest, hasPassword: Boolean(smtpPasswordEncrypted) };
}

export async function getEmailSettings(req: Request, res: Response) {
  const config = await prisma.clinicaEmailConfig.findUnique({ where: { clinicaId: req.user!.clinicaId! } });
  return res.json({ emailSettings: toPublicConfig(config) });
}

export async function updateEmailSettings(req: Request, res: Response) {
  const body = req.body as {
    provider?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUsername?: string;
    smtpPassword?: string;
    fromEmail?: string;
    fromName?: string;
    enabled?: boolean;
  };

  const clinicaId = req.user!.clinicaId!;
  const existing = await prisma.clinicaEmailConfig.findUnique({ where: { clinicaId } });

  const provider = body.provider ?? existing?.provider ?? 'smtp';
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `provider debe ser uno de: ${VALID_PROVIDERS.join(', ')}` });
  }
  if (!body.fromName?.trim()) {
    return res.status(400).json({ error: 'El nombre del remitente es requerido' });
  }
  if (!body.fromEmail?.trim() || !EMAIL_REGEX.test(body.fromEmail.trim())) {
    return res.status(400).json({ error: 'El correo remitente no es válido' });
  }
  if (!body.smtpHost?.trim()) {
    return res.status(400).json({ error: 'El servidor SMTP es requerido' });
  }
  if (!Number.isInteger(body.smtpPort) || body.smtpPort! < 1 || body.smtpPort! > 65535) {
    return res.status(400).json({ error: 'El puerto SMTP debe ser un número entre 1 y 65535' });
  }
  if (!body.smtpUsername?.trim()) {
    return res.status(400).json({ error: 'El usuario SMTP es requerido' });
  }
  // La contraseña sólo es obligatoria al crear la configuración por primera
  // vez — al editar una ya existente, dejarla vacía significa "mantener la
  // actual" (nunca se re-muestra ni se re-pide innecesariamente).
  if (!existing && !body.smtpPassword?.trim()) {
    return res.status(400).json({ error: 'La contraseña SMTP es requerida' });
  }

  const data = {
    provider,
    smtpHost: body.smtpHost.trim(),
    smtpPort: body.smtpPort!,
    smtpSecure: body.smtpSecure ?? true,
    smtpUsername: body.smtpUsername.trim(),
    fromEmail: body.fromEmail.trim(),
    fromName: body.fromName.trim(),
    enabled: body.enabled ?? false,
    ...(body.smtpPassword?.trim() ? { smtpPasswordEncrypted: encryptSecret(body.smtpPassword.trim()) } : {}),
  };

  const config = await prisma.clinicaEmailConfig.upsert({
    where: { clinicaId },
    update: data,
    create: { clinicaId, ...data },
  });

  return res.json({ emailSettings: toPublicConfig(config) });
}

export async function testEmailSettings(req: Request, res: Response) {
  const { email } = req.body as { email?: string };
  if (!email?.trim() || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: 'Ingresa un correo válido para la prueba' });
  }

  try {
    await sendTestEmail({ clinicaId: req.user!.clinicaId!, to: email.trim() });
    return res.json({ sent: true });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 502;
    const message = err instanceof Error ? err.message : 'No se pudo enviar el correo de prueba';
    // Nunca se registra la contraseña/credenciales — sólo el error de envío.
    console.error('Fallo el envío del correo de prueba', { clinicaId: req.user!.clinicaId, message });
    return res.status(statusCode).json({ error: message });
  }
}
