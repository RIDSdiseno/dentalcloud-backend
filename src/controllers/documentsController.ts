import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { belongsToRequesterClinica } from '../lib/tenantGuard';
import { buildExamRequestPdf } from '../lib/examRequestPdf';

export const DOCUMENT_CATEGORIES = [
  'receta',
  'derivacion',
  'imagen',
  'archivo',
  'alta',
  'solicitud_laboratorio',
  'documento_pabellon',
  'solicitud_pabellon',
];

const include = {
  uploadedBy: { select: { id: true, name: true } },
} as const;

export async function list(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;

  const documents = await prisma.clinicalDocument.findMany({
    where: { patientId, ...(category ? { category } : {}) },
    include,
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ documents });
}

export async function upload(req: Request, res: Response) {
  const body = req.body as { patientId?: string; category?: string; description?: string };
  const file = req.file;

  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }
  if (!body.category || !DOCUMENT_CATEGORIES.includes(body.category)) {
    return res.status(400).json({ error: `category debe ser uno de: ${DOCUMENT_CATEGORIES.join(', ')}` });
  }
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient || !belongsToRequesterClinica(patient, req)) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({
      error: 'La subida de documentos no está configurada. Falta CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en el servidor.',
    });
  }

  try {
    const uploadResult = await new Promise<{ secure_url: string; public_id: string; resource_type: string }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto', folder: `dentalcloud/${body.patientId}/${body.category}` },
          (error, result) => {
            if (error || !result) return reject(error);
            resolve(result as { secure_url: string; public_id: string; resource_type: string });
          }
        );
        stream.end(file.buffer);
      }
    );

    const document = await prisma.clinicalDocument.create({
      data: {
        patientId: body.patientId,
        uploadedById: req.user!.sub,
        category: body.category,
        fileName: file.originalname,
        fileUrl: uploadResult.secure_url,
        resourceType: uploadResult.resource_type,
        publicId: uploadResult.public_id,
        description: body.description?.trim() || null,
        clinicaId: req.user!.clinicaId!,
      },
      include,
    });
    return res.status(201).json({ document });
  } catch (err) {
    console.error('Error subiendo a Cloudinary', err);
    return res.status(502).json({ error: 'No se pudo subir el archivo. Intenta nuevamente.' });
  }
}

// Etapa 04 (reunión 2/9 con Urbina): bifurcación del juicio clínico — cuando
// el médico marca que el paciente "necesita exámenes previos", este endpoint
// genera la receta de exámenes en PDF, la sube a Cloudinary y la deja como
// un ClinicalDocument más (categoría solicitud_laboratorio, ya existente),
// visible en Documentos Clínicos igual que cualquier otro archivo.
export async function createExamRequest(req: Request<{ id: string }>, res: Response) {
  const body = req.body as { exams?: string; notes?: string };
  if (!body.exams?.trim()) {
    return res.status(400).json({ error: 'Debes indicar qué exámenes se solicitan' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !belongsToRequesterClinica(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const [clinica, professional] = await Promise.all([
    prisma.clinica.findUnique({ where: { id: req.user!.clinicaId! }, select: { name: true, logoUrl: true } }),
    prisma.user.findUnique({ where: { id: req.user!.sub }, select: { name: true } }),
  ]);
  if (!clinica) {
    return res.status(404).json({ error: 'Clínica no encontrada' });
  }

  const createdAt = new Date();
  const pdfBuffer = await buildExamRequestPdf({
    clinica,
    patient: { firstName: patient.firstName, lastName: patient.lastName, rut: patient.rut, birthDate: patient.birthDate },
    professional,
    exams: body.exams.trim(),
    notes: body.notes?.trim() || null,
    createdAt,
  });

  try {
    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', format: 'pdf', folder: `dentalcloud/${patient.id}/solicitud_laboratorio` },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      );
      stream.end(pdfBuffer);
    });

    const document = await prisma.clinicalDocument.create({
      data: {
        patientId: patient.id,
        uploadedById: req.user!.sub,
        category: 'solicitud_laboratorio',
        fileName: `solicitud-examenes-${createdAt.toISOString().slice(0, 10)}.pdf`,
        fileUrl: uploadResult.secure_url,
        resourceType: 'raw',
        publicId: uploadResult.public_id,
        description: body.exams.trim(),
        clinicaId: req.user!.clinicaId!,
      },
      include,
    });
    return res.status(201).json({ document });
  } catch (err) {
    console.error('Error generando/subiendo la solicitud de exámenes', err);
    return res.status(502).json({ error: 'No se pudo generar la solicitud de exámenes. Intenta nuevamente.' });
  }
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const document = await prisma.clinicalDocument.findUnique({ where: { id: req.params.id } });
  if (!document || !belongsToRequesterClinica(document, req)) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  const isOwnerOrAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin' || document.uploadedById === req.user!.sub;
  if (!isOwnerOrAdmin) {
    return res.status(403).json({ error: 'Solo quien subió el documento o un administrador puede eliminarlo' });
  }

  try {
    await cloudinary.uploader.destroy(document.publicId, { resource_type: document.resourceType });
  } catch (err) {
    console.error('Error eliminando de Cloudinary', err);
  }

  await prisma.clinicalDocument.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
