import type { Request, Response } from 'express';
import prisma from '../lib/prisma';

export async function listSucursales(req: Request, res: Response) {
  const includeInactive = req.query.all === 'true';
  const sucursales = await prisma.sucursal.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ sucursales });
}

export async function createSucursal(req: Request, res: Response) {
  const { name, address } = req.body as { name?: string; address?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre de la sucursal es requerido' });
  }
  const existing = await prisma.sucursal.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una sucursal con ese nombre' });
  }
  const sucursal = await prisma.sucursal.create({ data: { name: name.trim(), address: address?.trim() || null } });
  return res.status(201).json({ sucursal });
}

export async function updateSucursal(req: Request<{ id: string }>, res: Response) {
  const sucursal = await prisma.sucursal.findUnique({ where: { id: req.params.id } });
  if (!sucursal) {
    return res.status(404).json({ error: 'Sucursal no encontrada' });
  }
  const { name, address, active, dimageClinicId } = req.body as {
    name?: string;
    address?: string | null;
    active?: boolean;
    dimageClinicId?: string | null;
  };
  const updated = await prisma.sucursal.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(address !== undefined ? { address: address?.trim() || null } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(dimageClinicId !== undefined ? { dimageClinicId: dimageClinicId?.trim() || null } : {}),
    },
  });
  return res.json({ sucursal: updated });
}

export async function removeSucursal(req: Request<{ id: string }>, res: Response) {
  const sucursal = await prisma.sucursal.findUnique({ where: { id: req.params.id } });
  if (!sucursal) {
    return res.status(404).json({ error: 'Sucursal no encontrada' });
  }
  const planCount = await prisma.treatmentPlan.count({ where: { sucursalId: req.params.id } });
  if (planCount > 0) {
    return res.status(409).json({ error: 'No se puede eliminar una sucursal con presupuestos asociados. Desactívala en su lugar.' });
  }
  await prisma.sucursal.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}

export async function listPrevisiones(req: Request, res: Response) {
  const includeInactive = req.query.all === 'true';
  const previsiones = await prisma.prevision.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ previsiones });
}

export async function createPrevision(req: Request, res: Response) {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre de la previsión es requerido' });
  }
  const existing = await prisma.prevision.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una previsión con ese nombre' });
  }
  const prevision = await prisma.prevision.create({ data: { name: name.trim() } });
  return res.status(201).json({ prevision });
}

export async function updatePrevision(req: Request<{ id: string }>, res: Response) {
  const prevision = await prisma.prevision.findUnique({ where: { id: req.params.id } });
  if (!prevision) {
    return res.status(404).json({ error: 'Previsión no encontrada' });
  }
  const { name, active } = req.body as { name?: string; active?: boolean };
  const updated = await prisma.prevision.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  return res.json({ prevision: updated });
}

export async function removePrevision(req: Request<{ id: string }>, res: Response) {
  const prevision = await prisma.prevision.findUnique({ where: { id: req.params.id } });
  if (!prevision) {
    return res.status(404).json({ error: 'Previsión no encontrada' });
  }
  const planCount = await prisma.treatmentPlan.count({ where: { previsionId: req.params.id } });
  if (planCount > 0) {
    return res.status(409).json({ error: 'No se puede eliminar una previsión con presupuestos asociados. Desactívala en su lugar.' });
  }
  await prisma.prevision.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}

export async function listConvenios(req: Request, res: Response) {
  const includeInactive = req.query.all === 'true';
  const convenios = await prisma.convenio.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ convenios });
}

export async function createConvenio(req: Request, res: Response) {
  const { name, discountPercent } = req.body as { name?: string; discountPercent?: number };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre del convenio es requerido' });
  }
  const existing = await prisma.convenio.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return res.status(409).json({ error: 'Ya existe un convenio con ese nombre' });
  }
  const pct = Math.min(100, Math.max(0, Math.round(discountPercent ?? 0)));
  const convenio = await prisma.convenio.create({ data: { name: name.trim(), discountPercent: pct } });
  return res.status(201).json({ convenio });
}

export async function updateConvenio(req: Request<{ id: string }>, res: Response) {
  const convenio = await prisma.convenio.findUnique({ where: { id: req.params.id } });
  if (!convenio) {
    return res.status(404).json({ error: 'Convenio no encontrado' });
  }
  const { name, discountPercent, active } = req.body as { name?: string; discountPercent?: number; active?: boolean };
  const updated = await prisma.convenio.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(discountPercent !== undefined ? { discountPercent: Math.min(100, Math.max(0, Math.round(discountPercent))) } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  return res.json({ convenio: updated });
}

export async function removeConvenio(req: Request<{ id: string }>, res: Response) {
  const convenio = await prisma.convenio.findUnique({ where: { id: req.params.id } });
  if (!convenio) {
    return res.status(404).json({ error: 'Convenio no encontrado' });
  }
  const planCount = await prisma.treatmentPlan.count({ where: { convenioId: req.params.id } });
  if (planCount > 0) {
    return res.status(409).json({ error: 'No se puede eliminar un convenio con presupuestos asociados. Desactívalo en su lugar.' });
  }
  await prisma.convenio.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}

export async function listPrestaciones(req: Request, res: Response) {
  const includeInactive = req.query.all === 'true';
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const prestaciones = await prisma.prestacion.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    orderBy: { name: 'asc' },
  });
  return res.json({ prestaciones });
}

export async function createPrestacion(req: Request, res: Response) {
  const { name, code, basePrice } = req.body as { name?: string; code?: string; basePrice?: number };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre de la prestación es requerido' });
  }
  if (code?.trim()) {
    const existing = await prisma.prestacion.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(409).json({ error: 'Ya existe una prestación con ese código' });
    }
  }
  const prestacion = await prisma.prestacion.create({
    data: { name: name.trim(), code: code?.trim() || null, basePrice: Math.max(0, Math.round(basePrice ?? 0)) },
  });
  return res.status(201).json({ prestacion });
}

export async function updatePrestacion(req: Request<{ id: string }>, res: Response) {
  const prestacion = await prisma.prestacion.findUnique({ where: { id: req.params.id } });
  if (!prestacion) {
    return res.status(404).json({ error: 'Prestación no encontrada' });
  }
  const { name, code, basePrice, active } = req.body as {
    name?: string;
    code?: string | null;
    basePrice?: number;
    active?: boolean;
  };
  const updated = await prisma.prestacion.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(code !== undefined ? { code: code?.trim() || null } : {}),
      ...(basePrice !== undefined ? { basePrice: Math.max(0, Math.round(basePrice)) } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  return res.json({ prestacion: updated });
}

export async function removePrestacion(req: Request<{ id: string }>, res: Response) {
  const prestacion = await prisma.prestacion.findUnique({ where: { id: req.params.id } });
  if (!prestacion) {
    return res.status(404).json({ error: 'Prestación no encontrada' });
  }
  const itemCount = await prisma.treatmentItem.count({ where: { prestacionId: req.params.id } });
  if (itemCount > 0) {
    return res.status(409).json({ error: 'No se puede eliminar una prestación usada en presupuestos. Desactívala en su lugar.' });
  }
  await prisma.prestacion.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}

export async function listEvolutionTemplates(req: Request, res: Response) {
  const includeInactive = req.query.all === 'true';
  const templates = await prisma.evolutionTemplate.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ templates });
}

export async function createEvolutionTemplate(req: Request, res: Response) {
  const { name, section, content } = req.body as { name?: string; section?: string; content?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'El nombre de la plantilla es requerido' });
  }
  if (!content?.trim()) {
    return res.status(400).json({ error: 'El contenido de la plantilla es requerido' });
  }
  const template = await prisma.evolutionTemplate.create({
    data: { name: name.trim(), section: section?.trim() || null, content },
  });
  return res.status(201).json({ template });
}

export async function updateEvolutionTemplate(req: Request<{ id: string }>, res: Response) {
  const template = await prisma.evolutionTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) {
    return res.status(404).json({ error: 'Plantilla no encontrada' });
  }
  const { name, section, content, active } = req.body as {
    name?: string;
    section?: string | null;
    content?: string;
    active?: boolean;
  };
  const updated = await prisma.evolutionTemplate.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(section !== undefined ? { section: section?.trim() || null } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  return res.json({ template: updated });
}

export async function removeEvolutionTemplate(req: Request<{ id: string }>, res: Response) {
  const template = await prisma.evolutionTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) {
    return res.status(404).json({ error: 'Plantilla no encontrada' });
  }
  await prisma.evolutionTemplate.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
