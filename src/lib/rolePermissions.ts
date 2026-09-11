import { CLINICA_MODULE_LABELS, type ClinicaModuleKey } from './clinicaModules';

// Roles a los que aplica esta matriz de permisos. `admin` y `super_admin`
// siempre tienen acceso completo y no pasan por aquí — ver
// requireRolePermission.ts.
export const PERMISSIONED_ROLES = ['odontologo', 'radiologo', 'operador'] as const;
export type PermissionedRole = (typeof PERMISSIONED_ROLES)[number];

export function isPermissionedRole(role: string): role is PermissionedRole {
  return (PERMISSIONED_ROLES as readonly string[]).includes(role);
}

// "Permisos generales": no son pantallas completas sino GRUPOS de campos
// dentro de la ficha del paciente (ver PATIENT_FIELD_GROUPS en
// patientsController.ts) — permiten, por ejemplo, que un operador (recepción)
// pueda seguir cargando nombre/RUT/contacto de un paciente nuevo sin poder
// tocar el motivo de consulta, en vez de bloquearle la pantalla "Pacientes"
// entera (reunión 2/9 con Urbina: "el motivo de consulta lo tiene que
// preguntar el doctor").
export const GENERAL_PATIENT_PERMISSION_KEYS = [
  'datosPersonales',
  'datosContacto',
  'antecedentesMedicos',
  'motivoConsulta',
  'contactoEmergencia',
] as const;
export type GeneralPatientPermissionKey = (typeof GENERAL_PATIENT_PERMISSION_KEYS)[number];

// Las 8 pantallas de `Clinica.modules` + Rx (que se controla aparte, vía
// `Clinica.rxEnabled`, pero también necesita su propio permiso por perfil) +
// permisos de acción puntuales que no son "ver una pantalla completa" sino
// "hacer algo específico dentro de ella" (ej. crear presupuestos, ver
// treatmentPlansController.ts) + los 5 "permisos generales" de arriba.
export const PERMISSION_KEYS = [
  ...(Object.keys(CLINICA_MODULE_LABELS) as ClinicaModuleKey[]),
  'rx',
  'crearPresupuestos',
  ...GENERAL_PATIENT_PERMISSION_KEYS,
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type RolePermissions = Record<PermissionedRole, Record<PermissionKey, boolean>>;

const ALL_TRUE = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermissionKey, boolean>;

// Por ahora los 3 perfiles parten con acceso completo (igual que hoy); la
// idea es que cada clínica los ajuste desde el panel de permisos cuando lo
// necesite, no que el sistema imponga restricciones de entrada. Única
// excepción de fábrica: "operador" (recepción/secretaria) parte SIN acceso a
// "Motivo de consulta" — pedido explícito del cliente. Odontólogo y
// radiólogo (roles clínicos) parten con acceso, igual que el resto.
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  odontologo: { ...ALL_TRUE },
  radiologo: { ...ALL_TRUE },
  operador: { ...ALL_TRUE, motivoConsulta: false },
};

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  ...CLINICA_MODULE_LABELS,
  rx: 'Módulo Rx',
  crearPresupuestos: 'Crear presupuestos',
  datosPersonales: 'Datos personales',
  datosContacto: 'Datos de contacto',
  antecedentesMedicos: 'Antecedentes médicos',
  motivoConsulta: 'Motivo de consulta',
  contactoEmergencia: 'Contacto de emergencia',
};

// Mismo espíritu que `parseClinicaModules`: rellena cualquier rol/llave
// faltante con el default, para poder sumar perfiles/pantallas nuevas sin
// migración de datos.
export function parseRolePermissions(raw: unknown): RolePermissions {
  const parsed = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result: RolePermissions = {
    odontologo: { ...DEFAULT_ROLE_PERMISSIONS.odontologo },
    radiologo: { ...DEFAULT_ROLE_PERMISSIONS.radiologo },
    operador: { ...DEFAULT_ROLE_PERMISSIONS.operador },
  };
  for (const role of PERMISSIONED_ROLES) {
    const rolePatch = parsed[role];
    if (typeof rolePatch === 'object' && rolePatch !== null) {
      for (const key of PERMISSION_KEYS) {
        const value = (rolePatch as Record<string, unknown>)[key];
        if (typeof value === 'boolean') {
          result[role][key] = value;
        }
      }
    }
  }
  return result;
}
