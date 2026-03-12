const USER_STATE_PREFIX = process.env.USER_STATE_PREFIX || 'risk_calculator_user_state';
const { appendAuditEvent, verifySessionToken } = require('./_audit');

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

function buildStateKey(username = '') {
  return `${USER_STATE_PREFIX}__${String(username || '').trim().toLowerCase()}`;
}

function normaliseState(state = {}) {
  return {
    userSettings: state.userSettings && typeof state.userSettings === 'object' ? state.userSettings : null,
    assessments: Array.isArray(state.assessments) ? state.assessments : [],
    learningStore: state.learningStore && typeof state.learningStore === 'object' ? state.learningStore : { templates: {} },
    draft: state.draft && typeof state.draft === 'object' ? state.draft : null,
    _meta: {
      revision: Number(state._meta?.revision || 0),
      updatedAt: Number(state._meta?.updatedAt || 0)
    }
  };
}

async function readUserState(username) {
  const response = await runKvCommand(['GET', buildStateKey(username)]);
  const raw = response?.result;
  if (!raw) return normaliseState();
  try {
    return normaliseState(JSON.parse(raw));
  } catch {
    return normaliseState();
  }
}

async function writeUserState(username, state) {
  const next = normaliseState(state);
  const current = await readUserState(username);
  const currentUpdatedAt = Number(current._meta?.updatedAt || 0);
  const nextUpdatedAt = Number(next._meta?.updatedAt || 0);
  const currentRevision = Number(current._meta?.revision || 0);
  const nextRevision = Number(next._meta?.revision || 0);
  if (currentUpdatedAt > nextUpdatedAt || (currentUpdatedAt === nextUpdatedAt && currentRevision > nextRevision)) {
    return current;
  }
  await runKvCommand(['SET', buildStateKey(username), JSON.stringify(next)]);
  return next;
}


function canAccessUserState(session, username) {
  const safeUsername = String(username || '').trim().toLowerCase();
  return !!session && (session.role === 'admin' || String(session.username || '').trim().toLowerCase() === safeUsername);
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://slackspac3.github.io';
  const body = typeof req.body === 'string'
    ? (() => {
        try { return JSON.parse(req.body || '{}'); } catch { return {}; }
      })()
    : (req.body || {});

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-session-token');
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
    const username = String(req.method === 'GET' ? req.query?.username : body.username || '').trim().toLowerCase();
    const session = verifySessionToken(req.headers['x-session-token']);
    if (!username) {
      res.status(400).json({ error: 'Username required.' });
      return;
    }
    if (!canAccessUserState(session, username)) {
      res.status(403).json({ error: 'You are not allowed to access this user state.' });
      return;
    }

    if (req.method === 'GET') {
      const state = await readUserState(username);
      res.status(200).json({ state });
      return;
    }

    if (req.method === 'PUT') {
      const state = await writeUserState(username, body.state || {});
      if (body.audit && session) {
        await appendAuditEvent({
          category: body.audit.category || 'user_state',
          eventType: body.audit.eventType || 'user_state_updated',
          actorUsername: session.username,
          actorRole: session.role || 'user',
          target: body.audit.target || username,
          status: 'success',
          source: 'server',
          details: body.audit.details || {}
        });
      }
      res.status(200).json({ state });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({
      error: 'User state request failed.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
