-- Sesiones cerradas (13-11-2026): tokens de refresco invalidados al cerrar sesión.
CREATE TABLE IF NOT EXISTS "revoked_refresh_tokens" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "revoked_refresh_tokens_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX IF NOT EXISTS "revoked_refresh_tokens_expiresAt_idx" ON "revoked_refresh_tokens"("expiresAt");
