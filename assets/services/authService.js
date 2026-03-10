/**
 * authService.js — Local PoC authentication stub
 *
 * PoC: six seeded accounts stored in code for local testing only.
 * Production: replace with Microsoft Entra ID (MSAL.js).
 * Integration points marked with [ENTRA-INTEGRATION].
 */

const AuthService = (() => {
  const SESSION_KEY = 'rq_auth_session';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  const ACCOUNTS = [
    { username: 'admin', password: 'Admin@Risk2026', displayName: 'Global Admin', role: 'admin' },
    { username: 'alex.risk', password: 'RiskUser@01', displayName: 'Alex Risk', role: 'user' },
    { username: 'nina.ops', password: 'RiskUser@02', displayName: 'Nina Ops', role: 'user' },
    { username: 'omar.tech', password: 'RiskUser@03', displayName: 'Omar Tech', role: 'user' },
    { username: 'priya.audit', password: 'RiskUser@04', displayName: 'Priya Audit', role: 'user' },
    { username: 'samir.compliance', password: 'RiskUser@05', displayName: 'Samir Compliance', role: 'user' }
  ];

  function sanitiseAccount(account) {
    if (!account) return null;
    return {
      username: account.username,
      displayName: account.displayName,
      role: account.role
    };
  }

  function writeSession(account) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      authenticated: true,
      ts: Date.now(),
      user: sanitiseAccount(account)
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
    const account = ACCOUNTS.find(item =>
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
    return readSession()?.user || null;
  }

  function getSeededAccounts() {
    return ACCOUNTS.map(account => ({ ...sanitiseAccount(account), password: account.password }));
  }

  return {
    login,
    logout,
    isAuthenticated,
    isAdminAuthenticated,
    getCurrentUser,
    getSeededAccounts
  };
})();
