import crypto from 'crypto';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendMail } from '../lib/mailer';
import { DEFAULT_CONSENT_TYPES } from '../lib/consentTypes';
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

// Se llama en cada listado de tipos: si a la clínica le falta alguno de los
// tipos estándar (clínica nueva, o un tipo agregado al catálogo después de que
// la clínica ya existía), lo crea. Así no depende de una migración/seed para
// que clínicas nuevas queden al día.
async function ensureDefaultConsentTypes(clinicaId: string) {
  const existing = await prisma.consentType.findMany({ where: { clinicaId }, select: { code: true } });
  const existingCodes = new Set(existing.map((c) => c.code));
  const missing = DEFAULT_CONSENT_TYPES.filter((ct) => !existingCodes.has(ct.code));
  if (missing.length === 0) return;
  await prisma.consentType.createMany({
    data: missing.map((ct) => ({ ...ct, clinicaId })),
    skipDuplicates: true,
  });
  // El texto legal de "proteccion_datos" pudo haberse sembrado vacío por la
  // migración de datos histórica; lo completa si sigue en blanco.
  await prisma.consentType.updateMany({
    where: { clinicaId, code: 'proteccion_datos', legalText: '' },
    data: { legalText: DEFAULT_CONSENT_TYPES.find((ct) => ct.code === 'proteccion_datos')!.legalText },
  });
}

export async function getTypes(req: Request, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  await ensureDefaultConsentTypes(clinicaId);
  const consentTypes = await prisma.consentType.findMany({
    where: { clinicaId, active: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ consentTypes });
}

export async function listForPatient(req: Request<{ patientId: string }>, res: Response) {
  const consents = await prisma.consent.findMany({
    where: { patientId: req.params.patientId },
    select: {
      id: true,
      consentTypeId: true,
      status: true,
      method: true,
      sentAt: true,
      expiresAt: true,
      respondedAt: true,
      signerName: true,
      signerRut: true,
    },
  });
  return res.json({ consents });
}

export async function getText(req: Request<{ consentTypeId: string }>, res: Response) {
  const consentType = await prisma.consentType.findUnique({ where: { id: req.params.consentTypeId } });
  if (!consentType) {
    return res.status(404).json({ error: 'Tipo de consentimiento no encontrado' });
  }
  return res.json({ text: consentType.legalText });
}

export async function send(req: Request, res: Response) {
  const { patientId, consentTypeId } = req.body as { patientId?: string; consentTypeId?: string };
  if (!patientId || !consentTypeId) {
    return res.status(400).json({ error: 'patientId y consentTypeId son requeridos' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  if (!patient.email) {
    return res.status(400).json({ error: 'El paciente no tiene un correo registrado' });
  }
  const consentType = await prisma.consentType.findUnique({ where: { id: consentTypeId } });
  if (!consentType || consentType.clinicaId !== patient.clinicaId) {
    return res.status(404).json({ error: 'Tipo de consentimiento no encontrado' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const signUrl = `${getAppBaseUrl()}/consentimiento/${token}`;

  try {
    await sendMail({
      to: patient.email,
      subject: `Consentimiento: ${consentType.name} – DentalCloud`,
      html: buildConsentEmailHtml({ patientFirstName: patient.firstName, signUrl, expiresAt }),
    });
  } catch (err) {
    console.error('Error enviando correo de consentimiento', err);
    return res.status(502).json({ error: 'No se pudo enviar el correo. Intenta nuevamente.' });
  }

  const consent = await prisma.consent.upsert({
    where: { patientId_consentTypeId: { patientId, consentTypeId } },
    update: {
      status: 'pendiente',
      token,
      sentAt,
      expiresAt,
      method: 'email',
      sentById: req.user!.sub,
      respondedAt: null,
      signerName: null,
      signerRut: null,
      signerIp: null,
      userAgent: null,
      contentSnapshot: consentType.legalText,
    },
    create: {
      patientId,
      consentTypeId,
      clinicaId: patient.clinicaId,
      status: 'pendiente',
      token,
      sentAt,
      expiresAt,
      method: 'email',
      sentById: req.user!.sub,
      contentSnapshot: consentType.legalText,
    },
  });

  return res.status(201).json({
    consentTypeId,
    status: consent.status,
    sentAt: consent.sentAt,
    expiresAt: consent.expiresAt,
  });
}

async function findConsentByToken(token: string) {
  return prisma.consent.findUnique({ where: { token }, include: { consentType: true, patient: true } });
}

function isExpired(consent: { expiresAt: Date | null }) {
  return !!consent.expiresAt && consent.expiresAt < new Date();
}

export async function getByToken(req: Request<{ token: string }>, res: Response) {
  const consent = await findConsentByToken(req.params.token);
  if (!consent) {
    return res.status(404).json({ error: 'Link no válido' });
  }

  if (consent.status === 'firmado' || consent.status === 'rechazado') {
    return res.status(409).json({ error: 'Este consentimiento ya fue respondido', status: consent.status });
  }

  if (isExpired(consent)) {
    if (consent.status === 'pendiente') {
      await prisma.consent.update({ where: { id: consent.id }, data: { status: 'expirado' } });
    }
    return res.status(410).json({ error: 'Este link ha vencido' });
  }

  return res.json({
    patientName: `${consent.patient.firstName} ${consent.patient.lastName}`,
    consentTypeName: consent.consentType.name,
    contentSnapshot: consent.contentSnapshot ?? consent.consentType.legalText,
    expiresAt: consent.expiresAt,
  });
}

export async function respond(req: Request<{ token: string }>, res: Response) {
  const { decision, signerName, signerRut, readConfirmed } = req.body as {
    decision?: string;
    signerName?: string;
    signerRut?: string;
    readConfirmed?: boolean;
  };

  const consent = await findConsentByToken(req.params.token);
  if (!consent) {
    return res.status(404).json({ error: 'Link no válido' });
  }
  if (consent.status === 'firmado' || consent.status === 'rechazado') {
    return res.status(409).json({ error: 'Este consentimiento ya fue respondido', status: consent.status });
  }
  if (isExpired(consent)) {
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
  const updated = await prisma.consent.update({
    where: { id: consent.id },
    data: {
      status: decision,
      respondedAt,
      signerName: signerName.trim(),
      signerRut: cleanRut(signerRut),
      signerIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    },
  });

  return res.json({ status: updated.status, respondedAt: updated.respondedAt });
}

// Firma/rechazo presencial: lo hace un miembro del staff autenticado con el
// paciente presente, sin depender del link enviado por correo.
export async function respondInPerson(
  req: Request<{ patientId: string; consentTypeId: string }>,
  res: Response
) {
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
  const consentType = await prisma.consentType.findUnique({ where: { id: req.params.consentTypeId } });
  if (!consentType || consentType.clinicaId !== patient.clinicaId) {
    return res.status(404).json({ error: 'Tipo de consentimiento no encontrado' });
  }

  const existing = await prisma.consent.findUnique({
    where: { patientId_consentTypeId: { patientId: patient.id, consentTypeId: consentType.id } },
  });
  if (existing && (existing.status === 'firmado' || existing.status === 'rechazado')) {
    return res.status(409).json({ error: 'Este consentimiento ya fue respondido', status: existing.status });
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
  const updated = await prisma.consent.upsert({
    where: { patientId_consentTypeId: { patientId: patient.id, consentTypeId: consentType.id } },
    update: {
      status: decision,
      respondedAt,
      method: 'presencial',
      signerName: signerName.trim(),
      signerRut: cleanRut(signerRut),
      signerIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      contentSnapshot: consentType.legalText,
    },
    create: {
      patientId: patient.id,
      consentTypeId: consentType.id,
      clinicaId: patient.clinicaId,
      status: decision,
      respondedAt,
      method: 'presencial',
      signerName: signerName.trim(),
      signerRut: cleanRut(signerRut),
      signerIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      contentSnapshot: consentType.legalText,
    },
  });

  return res.json({ status: updated.status, respondedAt: updated.respondedAt });
}
