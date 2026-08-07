import crypto from 'crypto';
import axios from 'axios';
import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { sendMail } from '../lib/mailer';
import { DEFAULT_CONSENT_TYPES } from '../lib/consentTypes';
import { buildConsentEmailHtml } from '../lib/emailTemplates/consentEmail';
import { buildConsentPdf } from '../lib/consentPdf';
import { cleanRut, isValidRut } from '../utils/rut';

// El tipo de consentimiento puede tener un PDF propio de la clínica (reemplaza
// el texto legal). Si el consentimiento tiene una copia congelada de ese PDF
// (`pdfSnapshotUrl`), se usa esa directamente; si no, se genera con pdfkit a
// partir del texto (comportamiento de siempre).
async function resolveConsentPdfBuffer(
  params: { pdfSnapshotUrl?: string | null } & Parameters<typeof buildConsentPdf>[0]
): Promise<Buffer> {
  if (params.pdfSnapshotUrl) {
    const { data } = await axios.get<ArrayBuffer>(params.pdfSnapshotUrl, { responseType: 'arraybuffer' });
    return Buffer.from(data);
  }
  return buildConsentPdf(params);
}

// Copia independiente (Cloudinary) del PDF vivo del ConsentType al momento de
// enviar/firmar, para que un reemplazo posterior no altere este consentimiento
// ya registrado. Best-effort: si falla, el consentimiento sigue su curso con
// el texto (contentSnapshot) como respaldo.
async function snapshotConsentTypePdf(pdfUrl: string, clinicaId: string, consentId: string): Promise<string | null> {
  try {
    const result = await cloudinary.uploader.upload(pdfUrl, {
      resource_type: 'raw',
      folder: `dentalcloud/${clinicaId}/consentimientos-firmados`,
      public_id: consentId,
      overwrite: true,
    });
    return result.secure_url;
  } catch (err) {
    console.error('No se pudo generar la copia del PDF del consentimiento', err);
    return null;
  }
}

// Envío best-effort del PDF formal al paciente tras firmar — si falla (correo
// caído, logo inalcanzable, etc.) se registra el error pero no se revierte ni
// se falla la respuesta HTTP: el consentimiento ya quedó registrado igual.
async function sendSignedConsentPdf(params: {
  clinica: { name: string; logoUrl: string | null };
  patient: { firstName: string; lastName: string; rut: string; email: string | null };
  consentType: { name: string };
  consent: Parameters<typeof buildConsentPdf>[0]['consent'] & { pdfSnapshotUrl?: string | null };
}) {
  if (!params.patient.email) return;
  try {
    const pdfBuffer = await resolveConsentPdfBuffer({
      pdfSnapshotUrl: params.consent.pdfSnapshotUrl,
      clinica: params.clinica,
      patient: params.patient,
      consentType: params.consentType,
      consent: params.consent,
    });
    await sendMail({
      to: params.patient.email,
      subject: `Consentimiento firmado: ${params.consentType.name} – ${params.clinica.name}`,
      html: `<p>Adjuntamos el documento de consentimiento &ldquo;${params.consentType.name}&rdquo; que acabas de firmar en ${params.clinica.name}.</p>`,
      attachments: [
        {
          filename: `consentimiento-${params.consentType.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
          contentBytes: pdfBuffer.toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    console.error('No se pudo enviar el PDF del consentimiento firmado', err);
  }
}

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
  const patient = await prisma.patient.findUnique({ where: { id: req.params.patientId }, select: { clinicaId: true } });
  if (!patient || patient.clinicaId !== req.user!.clinicaId) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

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
  if (!consentType || consentType.clinicaId !== req.user!.clinicaId) {
    return res.status(404).json({ error: 'Tipo de consentimiento no encontrado' });
  }
  return res.json({ text: consentType.legalText, pdfUrl: consentType.pdfUrl });
}

export async function send(req: Request, res: Response) {
  const { patientId, consentTypeId } = req.body as { patientId?: string; consentTypeId?: string };
  if (!patientId || !consentTypeId) {
    return res.status(400).json({ error: 'patientId y consentTypeId son requeridos' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.clinicaId !== req.user!.clinicaId) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  if (!patient.email) {
    return res.status(400).json({ error: 'El paciente no tiene un correo registrado' });
  }
  const consentType = await prisma.consentType.findUnique({ where: { id: consentTypeId } });
  if (!consentType || consentType.clinicaId !== patient.clinicaId) {
    return res.status(404).json({ error: 'Tipo de consentimiento no encontrado' });
  }
  const clinica = await prisma.clinica.findUnique({ where: { id: patient.clinicaId } });

  const token = crypto.randomBytes(32).toString('hex');
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const signUrl = `${getAppBaseUrl()}/consentimiento/${token}`;

  try {
    await sendMail({
      to: patient.email,
      subject: `Consentimiento: ${consentType.name} – fordentcloud`,
      html: buildConsentEmailHtml({
        patientFirstName: patient.firstName,
        consentTypeName: consentType.name,
        signUrl,
        expiresAt,
        clinicaNombre: clinica?.name ?? 'fordentcloud',
        clinicaLogoUrl: clinica?.logoUrl,
      }),
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

  if (consentType.pdfUrl) {
    const pdfSnapshotUrl = await snapshotConsentTypePdf(consentType.pdfUrl, patient.clinicaId, consent.id);
    if (pdfSnapshotUrl) {
      await prisma.consent.update({ where: { id: consent.id }, data: { pdfSnapshotUrl } });
    }
  }

  return res.status(201).json({
    consentTypeId,
    status: consent.status,
    sentAt: consent.sentAt,
    expiresAt: consent.expiresAt,
  });
}

async function findConsentByToken(token: string) {
  return prisma.consent.findUnique({
    where: { token },
    include: { consentType: true, patient: true, clinica: true },
  });
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
    pdfUrl: consent.pdfSnapshotUrl ?? null,
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

  if (updated.status === 'firmado') {
    await sendSignedConsentPdf({
      clinica: consent.clinica,
      patient: consent.patient,
      consentType: consent.consentType,
      consent: updated,
    });
  }

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
  if (!patient || patient.clinicaId !== req.user!.clinicaId) {
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

  let finalConsent = updated;
  if (consentType.pdfUrl && !existing?.pdfSnapshotUrl) {
    const pdfSnapshotUrl = await snapshotConsentTypePdf(consentType.pdfUrl, patient.clinicaId, updated.id);
    if (pdfSnapshotUrl) {
      finalConsent = await prisma.consent.update({ where: { id: updated.id }, data: { pdfSnapshotUrl } });
    }
  }

  if (finalConsent.status === 'firmado') {
    const clinica = await prisma.clinica.findUnique({ where: { id: patient.clinicaId } });
    if (clinica) {
      await sendSignedConsentPdf({ clinica, patient, consentType, consent: finalConsent });
    }
  }

  return res.json({ status: finalConsent.status, respondedAt: finalConsent.respondedAt });
}

// Genera y descarga el PDF formal del consentimiento en cualquier momento
// (firmado, rechazado o incluso pendiente) — no depende del envío por correo.
export async function getPdf(req: Request<{ id: string }>, res: Response) {
  const consent = await prisma.consent.findUnique({
    where: { id: req.params.id },
    include: { consentType: true, patient: true, clinica: true },
  });
  if (!consent) {
    return res.status(404).json({ error: 'Consentimiento no encontrado' });
  }
  if (req.user!.role !== 'super_admin' && consent.clinicaId !== req.user!.clinicaId) {
    return res.status(404).json({ error: 'Consentimiento no encontrado' });
  }

  const pdfBuffer = await resolveConsentPdfBuffer({
    pdfSnapshotUrl: consent.pdfSnapshotUrl,
    clinica: consent.clinica,
    patient: consent.patient,
    consentType: consent.consentType,
    consent,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="consentimiento-${consent.id}.pdf"`);
  return res.send(pdfBuffer);
}

// Sube el PDF propio de la clínica para un tipo de consentimiento, reemplazando
// el texto legal por defecto. El chequeo de clinicaId acá es lo que garantiza
// que una clínica no pueda pisar/ver el PDF de otra.
export async function uploadConsentTypePdf(req: Request<{ consentTypeId: string }>, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo PDF' });
  }

  const consentType = await prisma.consentType.findUnique({ where: { id: req.params.consentTypeId } });
  if (!consentType || consentType.clinicaId !== req.user!.clinicaId) {
    return res.status(404).json({ error: 'Tipo de consentimiento no encontrado' });
  }

  let uploadResult: { secure_url: string; public_id: string };
  try {
    uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: `dentalcloud/${consentType.clinicaId}/consentimientos-tipos` },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      );
      stream.end(file.buffer);
    });
  } catch (err) {
    console.error('Error subiendo PDF de consentimiento a Cloudinary', err);
    return res.status(502).json({ error: 'No se pudo subir el archivo. Intenta nuevamente.' });
  }

  if (consentType.pdfPublicId) {
    await cloudinary.uploader.destroy(consentType.pdfPublicId, { resource_type: 'raw' }).catch(() => {
      // Best-effort: si el PDF anterior ya no existe en Cloudinary o falla el borrado, no bloquea el reemplazo.
    });
  }

  const updated = await prisma.consentType.update({
    where: { id: consentType.id },
    data: { pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id },
  });

  return res.json({ consentType: updated });
}

// Vuelve al modo texto: borra el PDF de Cloudinary y limpia las referencias.
export async function removeConsentTypePdf(req: Request<{ consentTypeId: string }>, res: Response) {
  const consentType = await prisma.consentType.findUnique({ where: { id: req.params.consentTypeId } });
  if (!consentType || consentType.clinicaId !== req.user!.clinicaId) {
    return res.status(404).json({ error: 'Tipo de consentimiento no encontrado' });
  }

  if (consentType.pdfPublicId) {
    await cloudinary.uploader.destroy(consentType.pdfPublicId, { resource_type: 'raw' }).catch(() => {
      // Best-effort: si ya no existe en Cloudinary, igual limpiamos las referencias en la base.
    });
  }

  const updated = await prisma.consentType.update({
    where: { id: consentType.id },
    data: { pdfUrl: null, pdfPublicId: null },
  });

  return res.json({ consentType: updated });
}
