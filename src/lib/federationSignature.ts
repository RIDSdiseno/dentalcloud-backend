import crypto from 'crypto';

// Firma de las llamadas entre DentalCloud y Dental-Demo (09-11-2026).
//
// Antes la FEDERATION_API_KEY viajaba tal cual en el header X-API-KEY: si
// quedaba en un log, un proxy o un error, servía para siempre. Ahora la clave
// NUNCA viaja: cada llamada lleva la hora y una firma HMAC de
// (hora, método, ruta con query y hash del cuerpo). La firma solo sirve para
// ESA llamada, durante 5 minutos, y una sola vez.
//
// El mismo esquema está en Dental-Demo-Back/src/lib/federationSignature.js.
// Si alguna vez hay que volver al esquema anterior sin desplegar código:
// FEDERATION_ALLOW_LEGACY_KEY=true en Railway (en los dos backends).

const WINDOW_MS = 5 * 60 * 1000;
export const TS_HEADER = 'x-fed-ts';
export const SIG_HEADER = 'x-fed-sig';

function sha256Hex(text: string) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function signatureFor(key: string, ts: string, method: string, pathWithQuery: string, rawBody: string) {
  const canonical = `${ts}\n${method.toUpperCase()}\n${pathWithQuery}\n${sha256Hex(rawBody)}`;
  return crypto.createHmac('sha256', key).update(canonical, 'utf8').digest('hex');
}

export function signFederationRequest(method: string, pathWithQuery: string, rawBody: string) {
  const key = process.env.FEDERATION_API_KEY ?? '';
  const ts = String(Date.now());
  return { [TS_HEADER]: ts, [SIG_HEADER]: signatureFor(key, ts, method, pathWithQuery, rawBody) };
}

const used = new Map<string, number>();
function purge(now: number) {
  for (const [sig, at] of used) if (now - at > 2 * WINDOW_MS) used.delete(sig);
}

function safeEqualHex(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// true si la llamada viene firmada por el otro backend (o, solo si se habilitó
// a propósito, con la clave antigua).
export function isValidFederationRequest(req: {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: string;
}): boolean {
  const key = process.env.FEDERATION_API_KEY;
  if (!key) return false;

  const ts = req.headers[TS_HEADER];
  const sig = req.headers[SIG_HEADER];
  if (typeof ts === 'string' && typeof sig === 'string') {
    const now = Date.now();
    const at = Number(ts);
    if (!Number.isFinite(at) || Math.abs(now - at) > WINDOW_MS) return false;
    const expected = signatureFor(key, ts, req.method, req.originalUrl, req.rawBody ?? '');
    if (!safeEqualHex(sig, expected)) return false;
    purge(now);
    if (used.has(sig)) return false; // la misma llamada repetida: no se acepta
    used.set(sig, now);
    return true;
  }

  const legacy = req.headers['x-api-key'];
  if (process.env.FEDERATION_ALLOW_LEGACY_KEY === 'true' && typeof legacy === 'string') {
    return safeEqualHex(legacy, key);
  }
  return false;
}
