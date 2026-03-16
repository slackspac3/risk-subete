const crypto = require('crypto');
const { appendAuditEvent } = require('./_audit');

const DEFAULT_ACCOUNTS = [];

function getBootstrapAccounts() {
  try {
    const raw = String(process.env.BOOTSTRAP_ACCOUNTS_JSON || '').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normaliseAccount).filter(account => account.username && account.password) : [];
  } catch {
    return [];
  }
}

const USERS_KEY = process.env.USER_STORE_KEY || 'risk_calculator_users';
const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || '';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const loginAttempts = new Map();

function getKvUrl() {
  return process.env.APPLE_CAT || process.env.FOO_URL_TEST || process.env.RC_USER_STORE_URL || process.env.USER_STORE_KV_URL || process.env.KV_REST_API_URL || '';
}

function getKvToken() {
  return process.env.BANANA_DOG || process.env.FOO_TOKEN_TEST || process.env.RC_USER_STORE_TOKEN || process.env.USER_STORE_KV_TOKEN || process.env.KV_REST_API_TOKEN || '';
}

function normaliseAccount(account = {}) {
  return {
    username: String(account.username || '').trim().toLowerCase(),
    password: String(account.password || ''),
    displayName: String(account.displayName || '').trim() || 'User',
    role: account.role === 'admin' ? 'admin' : (account.role === 'bu_admin' ? 'bu_admin' : (account.role === 'function_admin' ? 'function_admin' : 'user')),
    businessUnitEntityId: String(account.businessUnitEntityId || '').trim(),
    departmentEntityId: String(account.departmentEntityId || '').trim()
  };
}

function sanitiseAccount(account = {}) {
  return {
    username: String(account.username || '').trim().toLowerCase(),
    displayName: String(account.displayName || '').trim() || 'User',
    role: account.role === 'admin' ? 'admin' : (account.role === 'bu_admin' ? 'bu_admin' : (account.role === 'function_admin' ? 'function_admin' : 'user')),
    businessUnitEntityId: String(account.businessUnitEntityId || '').trim(),
    departmentEntityId: String(account.departmentEntityId || '').trim()
  };
}

function generatePassword() {
  return `RiskUser@${Math.floor(1000 + Math.random() * 9000)}`;
}

function isAdminSecretValid(req) {
  return !!ADMIN_API_SECRET && req.headers['x-admin-secret'] === ADMIN_API_SECRET;
}

function isAdminSessionValid(req) {
  const payload = verifySessionToken(req.headers['x-session-token']);
  return !!payload && payload.role === 'admin';
}

function isAdminRequest(req) {
  return isAdminSecretValid(req) || isAdminSessionValid(req);
}

function canSelfUpdateAccount(session, username) {
  const safeUsername = String(username || '').trim().toLowerCase();
  return !!session && (session.role === 'admin' || String(session.username || '').trim().toLowerCase() === safeUsername);
}

function getSessionSigningSecret() {
  return process.env.SESSION_SIGNING_SECRET || ADMIN_API_SECRET || getKvToken() || '';
}

function encodeTokenSegment(value) {
  return Buffer.from(value).toString('base64url');
}

function createSessionToken(account) {
  const signingSecret = getSessionSigningSecret();
  if (!signingSecret) throw new Error('Session signing secret is not configured.');
  const payload = JSON.stringify({
    username: account.username,
    role: account.role,
    businessUnitEntityId: account.businessUnitEntityId || '',
    departmentEntityId: account.departmentEntityId || '',
    exp: Date.now() + SESSION_TTL_MS
  });
  const payloadPart = encodeTokenSegment(payload);
  const signature = crypto.createHmac('sha256', signingSecret).update(payloadPart).digest('base64url');
  return `${payloadPart}.${signature}`;
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

function getLoginThrottleKey(req, username) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim();
  return `${String(username || '').trim().toLowerCase()}::${ip || 'unknown'}`;
}

function isLoginRateLimited(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }
  entry.count += 1;
  loginAttempts.set(key, entry);
}

function clearFailedLogin(key) {
  loginAttempts.delete(key);
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

function hasWritableKv() {
  return !!(getKvUrl() && getKvToken());
}

async function readAccounts() {
  const response = await runKvCommand(['GET', USERS_KEY]);
  const raw = response?.result;
  if (!raw) return getBootstrapAccounts();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed.map(normaliseAccount) : getBootstrapAccounts();
  } catch {
    return getBootstrapAccounts();
  }
}

async function writeAccounts(accounts) {
  if (!hasWritableKv()) {
    throw new Error('Shared user store is not writable. Configure the shared store environment variables in Vercel.');
  }
  await runKvCommand(['SET', USERS_KEY, JSON.stringify(accounts.map(normaliseAccount))]);
  return accounts.map(normaliseAccount);
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://slackspac3.github.io';
  const body = typeof req.body === 'string'
    ? (() => {
        try {
          return JSON.parse(req.body || '{}');
        } catch {
          return {};
        }
      })()
    : (req.body || {});

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-admin-secret,x-session-token');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  try {
    if (req.method === 'GET') {
      if (!isAdminRequest(req)) {
        res.status(403).json({ error: 'Not authorised.' });
        return;
      }
      const accounts = await readAccounts();
      res.status(200).json({
        accounts: accounts.map(sanitiseAccount),
        storage: {
          writable: hasWritableKv(),
          mode: hasWritableKv() ? 'shared-kv' : (accounts.length ? 'bootstrap-fallback' : 'empty')
        }
      });
      return;
    }

    if (req.method === 'POST') {
      if (body.action === 'login') {
        const username = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '');
        const throttleKey = getLoginThrottleKey(req, username);
        if (isLoginRateLimited(throttleKey)) {
          await appendAuditEvent({ category: 'auth', eventType: 'login_rate_limited', actorUsername: username || 'unknown', actorRole: 'anonymous', status: 'blocked', source: 'server', details: { ip: getLoginThrottleKey(req, username).split('::')[1] || 'unknown' } });
          res.status(429).json({ error: 'Too many login attempts. Please wait and try again.' });
          return;
        }
        const accounts = await readAccounts();
        const matched = accounts.find(account => account.username === username && account.password === password);
        if (!matched) {
          recordFailedLogin(throttleKey);
          await appendAuditEvent({ category: 'auth', eventType: 'login_failure', actorUsername: username || 'unknown', actorRole: 'anonymous', status: 'failed', source: 'server' });
          res.status(401).json({ error: 'Invalid username or password.' });
          return;
        }
        clearFailedLogin(throttleKey);
        await appendAuditEvent({ category: 'auth', eventType: 'login_success', actorUsername: matched.username, actorRole: matched.role, status: 'success', source: 'server' });
        res.status(200).json({
          user: sanitiseAccount(matched),
          sessionToken: createSessionToken(matched)
        });
        return;
      }

      if (!isAdminRequest(req)) {
        res.status(403).json({ error: 'Admin authentication required.' });
        return;
      }

      const accounts = await readAccounts();
      const account = normaliseAccount(body.account || {});
      if (!account.username || !account.password) {
        res.status(400).json({ error: 'Missing username or password.' });
        return;
      }
      if (accounts.some(item => item.username === account.username)) {
        res.status(409).json({ error: 'Username already exists.' });
        return;
      }
      accounts.push(account);
      await writeAccounts(accounts);
      await appendAuditEvent({ category: 'user_admin', eventType: 'user_created', actorUsername: 'admin', actorRole: 'admin', target: account.username, status: 'success', source: 'server', details: { role: account.role, businessUnitEntityId: account.businessUnitEntityId, departmentEntityId: account.departmentEntityId } });
      res.status(201).json({
        account: sanitiseAccount(account),
        password: account.password,
        accounts: accounts.map(sanitiseAccount)
      });
      return;
    }

    if (req.method === 'PATCH') {
      const username = String(body.username || '').trim().toLowerCase();
      const updates = body.updates || {};
      const session = verifySessionToken(req.headers['x-session-token']);
      const accounts = await readAccounts();
      const index = accounts.findIndex(account => account.username === username);
      if (index < 0) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (body.action === 'self-update') {
        if (!canSelfUpdateAccount(session, username)) {
          res.status(403).json({ error: 'You are not allowed to modify this account.' });
          return;
        }
        accounts[index] = normaliseAccount({
          ...accounts[index],
          businessUnitEntityId: typeof updates.businessUnitEntityId === 'string' ? updates.businessUnitEntityId : accounts[index].businessUnitEntityId,
          departmentEntityId: typeof updates.departmentEntityId === 'string' ? updates.departmentEntityId : accounts[index].departmentEntityId
        });
        await writeAccounts(accounts);
        await appendAuditEvent({ category: 'profile', eventType: 'self_assignment_updated', actorUsername: accounts[index].username, actorRole: accounts[index].role, target: accounts[index].username, status: 'success', source: 'server', details: { businessUnitEntityId: accounts[index].businessUnitEntityId, departmentEntityId: accounts[index].departmentEntityId } });
        res.status(200).json({ accounts: accounts.map(sanitiseAccount) });
        return;
      }
      if (!isAdminRequest(req)) {
        res.status(403).json({ error: 'Admin authentication required.' });
        return;
      }
      if (body.action === 'reset-password') {
        const nextPassword = generatePassword();
        accounts[index] = normaliseAccount({
          ...accounts[index],
          password: nextPassword
        });
        await writeAccounts(accounts);
        await appendAuditEvent({ category: 'user_admin', eventType: 'password_reset', actorUsername: 'admin', actorRole: 'admin', target: accounts[index].username, status: 'success', source: 'server' });
        res.status(200).json({
          account: sanitiseAccount(accounts[index]),
          password: nextPassword,
          accounts: accounts.map(sanitiseAccount)
        });
        return;
      }
      if (body.action === 'delete-user') {
        const removed = accounts.splice(index, 1)[0];
        await writeAccounts(accounts);
        await appendAuditEvent({ category: 'user_admin', eventType: 'user_deleted', actorUsername: 'admin', actorRole: 'admin', target: removed.username, status: 'success', source: 'server' });
        res.status(200).json({ accounts: accounts.map(sanitiseAccount) });
        return;
      }
      accounts[index] = normaliseAccount({
        ...accounts[index],
        displayName: typeof updates.displayName === 'string' && updates.displayName.trim() ? updates.displayName.trim() : accounts[index].displayName,
        role: typeof updates.role === 'string' ? updates.role : accounts[index].role,
        businessUnitEntityId: typeof updates.businessUnitEntityId === 'string' ? updates.businessUnitEntityId : accounts[index].businessUnitEntityId,
        departmentEntityId: typeof updates.departmentEntityId === 'string' ? updates.departmentEntityId : accounts[index].departmentEntityId
      });
      await writeAccounts(accounts);
      await appendAuditEvent({ category: 'user_admin', eventType: body.action === 'admin-update' ? 'managed_user_updated' : 'user_updated', actorUsername: 'admin', actorRole: 'admin', target: accounts[index].username, status: 'success', source: 'server', details: { role: accounts[index].role, businessUnitEntityId: accounts[index].businessUnitEntityId, departmentEntityId: accounts[index].departmentEntityId } });
      res.status(200).json({ accounts: accounts.map(sanitiseAccount) });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({
      error: 'User store request failed.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
