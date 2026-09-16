import prisma from './prisma';
import { CONSENT_LEGAL_TEXT } from './consentText';

// Catálogo estándar de tipos de consentimiento de una clínica dental. Cada
// clínica recibe su propia copia (una fila de ConsentType por clínica) para
// poder editar su texto legal de forma independiente. `code` es estable y no
// debe cambiar una vez sembrado — se usa como clave de negocio.
export const DEFAULT_CONSENT_TYPES: Array<{ code: string; name: string; legalText: string }> = [
  { code: 'proteccion_datos', name: 'Protección de datos personales', legalText: CONSENT_LEGAL_TEXT },
  {
    code: 'tratamiento_general',
    name: 'Tratamiento odontológico general',
    legalText: placeholderText('TRATAMIENTO ODONTOLÓGICO GENERAL'),
  },
  { code: 'anestesia', name: 'Uso de anestesia local', legalText: placeholderText('USO DE ANESTESIA LOCAL') },
  {
    code: 'cirugia_procedimiento_invasivo',
    name: 'Cirugía / procedimiento invasivo',
    legalText: placeholderText('CIRUGÍA O PROCEDIMIENTO INVASIVO'),
  },
  { code: 'endodoncia', name: 'Endodoncia (tratamiento de conducto)', legalText: placeholderText('ENDODONCIA') },
  { code: 'protesis', name: 'Prótesis fija o removible', legalText: placeholderText('TRATAMIENTO PROTÉSICO') },
  { code: 'ortodoncia', name: 'Tratamiento de ortodoncia', legalText: placeholderText('TRATAMIENTO DE ORTODONCIA') },
  { code: 'implantes', name: 'Implantes dentales', legalText: placeholderText('COLOCACIÓN DE IMPLANTES DENTALES') },
  { code: 'blanqueamiento', name: 'Blanqueamiento dental', legalText: placeholderText('BLANQUEAMIENTO DENTAL') },
  {
    code: 'uso_imagenes',
    name: 'Uso de fotografías y registros clínicos',
    legalText: placeholderText('USO DE FOTOGRAFÍAS Y REGISTROS CLÍNICOS'),
  },
  { code: 'sedacion', name: 'Sedación', legalText: placeholderText('SEDACIÓN') },
  {
    code: 'autorizacion_representante_menor',
    name: 'Autorización de representante legal (paciente menor de edad)',
    legalText: placeholderText('AUTORIZACIÓN DE REPRESENTANTE LEGAL PARA ATENCIÓN DE PACIENTE MENOR DE EDAD', true),
  },
  {
    code: 'grabacion_voz',
    name: 'Autorización de grabación de voz',
    legalText:
      placeholderText('GRABACIÓN DE VOZ DEL MOTIVO DE CONSULTA') +
      '\n\nEsta grabación, junto con su firma, se almacena en servidores de un proveedor externo (Cloudinary), fuera de Chile.',
  },
];

// Code estable del consentimiento que habilita grabar el motivo de consulta —
// ver patientsController.uploadMotivoConsultaAudio, que rechaza la subida si
// el paciente no tiene un Consent con este code en estado 'firmado'.
export const VOICE_RECORDING_CONSENT_CODE = 'grabacion_voz';

// Mismo candado, para el registro fotográfico de Evaluación Estética (11/09,
// pedido explícito) — ver patientsController.uploadExamPhoto.
export const PHOTO_USAGE_CONSENT_CODE = 'uso_imagenes';

function placeholderText(title: string, isAuthorization = false) {
  const heading = isAuthorization ? title : `CONSENTIMIENTO PARA ${title}`;
  return `${heading}\n\n[Este es un texto de ejemplo. Debe ser reemplazado por el texto legal definitivo antes de enviarse a pacientes reales.]`;
}

// Etapa 09 (16/09, pedido explícito de Urbina): "los consentimientos
// generalmente son por producto que yo te estoy inyectando" — no uno por
// sesión ni uno genérico. Cada ProductoMarca del catálogo tiene su propio
// ConsentType (1 a 1, vía `productoMarcaId`), para que el bloqueo duro al
// registrar el tratamiento (ver treatmentItemsController/evolutionsController)
// pueda exigir la firma de ESE producto puntual. El texto legal queda como
// plantilla — cada médico la edita desde Consentimientos, igual que ya hacía
// con los tipos custom.
export async function ensureProductConsentType(producto: {
  id: string;
  clinicaId: string;
  nombreGenerico: string;
  marca: string;
}) {
  const name = `Consentimiento: ${producto.nombreGenerico} (${producto.marca})`;
  const existing = await prisma.consentType.findUnique({ where: { productoMarcaId: producto.id } });
  if (existing) {
    if (existing.name !== name) {
      await prisma.consentType.update({ where: { id: existing.id }, data: { name } });
    }
    return existing;
  }
  return prisma.consentType.create({
    data: {
      clinicaId: producto.clinicaId,
      // Estable y único por construcción (el id del producto ya es único) —
      // no necesita slug ni chequeo de colisión como los tipos "custom_...".
      code: `producto_${producto.id}`,
      name,
      legalText: placeholderText(`APLICACIÓN DE ${producto.nombreGenerico.toUpperCase()} (${producto.marca.toUpperCase()})`),
      productoMarcaId: producto.id,
      active: true,
    },
  });
}
