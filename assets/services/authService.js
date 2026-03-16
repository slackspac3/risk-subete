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
  const ADMIN_SECRET_KEY = 'rq_admin_api_secret';
  const DEFAULT_USERS_API_URL = resolveApiUrl('/api/users');
  const DEFAULT_ACCOUNTS = [];
  let accountsCache = DEFAULT_ACCOUNTS.slice();

function resolveApiUrl(path) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin && origin.includes('vercel.app')) return `${origin}${path}`;
  return `https://risk-calculator-eight.vercel.app${path}`;
}

  function getUsersApiUrl() {
    return DEFAULT_USERS_API_URL;
  }

  function getAdminApiSecret() {
    return localStorage.getItem(ADMIN_SECRET_KEY) || '';
  }

  function setAdminApiSecret(secret) {
    const value = String(secret || '').trim();
    if (value) localStorage.setItem(ADMIN_SECRET_KEY, value);
    else localStorage.removeItem(ADMIN_SECRET_KEY);
    return value;
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
      role: account.role === 'admin' ? 'admin' : (account.role === 'bu_admin' ? 'bu_admin' : (account.role === 'function_admin' ? 'function_admin' : 'user')),
      businessUnitEntityId: String(account.businessUnitEntityId || '').trim(),
      departmentEntityId: String(account.departmentEntityId || '').trim()
    };
  }

  function saveCache(accounts) {
    accountsCache = Array.isArray(accounts) && accounts.length ? accounts.map(normaliseAccount) : [];
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

  async function requestUsers(method = 'GET', payload, { includeAdminSecret = false } = {}) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (includeAdminSecret && getAdminApiSecret()) {
      headers['x-admin-secret'] = getAdminApiSecret();
    }
    if (getApiSessionToken()) {
      headers['x-session-token'] = getApiSessionToken();
    }
    const res = await fetch(getUsersApiUrl(), {
      method,
      headers,
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
      apiSessionToken: account.apiSessionToken || '',
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
  async function login(username, password) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');
    try {
      const data = await requestUsers('POST', {
        action: 'login',
        username: normalizedUsername,
        password: normalizedPassword
      });
      if (!data?.user) return { success: false, error: 'Invalid username or password' };
      const knownAccounts = readCachedAccounts().filter(account => account.username !== data.user.username);
      saveCache([...knownAccounts, data.user]);
      writeSession({ ...data.user, apiSessionToken: data.sessionToken || '' });
      return { success: true, user: sanitiseAccount(data.user) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Invalid username or password' };
    }
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

  function getApiSessionToken() {
    return readSession()?.apiSessionToken || '';
  }


  function getManagedAccounts() {
    return readCachedAccounts()
      .filter(account => account.role !== 'admin')
      .map(account => sanitiseAccount(account));
  }

  async function createManagedAccount({ displayName, businessUnitEntityId = '', departmentEntityId = '', role = 'user' } = {}) {
    const accounts = readCachedAccounts();
    const username = buildUsername(displayName, accounts);
    const password = generatePassword(accounts);
    const account = normaliseAccount({
      username,
      password,
      displayName,
      role: role === 'bu_admin' ? 'bu_admin' : (role === 'function_admin' ? 'function_admin' : 'user'),
      businessUnitEntityId,
      departmentEntityId
    });
    const data = await requestUsers('POST', { action: 'create', account }, { includeAdminSecret: true });
    if (Array.isArray(data?.accounts)) saveCache(data.accounts);
    return { ...(data?.account || sanitiseAccount(account)), password: data?.password || password };
  }

  async function updateManagedAccount(username, updates = {}) {
    const data = await requestUsers('PATCH', {
      action: 'self-update',
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


  async function adminUpdateManagedAccount(username, updates = {}) {
    const data = await requestUsers('PATCH', {
      action: 'admin-update',
      username: String(username || '').trim().toLowerCase(),
      updates: {
        displayName: typeof updates.displayName === 'string' ? updates.displayName.trim() : undefined,
        role: typeof updates.role === 'string' ? updates.role.trim() : undefined,
        businessUnitEntityId: typeof updates.businessUnitEntityId === 'string' ? updates.businessUnitEntityId.trim() : undefined,
        departmentEntityId: typeof updates.departmentEntityId === 'string' ? updates.departmentEntityId.trim() : undefined
      }
    }, { includeAdminSecret: true });
    if (Array.isArray(data?.accounts)) saveCache(data.accounts);
    const updated = readCachedAccounts().find(account => account.username === String(username || '').trim().toLowerCase()) || null;
    return updated ? sanitiseAccount(updated) : null;
  }

  async function resetManagedPassword(username) {
    const data = await requestUsers('PATCH', {
      action: 'reset-password',
      username: String(username || '').trim().toLowerCase()
    }, { includeAdminSecret: true });
    if (Array.isArray(data?.accounts)) saveCache(data.accounts);
    return {
      account: data?.account ? sanitiseAccount(data.account) : null,
      password: data?.password || ''
    };
  }

  async function deleteManagedAccount(username) {
    const data = await requestUsers('PATCH', {
      action: 'delete-user',
      username: String(username || '').trim().toLowerCase()
    }, { includeAdminSecret: true });
    if (Array.isArray(data?.accounts)) saveCache(data.accounts);
    return true;
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
    getApiSessionToken,
    getManagedAccounts,
    createManagedAccount,
    updateManagedAccount,
    adminUpdateManagedAccount,
    resetManagedPassword,
    deleteManagedAccount,
    getAdminApiSecret,
    setAdminApiSecret
  };
})();
