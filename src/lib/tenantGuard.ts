import type { Request } from 'express';

// Auditoría de seguridad (11/09): varios controladores buscaban una fila
// (paciente, presupuesto, cita, documento, etc.) SOLO por su id, sin
// confirmar que perteneciera a la clínica de quien pedía — cualquier cuenta
// de staff podía leer/editar datos de OTRA clínica con solo conocer el UUID.
// `super_admin` (plataforma) sigue con acceso total; todo el resto queda
// acotado a su propia clínica, igual que ya hacían los `list()` de cada uno.
export function belongsToRequesterClinica(row: { clinicaId: string | null }, req: Request): boolean {
  return req.user?.role === 'super_admin' || row.clinicaId === req.user?.clinicaId;
}
