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
  }
}

export function startFederationRetryLoop() {
  setInterval(() => {
    retryPendingFederationSyncs().catch((error) => {
      console.error('Federation retry loop failed', error);
    });
  }, RETRY_INTERVAL_MS);
}
