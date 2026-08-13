// Tipo de datos y formateo compartidos entre los dos generadores de informe
// (PDF con pdfkit, DOCX con la librería docx) — evita mantener la misma
// definición de "qué es un informe de presupuesto" dos veces.
export type TreatmentPlanReportInput = {
  clinica: { name: string; logoUrl: string | null };
  patient: { firstName: string; lastName: string; rut: string; birthDate: Date | null };
  plan: {
    number: number;
    name: string | null;
    status: string;
    amount: number;
    notes: string | null;
    createdAt: Date;
    completedAt: Date | null;
    professional: { name: string } | null;
    sucursal: { name: string } | null;
    convenio: { name: string } | null;
    prevision: { name: string } | null;
  };
  items: {
    description: string;
    toothNumber: string | null;
    cost: number;
    completed: boolean;
    treatedAt: Date | null;
    treatedBy: { name: string } | null;
    notes: string | null;
  }[];
  // Fotos de la plantilla del presupuesto + las de cada procedimiento,
  // combinadas en una sola galería (pedido: "resumen completo + fotos").
  photos: { url: string; label: string | null }[];
};

export const TREATMENT_STATUS_LABELS_ES: Record<string, string> = {
  sin_iniciar: 'Sin iniciar',
  en_tratamiento: 'En tratamiento',
  terminado: 'Terminado',
  alta: 'Alta',
};

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
    amount
  );
}

export function formatReportDate(value: Date): string {
  return value.toLocaleDateString('es-CL');
}
