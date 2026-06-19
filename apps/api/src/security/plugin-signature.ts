import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type PluginSignatureInput = {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string;
};

export function hashRequestBody(body: string) {
  return createHash('sha256').update(body || '').digest('hex');
}

export function buildPluginSignaturePayload(input: PluginSignatureInput) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    hashRequestBody(input.body),
  ].join('\n');
}

export function signPluginRequest(input: PluginSignatureInput, secret: string) {
  return createHmac('sha256', secret)
    .update(buildPluginSignaturePayload(input))
    .digest('hex');
}

export function verifyPluginSignature(input: PluginSignatureInput, secret: string, signature: string) {
  const expected = signPluginRequest(input, secret);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature || '', 'hex');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
