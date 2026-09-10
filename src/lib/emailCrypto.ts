import crypto from 'crypto';

// Cifrado reversible para la contraseña SMTP de cada clínica (nunca se
// guarda en texto plano). AES-256-GCM: `EMAIL_ENCRYPTION_KEY` es una clave
// de 32 bytes en base64, global para todo el sistema — no hay una clave por
// clínica, sólo el secreto cifrado con ella cambia por fila.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.EMAIL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('EMAIL_ENCRYPTION_KEY no está configurada');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('EMAIL_ENCRYPTION_KEY debe decodificar a 32 bytes (AES-256)');
  }
  return key;
}

// Formato de almacenamiento: "iv:authTag:ciphertext", todo en hex, en un
// solo string — así cabe en una única columna sin tablas/campos extra.
export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Formato de secreto cifrado inválido');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
