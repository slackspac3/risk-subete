/**
 * authService.js — Local PoC authentication stub
 *
 * PoC: six seeded accounts stored in code for local testing only.
 * Production: replace with Microsoft Entra ID (MSAL.js).
 * Integration points marked with [ENTRA-INTEGRATION].
 */

const AuthService = (() => {
  const SESSION_KEY = 'rq_auth_session';
  const ACCOUNTS_KEY = 'rq_auth_accounts';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  const DEFAULT_ACCOUNTS = [
    { username: 'admin', password: 'Admin@Risk2026', displayName: 'Global Admin', role: 'admin' },
    { username: 'alex.risk', password: 'RiskUser@01', displayName: 'Alex Risk', role: 'user' },
    { username: 'nina.ops', password: 'RiskUser@02', displayName: 'Nina Ops', role: 'user' },
    { username: 'omar.tech', password: 'RiskUser@03', displayName: 'Omar Tech', role: 'user' },
    { username: 'priya.audit', password: 'RiskUser@04', displayName: 'Priya Audit', role: 'user' },
    { username: 'samir.compliance', password: 'RiskUser@05', displayName: 'Samir Compliance', role: 'user' }
  ];

  function readAccounts() {
    try {
      const stored = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || 'null');
      return Array.isArray(stored) && stored.length ? stored : DEFAULT_ACCOUNTS;
    } catch {
      return DEFAULT_ACCOUNTS;
    }
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
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
    const account = readAccounts().find(item =>
      item.username.toLowerCase() === normalizedUsername && item.password === normalizedPassword
    );
    if (!account) return { success: false, error: 'Invalid username or password' };
    writeSession(account);
    return { success: true, user: sanitiseAccount(account) };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    // [ENTRA-INTEGRATION] Call MSAL logout here.
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
    return readAccounts().map(account => ({ ...sanitiseAccount(account), password: account.password }));
  }

  function getManagedAccounts() {
    return readAccounts()
      .filter(account => account.role !== 'admin')
      .map(account => sanitiseAccount(account));
  }

  function createManagedAccount({ displayName, businessUnitEntityId = '', departmentEntityId = '' } = {}) {
    const accounts = readAccounts();
    const username = buildUsername(displayName, accounts);
    const password = generatePassword(accounts);
    const account = {
      username,
      password,
      displayName: String(displayName || '').trim() || 'New User',
      role: 'user',
      businessUnitEntityId: String(businessUnitEntityId || '').trim(),
      departmentEntityId: String(departmentEntityId || '').trim()
    };
    accounts.push(account);
    saveAccounts(accounts);
    return { ...sanitiseAccount(account), password };
  }

  function updateManagedAccount(username, updates = {}) {
    const accounts = readAccounts();
    const index = accounts.findIndex(account => account.username === String(username || '').trim().toLowerCase());
    if (index < 0) return null;
    accounts[index] = {
      ...accounts[index],
      displayName: typeof updates.displayName === 'string' && updates.displayName.trim() ? updates.displayName.trim() : accounts[index].displayName,
      businessUnitEntityId: typeof updates.businessUnitEntityId === 'string' ? updates.businessUnitEntityId.trim() : accounts[index].businessUnitEntityId || '',
      departmentEntityId: typeof updates.departmentEntityId === 'string' ? updates.departmentEntityId.trim() : accounts[index].departmentEntityId || ''
    };
    saveAccounts(accounts);
    const session = readSession();
    if (session?.user?.username === accounts[index].username) {
      session.user = sanitiseAccount(accounts[index]);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    return sanitiseAccount(accounts[index]);
  }

  return {
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
