import prisma from './prisma';
import { retryFederationSync } from './federationSync';

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

async function retryPendingFederationSyncs() {
  const pending = await prisma.federationSyncFailure.findMany({
    where: { attempts: { lt: MAX_ATTEMPTS } },
    take: 50,
  });

  for (const failure of pending) {
    // retryFederationSync nunca lanza (los sync internamente atrapan sus
    // propios errores) — si la fila sigue existiendo después de intentar, es
    // porque volvió a fallar, así que recién ahí subimos `attempts`.
    await retryFederationSync(failure.entityType, failure.localId);
    await prisma.federationSyncFailure.updateMany({
      where: { id: failure.id },
      data: { attempts: { increment: 1 } },
    });
    // Aviso cuando una copia se abandona (13-11-2026): antes quedaba en la
    // tabla sin que nadie se enterara. Sale una sola vez, en los logs de
    // Railway, con lo necesario para revisarla a mano.
    if (failure.attempts + 1 >= MAX_ATTEMPTS) {
      const still = await prisma.federationSyncFailure.findFirst({ where: { id: failure.id }, select: { lastError: true } });
      if (still) {
        console.error('[federacion] copia ABANDONADA tras ' + MAX_ATTEMPTS + ' intentos', {
          entityType: failure.entityType,
          localId: failure.localId,
          lastError: still.lastError,
        });
      }
    }
  }
}

export function startFederationRetryLoop() {
  setInterval(() => {
    retryPendingFederationSyncs().catch((error) => {
      console.error('Federation retry loop failed', error);
    });
  }, RETRY_INTERVAL_MS);
}
