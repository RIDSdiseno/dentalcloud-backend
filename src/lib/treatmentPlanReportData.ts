import { formatMoney } from './paises';
// Tipo de datos y formateo compartidos entre los dos generadores de informe
// (PDF con pdfkit, DOCX con la librería docx) — evita mantener la misma
// definición de "qué es un informe de presupuesto" dos veces.
export type TreatmentPlanReportInput = {
  clinica: { name: string; logoUrl: string | null; pais: string };
  patient: { firstName: string; lastName: string; rut: string; birthDate: Date | null };
  plan: {
    number: number;
    name: string | null;
    status: string;
    // "dental" u "odontológico" vs "estetica" — el mismo presupuesto/informe
    // se redacta distinto según cuál sea (título, columna de zona/pieza,
    // metadata del documento). Ver `Clinica.tipo`/`TreatmentPlan.diagramType`.
    diagramType: 'dental' | 'estetica';
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

/** Formatea con la moneda del país de la clínica (ver lib/paises.ts). */
export function formatCLP(amount: number, pais: string): string {
  return formatMoney(amount, pais);
}

export function formatReportDate(value: Date): string {
  return value.toLocaleDateString('es-CL');
}
