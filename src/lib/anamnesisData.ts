// Los 8 bloques de anamnesis dictados por Urbina (reunión 2/9, Etapa 03),
// en el orden exacto que pidió. Medicación actual y alergias (bloques 5 y 6)
// ya viven en sus propios campos de Patient (currentMedications/
// allergies/allergyNotes) desde antes — se reusan tal cual, no se duplican
// acá.
export const ANAMNESIS_PATHOLOGY_KEYS = [
  'hipertension',
  'diabetes',
  'tiroides',
  'coagulacion',
  'autoinmune',
  'cardiopatia',
  'embarazo',
] as const;
export type AnamnesisPathologyKey = (typeof ANAMNESIS_PATHOLOGY_KEYS)[number];

export const ANAMNESIS_HABIT_KEYS = ['tabaco', 'alcohol', 'exposicion_solar', 'sedentarismo'] as const;
export type AnamnesisHabitKey = (typeof ANAMNESIS_HABIT_KEYS)[number];

export type YesNoDetail = { tiene: boolean | null; detalle: string };

export type AnamnesisData = {
  antecedentesMorbidos: AnamnesisPathologyKey[];
  antecedentesMorbidosOtro: string;
  quirurgicosEsteticos: YesNoDetail;
  procedimientoPrevio: { tiene: boolean | null; tipo: string; zona: string; fecha: string };
  complicacionesPrevias: YesNoDetail;
  antecedentesFamiliares: YesNoDetail;
  habitos: AnamnesisHabitKey[];
  habitosOtro: string;
};

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
    antecedentesMorbidos: sanitizeStringArray(obj.antecedentesMorbidos, ANAMNESIS_PATHOLOGY_KEYS),
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
  tiroides: 'Enfermedad tiroidea',
  coagulacion: 'Trastornos de coagulación',
  autoinmune: 'Enfermedad autoinmune',
  cardiopatia: 'Cardiopatía',
  embarazo: 'Embarazo',
};

export const ANAMNESIS_HABIT_LABEL: Record<AnamnesisHabitKey, string> = {
  tabaco: 'Tabaco',
  alcohol: 'Alcohol',
  exposicion_solar: 'Exposición solar frecuente',
  sedentarismo: 'Sedentarismo',
};
