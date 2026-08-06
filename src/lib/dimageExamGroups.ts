// RIDS RX (Dimage2.0) expone GET /order/examinations/groups como una lista plana
// de ids de grupo (string) — no incluye nombre ni pestaña, esa info vive solo en
// su tabla interna `kind_groups`, que la API no expone. Este mapeo es la
// interpretación de fordentcloud de esos ids, coordinada manualmente con RIDS RX
// el 2026-07-31; si agregan un grupo nuevo del lado de ellos hay que sumarlo acá.
const KNOWN_EXAM_GROUPS: Record<string, { nombre: string; tab: string; orden: number }> = {
  '1': { nombre: 'Examen Adultos', tab: 'intraorales', orden: 1 },
  '2': { nombre: 'Examen Niños', tab: 'intraorales', orden: 2 },
  '3': { nombre: 'Examen 2D', tab: 'extraorales', orden: 1 },
  '4': { nombre: 'Examen 3D', tab: 'extraorales', orden: 2 },
};

const TAB_ORDER = ['intraorales', 'extraorales'];

export type ResolvedExamGroup = { id: number; nombre: string; tab: string };

export function resolveExamGroups(rawGroups: unknown): ResolvedExamGroup[] {
  const ids = Array.isArray(rawGroups) ? rawGroups.map((g) => String(g)) : [];

  return ids
    .map((id) => {
      const known = KNOWN_EXAM_GROUPS[id];
      return {
        id: Number(id) || 0,
        nombre: known?.nombre ?? `Grupo ${id}`,
        tab: known?.tab ?? 'otros',
        orden: known?.orden ?? 99,
      };
    })
    .sort((a, b) => {
      const tabIndex = (tab: string) => {
        const idx = TAB_ORDER.indexOf(tab);
        return idx === -1 ? TAB_ORDER.length : idx;
      };
      const tabDiff = tabIndex(a.tab) - tabIndex(b.tab);
      return tabDiff !== 0 ? tabDiff : a.orden - b.orden;
    })
    .map(({ id, nombre, tab }) => ({ id, nombre, tab }));
}
