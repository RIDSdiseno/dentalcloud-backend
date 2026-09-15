import { getOpenAIClient, getOpenAITextModel } from './openai';
import {
  ANAMNESIS_PATHOLOGY_LABEL,
  ANAMNESIS_HABIT_LABEL,
  type AnamnesisData,
  type AnamnesisPathologyKey,
  type MorbidStatus,
} from './anamnesisData';
import type { AllergyKey } from './allergies';

// El backend solo guarda los codes de alergia (ver lib/allergies.ts) — las
// etiquetas legibles viven en el frontend (data/allergies.ts). Acá basta un
// texto razonable para que el modelo redacte el resumen, no hace falta que
// sea idéntico al que ve el usuario en la ficha.
const ALLERGY_LABEL: Record<AllergyKey, string> = {
  fluoruro: 'fluoruro',
  penicilina: 'penicilina',
  anestesicos_locales: 'anestésicos locales',
  latex: 'látex',
  yodo: 'yodo',
  niquel_metales: 'níquel/metales',
  aines: 'AINES',
  sulfitos: 'sulfitos',
  otro: 'otra',
};

type SummaryInput = {
  firstName: string;
  gender: string | null;
  age: number | null;
  anamnesis: AnamnesisData;
  currentMedications: string | null;
  allergies: AllergyKey[];
  allergyNotes: string | null;
  motivoConsulta: string | null;
};

// Vuelca los 8 bloques a texto plano y llano — el modelo redacta el párrafo
// clínico final, no arma la lista él mismo, para no inventar datos que no
// están en los bloques.
function describeAnamnesis(input: SummaryInput): string {
  const lines: string[] = [];
  const genderWord = input.gender === 'femenino' ? 'femenina' : input.gender === 'masculino' ? 'masculino' : null;
  lines.push(
    `Paciente ${genderWord ? `${genderWord} ` : ''}${input.age !== null ? `de ${input.age} años` : 'de edad no registrada'}.`
  );

  const { anamnesis } = input;
  // Cada condición es independiente (Sí/No/Desconoce) — se agrupan por
  // estado para redactar como el ejemplo real de Urbina: "Antecedente de
  // hipotiroidismo... Niega hipertensión, diabetes...".
  const morbidEntries = Object.entries(anamnesis.antecedentesMorbidos) as [AnamnesisPathologyKey, MorbidStatus][];
  const morbidSi = morbidEntries.filter(([, v]) => v === 'si').map(([k]) => ANAMNESIS_PATHOLOGY_LABEL[k]);
  const morbidNo = morbidEntries.filter(([, v]) => v === 'no').map(([k]) => ANAMNESIS_PATHOLOGY_LABEL[k]);
  const morbidDesconoce = morbidEntries.filter(([, v]) => v === 'desconoce').map(([k]) => ANAMNESIS_PATHOLOGY_LABEL[k]);
  const morbidParts: string[] = [];
  if (morbidSi.length > 0) morbidParts.push(`Antecedente de ${morbidSi.join(', ')}`);
  if (morbidNo.length > 0) morbidParts.push(`Niega ${morbidNo.join(', ')}`);
  if (morbidDesconoce.length > 0) morbidParts.push(`Desconoce antecedentes de ${morbidDesconoce.join(', ')}`);
  if (anamnesis.antecedentesMorbidosOtro) morbidParts.push(anamnesis.antecedentesMorbidosOtro);
  lines.push(
    morbidParts.length > 0
      ? `Antecedentes mórbidos personales: ${morbidParts.join('. ')}.`
      : 'Antecedentes mórbidos personales no evaluados.'
  );

  lines.push(
    anamnesis.quirurgicosEsteticos.tiene
      ? `Antecedentes quirúrgicos estéticos: ${anamnesis.quirurgicosEsteticos.detalle || 'sin detalle registrado'}.`
      : 'Sin antecedentes quirúrgicos estéticos.'
  );

  lines.push(
    anamnesis.procedimientoPrevio.tiene
      ? `Procedimiento estético previo: ${[
          anamnesis.procedimientoPrevio.tipo,
          anamnesis.procedimientoPrevio.zona ? `zona ${anamnesis.procedimientoPrevio.zona}` : '',
          anamnesis.procedimientoPrevio.fecha ? `hace/en ${anamnesis.procedimientoPrevio.fecha}` : '',
        ]
          .filter(Boolean)
          .join(', ')}.`
      : 'Sin procedimientos estéticos previos.'
  );

  lines.push(
    anamnesis.complicacionesPrevias.tiene
      ? `Complicaciones previas: ${anamnesis.complicacionesPrevias.detalle || 'sin detalle registrado'}.`
      : 'Sin complicaciones previas.'
  );

  lines.push(
    input.currentMedications ? `Medicación actual: ${input.currentMedications}.` : 'Sin medicación actual registrada.'
  );

  const allergyText =
    input.allergies.length > 0 || input.allergyNotes
      ? [...input.allergies.map((a) => ALLERGY_LABEL[a] ?? a), input.allergyNotes].filter(Boolean).join(', ')
      : null;
  lines.push(allergyText ? `Alergias: ${allergyText}.` : 'Niega alergias medicamentosas, cosméticas o al látex.');

  lines.push(
    anamnesis.antecedentesFamiliares.tiene
      ? `Antecedentes familiares relevantes: ${anamnesis.antecedentesFamiliares.detalle || 'sin detalle registrado'}.`
      : 'Sin antecedentes familiares relevantes.'
  );

  lines.push(
    anamnesis.habitos.length > 0 || anamnesis.habitosOtro
      ? `Hábitos: ${[...anamnesis.habitos.map((k) => ANAMNESIS_HABIT_LABEL[k]), anamnesis.habitosOtro].filter(Boolean).join(', ')}.`
      : 'Sin hábitos relevantes registrados.'
  );

  if (input.motivoConsulta) lines.push(`Consulta por: ${input.motivoConsulta}.`);

  return lines.join('\n');
}

// Formato de salida pedido textualmente por Urbina en la reunión (ver
// Flujo-Estetico-RIDS.html, Etapa 03): un párrafo clínico redactado, no una
// lista con viñetas.
const INSTRUCTIONS = [
  'Eres un asistente clínico que redacta el resumen de anamnesis de un paciente de una clínica estética, a partir de los datos ya registrados por el médico.',
  'Devuelve SOLO un párrafo clínico redactado en tercera persona, en español, tono profesional y conciso — sin viñetas, sin títulos, sin markdown.',
  'No inventes datos que no estén en la información entregada. Si un bloque no tiene antecedentes, indícalo brevemente (ej. "niega antecedentes mórbidos").',
  'No hagas diagnósticos ni recomendaciones de tratamiento — solo resume lo declarado.',
].join(' ');

export async function generateAnamnesisSummary(input: SummaryInput): Promise<{ text: string; tokensUsed: number }> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: getOpenAITextModel(),
    instructions: INSTRUCTIONS,
    input: describeAnamnesis(input),
    store: false,
  });
  const text = response.output_text?.trim();
  if (!text) throw new Error('El modelo no devolvió texto');
  return { text, tokensUsed: response.usage?.total_tokens ?? 0 };
}
