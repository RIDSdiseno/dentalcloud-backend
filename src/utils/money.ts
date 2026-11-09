// Montos de presupuestos (09-11-2026): no se aceptan negativos ni valores que
// no sean número (texto, Infinity). Vacío/undefined sigue permitido (= 0 o
// "sin cambio", como antes).
export function isInvalidMoney(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  const n = Number(value);
  return !Number.isFinite(n) || n < 0;
}

export const INVALID_MONEY_ERROR = 'El monto debe ser un número igual o mayor a 0';
