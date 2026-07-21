export type ClinicaModuleKey =
  | 'pacientes'
  | 'documentosClinicos'
  | 'cartola'
  | 'evoluciones'
  | 'observaciones'
  | 'agenda'
  | 'tratamientos'
  | 'consentimientos';

export type ClinicaModules = Record<ClinicaModuleKey, boolean>;

export const DEFAULT_CLINICA_MODULES: ClinicaModules = {
  pacientes: true,
  documentosClinicos: true,
  cartola: true,
  evoluciones: true,
  observaciones: true,
  agenda: true,
  tratamientos: true,
  consentimientos: true,
};

export const CLINICA_MODULE_LABELS: Record<ClinicaModuleKey, string> = {
  pacientes: 'Pacientes',
  documentosClinicos: 'Documentos clínicos',
  cartola: 'Cartola',
  evoluciones: 'Evoluciones',
  observaciones: 'Observaciones administrativas',
  agenda: 'Agenda y citas',
  tratamientos: 'Planes de tratamiento',
  consentimientos: 'Consentimientos informados',
};

// El campo `modules` es un Json de Prisma (tipo `unknown` a nivel de TS), así
// que se normaliza acá para no repetir el casteo/relleno de valores por defecto
// en cada controller que lo lea.
export function parseClinicaModules(raw: unknown): ClinicaModules {
  const parsed = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_CLINICA_MODULES };
  for (const key of Object.keys(DEFAULT_CLINICA_MODULES) as ClinicaModuleKey[]) {
    if (typeof parsed[key] === 'boolean') {
      result[key] = parsed[key] as boolean;
    }
  }
  return result;
}
