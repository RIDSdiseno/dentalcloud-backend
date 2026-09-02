import type { Appointment, Clinica, Convenio, Patient, Prestacion, Prevision, Sucursal, TreatmentItem, TreatmentItemPhoto, TreatmentPlan, User } from '@prisma/client';
import prisma from './prisma';
import {
  isFederationConfigured,
  mirrorAppointmentToDentalDemo,
  mirrorClinicToDentalDemo,
  mirrorConvenioToDentalDemo,
  mirrorPatientToDentalDemo,
  mirrorPrestacionToDentalDemo,
  mirrorPrevisionToDentalDemo,
  mirrorSucursalToDentalDemo,
  mirrorTreatmentItemToDentalDemo,
  mirrorTreatmentItemPhotoToDentalDemo,
  mirrorTreatmentPlanToDentalDemo,
  mirrorUserToDentalDemo,
} from './federationClient';

type EntityType =
  | 'CLINICA'
  | 'CLINICA_STATUS'
  | 'PATIENT'
  | 'APPOINTMENT'
  | 'TREATMENT_PLAN'
  | 'TREATMENT_ITEM'
  | 'TREATMENT_ITEM_REMOVAL'
  | 'TREATMENT_ITEM_PHOTO'
  | 'TREATMENT_ITEM_PHOTO_REMOVAL'
  | 'CONVENIO'
  | 'PRESTACION'
  | 'PREVISION'
  | 'USER'
  | 'SUCURSAL';

async function recordSyncFailure(entityType: EntityType, localId: string, payload: unknown, error: unknown) {
  const lastError = error instanceof Error ? error.message : String(error);
  await prisma.federationSyncFailure.upsert({
    where: { entityType_localId: { entityType, localId } },
    create: { entityType, localId, payload: payload as never, lastError },
    update: { payload: payload as never, lastError },
  });
}

async function clearSyncFailure(entityType: EntityType, localId: string) {
  await prisma.federationSyncFailure.deleteMany({ where: { entityType, localId } });
}

export type FederationSyncKey = 'patients' | 'appointments' | 'treatmentPlans' | 'users' | 'sucursales' | 'catalog';

// Una clave ausente en `settings` se trata como habilitada, para no romper
// clínicas emparejadas antes de que existiera este control granular.
function isSyncKeyEnabled(settings: unknown, key: FederationSyncKey): boolean {
  if (!settings || typeof settings !== 'object') return true;
  const value = (settings as Record<string, unknown>)[key];
  return value !== false;
}

export async function syncClinicaToFederation(
  clinica: Clinica,
  admin: { name: string; email: string; password?: string }
): Promise<void> {
  if (!isFederationConfigured()) return;

  // El password en texto plano sólo viaja en la llamada saliente (mismo
  // momento en que ya está en texto plano localmente, antes de hashearlo) —
  // nunca se persiste. Si falla y hay que reintentar más tarde, el
  // reintento ya no lo tiene y el otro lado genera uno temporal.
  const clinicType: 'DENTAL' | 'ESTHETIC' | 'BOTH' =
    clinica.tipo === 'estetica' ? 'ESTHETIC' : clinica.tipo === 'ambas' ? 'BOTH' : 'DENTAL';
  const loggablePayload = {
    externalId: clinica.id,
    name: clinica.name,
    pais: clinica.pais,
    clinicType,
    adminName: admin.name,
    adminEmail: admin.email,
  };
  const payload = { ...loggablePayload, adminPassword: admin.password };

  try {
    const mirror = await mirrorClinicToDentalDemo(payload);
    await prisma.clinica.update({ where: { id: clinica.id }, data: { federatedClinicId: mirror.id } });
    await clearSyncFailure('CLINICA', clinica.id);
  } catch (error) {
    await recordSyncFailure('CLINICA', clinica.id, loggablePayload, error);
  }
}

// Espeja el estado activo/desactivado hacia la clínica par en
// Dental-Demo-Back — se llama cuando el super-admin activa/desactiva la
// clínica (equivalente a "eliminarla" de forma reversible). No hace nada si
// la clínica no está emparejada.
export async function syncClinicaActiveStateToFederation(clinica: Clinica): Promise<void> {
  if (!isFederationConfigured() || !clinica.federatedClinicId || clinica.federationPaused) return;

  const payload = { externalId: clinica.id, name: clinica.name, active: clinica.active };

  try {
    await mirrorClinicToDentalDemo(payload);
    await clearSyncFailure('CLINICA_STATUS', clinica.id);
  } catch (error) {
    await recordSyncFailure('CLINICA_STATUS', clinica.id, payload, error);
  }
}

export async function syncPatientToFederation(patient: Patient): Promise<void> {
  if (!isFederationConfigured()) return;

  const clinica = await prisma.clinica.findUnique({
    where: { id: patient.clinicaId },
    select: { federatedClinicId: true, federationCatalogOnly: true, federationPaused: true, federationSyncSettings: true },
  });
  if (!clinica?.federatedClinicId) return; // clínica sin par: nada que sincronizar
  if (clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (clinica.federationCatalogOnly) return; // emparejamiento sólo de catálogo: nunca pacientes reales
  if (!isSyncKeyEnabled(clinica.federationSyncSettings, 'patients')) return;

  const payload = {
    clinicId: clinica.federatedClinicId,
    externalId: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    rut: patient.rut,
    email: patient.email,
    phone: patient.phone,
    birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
    heightCm: patient.heightCm,
    weightKg: patient.weightKg,
    allergies: patient.allergies,
    allergyNotes: patient.allergyNotes,
    medicalConditions: patient.medicalConditions,
    currentMedications: patient.currentMedications,
  };

  try {
    const mirror = await mirrorPatientToDentalDemo(payload);
    if (mirror.id !== patient.federatedPatientId) {
      await prisma.patient.update({ where: { id: patient.id }, data: { federatedPatientId: mirror.id } });
    }
    await clearSyncFailure('PATIENT', patient.id);
  } catch (error) {
    await recordSyncFailure('PATIENT', patient.id, payload, error);
  }
}

// `plainPassword` sólo está disponible en el momento de la creación (antes
// de hashearla) — en un reintento posterior ya no la tenemos y el otro lado
// genera una temporal (mismo trato que syncClinicaToFederation con el admin).
export async function syncUserToFederation(user: User, plainPassword?: string): Promise<void> {
  if (!isFederationConfigured() || !user.clinicaId) return;

  const clinica = await prisma.clinica.findUnique({
    where: { id: user.clinicaId },
    select: { federatedClinicId: true, federationCatalogOnly: true, federationPaused: true, federationSyncSettings: true },
  });
  if (!clinica?.federatedClinicId) return; // clínica sin par: nada que sincronizar
  if (clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (clinica.federationCatalogOnly) return; // emparejamiento sólo de catálogo: nunca cuentas reales
  if (!isSyncKeyEnabled(clinica.federationSyncSettings, 'users')) return;

  const loggablePayload = {
    clinicId: clinica.federatedClinicId,
    externalId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    rut: user.rut,
  };
  const payload = { ...loggablePayload, password: plainPassword };

  try {
    const mirror = await mirrorUserToDentalDemo(payload);
    if (mirror.id !== user.federatedUserId) {
      await prisma.user.update({ where: { id: user.id }, data: { federatedUserId: mirror.id } });
    }
    await clearSyncFailure('USER', user.id);
  } catch (error) {
    await recordSyncFailure('USER', user.id, loggablePayload, error);
  }
}

export async function syncSucursalToFederation(sucursal: Sucursal): Promise<void> {
  if (!isFederationConfigured()) return;

  const clinica = await prisma.clinica.findUnique({
    where: { id: sucursal.clinicaId },
    select: { federatedClinicId: true, federationCatalogOnly: true, federationPaused: true, federationSyncSettings: true, pais: true },
  });
  if (!clinica?.federatedClinicId) return; // clínica sin par: nada que sincronizar
  if (clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (clinica.federationCatalogOnly) return; // emparejamiento sólo de catálogo: nunca sucursales reales
  if (!isSyncKeyEnabled(clinica.federationSyncSettings, 'sucursales')) return;

  const payload = {
    clinicId: clinica.federatedClinicId,
    externalId: sucursal.id,
    name: sucursal.name,
    country: clinica.pais,
    active: sucursal.active,
  };

  try {
    const mirror = await mirrorSucursalToDentalDemo(payload);
    if (mirror.id !== sucursal.federatedSucursalId) {
      await prisma.sucursal.update({ where: { id: sucursal.id }, data: { federatedSucursalId: mirror.id } });
    }
    await clearSyncFailure('SUCURSAL', sucursal.id);
  } catch (error) {
    await recordSyncFailure('SUCURSAL', sucursal.id, payload, error);
  }
}

export async function syncAppointmentToFederation(appointment: Appointment): Promise<void> {
  if (!isFederationConfigured()) return;

  const [clinica, patient] = await Promise.all([
    prisma.clinica.findUnique({
      where: { id: appointment.clinicaId },
      select: { federatedClinicId: true, federationCatalogOnly: true, federationPaused: true, federationSyncSettings: true },
    }),
    prisma.patient.findUnique({ where: { id: appointment.patientId }, select: { federatedPatientId: true } }),
  ]);
  if (!clinica?.federatedClinicId) return; // clínica sin par: nada que sincronizar
  if (clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (clinica.federationCatalogOnly) return; // emparejamiento sólo de catálogo: nunca citas reales
  if (!isSyncKeyEnabled(clinica.federationSyncSettings, 'appointments')) return;

  if (!patient?.federatedPatientId) {
    // El paciente todavía no tiene espejo (probablemente su propio sync está
    // en curso o falló) — se registra como pendiente y el reintento lo
    // resuelve solo una vez el paciente ya tenga federatedPatientId.
    await recordSyncFailure('APPOINTMENT', appointment.id, { reason: 'patient not yet federated' }, new Error('Paciente sin espejo todavía'));
    return;
  }

  const payload = {
    clinicId: clinica.federatedClinicId,
    patientId: patient.federatedPatientId,
    externalId: appointment.id,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    // Va en el vocabulario nativo de DentalCloud ('agendada'/'cancelada') —
    // el mapeo a AppointmentStatus de Dental-Demo-Back ocurre una sola vez,
    // del lado receptor (mirrorAppointment en platform.controller.js).
    status: appointment.status,
    notes: appointment.notes,
  };

  try {
    const mirror = await mirrorAppointmentToDentalDemo(payload);
    if (mirror.id !== appointment.federatedAppointmentId) {
      await prisma.appointment.update({ where: { id: appointment.id }, data: { federatedAppointmentId: mirror.id } });
    }
    await clearSyncFailure('APPOINTMENT', appointment.id);
  } catch (error) {
    await recordSyncFailure('APPOINTMENT', appointment.id, payload, error);
  }
}

export async function syncTreatmentPlanToFederation(plan: TreatmentPlan): Promise<void> {
  if (!isFederationConfigured()) return;

  const clinica = await prisma.clinica.findUnique({ where: { id: plan.clinicaId }, select: { federationCatalogOnly: true, federationPaused: true, federationSyncSettings: true } });
  if (clinica?.federationCatalogOnly) return; // emparejamiento sólo de catálogo: nunca presupuestos reales
  if (clinica?.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (!isSyncKeyEnabled(clinica?.federationSyncSettings, 'treatmentPlans')) return;

  const patient = await prisma.patient.findUnique({ where: { id: plan.patientId }, select: { federatedPatientId: true } });
  if (!patient?.federatedPatientId) return; // paciente sin espejo: nada que sincronizar

  const [convenio, prevision, professional] = await Promise.all([
    plan.convenioId ? prisma.convenio.findUnique({ where: { id: plan.convenioId }, select: { federatedConvenioId: true } }) : null,
    plan.previsionId ? prisma.prevision.findUnique({ where: { id: plan.previsionId }, select: { federatedPrevisionId: true } }) : null,
    plan.professionalId ? prisma.user.findUnique({ where: { id: plan.professionalId }, select: { name: true } }) : null,
  ]);

  const payload = {
    patientId: patient.federatedPatientId,
    externalId: plan.id,
    title: plan.name?.trim() || `Presupuesto #${plan.number}`,
    description: plan.notes,
    status: plan.status,
    // Sólo viajan si el convenio/previsión ya tienen su par en Dental-Demo-Back
    // (catálogo federado) — si no, se omiten en vez de bloquear el sync del plan.
    agreementId: convenio?.federatedConvenioId ?? undefined,
    previsionId: prevision?.federatedPrevisionId ?? undefined,
    // Dental-Demo-Back no tiene la cuenta de este profesional (no hay
    // federación de staff) — se manda sólo el nombre, como dato informativo.
    professionalName: professional?.name ?? undefined,
    planType: plan.diagramType === 'estetica' ? ('ESTHETIC' as const) : ('DENTAL' as const),
    facialGender: plan.facialGender ?? undefined,
  };

  try {
    const mirror = await mirrorTreatmentPlanToDentalDemo(payload);
    if (mirror.id !== plan.federatedTreatmentPlanId) {
      await prisma.treatmentPlan.update({ where: { id: plan.id }, data: { federatedTreatmentPlanId: mirror.id } });
    }
    await clearSyncFailure('TREATMENT_PLAN', plan.id);
  } catch (error) {
    await recordSyncFailure('TREATMENT_PLAN', plan.id, payload, error);
  }
}

// A diferencia de Convenio/Prestacion/Prevision, un presupuesto en
// DentalCloud no tiene estado "archivado" propio — se borra de verdad. Se
// llama con la fila ya leída, antes del `.delete()` local, porque después de
// borrarla no queda nada de dónde derivar el payload (mismo criterio que
// syncTreatmentItemRemovalToFederation).
export async function syncTreatmentPlanRemovalToFederation(plan: TreatmentPlan): Promise<void> {
  if (!isFederationConfigured() || !plan.federatedTreatmentPlanId) return;

  const payload = { externalId: plan.id, removed: true as const };
  try {
    await mirrorTreatmentPlanToDentalDemo(payload);
    await clearSyncFailure('TREATMENT_PLAN', plan.id);
  } catch (error) {
    await recordSyncFailure('TREATMENT_PLAN', plan.id, payload, error);
  }
}

export async function syncTreatmentItemToFederation(item: TreatmentItem): Promise<void> {
  if (!isFederationConfigured()) return;

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id: item.treatmentPlanId },
    select: { federatedTreatmentPlanId: true, clinica: { select: { federationCatalogOnly: true, federationPaused: true, federationSyncSettings: true } } },
  });
  if (plan?.clinica.federationCatalogOnly) return; // emparejamiento sólo de catálogo: nunca ítems reales
  if (plan?.clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (!isSyncKeyEnabled(plan?.clinica.federationSyncSettings, 'treatmentPlans')) return;
  if (!plan?.federatedTreatmentPlanId) {
    // El presupuesto todavía no tiene espejo — se registra como pendiente y
    // el reintento lo resuelve solo una vez el presupuesto ya esté federado.
    await recordSyncFailure('TREATMENT_ITEM', item.id, { reason: 'plan not yet federated' }, new Error('Presupuesto sin espejo todavía'));
    return;
  }

  const prestacion = item.prestacionId
    ? await prisma.prestacion.findUnique({ where: { id: item.prestacionId }, select: { federatedPrestacionId: true } })
    : null;

  const payload = {
    treatmentPlanId: plan.federatedTreatmentPlanId,
    externalId: item.id,
    name: item.description,
    description: item.notes,
    tooth: item.toothNumber,
    unitPrice: item.cost,
    completed: item.completed,
    // Sólo viaja si la prestación ya tiene su par en Dental-Demo-Back.
    prestacionId: prestacion?.federatedPrestacionId ?? undefined,
    listPrice: item.listPrice,
    convenioDiscountPercent: item.convenioDiscountPercent,
    productName: item.productName ?? undefined,
    productLot: item.productLot ?? undefined,
    productExpiresAt: item.productExpiresAt ? item.productExpiresAt.toISOString() : undefined,
    productQuantity: item.productQuantity ?? undefined,
  };

  try {
    const mirror = await mirrorTreatmentItemToDentalDemo(payload);
    if (mirror.id !== item.federatedTreatmentItemId) {
      await prisma.treatmentItem.update({ where: { id: item.id }, data: { federatedTreatmentItemId: mirror.id } });
    }
    await clearSyncFailure('TREATMENT_ITEM', item.id);
  } catch (error) {
    await recordSyncFailure('TREATMENT_ITEM', item.id, payload, error);
  }
}

// Fotos del procedimiento — solo lectura del lado de Dental-Demo (Cloudinary
// vive acá; el otro lado sólo guarda la URL pública + etiqueta). No hay
// federatedPhotoId que llevar de vuelta — la propia foto (photo.id) sirve de
// externalId estable para upsert/borrado.
export async function syncTreatmentItemPhotoToFederation(photo: TreatmentItemPhoto): Promise<void> {
  if (!isFederationConfigured()) return;

  const item = await prisma.treatmentItem.findUnique({
    where: { id: photo.treatmentItemId },
    select: { federatedTreatmentItemId: true },
  });
  if (!item?.federatedTreatmentItemId) {
    // El ítem todavía no tiene espejo — se registra como pendiente y el
    // reintento lo resuelve solo una vez el ítem ya esté federado.
    await recordSyncFailure('TREATMENT_ITEM_PHOTO', photo.id, { reason: 'item not yet federated' }, new Error('Ítem sin espejo todavía'));
    return;
  }

  const payload = {
    treatmentItemId: item.federatedTreatmentItemId,
    externalId: photo.id,
    url: photo.url,
    label: photo.label ?? undefined,
  };

  try {
    await mirrorTreatmentItemPhotoToDentalDemo(payload);
    await clearSyncFailure('TREATMENT_ITEM_PHOTO', photo.id);
  } catch (error) {
    await recordSyncFailure('TREATMENT_ITEM_PHOTO', photo.id, payload, error);
  }
}

// Se llama con la foto ya leída, antes del `.delete()` local — después de
// borrarla no queda nada de dónde derivar el payload (mismo criterio que
// syncTreatmentItemRemovalToFederation).
export async function syncTreatmentItemPhotoRemovalToFederation(photoId: string): Promise<void> {
  if (!isFederationConfigured()) return;

  const payload = { externalId: photoId, removed: true as const };
  try {
    await mirrorTreatmentItemPhotoToDentalDemo(payload);
    await clearSyncFailure('TREATMENT_ITEM_PHOTO_REMOVAL', photoId);
  } catch (error) {
    await recordSyncFailure('TREATMENT_ITEM_PHOTO_REMOVAL', photoId, payload, error);
  }
}

// El procedimiento se borra de verdad en DentalCloud (no hay estado
// "cancelado" a nivel de ítem) — se avisa al espejo para que también lo
// quite. Se llama con la fila ya leída, antes del `.delete()` local, porque
// después de borrarla no queda nada de dónde derivar el payload.
export async function syncTreatmentItemRemovalToFederation(item: TreatmentItem): Promise<void> {
  if (!isFederationConfigured() || !item.federatedTreatmentItemId) return;

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id: item.treatmentPlanId },
    select: { federatedTreatmentPlanId: true, clinica: { select: { federationCatalogOnly: true, federationPaused: true, federationSyncSettings: true } } },
  });
  if (plan?.clinica.federationCatalogOnly) return;
  if (plan?.clinica.federationPaused) return;
  if (!isSyncKeyEnabled(plan?.clinica.federationSyncSettings, 'treatmentPlans')) return;
  if (!plan?.federatedTreatmentPlanId) return;

  const payload = { treatmentPlanId: plan.federatedTreatmentPlanId, externalId: item.id, removed: true };
  try {
    await mirrorTreatmentItemToDentalDemo(payload);
    await clearSyncFailure('TREATMENT_ITEM_REMOVAL', item.id);
  } catch (error) {
    await recordSyncFailure('TREATMENT_ITEM_REMOVAL', item.id, payload, error);
  }
}

// Convenios y prestaciones son catálogo de la clínica (no de un paciente), así
// que sólo necesitan que la clínica esté emparejada — mismo criterio que
// syncClinicaActiveStateToFederation.
export async function syncConvenioToFederation(convenio: Convenio): Promise<void> {
  if (!isFederationConfigured()) return;

  const clinica = await prisma.clinica.findUnique({ where: { id: convenio.clinicaId }, select: { federatedClinicId: true, federationPaused: true, federationSyncSettings: true } });
  if (!clinica?.federatedClinicId) return; // clínica sin par: nada que sincronizar
  if (clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (!isSyncKeyEnabled(clinica.federationSyncSettings, 'catalog')) return;

  const payload = {
    clinicId: clinica.federatedClinicId,
    externalId: convenio.id,
    name: convenio.name,
    discountPercent: convenio.discountPercent,
    active: convenio.active,
  };

  try {
    const mirror = await mirrorConvenioToDentalDemo(payload);
    if (mirror.id !== convenio.federatedConvenioId) {
      await prisma.convenio.update({ where: { id: convenio.id }, data: { federatedConvenioId: mirror.id } });
    }
    await clearSyncFailure('CONVENIO', convenio.id);
  } catch (error) {
    await recordSyncFailure('CONVENIO', convenio.id, payload, error);
  }
}

export async function syncPrestacionToFederation(prestacion: Prestacion): Promise<void> {
  if (!isFederationConfigured()) return;

  const clinica = await prisma.clinica.findUnique({ where: { id: prestacion.clinicaId }, select: { federatedClinicId: true, federationPaused: true, federationSyncSettings: true } });
  if (!clinica?.federatedClinicId) return; // clínica sin par: nada que sincronizar
  if (clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (!isSyncKeyEnabled(clinica.federationSyncSettings, 'catalog')) return;

  const payload = {
    clinicId: clinica.federatedClinicId,
    externalId: prestacion.id,
    name: prestacion.name,
    code: prestacion.code,
    basePrice: prestacion.basePrice,
    active: prestacion.active,
    odontogramMode: prestacion.category === 'dental' ? prestacion.odontogramMode : undefined,
    requiresProductTracking: prestacion.requiresProductTracking,
  };

  try {
    const mirror = await mirrorPrestacionToDentalDemo(payload);
    if (mirror.id !== prestacion.federatedPrestacionId) {
      await prisma.prestacion.update({ where: { id: prestacion.id }, data: { federatedPrestacionId: mirror.id } });
    }
    await clearSyncFailure('PRESTACION', prestacion.id);
  } catch (error) {
    await recordSyncFailure('PRESTACION', prestacion.id, payload, error);
  }
}

export async function syncPrevisionToFederation(prevision: Prevision): Promise<void> {
  if (!isFederationConfigured()) return;

  const clinica = await prisma.clinica.findUnique({ where: { id: prevision.clinicaId }, select: { federatedClinicId: true, federationPaused: true, federationSyncSettings: true } });
  if (!clinica?.federatedClinicId) return; // clínica sin par: nada que sincronizar
  if (clinica.federationPaused) return; // sincronización pausada manualmente desde Super Admin
  if (!isSyncKeyEnabled(clinica.federationSyncSettings, 'catalog')) return;

  const payload = {
    clinicId: clinica.federatedClinicId,
    externalId: prevision.id,
    name: prevision.name,
    active: prevision.active,
  };

  try {
    const mirror = await mirrorPrevisionToDentalDemo(payload);
    if (mirror.id !== prevision.federatedPrevisionId) {
      await prisma.prevision.update({ where: { id: prevision.id }, data: { federatedPrevisionId: mirror.id } });
    }
    await clearSyncFailure('PREVISION', prevision.id);
  } catch (error) {
    await recordSyncFailure('PREVISION', prevision.id, payload, error);
  }
}

// Usado por el reintento (src/lib/federationRetry.ts): vuelve a leer la fila
// local vigente por su id y reintenta el mismo sync — nunca reintenta con el
// payload guardado (que puede estar obsoleto), siempre con el estado actual.
export async function retryFederationSync(entityType: string, localId: string): Promise<void> {
  if (entityType === 'CLINICA') {
    const clinica = await prisma.clinica.findUnique({ where: { id: localId } });
    if (!clinica || clinica.federatedClinicId) return clearSyncFailure('CLINICA', localId);
    const admin = await prisma.user.findFirst({
      where: { clinicaId: localId, role: 'admin' },
      orderBy: { name: 'asc' },
      select: { name: true, email: true },
    });
    if (!admin) return; // no hay admin todavía para reintentar con sus datos de contacto
    return syncClinicaToFederation(clinica, admin);
  }

  if (entityType === 'CLINICA_STATUS') {
    const clinica = await prisma.clinica.findUnique({ where: { id: localId } });
    if (!clinica) return clearSyncFailure('CLINICA_STATUS', localId);
    return syncClinicaActiveStateToFederation(clinica);
  }

  if (entityType === 'PATIENT') {
    const patient = await prisma.patient.findUnique({ where: { id: localId } });
    if (!patient) return clearSyncFailure('PATIENT', localId);
    return syncPatientToFederation(patient);
  }

  if (entityType === 'APPOINTMENT') {
    const appointment = await prisma.appointment.findUnique({ where: { id: localId } });
    if (!appointment) return clearSyncFailure('APPOINTMENT', localId);
    return syncAppointmentToFederation(appointment);
  }

  if (entityType === 'TREATMENT_PLAN') {
    const plan = await prisma.treatmentPlan.findUnique({ where: { id: localId } });
    if (!plan) return clearSyncFailure('TREATMENT_PLAN', localId);
    return syncTreatmentPlanToFederation(plan);
  }

  if (entityType === 'TREATMENT_ITEM') {
    const item = await prisma.treatmentItem.findUnique({ where: { id: localId } });
    if (!item) return clearSyncFailure('TREATMENT_ITEM', localId);
    return syncTreatmentItemToFederation(item);
  }

  if (entityType === 'CONVENIO') {
    const convenio = await prisma.convenio.findUnique({ where: { id: localId } });
    if (!convenio) return clearSyncFailure('CONVENIO', localId);
    return syncConvenioToFederation(convenio);
  }

  if (entityType === 'PRESTACION') {
    const prestacion = await prisma.prestacion.findUnique({ where: { id: localId } });
    if (!prestacion) return clearSyncFailure('PRESTACION', localId);
    return syncPrestacionToFederation(prestacion);
  }

  if (entityType === 'PREVISION') {
    const prevision = await prisma.prevision.findUnique({ where: { id: localId } });
    if (!prevision) return clearSyncFailure('PREVISION', localId);
    return syncPrevisionToFederation(prevision);
  }

  if (entityType === 'USER') {
    const user = await prisma.user.findUnique({ where: { id: localId } });
    if (!user) return clearSyncFailure('USER', localId);
    return syncUserToFederation(user); // sin plainPassword: el otro lado genera una temporal
  }

  if (entityType === 'SUCURSAL') {
    const sucursal = await prisma.sucursal.findUnique({ where: { id: localId } });
    if (!sucursal) return clearSyncFailure('SUCURSAL', localId);
    return syncSucursalToFederation(sucursal);
  }

  if (entityType === 'TREATMENT_ITEM_REMOVAL') {
    // El ítem ya no existe localmente — a diferencia de los demás casos, aquí
    // sí hay que reintentar con el payload guardado (no hay fila de dónde
    // re-derivarlo).
    const failure = await prisma.federationSyncFailure.findUnique({
      where: { entityType_localId: { entityType: 'TREATMENT_ITEM_REMOVAL', localId } },
    });
    if (!failure) return;
    try {
      await mirrorTreatmentItemToDentalDemo(failure.payload as never);
      await clearSyncFailure('TREATMENT_ITEM_REMOVAL', localId);
    } catch (error) {
      await recordSyncFailure('TREATMENT_ITEM_REMOVAL', localId, failure.payload, error);
    }
  }
}
