import rateLimit from 'express-rate-limit';

// Sin esto, /auth/login se podía probar fuerza bruta sin ningún límite.
// Generoso a propósito: varias personas de una misma clínica pueden compartir
// IP (red de oficina) e iniciar sesión seguido durante el día.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
});

// /auth/refresh se llama solo automáticamente (cada vez que expira el access
// token, ver JWT_ACCESS_EXPIRES_IN), nunca a mano — un límite mucho más
// generoso alcanza para frenar abuso sin afectar el uso normal.
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos antes de volver a intentar.' },
});

// Rutas públicas de firma de consentimiento (sin autenticación, por eso el
// límite es por IP) — el token en sí ya es prácticamente imposible de
// adivinar, esto es una segunda capa contra abuso/DoS.
export const publicConsentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos antes de volver a intentar.' },
});

// Mismo criterio que publicConsentRateLimiter, para el link público de
// confirmación de cita por correo.
export const publicAppointmentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos antes de volver a intentar.' },
});
