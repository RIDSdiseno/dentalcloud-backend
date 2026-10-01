import { cleanRut, isValidRut } from './rut';

// Validación de documentos de identidad por tipo. Espejo de
// front/src/utils/documento.ts: el frontend valida para avisar al usuario
// mientras escribe, pero la verdad vive acá — un cliente de API puede mandar
// cualquier cosa, así que el servidor vuelve a comprobarlo.
export const DOCUMENT_TYPES = ['RUT', 'DNI', 'NIE', 'CIF', 'PASAPORTE'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PERSON_DOCUMENT_TYPES: DocumentType[] = ['RUT', 'DNI', 'NIE', 'PASAPORTE'];
export const COMPANY_DOCUMENT_TYPES: DocumentType[] = ['RUT', 'CIF', 'NIE'];

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

const DNI_CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function cleanDocument(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

function isValidDni(value: string): boolean {
  const clean = cleanDocument(value);
  if (!/^\d{8}[A-Z]$/.test(clean)) return false;
  return DNI_CONTROL_LETTERS[Number(clean.slice(0, 8)) % 23] === clean[8];
}

function isValidNie(value: string): boolean {
  const clean = cleanDocument(value);
  if (!/^[XYZ]\d{7}[A-Z]$/.test(clean)) return false;
  // La letra inicial se sustituye por un dígito (X=0, Y=1, Z=2) y después se
  // valida igual que un DNI.
  const number = Number(String('XYZ'.indexOf(clean[0])) + clean.slice(1, 8));
  return DNI_CONTROL_LETTERS[number % 23] === clean[8];
}

const CIF_START = 'ABCDEFGHJNPQRSUVW';
// Sociedades cuyo carácter de control es siempre una letra, y las que lo tienen
// siempre numérico. El resto admite cualquiera de los dos.
const CIF_LETTER_ONLY = 'PQRSNW';
const CIF_DIGIT_ONLY = 'ABEH';

function isValidCif(value: string): boolean {
  const clean = cleanDocument(value);
  if (!/^[A-Z]\d{7}[0-9A-Z]$/.test(clean)) return false;
  const start = clean[0];
  if (!CIF_START.includes(start)) return false;

  const digits = clean.slice(1, 8);
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  const controlDigit = (10 - (sum % 10)) % 10;
  const control = clean[8];

  if (CIF_LETTER_ONLY.includes(start)) return control === 'JABCDEFGHI'[controlDigit];
  if (CIF_DIGIT_ONLY.includes(start)) return control === String(controlDigit);
  return control === String(controlDigit) || control === 'JABCDEFGHI'[controlDigit];
}

export function isValidDocument(type: DocumentType, value: string): boolean {
  const clean = cleanDocument(value);
  if (!clean) return false;
  switch (type) {
    case 'RUT':
      return isValidRut(value);
    case 'DNI':
      return isValidDni(value);
    case 'NIE':
      return isValidNie(value);
    case 'CIF':
      return isValidCif(value);
    // El pasaporte no tiene un formato común entre países: solo se comprueba
    // que sea plausible, no que sea verdadero.
    case 'PASAPORTE':
      return clean.length >= 5 && clean.length <= 20;
    default:
      return false;
  }
}

/** Normaliza para guardar: el RUT conserva su limpieza de siempre. */
export function normalizeDocument(type: DocumentType, value: string): string {
  return type === 'RUT' ? cleanRut(value) : cleanDocument(value);
}

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  RUT: 'RUT',
  DNI: 'DNI',
  NIE: 'NIE',
  CIF: 'CIF',
  PASAPORTE: 'Pasaporte',
};
