import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

const include = {
  professional: { select: { id: true, name: true } },
} as const;

function hasText(html: string) {
  return html.replace(/<[^>]*>/g, '').trim().length > 0;
}

export async function list(req: Request, res: Response) {
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) {
    return res.status(400).json({ error: 'Se requiere patientId' });
  }

  const professionalId = typeof req.query.professionalId === 'string' ? req.query.professionalId : undefined;
  const enabledFilter = typeof req.query.enabled === 'string' ? req.query.enabled : 'true';

  const evolutions = await prisma.evolution.findMany({
    where: {
      patientId,
      ...(professionalId ? { professionalId } : {}),
      ...(enabledFilter === 'all' ? {} : { enabled: enabledFilter === 'false' ? false : true }),
    },
    include,
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ evolutions });
}

export async function create(req: Request, res: Response) {
  const body = req.body as { patientId?: string; professionalId?: string; content?: string };
  if (!body.patientId) {
    return res.status(400).json({ error: 'patientId es requerido' });
  }
  if (!body.content || !hasText(body.content)) {
    return res.status(400).json({ error: 'El contenido de la evolución es requerido' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) {
    return res.status(400).json({ error: 'El paciente seleccionado no existe' });
  }

  let professionalId = req.user!.sub;
  if (body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional) {
      return res.status(400).json({ error: 'El profesional seleccionado no existe' });
    }
    professionalId = body.professionalId;
  }

  const evolution = await prisma.evolution.create({
    data: {
      patientId: body.patientId,
      professionalId,
      content: body.content,
      clinicaId: req.user!.clinicaId!,
    },
    include,
  });
  return res.status(201).json({ evolution });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = req.body as { content?: string; enabled?: boolean };
  const evolution = await prisma.evolution.findUnique({ where: { id: req.params.id } });
  if (!evolution) {
    return res.status(404).json({ error: 'Evolución no encontrada' });
  }

  const isOwnerOrAdmin = req.user!.role === 'admin' || evolution.professionalId === req.user!.sub;
  if (!isOwnerOrAdmin) {
    return res.status(403).json({ error: 'Solo el autor o un administrador pueden modificar esta evolución' });
  }

  if (body.content !== undefined && !hasText(body.content)) {
    return res.status(400).json({ error: 'El contenido de la evolución es requerido' });
  }

  const updated = await prisma.evolution.update({
    where: { id: req.params.id },
    data: {
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    },
    include,
  });
  return res.json({ evolution: updated });
}
