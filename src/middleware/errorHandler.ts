import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

// Errores con mensaje simple en JSON (09-11-2026). Antes, sin manejador propio,
// Express respondía una página HTML (y fuera de producción, con el detalle del
// código). Además, datos mal escritos por el usuario (texto en un monto, fecha
// inválida, JSON roto) terminaban como "error del servidor" (500) en vez de
// "datos inválidos" (400). Nunca se devuelve el detalle interno al cliente;
// queda en los logs del servidor.

export function apiNotFound(req: Request, res: Response) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  const e = err as { type?: string; status?: number; statusCode?: number; code?: string; message?: string };

  // Cuerpo de la petición: JSON roto o demasiado grande.
  if (e?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El formato de los datos enviados no es válido.' });
  }
  if (e?.type === 'entity.too.large' || e?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo o los datos enviados son demasiado grandes.' });
  }

  // Errores de la base de datos provocados por datos del usuario.
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: 'Datos inválidos. Revise los campos e intente de nuevo.' });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'No se encontró el registro.' });
    if (err.code === 'P2003') return res.status(400).json({ error: 'Uno de los datos relacionados no existe.' });
    if (err.code === 'P2000') return res.status(400).json({ error: 'Uno de los campos es demasiado largo.' });
    if (err.code === 'P2006' || err.code === 'P2007') return res.status(400).json({ error: 'Datos inválidos. Revise los campos e intente de nuevo.' });
  }

  // Errores con estado 4xx explícito (de librerías como multer o express).
  const status = Number(e?.status ?? e?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: 'No se pudo procesar la solicitud.' });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}
