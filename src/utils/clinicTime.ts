import prisma from '../lib/prisma';

// Hora de la clínica (13-11-2026). El servidor corre en UTC (Railway), así que
// `new Date('2026-11-13T00:00:00')` o `toLocaleString()` sin zona usaban la hora
// UTC: las citas de 21:00 a 23:59 en Chile caían en el día siguiente y los
// correos y PDF mostraban la hora corrida. DentalCloud no guarda zona horaria
// por clínica; se deduce del país (por defecto Chile).
export const DEFAULT_TZ = 'America/Santiago';

export function tzForPais(pais?: string | null): string {
  const p = String(pais ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (p === 'es' || p.includes('espana') || p.includes('spain')) return 'Europe/Madrid';
  return DEFAULT_TZ;
}

export async function clinicTimeZone(clinicaId: string | null | undefined): Promise<string> {
  if (!clinicaId) return DEFAULT_TZ;
  const c = await prisma.clinica.findUnique({ where: { id: clinicaId }, select: { pais: true } });
  return tzForPais(c?.pais);
}

// Diferencia (ms) entre la hora local de `tz` y UTC en el instante `d`. Se
// calcula leyendo ambas en la misma máquina, así que no depende de la zona
// del servidor.
function tzOffsetMs(d: Date, tz: string): number {
  const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return local.getTime() - utc.getTime();
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Medianoche de `ymd` (YYYY-MM-DD) en la zona `tz`, como instante UTC.
export function zonedMidnight(ymd: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(guess)) return null;
  const first = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

// Rango [inicio de `fromYmd`, fin de `toYmd`] en la hora de la clínica.
export function dayRange(fromYmd: string, toYmd: string, tz: string): { start: Date; end: Date } | null {
  const start = zonedMidnight(fromYmd, tz);
  const next = zonedMidnight(addDaysYmd(toYmd, 1), tz);
  if (!start || !next) return null;
  return { start, end: new Date(next.getTime() - 1) };
}
