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

// Pestañas de la ficha del paciente que no tenían permiso propio. Las otras
// siete (tratamientos, evoluciones, cartola, observaciones, documentos
// clínicos, consentimientos y rx) ya se controlan con las llaves de módulo, y
// en el panel se muestran agrupadas junto a éstas: son las mismas llaves, no
// interruptores duplicados.
export const PATIENT_TAB_PERMISSION_KEYS = ['fichaDatos', 'fichaExamenEstetico', 'fichaHoras'] as const;
export type PatientTabPermissionKey = (typeof PATIENT_TAB_PERMISSION_KEYS)[number];

// Las 8 pantallas de `Clinica.modules` + Rx (que se controla aparte, vía
// `Clinica.rxEnabled`, pero también necesita su propio permiso por perfil) +
// permisos de acción puntuales que no son "ver una pantalla completa" sino
// "hacer algo específico dentro de ella" (ej. crear presupuestos, ver
// treatmentPlansController.ts) + los 5 "permisos generales" + las pestañas
// propias de la ficha.
export const PERMISSION_KEYS = [
  ...(Object.keys(CLINICA_MODULE_LABELS) as ClinicaModuleKey[]),
  'rx',
  'crearPresupuestos',
  'eliminarEvoluciones',
  ...GENERAL_PATIENT_PERMISSION_KEYS,
  ...PATIENT_TAB_PERMISSION_KEYS,
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type RolePermissions = Record<PermissionedRole, Record<PermissionKey, boolean>>;

const ALL_TRUE = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermissionKey, boolean>;

// Los 3 perfiles parten con acceso completo: la idea es que cada clínica los
// ajuste desde el panel cuando lo necesite, no que el sistema imponga
// restricciones de entrada.
//
// Excepciones de fábrica (el resto parte en true):
//  - "operador" (recepción) sin "Motivo de consulta": lo completa el profesional
//    durante la atención, pedido explícito del cliente.
//  - NADIE puede anular evoluciones. Es un registro clínico: en Chile no se
//    puede borrar y hacerlo sería fraude (reunión 30/09) — por eso ni siquiera
//    se borran, se anulan: quedan a la vista tachadas, con quién, cuándo y por
//    qué (ver evolutionsController.ts). Queda como permiso y no como bloqueo
//    absoluto para que una clínica pueda concedérselo a alguien puntual si lo
//    necesita, pero nunca por defecto. El administrador sí puede, como con el
//    resto de los permisos.
//    La llave sigue llamándose `eliminarEvoluciones` para no invalidar las
//    excepciones por usuario ya guardadas en la base.
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  odontologo: { ...ALL_TRUE, eliminarEvoluciones: false },
  radiologo: { ...ALL_TRUE, eliminarEvoluciones: false },
  operador: { ...ALL_TRUE, motivoConsulta: false, eliminarEvoluciones: false },
};

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  ...CLINICA_MODULE_LABELS,
  rx: 'Módulo Rx',
  crearPresupuestos: 'Crear presupuestos',
  eliminarEvoluciones: 'Anular evoluciones',
  datosPersonales: 'Datos personales',
  datosContacto: 'Datos de contacto',
  antecedentesMedicos: 'Antecedentes médicos',
  motivoConsulta: 'Motivo de consulta',
  contactoEmergencia: 'Contacto de emergencia',
  fichaDatos: 'Datos paciente',
  fichaExamenEstetico: 'Examen Estético',
  fichaHoras: 'Horas',
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
