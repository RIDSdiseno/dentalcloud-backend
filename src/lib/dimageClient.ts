import axios from 'axios';
import FormData from 'form-data';

export function isDimageConfigured() {
  return Boolean(process.env.DIMAGE_API_URL && process.env.DIMAGE_API_KEY);
}

const dimage = axios.create({
  baseURL: process.env.DIMAGE_API_URL,
  headers: { 'X-API-KEY': process.env.DIMAGE_API_KEY ?? '' },
  timeout: 15000,
});

export type DimagePatient = {
  id: number;
  rut: string;
  name: string;
  email: string | null;
  celphone: string | null;
  housephone: string | null;
  address: string | null;
  dateofbirth: string | null;
  id_externo: string | null;
};

export async function findPatientByRut(rut: string) {
  try {
    const { data } = await dimage.get<DimagePatient>(`/patient/${rut}`);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

export async function upsertPatient(input: {
  rut: string;
  name: string;
  email?: string | null;
  celphone?: string | null;
  address?: string | null;
  dateofbirth?: string | null;
  id_externo?: string | null;
}) {
  const existing = await findPatientByRut(input.rut);
  if (existing) {
    const { data } = await dimage.put<DimagePatient>(`/patient/${input.rut}`, input);
    return data;
  }
  const { data } = await dimage.post<DimagePatient>('/patient', input);
  return data;
}

export async function findOdontologoByRut(rut: string) {
  try {
    const { data } = await dimage.get(`/odontologo/by-rut/${rut}`);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

export async function createOdontologo(input: { rut: string; name: string; email?: string | null }) {
  const { data } = await dimage.post('/odontologo/create', input);
  return data;
}

export async function fetchExamTypes() {
  const { data } = await dimage.get('/order/examinations/types');
  return data;
}

export async function fetchExamGroups() {
  const { data } = await dimage.get('/order/examinations/groups');
  return data;
}

export async function fetchOrdersByPatient(rut: string, page = 1, perPage = 10) {
  try {
    const { data } = await dimage.get(`/order/by-patient/${rut}`, { params: { page, per_page: perPage } });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return { data: [], total: 0 };
    throw err;
  }
}

export async function createOrder(input: {
  paciente: string;
  odontologo: string;
  clinica: string;
  diagnostico?: string;
  observaciones?: string;
  prioridad?: string;
  examenes: Array<{ kind_id: number; dientes?: string[]; url_texto?: string; otroinput?: string }>;
}) {
  const { data } = await dimage.post('/order', input);
  return data;
}

export async function sendOrderToRadiologo(orderId: number | string, staffIds?: number[]) {
  const { data } = await dimage.patch(`/order/${orderId}/send/radiologo`, staffIds ? { staff_ids: staffIds } : {});
  return data;
}

export async function fetchOrderPdfUrl(orderId: number | string) {
  const { data } = await dimage.get(`/order/pdf/${orderId}`);
  return data;
}

export async function fetchOrderZipUrl(orderId: number | string) {
  const { data } = await dimage.get(`/order/zip/${orderId}`);
  return data;
}

export async function fetchOrderById(orderId: number | string) {
  const { data } = await dimage.get(`/order/by-id/${orderId}`);
  return data;
}

export async function updateOrder(
  orderId: number | string,
  input: {
    diagnostico?: string;
    observaciones?: string;
    prioridad?: string;
    odontologo?: string;
    clinica?: string;
    examenes?: Array<{ kind_id: number; dientes?: string[]; url_texto?: string; otroinput?: string }>;
  }
) {
  const { data } = await dimage.put(`/order/${orderId}`, input);
  return data;
}

export async function uploadOrderFiles(
  orderId: number | string,
  examinationId: number | string,
  files: Array<{ buffer: Buffer; originalname: string }>
) {
  const form = new FormData();
  for (const file of files) {
    form.append('archivos[]', file.buffer, { filename: file.originalname });
  }
  const { data } = await dimage.post(`/order/${orderId}/files/${examinationId}`, form, {
    headers: form.getHeaders(),
  });
  return data;
}

export async function deleteOrderFile(fileId: number | string) {
  const { data } = await dimage.delete(`/order/file/${fileId}`);
  return data;
}

export default dimage;
