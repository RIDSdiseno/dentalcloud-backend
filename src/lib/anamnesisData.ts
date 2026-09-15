// Los 8 bloques de anamnesis dictados por Urbina (reunión 2/9, Etapa 03),
// en el orden exacto que pidió. Medicación actual y alergias (bloques 5 y 6)
// ya viven en sus propios campos de Patient (currentMedications/
// allergies/allergyNotes) desde antes — se reusan tal cual, no se duplican
// acá.
// Las 11 condiciones exactas del mockup de Urbina (reunión 2/9), cada una
// con su propio Sí/No/Desconoce — no una lista de "marca las que aplican".
// Ajustado el 15/09 tras comparar contra las capturas reales de la reunión:
// la versión anterior tenía solo 7 (con "cardiopatía" que no estaba en el
// mockup) y las trataba como una sola lista de casillas.
export const ANAMNESIS_PATHOLOGY_KEYS = [
  'hipertension',
  'diabetes',
  'autoinmune',
  'coagulacion',
  'tiroides',
  'hepatica',
  'renal',
  'cancer',
  'herpes',
  'embarazo',
  'lactancia',
] as const;
export type AnamnesisPathologyKey = (typeof ANAMNESIS_PATHOLOGY_KEYS)[number];

export const ANAMNESIS_HABIT_KEYS = ['tabaco', 'alcohol', 'exposicion_solar', 'sedentarismo'] as const;
export type AnamnesisHabitKey = (typeof ANAMNESIS_HABIT_KEYS)[number];

export type YesNoDetail = { tiene: boolean | null; detalle: string };

// 'si' | 'no' | 'desconoce' | null (null = todavía sin marcar) — un valor
// independiente por condición, igual al mockup real.
export type MorbidStatus = 'si' | 'no' | 'desconoce' | null;
export type AntecedentesMorbidos = Record<AnamnesisPathologyKey, MorbidStatus>;

export type AnamnesisData = {
  antecedentesMorbidos: AntecedentesMorbidos;
  antecedentesMorbidosOtro: string;
  quirurgicosEsteticos: YesNoDetail;
  procedimientoPrevio: { tiene: boolean | null; tipo: string; zona: string; fecha: string };
  complicacionesPrevias: YesNoDetail;
  antecedentesFamiliares: YesNoDetail;
  habitos: AnamnesisHabitKey[];
  habitosOtro: string;
};

export const EMPTY_ANTECEDENTES_MORBIDOS: AntecedentesMorbidos = Object.fromEntries(
  ANAMNESIS_PATHOLOGY_KEYS.map((key) => [key, null])
) as AntecedentesMorbidos;

const MORBID_STATUS_VALUES = ['si', 'no', 'desconoce'] as const;

function sanitizeMorbidStatus(raw: unknown): MorbidStatus {
  return typeof raw === 'string' && (MORBID_STATUS_VALUES as readonly string[]).includes(raw)
    ? (raw as MorbidStatus)
    : null;
}

// Migra el formato viejo (array de keys marcadas = "tenía", sin Desconoce) a
// falta de otra info — así los pacientes ya cargados antes del 15/09 no
// pierden lo que ya se había marcado como "Sí".
function sanitizeAntecedentesMorbidos(raw: unknown): AntecedentesMorbidos {
  if (Array.isArray(raw)) {
    const result = { ...EMPTY_ANTECEDENTES_MORBIDOS };
    for (const key of ANAMNESIS_PATHOLOGY_KEYS) {
      if (raw.includes(key)) result[key] = 'si';
    }
    return result;
  }
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result = { ...EMPTY_ANTECEDENTES_MORBIDOS };
  for (const key of ANAMNESIS_PATHOLOGY_KEYS) {
    result[key] = sanitizeMorbidStatus(obj[key]);
  }
  return result;
}

function sanitizeYesNoDetail(raw: unknown): YesNoDetail {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    tiene: typeof obj.tiene === 'boolean' ? obj.tiene : null,
    detalle: typeof obj.detalle === 'string' ? obj.detalle.trim() : '',
  };
}

function sanitizeStringArray<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  const allowedSet: readonly string[] = allowed;
  return raw.filter((v): v is T => typeof v === 'string' && allowedSet.includes(v));
}

// Passthrough tolerante: si viene basura o campos faltantes, se rellena con
// valores por defecto en vez de rechazar el guardado completo — es
// información clínica de apoyo, no algo que deba bloquear al médico por un
// campo mal formado.
export function sanitizeAnamnesisData(raw: unknown): AnamnesisData {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const procedimientoPrevioRaw = (
    obj.procedimientoPrevio && typeof obj.procedimientoPrevio === 'object' ? obj.procedimientoPrevio : {}
  ) as Record<string, unknown>;

  return {
    antecedentesMorbidos: sanitizeAntecedentesMorbidos(obj.antecedentesMorbidos),
    antecedentesMorbidosOtro:
      typeof obj.antecedentesMorbidosOtro === 'string' ? obj.antecedentesMorbidosOtro.trim() : '',
    quirurgicosEsteticos: sanitizeYesNoDetail(obj.quirurgicosEsteticos),
    procedimientoPrevio: {
      tiene: typeof procedimientoPrevioRaw.tiene === 'boolean' ? procedimientoPrevioRaw.tiene : null,
      tipo: typeof procedimientoPrevioRaw.tipo === 'string' ? procedimientoPrevioRaw.tipo.trim() : '',
      zona: typeof procedimientoPrevioRaw.zona === 'string' ? procedimientoPrevioRaw.zona.trim() : '',
      fecha: typeof procedimientoPrevioRaw.fecha === 'string' ? procedimientoPrevioRaw.fecha.trim() : '',
    },
    complicacionesPrevias: sanitizeYesNoDetail(obj.complicacionesPrevias),
    antecedentesFamiliares: sanitizeYesNoDetail(obj.antecedentesFamiliares),
    habitos: sanitizeStringArray(obj.habitos, ANAMNESIS_HABIT_KEYS),
    habitosOtro: typeof obj.habitosOtro === 'string' ? obj.habitosOtro.trim() : '',
  };
}

export const ANAMNESIS_PATHOLOGY_LABEL: Record<AnamnesisPathologyKey, string> = {
  hipertension: 'Hipertensión',
  diabetes: 'Diabetes',
  autoinmune: 'Enfermedades autoinmunes',
  coagulacion: 'Trastornos de coagulación',
  tiroides: 'Enfermedad tiroidea',
  hepatica: 'Enfermedad hepática',
  renal: 'Enfermedad renal',
  cancer: 'Cáncer',
  herpes: 'Herpes recurrente',
  embarazo: 'Embarazo',
  lactancia: 'Lactancia',
};

export const ANAMNESIS_HABIT_LABEL: Record<AnamnesisHabitKey, string> = {
  tabaco: 'Tabaco',
  alcohol: 'Alcohol',
  exposicion_solar: 'Exposición solar frecuente',
  sedentarismo: 'Sedentarismo',
};
