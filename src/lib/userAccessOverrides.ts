import { PERMISSION_KEYS, type PermissionKey } from './rolePermissions';
import { CLINICA_MODULE_LABELS, type ClinicaModuleKey } from './clinicaModules';

export const CLINICA_MODULE_KEYS = Object.keys(CLINICA_MODULE_LABELS) as ClinicaModuleKey[];

// Excepciones por usuario, por encima del default de su rol/clínica. Sólo se
// guardan las llaves explícitamente distintas del default — a diferencia de
// `parseRolePermissions`/`parseClinicaModules`, este parser NO rellena con
// `true`: una llave ausente significa "hereda el default", no "true".
export function parsePermissionOverrides(raw: unknown): Partial<Record<PermissionKey, boolean>> {
  const parsed = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result: Partial<Record<PermissionKey, boolean>> = {};
  for (const key of PERMISSION_KEYS) {
    const value = parsed[key];
    if (typeof value === 'boolean') result[key] = value;
  }
  return result;
}

export function parseModuleOverrides(raw: unknown): Partial<Record<ClinicaModuleKey, boolean>> {
  const parsed = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result: Partial<Record<ClinicaModuleKey, boolean>> = {};
  for (const key of CLINICA_MODULE_KEYS) {
    const value = parsed[key];
    if (typeof value === 'boolean') result[key] = value;
  }
  return result;
}

export function applyPermissionOverrides(
  base: Record<PermissionKey, boolean>,
  overridesRaw: unknown
): Record<PermissionKey, boolean> {
  return { ...base, ...parsePermissionOverrides(overridesRaw) };
}

export function applyModuleOverrides(
  base: Record<ClinicaModuleKey, boolean>,
  overridesRaw: unknown
): Record<ClinicaModuleKey, boolean> {
  return { ...base, ...parseModuleOverrides(overridesRaw) };
}

// Para el PATCH del admin: `value === null` en el patch borra la excepción
// (vuelve a heredar el default), `true`/`false` la fija explícitamente.
function mergeOverridePatch<K extends string>(
  currentRaw: unknown,
  patch: Partial<Record<K, boolean | null>>,
  validKeys: readonly K[]
): Record<K, boolean> {
  const parsed = typeof currentRaw === 'object' && currentRaw !== null ? (currentRaw as Record<string, unknown>) : {};
  const merged: Record<string, boolean> = {};
  for (const key of validKeys) {
    if (typeof parsed[key] === 'boolean') merged[key] = parsed[key] as boolean;
  }
  for (const key of Object.keys(patch) as K[]) {
    const value = patch[key];
    if (value === null) {
      delete merged[key];
    } else if (typeof value === 'boolean') {
      merged[key] = value;
    }
  }
  return merged as Record<K, boolean>;
}

export function mergePermissionOverrides(
  currentRaw: unknown,
  patch: Partial<Record<PermissionKey, boolean | null>>
): Record<PermissionKey, boolean> {
  return mergeOverridePatch(currentRaw, patch, PERMISSION_KEYS);
}

export function mergeModuleOverrides(
  currentRaw: unknown,
  patch: Partial<Record<ClinicaModuleKey, boolean | null>>
): Record<ClinicaModuleKey, boolean> {
  return mergeOverridePatch(currentRaw, patch, CLINICA_MODULE_KEYS);
}
