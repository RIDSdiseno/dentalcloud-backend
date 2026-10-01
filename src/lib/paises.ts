import type { DocumentType } from '../utils/documento';

// País de la clínica como fuente única de moneda y tipo de documento.
//
// Antes cada cosa se definía por separado y todo venía cableado a Chile: los
// montos se formateaban siempre en pesos chilenos y el documento siempre era
// RUT. Eso hacía imposible operar en España — se veían "pesos" en una clínica
// que cobra en euros, y no se podía cargar un paciente con DNI.
//
// Se eligió derivarlo del país (y no ofrecer selectores sueltos de moneda y
// documento) por un pedido explícito del cliente: "se hace una sola vez… ya no
// lo puedes modificar más". Así nadie puede dejar una clínica a medio
// configurar, con el país de un lado y la moneda de otro.

export type PaisConfig = {
  /** Código ISO de la moneda, para Intl.NumberFormat. */
  currency: string;
  /** Locale con el que se formatean montos y fechas. */
  locale: string;
  /** Tipo de documento que se ofrece por defecto al cargar una persona. */
  defaultPersonDocument: DocumentType;
  /** Tipo de documento que se ofrece por defecto para la propia clínica. */
  defaultCompanyDocument: DocumentType;
};

export const PAISES: Record<string, PaisConfig> = {
  Chile: { currency: 'CLP', locale: 'es-CL', defaultPersonDocument: 'RUT', defaultCompanyDocument: 'RUT' },
  Argentina: { currency: 'ARS', locale: 'es-AR', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  Perú: { currency: 'PEN', locale: 'es-PE', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  Colombia: { currency: 'COP', locale: 'es-CO', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  México: { currency: 'MXN', locale: 'es-MX', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  Bolivia: { currency: 'BOB', locale: 'es-BO', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  Ecuador: { currency: 'USD', locale: 'es-EC', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  Uruguay: { currency: 'UYU', locale: 'es-UY', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  Paraguay: { currency: 'PYG', locale: 'es-PY', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  Venezuela: { currency: 'VES', locale: 'es-VE', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  España: { currency: 'EUR', locale: 'es-ES', defaultPersonDocument: 'DNI', defaultCompanyDocument: 'CIF' },
  'Estados Unidos': { currency: 'USD', locale: 'en-US', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
  // "Otro" conserva el comportamiento histórico para no cambiarle la moneda a
  // ninguna clínica existente por accidente.
  Otro: { currency: 'CLP', locale: 'es-CL', defaultPersonDocument: 'PASAPORTE', defaultCompanyDocument: 'RUT' },
};

export const VALID_PAISES = Object.keys(PAISES);

// Las monedas sin decimales se formatean sin centavos. El peso chileno nunca
// los usó, y mostrar "$ 18.000,00" donde siempre decía "$ 18.000" se vería como
// un error, no como una mejora.
const SIN_DECIMALES = new Set(['CLP', 'PYG', 'COP']);

export function paisConfig(pais: string | null | undefined): PaisConfig {
  return (pais && PAISES[pais]) || PAISES.Chile;
}

/** Formatea un monto con la moneda del país de la clínica. */
export function formatMoney(amount: number, pais: string | null | undefined): string {
  const { currency, locale } = paisConfig(pais);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: SIN_DECIMALES.has(currency) ? 0 : 2,
  }).format(amount);
}
