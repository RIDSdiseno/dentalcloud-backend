import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { syncAppointmentToFederation } from '../lib/federationSync';
import { sendAppointmentConfirmation } from '../lib/emailService';
import { belongsToRequesterClinica } from '../lib/tenantGuard';

type AppointmentInput = {
  chairId?: string;
  patientId?: string;
  professionalId?: string;
  startAt?: string;
  endAt?: string;
  notes?: string;
  type?: string;
  // Si viene, la cita nace de tomar una hora publicada ("Agregar horas
  // disponibles") — chairId/professionalId/startAt/endAt se ignoran y se
  // usan los de la hora publicada, nunca los que mande el cliente.
  openSlotId?: string;
};

type UrgencyInput = {
  patientId?: string;
  professionalId?: string;
  motivoUrgencia?: string;
  triageLevel?: string;
  durationMinutes?: number;
};

const APPOINTMENT_TYPES = ['cita', 'control'];
const TRIAGE_LEVELS = ['leve', 'moderada', 'grave'];
const DEFAULT_URGENCY_DURATION_MINUTES = 30;

async function sendAppointmentBookedEmail(appointment: {
  clinicaId: string;
  startAt: Date;
  patient: { firstName: string; email: string | null };
  professional: { name: string } | null;
}) {
  if (!appointment.patient.email) return;
  const clinica = await prisma.clinica.findUnique({
    where: { id: appointment.clinicaId },
    select: { name: true, logoUrl: true },
  });
  // La resolución de remitente (SMTP propio de la clínica vs. Graph global)
  // vive en EmailService — este sitio de llamada no sabe ni le importa cuál
  // de los dos se terminó usando.
  await sendAppointmentConfirmation({
    clinicaId: appointment.clinicaId,
    patientEmail: appointment.patient.email,
    patientFirstName: appointment.patient.firstName,
    professionalName: appointment.professional?.name ?? 'Por confirmar',
    startAt: appointment.startAt,
    clinicaNombre: clinica?.name ?? 'fordentcloud',
    clinicaLogoUrl: clinica?.logoUrl,
  });
}

const include = {
  patient: {
    select: { id: true, rut: true, firstName: true, lastName: true, phone: true, email: true },
  },
  professional: {
    select: { id: true, name: true },
  },
  receivedBy: {
    select: { id: true, name: true },
  },
  chair: {
    select: { id: true, number: true, name: true },
  },
} as const;

export async function list(req: Request, res: Response) {
  const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
  const fromParam = typeof req.query.from === 'string' ? req.query.from : null;
  const toParam = typeof req.query.to === 'string' ? req.query.to : null;
  const chairId = typeof req.query.chairId === 'string' ? req.query.chairId : undefined;
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  const mineOnly = req.query.mine === 'true';

  let rangeStart: Date | undefined;
  let rangeEnd: Date | undefined;

  if (dateParam) {
    rangeStart = new Date(`${dateParam}T00:00:00`);
    rangeEnd = new Date(`${dateParam}T23:59:59.999`);
  } else if (fromParam && toParam) {
    rangeStart = new Date(`${fromParam}T00:00:00`);
    rangeEnd = new Date(`${toParam}T23:59:59.999`);
  } else if (!patientId) {
    return res.status(400).json({ error: 'Se requiere date, from y to, o patientId' });
  }

  if (rangeStart && (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd!.getTime()))) {
    return res.status(400).json({ error: 'Fecha inválida' });
  }

  const restrictToOwn = mineOnly && req.user!.role !== 'admin';

  const appointments = await prisma.appointment.findMany({
    where: {
      clinicaId: req.user!.clinicaId!,
      ...(rangeStart ? { startAt: { gte: rangeStart, lte: rangeEnd } } : {}),
      ...(patientId ? { patientId } : { status: { not: 'cancelada' } }),
      ...(chairId ? { chairId } : {}),
      ...(restrictToOwn ? { professionalId: req.user!.sub } : {}),
    },
    include,
    orderBy: { startAt: patientId && !rangeStart ? 'desc' : 'asc' },
  });
  return res.json({ appointments });
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function create(req: Request, res: Response) {
  const body = req.body as AppointmentInput;

  if (body.openSlotId) {
    return createFromOpenSlot(req, res, body.openSlotId, body.patientId, body.notes, body.type);
  }

  if (!body.chairId || !body.patientId || !body.startAt || !body.endAt) {
    return res.status(400).json({ error: 'chairId, patientId, startAt y endAt son requeridos' });
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return res.status(400).json({ error: 'El rango de horario ingresado no es válido' });
  }

  if (body.type && !APPOINTMENT_TYPES.includes(body.type)) {
    return res.status(400).json({ error: `El tipo debe ser uno de: ${APPOINTMENT_TYPES.join(', ')}` });
  }

  const [chair, patient] = await Promise.all([
    prisma.chair.findUnique({ where: { id: body.chairId } }),
    prisma.patient.findUnique({ where: { id: body.patientId } }),
  ]);
  if (!chair || !chair.active) {
    return res.status(400).json({ error: 'El sillón seleccionado no existe o no está activo' });
  }
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId = req.user!.sub;
  if (req.user!.role === 'admin' && body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional) {
      return res.status(400).json({ error: 'El profesional seleccionado no existe' });
    }
    professionalId = body.professionalId;
  }

  const overlapping = await prisma.appointment.findFirst({
    where: {
      chairId: body.chairId,
      status: { not: 'cancelada' },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (overlapping) {
    return res.status(409).json({ error: 'Ese sillón ya tiene una cita en ese horario' });
  }

  const appointment = await prisma.appointment.create({
    data: {
      chairId: body.chairId,
      patientId: body.patientId,
      professionalId,
      startAt,
      endAt,
      notes: body.notes?.trim() || null,
      type: body.type || 'cita',
      clinicaId: req.user!.clinicaId!,
    },
    include,
  });

  syncAppointmentToFederation(appointment).catch((err) => {
    console.error('No se pudo sincronizar la cita recién creada con Dental-Demo-Back', err);
  });

  // Best-effort: avisa al paciente por correo el día/hora y con qué
  // profesional quedó agendado. No bloquea ni falla la creación si el
  // paciente no tiene correo registrado o si el envío falla.
  sendAppointmentBookedEmail(appointment).catch((err) => {
    console.error('No se pudo enviar el correo de confirmación de la cita', err);
  });

  return res.status(201).json({ appointment });
}

// Toma una hora publicada ("Agregar horas disponibles") y la convierte en una
// cita real — usado tanto por "Seleccionar cita ya postulada" (staff) como,
// en el portal de pacientes, por el propio paciente. El sillón/profesional/
// horario SIEMPRE salen de la hora publicada, nunca de lo que mande el
// cliente, para que nadie pueda "tomar" una hora pero inyectar un horario
// distinto al que en verdad se publicó.
async function createFromOpenSlot(
  req: Request,
  res: Response,
  openSlotId: string,
  patientId: string | undefined,
  notes: string | undefined,
  type: string | undefined
) {
  if (!patientId) {
    return res.status(400).json({ error: 'Selecciona o crea un paciente para tomar esta hora' });
  }
  if (type && !APPOINTMENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `El tipo debe ser uno de: ${APPOINTMENT_TYPES.join(', ')}` });
  }

  const clinicaId = req.user!.clinicaId!;

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${openSlotId}))`;

      const [openSlot, patient] = await Promise.all([
        tx.openSlot.findUnique({ where: { id: openSlotId } }),
        tx.patient.findUnique({ where: { id: patientId } }),
      ]);
      if (!openSlot || openSlot.clinicaId !== clinicaId) {
        throw new HttpError(404, 'Hora publicada no encontrada');
      }
      if (openSlot.status !== 'abierta') {
        throw new HttpError(409, 'Esta hora ya no está disponible, elige otra');
      }
      if (!patient || patient.clinicaId !== clinicaId) {
        throw new HttpError(400, 'El paciente seleccionado no existe');
      }

      const created = await tx.appointment.create({
        data: {
          chairId: openSlot.chairId,
          patientId,
          professionalId: openSlot.professionalId,
          startAt: openSlot.startAt,
          endAt: openSlot.endAt,
          notes: notes?.trim() || null,
          type: type || 'cita',
          clinicaId,
        },
        include,
      });

      await tx.openSlot.update({ where: { id: openSlot.id }, data: { status: 'tomada', appointmentId: created.id } });

      return created;
    });

    syncAppointmentToFederation(appointment).catch((err) => {
      console.error('No se pudo sincronizar la cita recién creada con Dental-Demo-Back', err);
    });
    sendAppointmentBookedEmail(appointment).catch((err) => {
      console.error('No se pudo enviar el correo de confirmación de la cita', err);
    });

    return res.status(201).json({ appointment });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('Error tomando hora publicada', err);
    return res.status(500).json({ error: 'No se pudo agendar la cita' });
  }
}

// Circuito de Urgencia: entra directo, sin agenda previa — el propio endpoint
// busca el primer sillón libre AHORA (en vez de que alguien elija sillón y
// horario a mano) y la cita nace ya en "llego", porque el paciente ya está
// físicamente ahí. De ahí en más sigue el mismo circuito clínico de siempre
// (Pasar a atención → Terminar cita).
export async function createUrgencia(req: Request, res: Response) {
  const body = req.body as UrgencyInput;

  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }
  if (!body.motivoUrgencia?.trim()) {
    return res.status(400).json({ error: 'El motivo de la urgencia es requerido' });
  }
  if (body.triageLevel && !TRIAGE_LEVELS.includes(body.triageLevel)) {
    return res.status(400).json({ error: `El nivel de triage debe ser uno de: ${TRIAGE_LEVELS.join(', ')}` });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId: string | null = null;
  if (body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional) {
      return res.status(400).json({ error: 'El profesional seleccionado no existe' });
    }
    professionalId = body.professionalId;
  }

  const durationMinutes =
    body.durationMinutes && body.durationMinutes > 0 ? body.durationMinutes : DEFAULT_URGENCY_DURATION_MINUTES;
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  const chairs = await prisma.chair.findMany({
    where: { clinicaId: req.user!.clinicaId!, active: true },
    orderBy: { number: 'asc' },
  });
  if (chairs.length === 0) {
    return res.status(409).json({ error: 'No hay sillones activos en esta clínica' });
  }

  const overlapping = await prisma.appointment.findMany({
    where: {
      chairId: { in: chairs.map((c) => c.id) },
      status: { not: 'cancelada' },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { chairId: true },
  });
  const busyChairIds = new Set(overlapping.map((a) => a.chairId));
  const freeChair = chairs.find((c) => !busyChairIds.has(c.id));
  if (!freeChair) {
    return res.status(409).json({ error: 'No hay ningún sillón disponible en este momento' });
  }

  const appointment = await prisma.appointment.create({
    data: {
      chairId: freeChair.id,
      patientId: body.patientId,
      professionalId,
      startAt,
      endAt,
      type: 'urgencia',
      status: 'llego',
      arrivedAt: startAt,
      motivoUrgencia: body.motivoUrgencia.trim(),
      triageLevel: body.triageLevel || null,
      receivedByUserId: req.user!.sub,
      clinicaId: req.user!.clinicaId!,
    },
    include,
  });

  syncAppointmentToFederation(appointment).catch((err) => {
    console.error('No se pudo sincronizar la urgencia recién creada con Dental-Demo-Back', err);
  });

  return res.status(201).json({ appointment });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment || !belongsToRequesterClinica(appointment, req)) {
    return res.status(404).json({ error: 'Cita no encontrada' });
  }

  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin' && appointment.professionalId !== req.user!.sub) {
    return res.status(403).json({ error: 'No puedes cancelar una cita de otro profesional' });
  }

  const cancelled = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: 'cancelada' },
  });

  // Si esta cita nació de tomar una hora publicada, la hora vuelve a quedar
  // disponible para que otro paciente (o el mismo) la tome.
  prisma.openSlot
    .updateMany({ where: { appointmentId: cancelled.id }, data: { status: 'abierta', appointmentId: null } })
    .catch((err) => {
      console.error('No se pudo reabrir la hora publicada tras cancelar la cita', err);
    });

  syncAppointmentToFederation(cancelled).catch((err) => {
    console.error('No se pudo sincronizar la cancelación de la cita con Dental-Demo-Back', err);
  });

  return res.status(204).send();
}

// Hitos de los Circuitos del Paciente: cada transición sella su propia hora
// (arrivedAt / attentionStartedAt), de la cual salen las métricas de
// puntualidad, tiempo de espera y tiempo en atención — sin pedirle un campo
// nuevo al doctor, solo el mismo botón que ya iba a apretar para avanzar al
// paciente.
export async function markArrival(req: Request<{ id: string }>, res: Response) {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment || !belongsToRequesterClinica(appointment, req)) {
    return res.status(404).json({ error: 'Cita no encontrada' });
  }

  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin' && appointment.professionalId !== req.user!.sub) {
    return res.status(403).json({ error: 'No puedes marcar la llegada de una cita de otro profesional' });
  }

  if (appointment.status !== 'agendada') {
    return res.status(409).json({ error: 'Solo se puede marcar la llegada de una cita agendada' });
  }

  const updated = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: 'llego', arrivedAt: new Date() },
    include,
  });

  syncAppointmentToFederation(updated).catch((err) => {
    console.error('No se pudo sincronizar la llegada de la cita con Dental-Demo-Back', err);
  });

  return res.json({ appointment: updated });
}

export async function startAttention(req: Request<{ id: string }>, res: Response) {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment || !belongsToRequesterClinica(appointment, req)) {
    return res.status(404).json({ error: 'Cita no encontrada' });
  }

  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin' && appointment.professionalId !== req.user!.sub) {
    return res.status(403).json({ error: 'No puedes pasar a atención una cita de otro profesional' });
  }

  if (appointment.status !== 'llego') {
    return res.status(409).json({ error: 'Solo se puede pasar a atención una cita cuyo paciente ya llegó' });
  }

  const updated = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: 'en_atencion', attentionStartedAt: new Date() },
    include,
  });

  syncAppointmentToFederation(updated).catch((err) => {
    console.error('No se pudo sincronizar el inicio de atención de la cita con Dental-Demo-Back', err);
  });

  return res.json({ appointment: updated });
}

// Cierra el circuito operativo de la cita — deliberadamente independiente de
// evolucionar: el profesional puede terminar la cita hoy y grabar la
// evolución en otro momento (o en otra visita) sin que eso bloquee la agenda.
export async function finishAttention(req: Request<{ id: string }>, res: Response) {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment || !belongsToRequesterClinica(appointment, req)) {
    return res.status(404).json({ error: 'Cita no encontrada' });
  }

  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin' && appointment.professionalId !== req.user!.sub) {
    return res.status(403).json({ error: 'No puedes terminar una cita de otro profesional' });
  }

  if (appointment.status !== 'en_atencion') {
    return res.status(409).json({ error: 'Solo se puede terminar una cita que está en atención' });
  }

  const updated = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: 'finalizada', attentionEndedAt: new Date() },
    include,
  });

  syncAppointmentToFederation(updated).catch((err) => {
    console.error('No se pudo sincronizar el término de la cita con Dental-Demo-Back', err);
  });

  return res.json({ appointment: updated });
}
