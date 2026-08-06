import type { Request, Response } from 'express';
import { verifyDicomViewerToken } from '../utils/tokens';
import { listOrderDicomFiles, getDicomFileStream } from '../lib/ridsRxStorage';

// Estas rutas NO pasan por el middleware `authenticate` de siempre — las pide
// el visor 3D (Med3Web) desde su propia pestaña/ventana con XHR planas, sin
// el header Authorization del cliente. El token de corta duración emitido por
// `dicomViewerToken` (rxController.ts) es la única autorización acá.
function resolveOrderId(req: Request<{ token: string }>, res: Response): string | null {
  try {
    return verifyDicomViewerToken(req.params.token).orderId;
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return null;
  }
}

export async function dicomFileList(req: Request<{ token: string }>, res: Response) {
  const orderId = resolveOrderId(req, res);
  if (!orderId) return;
  try {
    const files = await listOrderDicomFiles(orderId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(files.join('\n'));
  } catch (err) {
    console.error('No se pudo listar los archivos DICOM', err);
    return res.status(502).json({ error: 'No se pudieron listar los archivos' });
  }
}

// Evita path traversal (../, /, etc.) — el nombre se usa tal cual como llave
// dentro del prefijo S3 del pedido, así que solo se permiten nombres de
// archivo "planos".
const SAFE_FILENAME = /^[\w.-]+$/;

export async function dicomFile(req: Request<{ token: string; filename: string }>, res: Response) {
  const orderId = resolveOrderId(req, res);
  if (!orderId) return;

  const { filename } = req.params;
  if (!SAFE_FILENAME.test(filename)) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }

  try {
    const stream = await getDicomFileStream(orderId, filename);
    if (!stream) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    res.setHeader('Content-Type', 'application/dicom');
    stream.pipe(res);
    stream.on('error', (err) => {
      console.error('Error transmitiendo archivo DICOM', err);
      if (!res.headersSent) res.status(502).end();
    });
  } catch (err) {
    console.error('No se pudo descargar el archivo DICOM', err);
    return res.status(502).json({ error: 'No se pudo descargar el archivo' });
  }
}
