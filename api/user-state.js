const USER_STATE_PREFIX = process.env.USER_STATE_PREFIX || 'risk_calculator_user_state';

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
    learningStore: state.learningStore && typeof state.learningStore === 'object' ? state.learningStore : { templates: {} }
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
  await runKvCommand(['SET', buildStateKey(username), JSON.stringify(next)]);
  return next;
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
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
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
    if (!username) {
      res.status(400).json({ error: 'Username required.' });
      return;
    }

    if (req.method === 'GET') {
      const state = await readUserState(username);
      res.status(200).json({ state });
      return;
    }

    if (req.method === 'PUT') {
      const state = await writeUserState(username, body.state || {});
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
