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

export type ConsultationPaymentInput = {
  documentType?: string;
  rut?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  amount?: number;
  paymentMethod?: string;
};

// Lógica única de "registrar pago de consulta": la usan la pantalla (create) y
// el asistente, para que ambos validen y guarden exactamente igual (11-11-2026).
export async function createConsultationPaymentCore(clinicaId: string, userId: string, body: ConsultationPaymentInput) {
  const documentType: DocumentType = isDocumentType(body.documentType) ? body.documentType : 'RUT';
  if (!PERSON_DOCUMENT_TYPES.includes(documentType)) {
    return { status: 400, json: { error: 'Tipo de documento no válido' } };
  }
  if (!body.rut || !isValidDocument(documentType, body.rut)) {
    return { status: 400, json: { error: 'El RUT ingresado no es válido' } };
  }
  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return { status: 400, json: { error: 'Nombre y apellido son requeridos' } };
  }
  // Se redondea a pesos enteros y se valida el resultado: 0,4 redondea a 0 y
  // antes quedaba guardado un pago de $0; texto daba error 500 (10-11-2026).
  const amount = Math.round(Number(body.amount));
  if (body.amount === undefined || body.amount === null || !Number.isFinite(amount) || amount <= 0) {
    return { status: 400, json: { error: 'El monto debe ser mayor a 0' } };
  }

  const payment = await prisma.consultationPayment.create({
    data: {
      clinicaId,
      rut: normalizeDocument(documentType, body.rut),
      documentType,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: body.email?.trim() || null,
      amount,
      paymentMethod: body.paymentMethod?.trim() || null,
      registeredById: userId,
    },
  });

  return { status: 201, json: { payment } };
}

export async function create(req: Request, res: Response) {
  const out = await createConsultationPaymentCore(req.user!.clinicaId!, req.user!.sub, req.body as ConsultationPaymentInput);
  return res.status(out.status).json(out.json);
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
