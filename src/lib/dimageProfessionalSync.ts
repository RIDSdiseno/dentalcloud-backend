import crypto from 'crypto';
import { formatRut } from '../utils/rut';
import {
  isDimageConfigured,
  findOdontologoByRut,
  createOdontologo,
  findRadiologoByRut,
  createRadiologo,
} from './dimageClient';

type ProfessionalInput = {
  rut: string | null;
  name: string;
  email: string;
  role: string;
  // Id de la clínica en RIDS RX (Sucursal.dimageClinicId) — necesario para que
  // POST /odontologo/create vincule al odontólogo con esa clínica; sin esto
  // el staff se crea pero queda huérfano (no aparece en ninguna búsqueda por
  // holding/rut, que exigen el join con clinic_staff). El endpoint de
  // radiólogo no lo necesita: vincula automáticamente a todas las clínicas
  // del holding.
  dimageClinicId?: string | null;
};

// Crea al profesional en RIDS RX si todavía no existe ahí, por RUT — idempotente.
// Solo odontólogo y radiólogo tienen equivalente en RIDS RX (no existe endpoint
// para "operador"/técnico en su API v3). Un radiólogo necesita una contraseña
// propia para entrar directo a RIDS RX (es una app separada); como fordentcloud
// guarda su contraseña hasheada, se genera una nueva al azar y se devuelve una
// única vez para que el caller la muestre al admin — no se guarda en ningún lado.
export async function syncProfessionalToDimageIfNeeded(
  user: ProfessionalInput
): Promise<{ generatedPassword: string | null }> {
  if (!isDimageConfigured() || !user.rut) return { generatedPassword: null };
  const rut = formatRut(user.rut);

  if (user.role === 'odontologo') {
    const existing = await findOdontologoByRut(rut);
    if (!existing) {
      await createOdontologo({ rut, name: user.name, email: user.email, clinic_id: user.dimageClinicId });
    }
    return { generatedPassword: null };
  }

  if (user.role === 'radiologo') {
    const existing = await findRadiologoByRut(rut);
    if (existing) return { generatedPassword: null };
    const generatedPassword = crypto.randomBytes(9).toString('base64url');
    await createRadiologo({ rut, name: user.name, email: user.email, password: generatedPassword });
    return { generatedPassword };
  }

  return { generatedPassword: null };
}
