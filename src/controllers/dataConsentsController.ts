import crypto from 'crypto';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendMail } from '../lib/mailer';
import { CONSENT_LEGAL_TEXT } from '../lib/consentText';
import { buildConsentEmailHtml } from '../lib/emailTemplates/consentEmail';
import { cleanRut, isValidRut } from '../utils/rut';

const CONSENT_EXPIRY_DAYS = 7;

function getAppBaseUrl() {
  const origins = (process.env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins[0] ?? 'http://localhost:5173';
}

export async function getText(req: Request, res: Response) {
  return res.json({ text: CONSENT_LEGAL_TEXT });
}

export async function send(req: Request, res: Response) {
  const { patientId } = req.body as { patientId?: string };
  if (!patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  if (!patient.email) {
    return res.status(400).json({ error: 'El paciente no tiene un correo registrado' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const signUrl = `${getAppBaseUrl()}/consentimiento/${token}`;

  try {
    await sendMail({
      to: patient.email,
      subject: 'Consentimiento de tratamiento de datos personales – DentalCloud',
      html: buildConsentEmailHtml({ patientFirstName: patient.firstName, signUrl, expiresAt }),
    });
  } catch (err) {
    console.error('Error enviando correo de consentimiento', err);
    return res.status(502).json({ error: 'No se pudo enviar el correo. Intenta nuevamente.' });
  }

  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: {
      privacyConsentStatus: 'pendiente',
      privacyConsentToken: token,
      privacyConsentSentAt: sentAt,
      privacyConsentExpiresAt: expiresAt,
      privacyConsentMethod: 'email',
      privacyConsentSentById: req.user!.sub,
      privacyConsentAt: null,
      privacyConsentSignerName: null,
      privacyConsentSignerRut: null,
      privacyConsentSignerIp: null,
      privacyConsentUserAgent: null,
    },
  });

  return res.status(201).json({
    status: updated.privacyConsentStatus,
    sentAt: updated.privacyConsentSentAt,
    expiresAt: updated.privacyConsentExpiresAt,
  });
}

async function findConsentByToken(token: string) {
  return prisma.patient.findUnique({ where: { privacyConsentToken: token } });
}

function isExpired(patient: { privacyConsentExpiresAt: Date | null }) {
  return !!patient.privacyConsentExpiresAt && patient.privacyConsentExpiresAt < new Date();
}

export async function getByToken(req: Request<{ token: string }>, res: Response) {
  const patient = await findConsentByToken(req.params.token);
  if (!patient) {
    return res.status(404).json({ error: 'Link no válido' });
  }

  if (patient.privacyConsentStatus === 'firmado' || patient.privacyConsentStatus === 'rechazado') {
    return res.status(409).json({ error: 'Este consentimiento ya fue respondido', status: patient.privacyConsentStatus });
  }

  if (isExpired(patient)) {
    if (patient.privacyConsentStatus === 'pendiente') {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { privacyConsentStatus: 'expirado' },
      });
    }
    return res.status(410).json({ error: 'Este link ha vencido' });
  }

  return res.json({
    patientName: `${patient.firstName} ${patient.lastName}`,
    contentSnapshot: CONSENT_LEGAL_TEXT,
    expiresAt: patient.privacyConsentExpiresAt,
  });
}

export async function respond(req: Request<{ token: string }>, res: Response) {
  const { decision, signerName, signerRut, readConfirmed } = req.body as {
    decision?: string;
    signerName?: string;
    signerRut?: string;
    readConfirmed?: boolean;
  };

  const patient = await findConsentByToken(req.params.token);
  if (!patient) {
    return res.status(404).json({ error: 'Link no válido' });
  }
  if (patient.privacyConsentStatus === 'firmado' || patient.privacyConsentStatus === 'rechazado') {
    return res.status(409).json({ error: 'Este consentimiento ya fue respondido', status: patient.privacyConsentStatus });
  }
  if (isExpired(patient)) {
    return res.status(410).json({ error: 'Este link ha vencido' });
  }

  if (decision !== 'firmado' && decision !== 'rechazado') {
    return res.status(400).json({ error: 'decision debe ser "firmado" o "rechazado"' });
  }
  if (!readConfirmed) {
    return res.status(400).json({ error: 'Debes confirmar que leíste el documento' });
  }
  if (!signerName?.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }
  if (!signerRut || !isValidRut(signerRut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }

  const respondedAt = new Date();
  const updated = await prisma.patient.update({
    where: { id: patient.id },
    data: {
      privacyConsentStatus: decision,
      privacyConsentAt: respondedAt,
      privacyConsentSignerName: signerName.trim(),
      privacyConsentSignerRut: cleanRut(signerRut),
      privacyConsentSignerIp: req.ip ?? null,
      privacyConsentUserAgent: req.headers['user-agent'] ?? null,
    },
  });

  return res.json({ status: updated.privacyConsentStatus, respondedAt: updated.privacyConsentAt });
}

// Firma/rechazo presencial: lo hace un miembro del staff autenticado con el
// paciente presente, sin depender del link enviado por correo.
export async function respondInPerson(req: Request<{ patientId: string }>, res: Response) {
  const { decision, signerName, signerRut, readConfirmed } = req.body as {
    decision?: string;
    signerName?: string;
    signerRut?: string;
    readConfirmed?: boolean;
  };

  const patient = await prisma.patient.findUnique({ where: { id: req.params.patientId } });
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  if (patient.privacyConsentStatus === 'firmado' || patient.privacyConsentStatus === 'rechazado') {
    return res.status(409).json({ error: 'Este consentimiento ya fue respondido', status: patient.privacyConsentStatus });
  }

  if (decision !== 'firmado' && decision !== 'rechazado') {
    return res.status(400).json({ error: 'decision debe ser "firmado" o "rechazado"' });
  }
  if (!readConfirmed) {
    return res.status(400).json({ error: 'Debes confirmar que el paciente leyó el documento' });
  }
  if (!signerName?.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }
  if (!signerRut || !isValidRut(signerRut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }

  const respondedAt = new Date();
  const updated = await prisma.patient.update({
    where: { id: patient.id },
    data: {
      privacyConsentStatus: decision,
      privacyConsentAt: respondedAt,
      privacyConsentMethod: 'presencial',
      privacyConsentSignerName: signerName.trim(),
      privacyConsentSignerRut: cleanRut(signerRut),
      privacyConsentSignerIp: req.ip ?? null,
      privacyConsentUserAgent: req.headers['user-agent'] ?? null,
    },
  });

  return res.json({ status: updated.privacyConsentStatus, respondedAt: updated.privacyConsentAt });
}
