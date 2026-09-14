import OpenAI from 'openai';

// Misma llave que ya paga Dental-Demo-Back (OPENAI_API_KEY compartida entre
// productos, decisión explícita del usuario el 14/09) — mismo patrón de
// configuración que allá (src/config/openai.js) para no reinventar nada.
const DEFAULT_TEXT_MODEL = 'gpt-5.4-mini';

let client: OpenAI | null = null;

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAIClient(): OpenAI {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI no está configurado en el servidor');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000,
      maxRetries: 1,
    });
  }
  return client;
}

export function getOpenAITextModel(): string {
  return process.env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
}
