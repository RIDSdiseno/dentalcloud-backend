// Vocabulario fijo de alergias relevantes en una clínica dental. Se usa para
// validar lo que llega del frontend (src/data/allergies.ts, que debe mantenerse
// en sync) y para el cruce automático contra prestaciones (ver
// dentalcloud-front/src/pages/pacientes/allergenDetection.ts).
export const ALLERGY_KEYS = [
  'fluoruro',
  'penicilina',
  'anestesicos_locales',
  'latex',
  'yodo',
  'niquel_metales',
  'aines',
  'sulfitos',
  'otro',
] as const;

export type AllergyKey = (typeof ALLERGY_KEYS)[number];
