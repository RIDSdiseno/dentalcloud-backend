export const TREATMENT_STATUSES = ['sin_iniciar', 'en_tratamiento', 'terminado', 'alta'];

export function computeTreatmentStatus(items: { completed: boolean }[], currentStatus: string): string {
  if (currentStatus === 'alta') return 'alta';
  if (items.length === 0) return 'sin_iniciar';
  const completedCount = items.filter((i) => i.completed).length;
  if (completedCount === 0) return 'sin_iniciar';
  if (completedCount === items.length) return 'terminado';
  return 'en_tratamiento';
}
