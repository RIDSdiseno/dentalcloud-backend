import fs from 'fs';
import type { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../lib/prisma';
import { formatRut } from '../utils/rut';
import {
  isDimageConfigured,
  findPatientByRut,
  upsertPatient,
  findOdontologoByRut,
  createOdontologo,
  fetchExamTypes,
  fetchExamGroups,
  fetchOrdersByPatient,
  createOrder,
  sendOrderToRadiologo,
  fetchOrderPdfUrl,
  fetchOrderZipUrl,
  fetchOrderById,
  updateOrder,
  uploadOrderFiles,
  deleteOrderFile,
} from '../lib/dimageClient';
import { resolveExamGroups } from '../lib/dimageExamGroups';
import { syncPatientToDimageIfNeeded } from '../lib/dimagePatientSync';
import { listOrderDicomFiles, isRidsRxStorageConfigured } from '../lib/ridsRxStorage';
import { signDicomViewerToken } from '../utils/tokens';

function dimageErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

function requireDimageConfigured(res: Response) {
  if (!isDimageConfigured()) {
    res.status(503).json({
      error: 'La integración con RIDS RX no está configurada. Falta DIMAGE_API_URL/DIMAGE_API_KEY en el servidor.',
    });
    return false;
  }
  return true;
}

async function getPatientOrFail(patientId: string, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    res.status(400).json({ error: 'El paciente seleccionado no existe' });
    return null;
  }
  return patient;
}

export async function examCatalog(req: Request, res: Response) {
  if (!requireDimageConfigured(res)) return;
  try {
    const [types, rawGroups] = await Promise.all([fetchExamTypes(), fetchExamGroups()]);
    return res.json({ types, groups: resolveExamGroups(rawGroups) });
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo cargar el catálogo de exámenes') });
  }
}

export async function patientStatus(req: Request, res: Response) {
  if (!requireDimageConfigured(res)) return;
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) return res.status(400).json({ error: 'Se requiere patientId' });

  const patient = await getPatientOrFail(patientId, res);
  if (!patient) return;

  try {
    const dimagePatient = await findPatientByRut(formatRut(patient.rut));
    return res.json({ synced: Boolean(dimagePatient), patient: dimagePatient });
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo consultar el estado del paciente en RIDS RX') });
  }
}

export async function syncPatient(req: Request, res: Response) {
  if (!requireDimageConfigured(res)) return;
  const { patientId } = req.body as { patientId?: string };
  if (!patientId) return res.status(400).json({ error: 'Se requiere patientId' });

  const patient = await getPatientOrFail(patientId, res);
  if (!patient) return;

  try {
    const dimagePatient = await upsertPatient({
      rut: formatRut(patient.rut),
      name: `${patient.firstName} ${patient.lastName}`,
      email: patient.email,
      celphone: patient.phone,
      address: patient.address,
      dateofbirth: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
      id_externo: patient.id,
    });
    return res.json({ patient: dimagePatient });
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo sincronizar el paciente con RIDS RX') });
  }
}

export async function listOrders(req: Request, res: Response) {
  if (!requireDimageConfigured(res)) return;
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  if (!patientId) return res.status(400).json({ error: 'Se requiere patientId' });

  const patient = await getPatientOrFail(patientId, res);
  if (!patient) return;

  try {
    const result = await fetchOrdersByPatient(formatRut(patient.rut));
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudieron cargar las órdenes Rx') });
  }
}

export async function createRxOrder(req: Request, res: Response) {
  if (!requireDimageConfigured(res)) return;
  if (req.user!.role === 'radiologo') {
    return res.status(403).json({ error: 'Los radiólogos no pueden crear órdenes Rx.' });
  }
  const body = req.body as {
    patientId?: string;
    professionalId?: string;
    sucursalId?: string;
    diagnostico?: string;
    observaciones?: string;
    prioridad?: string;
    examenes?: Array<{ kindId: number; dientes?: string[]; urlTexto?: string; otroInput?: string }>;
  };

  if (!body.patientId || !body.sucursalId || !body.examenes?.length) {
    return res.status(400).json({ error: 'patientId, sucursalId y al menos un examen son requeridos' });
  }

  const patient = await getPatientOrFail(body.patientId, res);
  if (!patient) return;

  const sucursal = await prisma.sucursal.findUnique({ where: { id: body.sucursalId } });
  if (!sucursal) return res.status(400).json({ error: 'La sucursal seleccionada no existe' });
  if (!sucursal.dimageClinicId) {
    return res.status(400).json({
      error: `La sucursal "${sucursal.name}" no tiene configurado su ID de clínica en RIDS RX. Pídele a un administrador que lo configure.`,
    });
  }

  const professionalId = body.professionalId || req.user!.sub;
  const professional = await prisma.user.findUnique({ where: { id: professionalId } });
  if (!professional) return res.status(400).json({ error: 'El profesional seleccionado no existe' });
  if (!professional.rut) {
    return res.status(400).json({
      error: `${professional.name} no tiene un RUT configurado. Un administrador debe agregarlo en Profesionales antes de crear órdenes Rx.`,
    });
  }

  const odontologoRut = formatRut(professional.rut);

  try {
    const existingOdontologo = await findOdontologoByRut(odontologoRut);
    if (!existingOdontologo) {
      await createOdontologo({ rut: odontologoRut, name: professional.name, email: professional.email });
    }

    await syncPatientToDimageIfNeeded(patient);

    const order = await createOrder({
      paciente: formatRut(patient.rut),
      odontologo: odontologoRut,
      clinica: sucursal.dimageClinicId,
      diagnostico: body.diagnostico,
      observaciones: body.observaciones,
      prioridad: body.prioridad,
      examenes: body.examenes.map((e) => ({
        kind_id: e.kindId,
        dientes: e.dientes,
        url_texto: e.urlTexto,
        otroinput: e.otroInput,
      })),
    });
    return res.status(201).json(order);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo crear la orden en RIDS RX') });
  }
}

export async function sendOrder(req: Request<{ id: string }>, res: Response) {
  if (!requireDimageConfigured(res)) return;
  try {
    const result = await sendOrderToRadiologo(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo enviar la orden al radiólogo') });
  }
}

export async function orderPdf(req: Request<{ id: string }>, res: Response) {
  if (!requireDimageConfigured(res)) return;
  try {
    const result = await fetchOrderPdfUrl(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo generar el PDF') });
  }
}

export async function orderZip(req: Request<{ id: string }>, res: Response) {
  if (!requireDimageConfigured(res)) return;
  try {
    const result = await fetchOrderZipUrl(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo generar el ZIP') });
  }
}

export async function orderDetail(req: Request<{ id: string }>, res: Response) {
  if (!requireDimageConfigured(res)) return;
  try {
    const order = await fetchOrderById(req.params.id);
    return res.json(order);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo cargar el detalle de la orden') });
  }
}

// Emite un token de corta duración para el visor 3D (Med3Web) y le indica el
// primer archivo DICOM de la serie — el visor deriva la "carpeta" de esa URL
// y desde ahí pide el resto (ver routes/rxViewer.ts). Se listan los archivos
// directo desde el storage S3 de RIDS RX en vez de confiar en `ruta_dcm` (que
// hoy apunta a la carpeta, no a un archivo, y no viene acompañado de un
// manifiesto utilizable).
export async function dicomViewerToken(req: Request<{ id: string }>, res: Response) {
  if (!isRidsRxStorageConfigured()) {
    return res.status(503).json({ error: 'El visor 3D no está configurado en el servidor.' });
  }
  try {
    const files = await listOrderDicomFiles(req.params.id);
    if (files.length === 0) {
      return res.status(404).json({ error: 'Esta orden no tiene archivos DICOM disponibles.' });
    }
    const token = signDicomViewerToken(req.params.id);
    return res.json({ token, entryFilename: files[0] });
  } catch (err) {
    console.error('No se pudo preparar el visor 3D', err);
    return res.status(502).json({ error: 'No se pudo preparar el visor 3D.' });
  }
}

export async function updateRxOrder(req: Request<{ id: string }>, res: Response) {
  if (!requireDimageConfigured(res)) return;
  const body = req.body as {
    diagnostico?: string;
    observaciones?: string;
    prioridad?: string;
    professionalId?: string;
    examenes?: Array<{ kindId: number; dientes?: string[]; urlTexto?: string; otroInput?: string }>;
  };

  let odontologoRut: string | undefined;
  if (body.professionalId) {
    const professional = await prisma.user.findUnique({ where: { id: body.professionalId } });
    if (!professional?.rut) {
      return res.status(400).json({ error: 'El profesional seleccionado no tiene un RUT configurado' });
    }
    odontologoRut = formatRut(professional.rut);
  }

  try {
    const result = await updateOrder(req.params.id, {
      diagnostico: body.diagnostico,
      observaciones: body.observaciones,
      prioridad: body.prioridad,
      odontologo: odontologoRut,
      examenes: body.examenes?.map((e) => ({
        kind_id: e.kindId,
        dientes: e.dientes,
        url_texto: e.urlTexto,
        otroinput: e.otroInput,
      })),
    });
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo actualizar la orden') });
  }
}

export async function uploadOrderFilesController(req: Request<{ id: string; examinationId: string }>, res: Response) {
  if (!requireDimageConfigured(res)) return;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un archivo' });
  }

  try {
    const result = await uploadOrderFiles(
      req.params.id,
      req.params.examinationId,
      files.map((f) => ({ path: f.path, originalname: f.originalname }))
    );
    return res.status(201).json(result);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudieron subir los archivos') });
  } finally {
    // Los archivos quedan como temporales en disco (multer diskStorage, para no
    // bufferear en RAM archivos grandes de hasta 3 GB) — se limpian siempre,
    // haya salido bien la subida a Dimage o no.
    await Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => {})));
  }
}

export async function deleteOrderFileController(req: Request<{ fileId: string }>, res: Response) {
  if (!requireDimageConfigured(res)) return;
  try {
    const result = await deleteOrderFile(req.params.fileId);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: dimageErrorMessage(err, 'No se pudo eliminar el archivo') });
  }
}
