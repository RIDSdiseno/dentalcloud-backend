import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import cloudinary from '../lib/cloudinary';
import { cleanRut, isValidRut } from '../utils/rut';
import { ALLERGY_KEYS } from '../lib/allergies';
import { fetchPrivacyConsentSummaries, fetchPrivacyConsentSummary, withPrivacyConsentSummary } from '../lib/privacyConsentSummary';
import { syncPatientToDimageIfNeeded } from '../lib/dimagePatientSync';
import { syncPatientToFederation } from '../lib/federationSync';
import { VOICE_RECORDING_CONSENT_CODE, PHOTO_USAGE_CONSENT_CODE } from '../lib/consentTypes';
import { PERMISSION_LABELS, type GeneralPatientPermissionKey } from '../lib/rolePermissions';
import { resolveRequestPermissions } from '../middleware/requireRolePermission';
import { sanitizeAnamnesisData } from '../lib/anamnesisData';
import { generateAnamnesisSummary } from '../lib/anamnesisSummaryAi';
import { isOpenAIConfigured } from '../lib/openai';
import { assertAiTokenBudget, recordAiTokenUsage, AiTokenLimitError } from '../lib/aiTokenUsage';

// Auditoría de seguridad (11/09): getOne/update/uploadPhoto/uploadExamPhoto/
// uploadMotivoConsultaAudio/corroborateData buscaban el paciente SOLO por id,
// sin confirmar que fuera de la clínica de quien pedía — cualquier cuenta de
// staff podía leer o modificar la ficha de un paciente de OTRA clínica con
// solo conocer su UUID. `super_admin` sigue con acceso total (plataforma);
// todos los demás roles quedan acotados a su propia clínica, igual que ya
// hace `list()`.
function patientBelongsToRequester(patient: { clinicaId: string }, req: Request): boolean {
  return req.user?.role === 'super_admin' || patient.clinicaId === req.user?.clinicaId;
}

// A qué "permiso general" pertenece cada campo editable de la ficha — nombre,
// RUT y apellido quedan siempre fuera (recepción siempre tiene que poder
// registrar un paciente nuevo). El resto de la ficha (examen estético,
// juicio clínico) tiene su propio módulo/gate y no pasa por acá.
const PATIENT_FIELD_GROUPS: Record<GeneralPatientPermissionKey, (keyof PatientInput)[]> = {
  datosPersonales: [
    'gender',
    'maritalStatus',
    'nationality',
    'occupation',
    'birthDate',
    'heightCm',
    'weightKg',
    'healthInsurance',
    'healthInsuranceDetail',
    'bloodType',
    'tags',
  ],
  datosContacto: ['phone', 'email', 'address'],
  antecedentesMedicos: ['allergies', 'allergyNotes', 'medicalConditions', 'currentMedications', 'chronicDiseases', 'dentalHistory'],
  motivoConsulta: ['motivoConsulta'],
  contactoEmergencia: ['emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship'],
};

type PatientInput = {
  rut?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
  gender?: string;
  nationality?: string;
  maritalStatus?: string;
  occupation?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  allergies?: string[];
  allergyNotes?: string;
  medicalConditions?: string;
  currentMedications?: string;
  chronicDiseases?: string;
  dentalHistory?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  healthInsurance?: string;
  healthInsuranceDetail?: string;
  bloodType?: string;
  tags?: string[];
  motivoConsulta?: string;
  anamnesisData?: unknown;
  expectativasPaciente?: string;
  optimoTratamiento?: string;
  examSkinType?: string;
  examSkinQuality?: string;
  examFitzpatrick?: string;
  examWrinkles?: string;
  examFlaccidity?: string;
  examVolume?: string;
  examAsymmetries?: boolean | null;
  examAsymmetryNotes?: string;
  examDiagnosis?: string;
};

const EXAM_PHOTO_SLOTS = ['frontal', 'perfilDerecho', '45derecha', '45izquierda'] as const;
type ExamPhotoSlot = (typeof EXAM_PHOTO_SLOTS)[number];

// Registro corporal (14/09, pedido explícito): mismo mecanismo que el
// facial, con sus propios 4 ángulos — se distinguen por `area` en ExamPhoto.
// 'facialAvanzado' (30/09, demo): mismos 4 ángulos que el facial, pero
// tomados con el escaneo guiado que detecta la orientación de la cabeza en
// vivo. Se guarda como un área aparte para que conviva con el registro normal
// sin mezclarse — `area` es una columna de texto, así que no necesita
// migración, solo aceptarse acá.
const EXAM_PHOTO_AREAS = ['facial', 'corporal', 'facialAvanzado'] as const;
type ExamPhotoArea = (typeof EXAM_PHOTO_AREAS)[number];
const EXAM_PHOTO_SLOTS_BY_AREA: Record<ExamPhotoArea, readonly string[]> = {
  facial: EXAM_PHOTO_SLOTS,
  corporal: ['frontal', 'espalda', 'perfilIzquierdo', 'perfilDerecho'],
  facialAvanzado: EXAM_PHOTO_SLOTS,
};

function sanitizeAllergies(allergies?: string[]): string[] | undefined {
  if (allergies === undefined) return undefined;
  if (!Array.isArray(allergies)) return [];
  const validKeys: readonly string[] = ALLERGY_KEYS;
  return allergies.filter((a) => typeof a === 'string' && validKeys.includes(a));
}

function sanitizeTags(tags?: string[]): string[] | undefined {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .filter((t) => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  return [...new Set(cleaned)];
}

function toPatientData(body: PatientInput) {
  return {
    firstName: body.firstName!.trim(),
    lastName: body.lastName!.trim(),
    phone: body.phone?.trim() || null,
    email: body.email?.trim() || null,
    birthDate: body.birthDate ? new Date(body.birthDate) : null,
    address: body.address?.trim() || null,
    gender: body.gender?.trim() || null,
    nationality: body.nationality?.trim() || null,
    maritalStatus: body.maritalStatus?.trim() || null,
    occupation: body.occupation?.trim() || null,
    heightCm: body.heightCm != null ? Math.round(body.heightCm) : null,
    weightKg: body.weightKg != null ? body.weightKg : null,
    allergies: sanitizeAllergies(body.allergies) ?? [],
    allergyNotes: body.allergyNotes?.trim() || null,
    medicalConditions: body.medicalConditions?.trim() || null,
    currentMedications: body.currentMedications?.trim() || null,
    chronicDiseases: body.chronicDiseases?.trim() || null,
    dentalHistory: body.dentalHistory?.trim() || null,
    emergencyContactName: body.emergencyContactName?.trim() || null,
    emergencyContactPhone: body.emergencyContactPhone?.trim() || null,
    emergencyContactRelationship: body.emergencyContactRelationship?.trim() || null,
    healthInsurance: body.healthInsurance?.trim() || null,
    healthInsuranceDetail: body.healthInsuranceDetail?.trim() || null,
    bloodType: body.bloodType?.trim() || null,
    tags: sanitizeTags(body.tags) ?? [],
    motivoConsulta: body.motivoConsulta?.trim() || null,
    anamnesisData: body.anamnesisData !== undefined ? sanitizeAnamnesisData(body.anamnesisData) : undefined,
    expectativasPaciente: body.expectativasPaciente?.trim() || null,
    optimoTratamiento: body.optimoTratamiento?.trim() || null,
    examSkinType: body.examSkinType?.trim() || null,
    examSkinQuality: body.examSkinQuality?.trim() || null,
    examFitzpatrick: body.examFitzpatrick?.trim() || null,
    examWrinkles: body.examWrinkles?.trim() || null,
    examFlaccidity: body.examFlaccidity?.trim() || null,
    examVolume: body.examVolume?.trim() || null,
    examAsymmetries: body.examAsymmetries ?? null,
    examAsymmetryNotes: body.examAsymmetryNotes?.trim() || null,
    examDiagnosis: body.examDiagnosis?.trim() || null,
  };
}

function toPatientPatch(body: PatientInput) {
  const patch: Record<string, unknown> = {};
  if (body.firstName !== undefined) patch.firstName = body.firstName.trim();
  if (body.lastName !== undefined) patch.lastName = body.lastName.trim();
  if (body.phone !== undefined) patch.phone = body.phone.trim() || null;
  if (body.email !== undefined) patch.email = body.email.trim() || null;
  if (body.birthDate !== undefined) patch.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  if (body.address !== undefined) patch.address = body.address.trim() || null;
  if (body.gender !== undefined) patch.gender = body.gender.trim() || null;
  if (body.nationality !== undefined) patch.nationality = body.nationality.trim() || null;
  if (body.maritalStatus !== undefined) patch.maritalStatus = body.maritalStatus.trim() || null;
  if (body.occupation !== undefined) patch.occupation = body.occupation.trim() || null;
  if (body.heightCm !== undefined) patch.heightCm = body.heightCm != null ? Math.round(body.heightCm) : null;
  if (body.weightKg !== undefined) patch.weightKg = body.weightKg;
  if (body.allergies !== undefined) patch.allergies = sanitizeAllergies(body.allergies);
  if (body.allergyNotes !== undefined) patch.allergyNotes = body.allergyNotes.trim() || null;
  if (body.medicalConditions !== undefined) patch.medicalConditions = body.medicalConditions.trim() || null;
  if (body.currentMedications !== undefined) patch.currentMedications = body.currentMedications.trim() || null;
  if (body.chronicDiseases !== undefined) patch.chronicDiseases = body.chronicDiseases.trim() || null;
  if (body.dentalHistory !== undefined) patch.dentalHistory = body.dentalHistory.trim() || null;
  if (body.emergencyContactName !== undefined) patch.emergencyContactName = body.emergencyContactName.trim() || null;
  if (body.emergencyContactPhone !== undefined) patch.emergencyContactPhone = body.emergencyContactPhone.trim() || null;
  if (body.emergencyContactRelationship !== undefined) patch.emergencyContactRelationship = body.emergencyContactRelationship.trim() || null;
  if (body.healthInsurance !== undefined) patch.healthInsurance = body.healthInsurance.trim() || null;
  if (body.healthInsuranceDetail !== undefined) patch.healthInsuranceDetail = body.healthInsuranceDetail.trim() || null;
  if (body.bloodType !== undefined) patch.bloodType = body.bloodType.trim() || null;
  if (body.tags !== undefined) patch.tags = sanitizeTags(body.tags);
  if (body.motivoConsulta !== undefined) patch.motivoConsulta = body.motivoConsulta.trim() || null;
  if (body.anamnesisData !== undefined) patch.anamnesisData = sanitizeAnamnesisData(body.anamnesisData);
  if (body.expectativasPaciente !== undefined) patch.expectativasPaciente = body.expectativasPaciente.trim() || null;
  if (body.optimoTratamiento !== undefined) patch.optimoTratamiento = body.optimoTratamiento.trim() || null;
  if (body.examSkinType !== undefined) patch.examSkinType = body.examSkinType.trim() || null;
  if (body.examSkinQuality !== undefined) patch.examSkinQuality = body.examSkinQuality.trim() || null;
  if (body.examFitzpatrick !== undefined) patch.examFitzpatrick = body.examFitzpatrick.trim() || null;
  if (body.examWrinkles !== undefined) patch.examWrinkles = body.examWrinkles.trim() || null;
  if (body.examFlaccidity !== undefined) patch.examFlaccidity = body.examFlaccidity.trim() || null;
  if (body.examVolume !== undefined) patch.examVolume = body.examVolume.trim() || null;
  if (body.examAsymmetries !== undefined) patch.examAsymmetries = body.examAsymmetries;
  if (body.examAsymmetryNotes !== undefined) patch.examAsymmetryNotes = body.examAsymmetryNotes.trim() || null;
  if (body.examDiagnosis !== undefined) patch.examDiagnosis = body.examDiagnosis.trim() || null;
  return patch;
}

// Oculta los grupos de campos que el perfil no tiene permitido ver.
//
// Hasta ahora los "permisos generales" solo bloqueaban ESCRIBIR esos campos
// (ver el chequeo en update()); al LEER se devolvía la ficha completa. Por eso
// poner "Datos personales = No" no ocultaba el teléfono: el dato igual viajaba
// al navegador y la pantalla lo mostraba. Peor aún, los datos llegaban al
// cliente aunque la interfaz los escondiera, así que bastaba con mirar la
// respuesta de la API para verlos.
//
// Se devuelven en null en vez de omitir la propiedad para no romper a quien
// espera que el campo exista; "sin acceso" se ve igual que "sin dato".
function hidePatientFieldsWithoutPermission<T extends Record<string, unknown>>(
  patient: T,
  permissions: Awaited<ReturnType<typeof resolveRequestPermissions>>
): T {
  if (permissions === 'full-access') return patient;
  if (permissions === 'no-clinic') return patient;
  const result: Record<string, unknown> = { ...patient };
  for (const [key, fields] of Object.entries(PATIENT_FIELD_GROUPS) as [
    GeneralPatientPermissionKey,
    (keyof PatientInput)[],
  ][]) {
    if (permissions[key]) continue;
    for (const field of fields) {
      if (field in result) result[field] = Array.isArray(result[field]) ? [] : null;
    }
  }
  // El examen estético viaja dentro del propio paciente, no solo en sus
  // endpoints de fotos: sin esto, ocultar la pestaña dejaría igual a la vista
  // el diagnóstico y el resto de la evaluación en la respuesta de la API.
  if (!permissions.fichaExamenEstetico) {
    for (const field of Object.keys(result)) {
      if (field.startsWith('exam')) result[field] = Array.isArray(result[field]) ? [] : null;
    }
  }
  return result as T;
}

export async function list(req: Request, res: Response) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const searchRut = cleanRut(search);
  const clinicaId = req.user!.clinicaId!;

  const patients = await prisma.patient.findMany({
    where: {
      clinicaId,
      ...(search
        ? {
            OR: [
              ...(searchRut ? [{ rut: { contains: searchRut, mode: 'insensitive' as const } }] : []),
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 50,
  });
  const summaries = await fetchPrivacyConsentSummaries(patients.map((p) => p.id));
  const permissions = await resolveRequestPermissions(req);
  return res.json({
    patients: patients.map((p) =>
      hidePatientFieldsWithoutPermission(withPrivacyConsentSummary(p, summaries), permissions)
    ),
  });
}

export async function getOne(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  const summary = await fetchPrivacyConsentSummary(patient.id);
  const permissions = await resolveRequestPermissions(req);
  return res.json({ patient: hidePatientFieldsWithoutPermission({ ...patient, ...summary }, permissions) });
}

export async function create(req: Request, res: Response) {
  const body = req.body as PatientInput;

  if (!body.rut || !isValidRut(body.rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }
  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  }

  const clinicaId = req.user!.clinicaId!;
  const rut = cleanRut(body.rut);
  const existing = await prisma.patient.findFirst({ where: { clinicaId, rut } });
  if (existing) {
    return res.status(409).json({ error: `Ya existe un paciente con el RUT ${rut}` });
  }

  const patient = await prisma.patient.create({ data: { rut, clinicaId, ...toPatientData(body) } });

  const clinica = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { rxEnabled: true } });
  if (clinica?.rxEnabled) {
    // Best-effort: si la clínica tiene el módulo Rx habilitado, el paciente
    // queda disponible en RIDS RX desde su creación (no solo al crear una
    // orden), para poder generar órdenes desde cualquiera de los dos sistemas.
    // No bloquea ni falla la creación del paciente si Dimage no responde.
    syncPatientToDimageIfNeeded(patient).catch((err) => {
      console.error('No se pudo sincronizar el paciente recién creado con RIDS RX', err);
    });
  }

  // Best-effort: si la clínica de este paciente está emparejada con
  // Dental-Demo-Back, lo espeja allá para que administración lo vea también.
  syncPatientToFederation(patient).catch((err) => {
    console.error('No se pudo sincronizar el paciente recién creado con Dental-Demo-Back', err);
  });

  return res.status(201).json({ patient });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const body = req.body as PatientInput;
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  if (body.rut && !isValidRut(body.rut)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }

  // "Permisos generales": a diferencia del resto de este endpoint (que solo
  // exige el módulo "pacientes" completo, vía requireRolePermission en la
  // ruta), estos grupos de campos se chequean acá adentro para poder
  // bloquear SOLO, por ejemplo, "Motivo de consulta" sin bloquear el resto de
  // la ficha (así recepción sigue pudiendo cargar nombre/RUT/contacto).
  const permissions = await resolveRequestPermissions(req);
  if (permissions !== 'full-access' && permissions !== 'no-clinic') {
    for (const [key, fields] of Object.entries(PATIENT_FIELD_GROUPS) as [GeneralPatientPermissionKey, (keyof PatientInput)[]][]) {
      if (permissions[key]) continue;
      // Los campos sin permiso se descartan del cuerpo en vez de rechazar la
      // petición completa. Antes esto devolvía 403 apenas el cuerpo mencionara
      // uno de estos campos, y el formulario SIEMPRE manda estatura, peso,
      // alergias y etiquetas aunque vayan vacías — así que apagar un permiso
      // dejaba a ese perfil sin poder guardar absolutamente nada del paciente,
      // ni siquiera lo que sí tenía permitido. Descartándolos, cada perfil
      // edita lo suyo y lo bloqueado nunca se toca ni se sobrescribe.
      for (const field of fields) delete body[field];
    }
  }

  // Si el paciente ya tenía sus datos corroborados por un médico y ahora se
  // cambia justo el tipo de dato que se corrobora (identidad/contacto), esa
  // confirmación queda obsoleta — se limpia para que el sistema vuelva a
  // pedirla, en vez de dejar una corroboración vieja como si siguiera
  // vigente sobre datos que ya cambiaron.
  const IDENTITY_INVALIDATION_FIELDS: (keyof PatientInput)[] = [
    'rut',
    'firstName',
    'lastName',
    ...PATIENT_FIELD_GROUPS.datosPersonales,
    ...PATIENT_FIELD_GROUPS.datosContacto,
    ...PATIENT_FIELD_GROUPS.contactoEmergencia,
  ];
  const invalidatesCorroboration =
    patient.datosCorroboradosAt !== null && IDENTITY_INVALIDATION_FIELDS.some((field) => body[field] !== undefined);

  const updated = await prisma.patient.update({
    where: { id: req.params.id },
    data: {
      ...(body.rut ? { rut: cleanRut(body.rut) } : {}),
      ...toPatientPatch(body),
      ...(invalidatesCorroboration ? { datosCorroboradosAt: null, datosCorroboradosPorId: null } : {}),
    },
  });

  syncPatientToFederation(updated).catch((err) => {
    console.error('No se pudo sincronizar la edición del paciente con Dental-Demo-Back', err);
  });

  return res.json({ patient: updated });
}

// Etapa 01 (reunión 2/9 con Urbina): recepción puede cargar los datos
// administrativos, pero el médico tiene que repasarlos con el paciente
// presente antes de avanzar — "Juanita, ¿por qué viene a la consulta?",
// confirmando que no hay errores de tipeo. Reusa el mismo permiso
// "motivoConsulta" (mismo "solo el profesional" del resto de la etapa 01/02),
// en vez de crear uno nuevo para una acción tan puntual.
export async function corroborateData(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const permissions = await resolveRequestPermissions(req);
  if (permissions !== 'full-access' && permissions !== 'no-clinic' && !permissions.motivoConsulta) {
    return res.status(403).json({ error: 'Tu perfil no tiene acceso a confirmar los datos del paciente' });
  }

  const updated = await prisma.patient.update({
    where: { id: req.params.id },
    data: { datosCorroboradosAt: new Date(), datosCorroboradosPorId: req.user!.sub },
  });

  return res.json({ patient: updated });
}

function calculateAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// Etapa 03 (reunión 2/9 con Urbina): "la idea es meterle IA de manera que te
// entregue un resumen" — toma los 8 bloques de anamnesis + medicación/
// alergias/motivo de consulta ya guardados y genera el párrafo clínico. Se
// guarda en anamnesisSummary; se puede volver a generar cuando cambien los
// datos (no hay historial de versiones, siempre es la última).
export async function generateAnamnesisSummaryHandler(req: Request<{ id: string }>, res: Response) {
  if (!isOpenAIConfigured()) {
    return res.status(503).json({ error: 'La generación de resumen con IA no está configurada en este servidor.' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const clinicaId = patient.clinicaId;
  try {
    await assertAiTokenBudget(clinicaId);
  } catch (err) {
    if (err instanceof AiTokenLimitError) {
      return res.status(429).json({ error: err.message });
    }
    throw err;
  }

  try {
    const { text, tokensUsed } = await generateAnamnesisSummary({
      firstName: patient.firstName,
      gender: patient.gender,
      age: calculateAge(patient.birthDate),
      anamnesis: sanitizeAnamnesisData(patient.anamnesisData),
      currentMedications: patient.currentMedications,
      allergies: patient.allergies as (typeof ALLERGY_KEYS)[number][],
      allergyNotes: patient.allergyNotes,
      motivoConsulta: patient.motivoConsulta,
    });
    await recordAiTokenUsage(clinicaId, tokensUsed);

    const updated = await prisma.patient.update({
      where: { id: req.params.id },
      data: { anamnesisSummary: text },
    });
    return res.json({ patient: updated });
  } catch (err) {
    console.error('Error generando resumen de anamnesis con IA', err);
    return res.status(502).json({ error: 'No se pudo generar el resumen con IA. Intenta nuevamente.' });
  }
}

export async function uploadPhoto(req: Request<{ id: string }>, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de foto' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const photo = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'dentalcloud/patients/photos' },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  if (patient.photoPublicId) {
    await cloudinary.uploader.destroy(patient.photoPublicId).catch(() => {
      // Best-effort: si la foto anterior ya no existe en Cloudinary o falla el
      // borrado, no bloquea la actualización de la nueva foto.
    });
  }

  const updated = await prisma.patient.update({
    where: { id: req.params.id },
    data: { photoUrl: photo.secure_url, photoPublicId: photo.public_id },
  });

  return res.json({ patient: updated });
}

const EXAM_PHOTO_MOMENTS = ['antes', 'avance'] as const;
type ExamPhotoMoment = (typeof EXAM_PHOTO_MOMENTS)[number];

// Historial del registro fotográfico (11/09, pedido explícito): cada captura
// queda como su propia fila con fecha, en vez de sobrescribir un solo campo
// por ángulo — así "Antes" y cada ronda de "Avance" quedan disponibles para
// comparar, y puede haber más de una ronda de avance en el tiempo.
export async function uploadExamPhoto(req: Request<{ id: string; slot: string }>, res: Response) {
  const area = (req.body?.area || 'facial') as ExamPhotoArea;
  if (!EXAM_PHOTO_AREAS.includes(area)) {
    return res.status(400).json({ error: 'area debe ser "facial", "corporal" o "facialAvanzado"' });
  }
  const slot = req.params.slot;
  if (!EXAM_PHOTO_SLOTS_BY_AREA[area].includes(slot)) {
    return res.status(400).json({ error: 'Ángulo de foto no válido' });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de foto' });
  }
  const moment = req.body?.moment as ExamPhotoMoment;
  if (!EXAM_PHOTO_MOMENTS.includes(moment)) {
    return res.status(400).json({ error: 'moment debe ser "antes" o "avance"' });
  }
  const round = Number(req.body?.round);
  if (!Number.isInteger(round) || round < 1) {
    return res.status(400).json({ error: 'round debe ser un entero positivo' });
  }
  if (moment === 'antes' && round !== 1) {
    return res.status(400).json({ error: 'La ronda "antes" siempre es 1' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // Candado duro (11/09, pedido explícito): sin el consentimiento de "Uso de
  // fotografías y registros clínicos" ya firmado, no se sube ninguna foto del
  // examen estético — no basta con que el frontend oculte el botón.
  const signedPhotoConsent = await prisma.consent.findFirst({
    where: {
      patientId: patient.id,
      status: 'firmado',
      consentType: { code: PHOTO_USAGE_CONSENT_CODE },
    },
  });
  if (!signedPhotoConsent) {
    return res.status(403).json({
      error: 'El paciente debe firmar el consentimiento de uso de fotografías antes de poder tomar fotos.',
    });
  }

  const photo = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: `dentalcloud/patients/exam-photos/${area}/${moment}-${round}/${slot}` },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  await prisma.examPhoto.create({
    data: {
      patientId: patient.id,
      clinicaId: patient.clinicaId,
      area,
      slot,
      moment,
      round,
      url: photo.secure_url,
      publicId: photo.public_id,
    },
  });

  const examPhotos = await prisma.examPhoto.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ examPhotos });
}

export async function listExamPhotos(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  const examPhotos = await prisma.examPhoto.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ examPhotos });
}

// Etapa 07 (marcación sobre la foto, 25/09 pedido explícito): el médico
// dibuja encima de una foto del examen estético ya tomada (puntos de botox,
// líneas punteadas de ojeras, líneas continuas de filler/hilos) y el
// resultado se aplana en una imagen nueva — la ExamPhoto original nunca se
// modifica ni se reemplaza, para no perder el registro si la marcación sale
// mal. Por eso vive en su propia tabla (ExamPhotoMarkup), no como otra fila
// de ExamPhoto.
export async function uploadExamPhotoMarkup(req: Request<{ id: string; examPhotoId: string }>, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de imagen' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const examPhoto = await prisma.examPhoto.findUnique({ where: { id: req.params.examPhotoId } });
  if (!examPhoto || examPhoto.patientId !== patient.id) {
    return res.status(404).json({ error: 'Foto del examen estético no encontrada' });
  }

  // Mismo candado que subir una foto del examen: sin el consentimiento de uso
  // de fotografías firmado, tampoco se puede marcar una ya existente.
  const signedPhotoConsent = await prisma.consent.findFirst({
    where: {
      patientId: patient.id,
      status: 'firmado',
      consentType: { code: PHOTO_USAGE_CONSENT_CODE },
    },
  });
  if (!signedPhotoConsent) {
    return res.status(403).json({
      error: 'El paciente debe firmar el consentimiento de uso de fotografías antes de poder marcar una foto.',
    });
  }

  const uploaded = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: `dentalcloud/patients/exam-photo-markups/${examPhoto.id}` },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  await prisma.examPhotoMarkup.create({
    data: {
      examPhotoId: examPhoto.id,
      patientId: patient.id,
      clinicaId: patient.clinicaId,
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
    },
  });

  const examPhotoMarkups = await prisma.examPhotoMarkup.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ examPhotoMarkups });
}

export async function listExamPhotoMarkups(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  const examPhotoMarkups = await prisma.examPhotoMarkup.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ examPhotoMarkups });
}

export async function deleteExamPhotoMarkup(req: Request<{ id: string; markupId: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const markup = await prisma.examPhotoMarkup.findUnique({ where: { id: req.params.markupId } });
  if (!markup || markup.patientId !== patient.id) {
    return res.status(404).json({ error: 'Imagen marcada no encontrada' });
  }

  await cloudinary.uploader.destroy(markup.publicId).catch(() => {
    // Best-effort: si ya no existe en Cloudinary, igual se borra el registro.
  });
  await prisma.examPhotoMarkup.delete({ where: { id: markup.id } });

  const examPhotoMarkups = await prisma.examPhotoMarkup.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ examPhotoMarkups });
}

// Borrado de fotos del examen (30/09, pedido explícito): hacía falta poder
// deshacer una toma mala y limpiar rondas de prueba completas. Las dos
// funciones de abajo comparten esta ayuda: al borrar una foto hay que borrar
// también sus marcaciones, y de cada una su archivo en Cloudinary — la fila de
// ExamPhotoMarkup se va sola por el onDelete: Cascade del schema, pero la
// imagen subida no, y quedaría ocupando espacio para siempre.
async function destroyExamPhotoAssets(photos: { id: string; publicId: string }[]) {
  if (photos.length === 0) return;
  const markups = await prisma.examPhotoMarkup.findMany({
    where: { examPhotoId: { in: photos.map((p) => p.id) } },
    select: { publicId: true },
  });
  await Promise.all(
    [...photos, ...markups].map((asset) =>
      cloudinary.uploader.destroy(asset.publicId).catch(() => {
        // Best-effort: si ya no está en Cloudinary, igual se borra el registro.
      })
    )
  );
}

async function examPhotoState(patientId: string) {
  const [examPhotos, examPhotoMarkups] = await Promise.all([
    prisma.examPhoto.findMany({ where: { patientId }, orderBy: { createdAt: 'asc' } }),
    prisma.examPhotoMarkup.findMany({ where: { patientId }, orderBy: { createdAt: 'asc' } }),
  ]);
  // Se devuelven las dos listas porque borrar una foto arrastra sus
  // marcaciones: si solo se devolvieran las fotos, la pantalla seguiría
  // mostrando marcaciones de una foto que ya no existe.
  return { examPhotos, examPhotoMarkups };
}

export async function deleteExamPhoto(req: Request<{ id: string; examPhotoId: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const photo = await prisma.examPhoto.findUnique({ where: { id: req.params.examPhotoId } });
  if (!photo || photo.patientId !== patient.id) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }

  await destroyExamPhotoAssets([photo]);
  await prisma.examPhoto.delete({ where: { id: photo.id } });

  return res.json(await examPhotoState(patient.id));
}

// Borra una ronda completa (los 4 ángulos de un area + moment + round). "Antes"
// no se puede borrar: es la línea base de la que cuelga todo el registro, y
// dejar avances colgando de una comparación que ya no existe no tiene sentido.
export async function deleteExamPhotoRound(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  const area = (req.query.area || 'facial') as ExamPhotoArea;
  if (!EXAM_PHOTO_AREAS.includes(area)) {
    return res.status(400).json({ error: 'area debe ser "facial", "corporal" o "facialAvanzado"' });
  }
  if (req.query.moment !== 'avance') {
    return res.status(400).json({ error: 'Solo se pueden borrar rondas de "avance"' });
  }
  const round = Number(req.query.round);
  if (!Number.isInteger(round) || round < 1) {
    return res.status(400).json({ error: 'round debe ser un número entero mayor o igual a 1' });
  }

  const photos = await prisma.examPhoto.findMany({
    where: { patientId: patient.id, area, moment: 'avance', round },
    select: { id: true, publicId: true },
  });
  if (photos.length === 0) {
    return res.status(404).json({ error: 'Esa ronda no tiene fotos' });
  }

  await destroyExamPhotoAssets(photos);
  await prisma.examPhoto.deleteMany({ where: { id: { in: photos.map((p) => p.id) } } });

  return res.json(await examPhotoState(patient.id));
}

// Registro de video (14/09, pedido explícito): mismo esquema de rondas que
// el registro fotográfico (antes / avance N), pero un solo video por ronda
// en vez de 4 ángulos — ver ExamVideo en el schema.
export async function uploadExamVideo(req: Request<{ id: string }>, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de video' });
  }
  const moment = req.body?.moment as ExamPhotoMoment;
  if (!EXAM_PHOTO_MOMENTS.includes(moment)) {
    return res.status(400).json({ error: 'moment debe ser "antes" o "avance"' });
  }
  const round = Number(req.body?.round);
  if (!Number.isInteger(round) || round < 1) {
    return res.status(400).json({ error: 'round debe ser un entero positivo' });
  }
  if (moment === 'antes' && round !== 1) {
    return res.status(400).json({ error: 'La ronda "antes" siempre es 1' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // Mismo candado duro que las fotos del examen estético — un mismo
  // consentimiento de "uso de imágenes" cubre foto y video.
  const signedPhotoConsent = await prisma.consent.findFirst({
    where: {
      patientId: patient.id,
      status: 'firmado',
      consentType: { code: PHOTO_USAGE_CONSENT_CODE },
    },
  });
  if (!signedPhotoConsent) {
    return res.status(403).json({
      error: 'El paciente debe firmar el consentimiento de uso de imágenes antes de poder grabar video.',
    });
  }

  const video = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'video', folder: `dentalcloud/patients/exam-videos/${moment}-${round}` },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  await prisma.examVideo.create({
    data: {
      patientId: patient.id,
      clinicaId: patient.clinicaId,
      moment,
      round,
      url: video.secure_url,
      publicId: video.public_id,
    },
  });

  const examVideos = await prisma.examVideo.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ examVideos });
}

export async function listExamVideos(req: Request<{ id: string }>, res: Response) {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  const examVideos = await prisma.examVideo.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ examVideos });
}

export async function uploadMotivoConsultaAudio(req: Request<{ id: string }>, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Se requiere un archivo de audio' });
  }

  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient || !patientBelongsToRequester(patient, req)) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }

  // Mismo permiso "Motivo de consulta" que gatea el campo de texto (ver
  // update() más arriba) — sin esto, un perfil sin acceso al texto podría
  // igual grabar el audio y dejarlo como respaldo.
  const permissions = await resolveRequestPermissions(req);
  if (permissions !== 'full-access' && permissions !== 'no-clinic' && !permissions.motivoConsulta) {
    return res.status(403).json({ error: `Tu perfil no tiene acceso a "${PERMISSION_LABELS.motivoConsulta}"` });
  }

  // Candado duro: sin un consentimiento de grabación de voz ya firmado, el
  // audio no se sube — no basta con que el frontend oculte el botón, porque
  // esto es lo que evita que alguien grabe sin autorización aunque se salte
  // la pantalla.
  const signedConsent = await prisma.consent.findFirst({
    where: {
      patientId: patient.id,
      status: 'firmado',
      consentType: { code: VOICE_RECORDING_CONSENT_CODE },
    },
  });
  if (!signedConsent) {
    return res.status(403).json({
      error: 'El paciente debe firmar el consentimiento de grabación de voz antes de poder grabar.',
    });
  }

  const audio = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'video', folder: 'dentalcloud/patients/motivo-consulta-audio' },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(file.buffer);
  });

  if (patient.motivoConsultaAudioPublicId) {
    await cloudinary.uploader.destroy(patient.motivoConsultaAudioPublicId, { resource_type: 'video' }).catch(() => {
      // Best-effort: si la grabación anterior ya no existe en Cloudinary o
      // falla el borrado, no bloquea la actualización de la nueva.
    });
  }

  const updated = await prisma.patient.update({
    where: { id: req.params.id },
    data: { motivoConsultaAudioUrl: audio.secure_url, motivoConsultaAudioPublicId: audio.public_id },
  });

  return res.json({ patient: updated });
}
