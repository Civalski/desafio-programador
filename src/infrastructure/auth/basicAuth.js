import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'quick_filler_session';
const DAY_MS = 24 * 60 * 60 * 1000;

const equal = (left = '', right = '') => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const encode = value => Buffer.from(value).toString('base64url');
const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url');
const cookies = header => Object.fromEntries((header || '').split(';').map(item => item.trim().split(/=(.*)/s)).filter(([key]) => key));

export class BasicAuth {
  constructor(env = process.env) {
    this.username = env.AUTH_USERNAME || '';
    this.password = env.AUTH_PASSWORD || '';
    this.secret = env.AUTH_SESSION_SECRET || '';
    this.enabled = Boolean(this.username && this.password && this.secret);
  }
  authenticate(username, password) { return this.enabled && equal(username, this.username) && equal(password, this.password); }
  createSession() { const payload = encode(JSON.stringify({ sub: this.username, exp: Date.now() + DAY_MS })); return `${payload}.${sign(payload, this.secret)}`; }
  hasValidSession(header) {
    if (!this.enabled) return true;
    const token = cookies(header)[COOKIE_NAME]; if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !equal(signature, sign(payload, this.secret))) return false;
    try { const session = JSON.parse(Buffer.from(payload, 'base64url').toString()); return session.sub === this.username && Number(session.exp) > Date.now(); } catch { return false; }
  }
  cookie(value, maxAge = DAY_MS / 1000) { return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''}`; }
  clearCookie() { return this.cookie('', 0); }
}
