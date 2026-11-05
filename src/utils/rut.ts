export function cleanRut(rut: string) {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function isValidRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return expectedDv === dv;
}

export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

// Todas las formas en que puede venir guardado un mismo RUT ("12.345.678-9",
// "12345678-9", "123456789" y, si termina en K, también con k minúscula).
// DentalCloud guarda la forma compacta, pero hay datos que llegaron por la
// federación con puntos y guion; buscar con esta lista evita crear duplicados.
// Si no es un RUT válido (DNI, pasaporte), devuelve solo el valor tal cual.
export function rutEquivalents(rut: string): string[] {
  const raw = String(rut ?? '').trim();
  if (!isValidRut(raw)) return raw ? [raw] : [];
  const clean = cleanRut(raw);
  const values = [clean, formatRut(clean), dimageRut(clean)];
  if (clean.endsWith('K')) values.push(...values.map((v) => v.replace(/K$/, 'k')));
  return [...new Set(values)];
}

// Para llamadas a la API de Dimage: devuelve el RUT en formato "dígitos-DV"
// sin puntos, que es como Dimage lo almacena internamente (ej: "205318-K").
export function dimageRut(rut: string): string {
  const clean = cleanRut(rut);
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}
