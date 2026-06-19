import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTED_SECRET_PREFIX = 'enc:v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export function encryptSecret(plainText: string, appSecret: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(appSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_SECRET_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptSecretIfNeeded(value: string, appSecret: string) {
  if (!value.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)) {
    return value;
  }

  const [, , ivValue, authTagValue, encryptedValue] = value.split(':');
  if (!ivValue || !authTagValue || !encryptedValue) {
    throw new Error('Invalid encrypted secret payload');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(appSecret), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function deriveKey(appSecret: string) {
  return createHash('sha256').update(appSecret).digest();
}
