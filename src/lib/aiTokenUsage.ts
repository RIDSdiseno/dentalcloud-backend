import prisma from './prisma';

// Regulador manual de tokens de IA (14/09, pedido explícito): todas las
// clínicas comparten la misma OPENAI_API_KEY (la de Dental-Demo-Back), así
// que sin esto una sola clínica podría gastar todo el presupuesto
// compartido. El super admin fija el tope por clínica (Clinica.aiTokenLimitMonthly,
// 0 = sin límite) desde el panel de Holdings; acá solo se compara y se
// registra el consumo real, mes calendario a mes calendario.
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export class AiTokenLimitError extends Error {
  statusCode = 429;
}

export async function getAiTokenUsage(clinicaId: string): Promise<{ limit: number; used: number; periodo: string }> {
  const periodo = currentPeriod();
  const [clinica, usage] = await Promise.all([
    prisma.clinica.findUnique({ where: { id: clinicaId }, select: { aiTokenLimitMonthly: true } }),
    prisma.aiTokenUsage.findUnique({ where: { clinicaId_periodo: { clinicaId, periodo } } }),
  ]);
  return { limit: clinica?.aiTokenLimitMonthly ?? 0, used: usage?.tokensUsados ?? 0, periodo };
}

// Se llama ANTES de gastar plata en una llamada al modelo — 0 en el límite
// significa "sin tope" (para clínicas que el super admin decida no limitar).
export async function assertAiTokenBudget(clinicaId: string): Promise<void> {
  const { limit, used } = await getAiTokenUsage(clinicaId);
  if (limit > 0 && used >= limit) {
    throw new AiTokenLimitError(
      'Tu clínica alcanzó el límite mensual de uso de IA. Contacta al administrador de la plataforma para aumentarlo.'
    );
  }
}

// Se llama DESPUÉS de una llamada exitosa, con el consumo real que devolvió
// el modelo (no una estimación) — upsert porque puede ser la primera
// llamada del mes para esa clínica.
export async function recordAiTokenUsage(clinicaId: string, tokensUsed: number): Promise<void> {
  if (!Number.isFinite(tokensUsed) || tokensUsed <= 0) return;
  const periodo = currentPeriod();
  await prisma.aiTokenUsage.upsert({
    where: { clinicaId_periodo: { clinicaId, periodo } },
    create: { clinicaId, periodo, tokensUsados: tokensUsed },
    update: { tokensUsados: { increment: tokensUsed } },
  });
}
