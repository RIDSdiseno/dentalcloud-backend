import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';

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
  if (!patient) {
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
      },
      include,
    });
    return res.status(201).json({ document });
  } catch (err) {
    console.error('Error subiendo a Cloudinary', err);
    return res.status(502).json({ error: 'No se pudo subir el archivo. Intenta nuevamente.' });
  }
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const document = await prisma.clinicalDocument.findUnique({ where: { id: req.params.id } });
  if (!document) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  const isOwnerOrAdmin = req.user!.role === 'admin' || document.uploadedById === req.user!.sub;
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
