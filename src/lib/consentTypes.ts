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
];

function placeholderText(title: string, isAuthorization = false) {
  const heading = isAuthorization ? title : `CONSENTIMIENTO PARA ${title}`;
  return `${heading}\n\n[Este es un texto de ejemplo. Debe ser reemplazado por el texto legal definitivo antes de enviarse a pacientes reales.]`;
}
