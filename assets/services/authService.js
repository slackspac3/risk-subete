/**
 * authService.js — Local PoC authentication stub
 *
 * PoC: user accounts are loaded from the shared Vercel user store when available.
 * Production: replace with Microsoft Entra ID (MSAL.js).
 * Integration points marked with [ENTRA-INTEGRATION].
 */

const AuthService = (() => {
  const SESSION_KEY = 'rq_auth_session';
  const ACCOUNTS_CACHE_KEY = 'rq_auth_accounts_cache';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  const DEFAULT_USERS_API_URL = 'https://risk-calculator-eight.vercel.app/api/users';
  const DEFAULT_ACCOUNTS = [
    { username: 'admin', password: 'Admin@Risk2026', displayName: 'Global Admin', role: 'admin' },
    { username: 'alex.risk', password: 'RiskUser@01', displayName: 'Alex Risk', role: 'user' },
    { username: 'nina.ops', password: 'RiskUser@02', displayName: 'Nina Ops', role: 'user' },
    { username: 'omar.tech', password: 'RiskUser@03', displayName: 'Omar Tech', role: 'user' },
    { username: 'priya.audit', password: 'RiskUser@04', displayName: 'Priya Audit', role: 'user' },
    { username: 'samir.compliance', password: 'RiskUser@05', displayName: 'Samir Compliance', role: 'user' }
  ];
  let accountsCache = DEFAULT_ACCOUNTS.slice();

  function getUsersApiUrl() {
    return DEFAULT_USERS_API_URL;
  }

  function sanitiseAccount(account) {
    if (!account) return null;
    return {
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      businessUnitEntityId: account.businessUnitEntityId || '',
      departmentEntityId: account.departmentEntityId || ''
    };
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

  function saveCache(accounts) {
    accountsCache = Array.isArray(accounts) && accounts.length ? accounts.map(normaliseAccount) : DEFAULT_ACCOUNTS.slice();
    localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify(accountsCache));
  }

  function readCachedAccounts() {
    try {
      const stored = JSON.parse(localStorage.getItem(ACCOUNTS_CACHE_KEY) || 'null');
      if (Array.isArray(stored) && stored.length) {
        accountsCache = stored.map(normaliseAccount);
      }
    } catch {}
    return accountsCache;
  }

  async function requestUsers(method = 'GET', payload) {
    const res = await fetch(getUsersApiUrl(), {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
      throw new Error(parsed?.detail || parsed?.error || text || `User store request failed with HTTP ${res.status}`);
    }
    return parsed || {};
  }

  async function init() {
    readCachedAccounts();
    try {
      const data = await requestUsers('GET');
      if (Array.isArray(data?.accounts) && data.accounts.length) {
        saveCache(data.accounts);
      }
    } catch (error) {
      console.warn('AuthService.init fallback:', error.message);
    }
    return accountsCache;
  }

  async function testUsersStoreHealth() {
    try {
      const data = await requestUsers('GET');
      return {
        ok: true,
        apiUrl: getUsersApiUrl(),
        accountCount: Array.isArray(data?.accounts) ? data.accounts.length : 0,
        writable: !!data?.storage?.writable,
        mode: data?.storage?.mode || 'unknown'
      };
    } catch (error) {
      return {
        ok: false,
        apiUrl: getUsersApiUrl(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function buildUsername(displayName, accounts) {
    const base = String(displayName || 'user')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'user';
    let candidate = base;
    let index = 1;
    while (accounts.some(account => account.username === candidate)) {
      index += 1;
      candidate = `${base}.${index}`;
    }
    return candidate;
  }

  function generatePassword(accounts) {
    const nextNumber = accounts.filter(account => account.role !== 'admin').length + 1;
    return `RiskUser@${String(nextNumber).padStart(2, '0')}`;
  }

  function writeSession(account) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      authenticated: true,
      ts: Date.now(),
      user: sanitiseAccount(account),
      context: {}
    }));
  }

  function readSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!session?.authenticated || !session.user?.username) return null;
      if (Date.now() - Number(session.ts || 0) > SESSION_TTL_MS) {
        logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  // [ENTRA-INTEGRATION] Replace with Entra loginPopup() and claim validation.
  function login(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');
    const account = readCachedAccounts().find(item =>
      item.username.toLowerCase() === normalizedUsername && item.password === normalizedPassword
    );
    if (!account) return { success: false, error: 'Invalid username or password' };
    writeSession(account);
    return { success: true, user: sanitiseAccount(account) };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function isAuthenticated() {
    return !!readSession();
  }

  function isAdminAuthenticated() {
    return readSession()?.user?.role === 'admin';
  }

  function getCurrentUser() {
    const session = readSession();
    if (!session?.user) return null;
    return {
      ...session.user,
      ...(session.context || {})
    };
  }

  function updateSessionContext(context = {}) {
    const session = readSession();
    if (!session?.user) return null;
    session.context = {
      ...(session.context || {}),
      ...context
    };
    session.ts = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return getCurrentUser();
  }

  function getSeededAccounts() {
    return readCachedAccounts().map(account => ({ ...sanitiseAccount(account), password: account.password }));
  }

  function getManagedAccounts() {
    return readCachedAccounts()
      .filter(account => account.role !== 'admin')
      .map(account => sanitiseAccount(account));
  }

  async function createManagedAccount({ displayName, businessUnitEntityId = '', departmentEntityId = '' } = {}) {
    const accounts = readCachedAccounts();
    const username = buildUsername(displayName, accounts);
    const password = generatePassword(accounts);
    const account = normaliseAccount({
      username,
      password,
      displayName,
      role: 'user',
      businessUnitEntityId,
      departmentEntityId
    });
    const data = await requestUsers('POST', { account });
    if (Array.isArray(data?.accounts)) saveCache(data.accounts);
    return { ...sanitiseAccount(account), password };
  }

  async function updateManagedAccount(username, updates = {}) {
    const data = await requestUsers('PATCH', {
      username: String(username || '').trim().toLowerCase(),
      updates: {
        displayName: typeof updates.displayName === 'string' ? updates.displayName.trim() : undefined,
        businessUnitEntityId: typeof updates.businessUnitEntityId === 'string' ? updates.businessUnitEntityId.trim() : undefined,
        departmentEntityId: typeof updates.departmentEntityId === 'string' ? updates.departmentEntityId.trim() : undefined
      }
    });
    if (Array.isArray(data?.accounts)) saveCache(data.accounts);
    const updated = readCachedAccounts().find(account => account.username === String(username || '').trim().toLowerCase()) || null;
    const session = readSession();
    if (session?.user?.username === updated?.username) {
      session.user = sanitiseAccount(updated);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    return updated ? sanitiseAccount(updated) : null;
  }

  return {
    init,
    testUsersStoreHealth,
    login,
    logout,
    isAuthenticated,
    isAdminAuthenticated,
    getCurrentUser,
    updateSessionContext,
    getSeededAccounts,
    getManagedAccounts,
    createManagedAccount,
    updateManagedAccount
  };
})();
