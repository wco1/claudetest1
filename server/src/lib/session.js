import crypto from 'node:crypto';
import { config } from '../config.js';

const COOKIE_NAME = 'kt_session';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(value) {
  return crypto.createHmac('sha256', config.auth.sessionSecret).update(value).digest('base64url');
}

export function createToken(payload) {
  const body = b64url(JSON.stringify({ ...payload, iat: Date.now() }));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.iat || Date.now() - payload.iat > config.auth.sessionMaxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function setSessionCookie(res, payload, { secure }) {
  const token = createToken(payload);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(config.auth.sessionMaxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
  return token;
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function readSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies[COOKIE_NAME];

  // TV browsers are erratic about third-party cookie policies on LAN addresses,
  // so the client may also present the token as a bearer header.
  if (!token) {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  }
  // Video elements cannot set headers; playback URLs may carry the token.
  if (!token && req.query?.t) token = String(req.query.t);

  return verifyToken(token);
}

export const SESSION_COOKIE = COOKIE_NAME;
