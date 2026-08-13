// Sugerencia automática del modo de odontograma a partir del nombre de la
// prestación. Mismas listas de palabras clave que odontogramConfig.ts en el
// front (dentalcloud-front) — deben mantenerse en sync manualmente si se
// agregan nuevas prestaciones con vocabulario no contemplado. Sólo se usa
// como sugerencia inicial al crear/editar o en el backfill masivo; una vez
// guardado, el modo queda fijo en Prestacion.odontogramMode hasta que
// alguien lo cambie a mano.
export type OdontogramMode = 'session' | 'tooth' | 'surface' | 'extraction' | 'cuadrante' | 'sextante' | 'arcada';

const SESSION_KEYWORDS = [
  'blanqueamiento',
  'fluor',
  'consulta',
  'control',
  'destartraje',
  'limpieza',
  'examen',
  'sesion',
  'entrenamiento',
  'programa terapeutico',
];
const TOOTH_KEYWORDS = ['endodoncia', 'corona', 'implante', 'incrustacion', 'perno', 'munon', 'provisional', 'retiro'];
const SURFACE_KEYWORDS = ['restauracion', 'resina', 'obturacion', 'caries', 'carilla', 'sellante'];
const EXTRACTION_KEYWORDS = ['exodoncia', 'extraccion', 'extraer'];
const SEXTANT_KEYWORDS = ['sextante', 'por grupo', 'griupo'];
const ARCH_KEYWORDS = [
  'por arcada',
  'por arcadas',
  'arco maxilar completo',
  'arco mandibular completo',
  'protesis total superior',
  'protesis total inferior',
  'protesis hibrida superior',
  'protesis hibrida inferior',
  'protesis parcial',
  'sup. o inf. parcial',
  'sobredentadura',
  'dispositivo oclusal',
  'placa de alivio oclusal',
];
const WHOLE_MOUTH_ARCH_EXCEPTIONS = ['ambas arcadas', '2 arcadas', 'dos arcadas'];
const QUADRANT_KEYWORDS = ['cuadrante'];
const PER_TOOTH_PHRASES = ['por diente', 'x diente', 'por pieza'];

const DIACRITICS_PATTERN = new RegExp('[̀-ͯ]', 'g');

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(DIACRITICS_PATTERN, '').replace(/\s+/g, ' ').trim();
}

export function guessOdontogramMode(name: string): OdontogramMode {
  const normalized = normalize(name);
  if (EXTRACTION_KEYWORDS.some((k) => normalized.includes(k))) return 'extraction';
  if (WHOLE_MOUTH_ARCH_EXCEPTIONS.some((k) => normalized.includes(k))) return 'session';
  if (SEXTANT_KEYWORDS.some((k) => normalized.includes(k))) return 'sextante';
  if (ARCH_KEYWORDS.some((k) => normalized.includes(k))) return 'arcada';
  if (QUADRANT_KEYWORDS.some((k) => normalized.includes(k))) return 'cuadrante';
  if (SURFACE_KEYWORDS.some((k) => normalized.includes(k))) return 'surface';
  if (PER_TOOTH_PHRASES.some((k) => normalized.includes(k))) return 'tooth';
  if (TOOTH_KEYWORDS.some((k) => normalized.includes(k))) return 'tooth';
  if (SESSION_KEYWORDS.some((k) => normalized.includes(k))) return 'session';
  return 'tooth';
}

export const ODONTOGRAM_MODES: OdontogramMode[] = ['session', 'tooth', 'surface', 'extraction', 'cuadrante', 'sextante', 'arcada'];
