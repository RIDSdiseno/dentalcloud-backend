import Anthropic from '@anthropic-ai/sdk';

// Cerebro del asistente de la clínica (la burbuja). Usa la API de Claude
// (Anthropic). Las demás funciones de IA del sistema siguen en OpenAI.
const DEFAULT_MODEL = 'claude-sonnet-5-5';

let client: Anthropic | null = null;

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  if (!isAnthropicConfigured()) {
    throw new Error('Anthropic (Claude) no está configurado en el servidor');
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60000, maxRetries: 1 });
  }
  return client;
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}
