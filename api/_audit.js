const crypto = require('crypto');

const AUDIT_KEY = process.env.AUDIT_LOG_KEY || 'risk_calculator_audit_log';
const AUDIT_CAPACITY = Number(process.env.AUDIT_LOG_CAPACITY || 200);

function getKvUrl() {
  return process.env.APPLE_CAT || process.env.FOO_URL_TEST || process.env.RC_USER_STORE_URL || process.env.USER_STORE_KV_URL || process.env.KV_REST_API_URL || '';
}

function getKvToken() {
  return process.env.BANANA_DOG || process.env.FOO_TOKEN_TEST || process.env.RC_USER_STORE_TOKEN || process.env.USER_STORE_KV_TOKEN || process.env.KV_REST_API_TOKEN || '';
}

async function runKvCommand(command) {
  const url = getKvUrl();
  const token = getKvToken();
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `KV request failed with HTTP ${res.status}`);
  }
  return res.json();
}

async function readAuditLog() {
  const response = await runKvCommand(['GET', AUDIT_KEY]);
  const raw = response?.result;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAuditLog(entries) {
  const next = Array.isArray(entries) ? entries.slice(-AUDIT_CAPACITY) : [];
  await runKvCommand(['SET', AUDIT_KEY, JSON.stringify(next)]);
  return next;
}

async function appendAuditEvent(event = {}) {
  const entry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    category: event.category || 'general',
    eventType: event.eventType || 'event',
    actorUsername: event.actorUsername || 'system',
    actorRole: event.actorRole || 'system',
    target: event.target || '',
    status: event.status || 'success',
    source: event.source || 'server',
    details: event.details && typeof event.details === 'object' ? event.details : {}
  };
  const entries = await readAuditLog();
  entries.push(entry);
  await writeAuditLog(entries);
  return entry;
}

function summariseAuditLog(entries = []) {
  const recent = [...entries].reverse();
  const summary = {
    total: recent.length,
    retainedCapacity: AUDIT_CAPACITY,
    loginSuccessCount: 0,
    loginFailureCount: 0,
    logoutCount: 0,
    adminActionCount: 0,
    buAdminActionCount: 0,
    userActionCount: 0
  };
  for (const entry of recent) {
    if (entry.eventType === 'login_success') summary.loginSuccessCount += 1;
    if (entry.eventType === 'login_failure') summary.loginFailureCount += 1;
    if (entry.eventType === 'logout') summary.logoutCount += 1;
    if (entry.actorRole === 'admin') summary.adminActionCount += 1;
    else if (entry.actorRole === 'bu_admin') summary.buAdminActionCount += 1;
    else if (entry.actorRole === 'user') summary.userActionCount += 1;
  }
  return summary;
}

function getSessionSigningSecret() {
  return process.env.SESSION_SIGNING_SECRET || process.env.ADMIN_API_SECRET || getKvToken() || '';
}

function verifySessionToken(token) {
  const signingSecret = getSessionSigningSecret();
  if (!signingSecret) return null;
  const value = String(token || '').trim();
  if (!value || !value.includes('.')) return null;
  const [payloadPart, signature] = value.split('.', 2);
  const expected = crypto.createHmac('sha256', signingSecret).update(payloadPart).digest('base64url');
  if (signature !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (!payload?.username || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  AUDIT_CAPACITY,
  appendAuditEvent,
  readAuditLog,
  summariseAuditLog,
  verifySessionToken
};
