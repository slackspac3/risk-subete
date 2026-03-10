const DEFAULT_ACCOUNTS = [
  { username: 'admin', password: 'Admin@Risk2026', displayName: 'Global Admin', role: 'admin', businessUnitEntityId: '', departmentEntityId: '' },
  { username: 'alex.risk', password: 'RiskUser@01', displayName: 'Alex Risk', role: 'user', businessUnitEntityId: '', departmentEntityId: '' },
  { username: 'nina.ops', password: 'RiskUser@02', displayName: 'Nina Ops', role: 'user', businessUnitEntityId: '', departmentEntityId: '' },
  { username: 'omar.tech', password: 'RiskUser@03', displayName: 'Omar Tech', role: 'user', businessUnitEntityId: '', departmentEntityId: '' },
  { username: 'priya.audit', password: 'RiskUser@04', displayName: 'Priya Audit', role: 'user', businessUnitEntityId: '', departmentEntityId: '' },
  { username: 'samir.compliance', password: 'RiskUser@05', displayName: 'Samir Compliance', role: 'user', businessUnitEntityId: '', departmentEntityId: '' }
];

const USERS_KEY = process.env.USER_STORE_KEY || 'risk_calculator_users';


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
    role: account.role === 'admin' ? 'admin' : 'user',
    businessUnitEntityId: String(account.businessUnitEntityId || '').trim(),
    departmentEntityId: String(account.departmentEntityId || '').trim()
  };
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
  if (!raw) return DEFAULT_ACCOUNTS.map(normaliseAccount);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed.map(normaliseAccount) : DEFAULT_ACCOUNTS.map(normaliseAccount);
  } catch {
    return DEFAULT_ACCOUNTS.map(normaliseAccount);
  }
}

async function writeAccounts(accounts) {
  if (!hasWritableKv()) {
    throw new Error('Shared user store is not writable. Add KV_REST_API_URL and KV_REST_API_TOKEN in the Vercel project.');
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
    if (req.method === 'GET') {
      const accounts = await readAccounts();
      res.status(200).json({
        accounts,
        storage: {
          writable: hasWritableKv(),
          mode: hasWritableKv() ? 'shared-kv' : 'fallback-defaults',
          diagnostics: {
            vercelEnv: process.env.VERCEL_ENV || '',
            vercelTargetEnv: process.env.VERCEL_TARGET_ENV || '',
            vercelUrl: process.env.VERCEL_URL || '',
            vercelBranchUrl: process.env.VERCEL_BRANCH_URL || '',
            vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || '',
            fooTestPresent: !!process.env.FOO_TEST,
            fooTestValue: process.env.FOO_TEST || '',
            barTestPresent: !!process.env.BAR_TEST,
            barTestValue: process.env.BAR_TEST || '',
            appleCatPresent: !!process.env.APPLE_CAT,
            bananaDogPresent: !!process.env.BANANA_DOG,
            fooUrlTestPresent: !!process.env.FOO_URL_TEST,
            fooTokenTestPresent: !!process.env.FOO_TOKEN_TEST,
            rcUserStoreUrlPresent: !!process.env.RC_USER_STORE_URL,
            rcUserStoreTokenPresent: !!process.env.RC_USER_STORE_TOKEN,
            kvUrlPresent: !!process.env.KV_REST_API_URL,
            kvTokenPresent: !!process.env.KV_REST_API_TOKEN,
            userStoreKvUrlPresent: !!process.env.USER_STORE_KV_URL,
            userStoreKvTokenPresent: !!process.env.USER_STORE_KV_TOKEN,
            userStoreKey: USERS_KEY,
            allowedOrigin,
            debugPresent: !!process.env.USER_STORE_DEBUG,
            debugValue: process.env.USER_STORE_DEBUG || ''
          }
        }
      });
      return;
    }

    if (req.method === 'POST') {
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
      res.status(201).json({ accounts });
      return;
    }

    if (req.method === 'PATCH') {
      const username = String(body.username || '').trim().toLowerCase();
      const updates = body.updates || {};
      const accounts = await readAccounts();
      const index = accounts.findIndex(account => account.username === username);
      if (index < 0) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      accounts[index] = normaliseAccount({
        ...accounts[index],
        displayName: typeof updates.displayName === 'string' && updates.displayName.trim() ? updates.displayName.trim() : accounts[index].displayName,
        businessUnitEntityId: typeof updates.businessUnitEntityId === 'string' ? updates.businessUnitEntityId : accounts[index].businessUnitEntityId,
        departmentEntityId: typeof updates.departmentEntityId === 'string' ? updates.departmentEntityId : accounts[index].departmentEntityId
      });
      await writeAccounts(accounts);
      res.status(200).json({ accounts });
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
