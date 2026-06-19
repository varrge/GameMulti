import { createHmac, timingSafeEqual } from 'node:crypto';

export function encodeDiscoursePayload(params: Record<string, string>) {
  return Buffer.from(new URLSearchParams(params).toString(), 'utf8').toString('base64');
}

export function decodeDiscoursePayload(payload: string) {
  const decoded = Buffer.from(payload, 'base64').toString('utf8');
  const params = new URLSearchParams(decoded);
  return Object.fromEntries(params.entries());
}

export function signDiscoursePayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyDiscoursePayload(payload: string, signature: string, secret: string) {
  const expected = signDiscoursePayload(payload, secret);
  const actual = signature.trim().toLowerCase();

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
