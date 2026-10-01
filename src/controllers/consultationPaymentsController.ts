import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { cleanRut, isValidRut } from '../utils/rut';
import { isDocumentType, isValidDocument, normalizeDocument, PERSON_DOCUMENT_TYPES, type DocumentType } from '../utils/documento';

export async function list(req: Request, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const payments = await prisma.consultationPayment.findMany({
    where: { clinicaId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json({ payments });
}

export async function create(req: Request, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const body = req.body as {
    documentType?: string;
    rut?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    amount?: number;
    paymentMethod?: string;
  };

  const documentType: DocumentType = isDocumentType(body.documentType) ? body.documentType : 'RUT';
  if (!PERSON_DOCUMENT_TYPES.includes(documentType)) {
    return res.status(400).json({ error: 'Tipo de documento no válido' });
  }
  if (!body.rut || !isValidDocument(documentType, body.rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }
  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  }
  if (body.amount === undefined || body.amount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  const payment = await prisma.consultationPayment.create({
    data: {
      clinicaId,
      rut: normalizeDocument(documentType, body.rut),
      documentType,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: body.email?.trim() || null,
      amount: Math.round(body.amount),
      paymentMethod: body.paymentMethod?.trim() || null,
      registeredById: req.user!.sub,
    },
  });

  return res.status(201).json({ payment });
}

// Usado por el formulario de "Nuevo paciente": si el RUT ya pagó su
// consulta, se autocompletan nombre y correo (ver PatientFormModal).
// No indica nada si no hay pago — el formulario sigue igual que antes.
export async function findByRut(req: Request<{ rut: string }>, res: Response) {
  const clinicaId = req.user!.clinicaId!;
  const rut = cleanRut(req.params.rut);
  const payment = await prisma.consultationPayment.findFirst({
    where: { clinicaId, rut },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ payment: payment ?? null });
}
