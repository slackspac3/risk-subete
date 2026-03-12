/**
 * app.js — Main application entry point
 * G42 Tech & Cyber Risk Quantifier PoC
 */

'use strict';

const TOLERANCE_THRESHOLD = 5_000_000;
const DEFAULT_FX_RATE = 3.6725;
const DEFAULT_COMPASS_PROXY_URL = resolveCompassProxyUrl();
const GLOBAL_ADMIN_STORAGE_KEY = 'rq_admin_settings';
const USER_SETTINGS_STORAGE_PREFIX = 'rq_user_settings';
const ASSESSMENTS_STORAGE_PREFIX = 'rq_assessments';
const LEARNING_STORAGE_PREFIX = 'rq_learning_store';
const DRAFT_STORAGE_PREFIX = 'rq_draft';
const SESSION_LLM_STORAGE_PREFIX = 'rq_llm_session';
const DEFAULT_ADMIN_SETTINGS = {
  geography: 'United Arab Emirates',
  companyWebsiteUrl: '',
  companyContextProfile: '',
  companyContextSections: null,
  companyStructure: [],
  entityContextLayers: [],
  riskAppetiteStatement: 'Moderate. Escalate risks that threaten regulated operations, cross-border data movement, or strategic platforms.',
  applicableRegulations: ['UAE PDPL', 'BIS Export Controls', 'OFAC Sanctions', 'UAE Cybersecurity Council Guidance'],
  aiInstructions: 'Prioritise operational, regulatory, and strategic impact. Use British English.',
  benchmarkStrategy: 'Prefer GCC and UAE benchmark references where relevant. Where GCC data is thin, use the best available global benchmark and explain the fallback clearly.',
  defaultLinkMode: true,
  toleranceThresholdUsd: TOLERANCE_THRESHOLD,
  warningThresholdUsd: 3_000_000,
  annualReviewThresholdUsd: 12_000_000,
  adminContextSummary: 'Use this workspace to maintain geography, regulations, thresholds, and AI guidance for the platform.',
  escalationGuidance: 'Escalate to leadership when the scenario is above tolerance, close to tolerance, or materially affects regulated services.'
};


function resolveCompassProxyUrl() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin && origin.includes('vercel.app')) return `${origin}/api/compass`;
  return 'https://risk-calculator-eight.vercel.app/api/compass';
}

const AppState = {
  currency: 'USD',
  fxRate: DEFAULT_FX_RATE,
  mode: 'basic',
  currentUser: null,
  draft: {},
  buList: [],
  docList: [],
  adminNewUserStatus: '',
  adminVisiblePasswords: {},
  settingsSectionState: {},
  settingsScrollState: {},
  adminSettingsCache: null,
  userStateCache: { username: '', userSettings: null, assessments: null, learningStore: null, draft: null },
  auditLogCache: { loaded: false, loading: false, entries: [], summary: null, error: '' }
};


function getSettingsApiUrl() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin && origin.includes('vercel.app')) return `${origin}/api/settings`;
  return 'https://risk-calculator-eight.vercel.app/api/settings';
}

async function requestSharedSettings(method = 'GET', payload, { includeAdminSecret = false } = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (includeAdminSecret && AuthService.getAdminApiSecret()) {
    headers['x-admin-secret'] = AuthService.getAdminApiSecret();
  }
  if (AuthService.getApiSessionToken()) {
    headers['x-session-token'] = AuthService.getApiSessionToken();
  }
  const res = await fetch(getSettingsApiUrl(), {
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
    throw new Error(parsed?.detail || parsed?.error || text || `Settings request failed with HTTP ${res.status}`);
  }
  return parsed || {};
}

async function loadSharedAdminSettings() {
  try {
    const data = await requestSharedSettings('GET');
    if (data?.settings) {
      let localSaved = null;
      try {
        localSaved = JSON.parse(localStorage.getItem(GLOBAL_ADMIN_STORAGE_KEY) || 'null');
      } catch {}
      const sharedSettings = {
        ...DEFAULT_ADMIN_SETTINGS,
        ...data.settings,
        applicableRegulations: Array.isArray(data.settings.applicableRegulations) ? data.settings.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations]
      };
      const localHasStructure = Array.isArray(localSaved?.companyStructure) && localSaved.companyStructure.length;
      const sharedHasStructure = Array.isArray(sharedSettings.companyStructure) && sharedSettings.companyStructure.length;
      const localHasLayers = Array.isArray(localSaved?.entityContextLayers) && localSaved.entityContextLayers.length;
      const sharedHasLayers = Array.isArray(sharedSettings.entityContextLayers) && sharedSettings.entityContextLayers.length;
      const merged = {
        ...sharedSettings,
        companyStructure: sharedHasStructure ? sharedSettings.companyStructure : (localHasStructure ? localSaved.companyStructure : sharedSettings.companyStructure),
        entityContextLayers: sharedHasLayers ? sharedSettings.entityContextLayers : (localHasLayers ? localSaved.entityContextLayers : sharedSettings.entityContextLayers),
        companyContextSections: sharedSettings.companyContextSections || localSaved?.companyContextSections || null
      };
      AppState.adminSettingsCache = merged;
      localStorage.setItem(GLOBAL_ADMIN_STORAGE_KEY, JSON.stringify(merged));
      if ((!sharedHasStructure && localHasStructure) || (!sharedHasLayers && localHasLayers)) {
        syncSharedAdminSettings(merged, { category: 'settings', eventType: 'shared_settings_rehydrated', target: 'global_settings', details: { reason: 'local_backup_richer_than_shared' } }).catch(error => console.warn('shared settings rehydrate failed:', error.message));
      }
      return merged;
    }
  } catch (error) {
    console.warn('loadSharedAdminSettings fallback:', error.message);
  }
  return null;
}

function syncSharedAdminSettings(settings, audit = null) {
  return requestSharedSettings('PUT', { settings, audit }, { includeAdminSecret: true });
}

function getAuditApiUrl() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin && origin.includes('vercel.app')) return `${origin}/api/audit-log`;
  return 'https://risk-calculator-eight.vercel.app/api/audit-log';
}

async function requestAuditLog(method = 'GET', payload, { includeAdminSecret = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (includeAdminSecret && AuthService.getAdminApiSecret()) headers['x-admin-secret'] = AuthService.getAdminApiSecret();
  if (AuthService.getApiSessionToken()) headers['x-session-token'] = AuthService.getApiSessionToken();
  const res = await fetch(getAuditApiUrl(), { method, headers, body: payload ? JSON.stringify(payload) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(parsed?.detail || parsed?.error || text || `Audit request failed with HTTP ${res.status}`);
  return parsed || {};
}

async function loadAuditLog() {
  AppState.auditLogCache.loading = true;
  try {
    const data = await requestAuditLog('GET', undefined, { includeAdminSecret: true });
    AppState.auditLogCache = {
      loaded: true,
      loading: false,
      entries: Array.isArray(data.entries) ? data.entries : [],
      summary: data.summary || null,
      error: ''
    };
    return AppState.auditLogCache;
  } catch (error) {
    AppState.auditLogCache = {
      loaded: true,
      loading: false,
      entries: [],
      summary: null,
      error: error instanceof Error ? error.message : String(error)
    };
    throw error;
  }
}

async function logAuditEvent(event = {}) {
  try {
    await requestAuditLog('POST', event, { includeAdminSecret: false });
  } catch (error) {
    console.warn('logAuditEvent failed:', error.message);
  }
}

function formatAuditDetails(details = {}) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ');
}

async function performLogout({ renderLoginScreen = false } = {}) {
  const currentUser = AuthService.getCurrentUser();
  if (currentUser?.username) {
    await logAuditEvent({ category: 'auth', eventType: 'logout', target: currentUser.username, status: 'success', source: 'client' });
  }
  AuthService.logout();
  activateAuthenticatedState();
  if (renderLoginScreen) renderLogin();
  else Router.navigate('/login');
}

function getUserStateApiUrl() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (origin && origin.includes('vercel.app')) return `${origin}/api/user-state`;
  return 'https://risk-calculator-eight.vercel.app/api/user-state';
}

async function requestUserState(method = 'GET', username, payload, audit = null) {
  const safeUsername = String(username || '').trim().toLowerCase();
  const url = method === 'GET'
    ? `${getUserStateApiUrl()}?username=${encodeURIComponent(safeUsername)}`
    : getUserStateApiUrl();
  const headers = {
    'Content-Type': 'application/json'
  };
  if (AuthService.getApiSessionToken()) headers['x-session-token'] = AuthService.getApiSessionToken();
  const res = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify({ username: safeUsername, state: payload, audit })
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    throw new Error(parsed?.detail || parsed?.error || text || `User state request failed with HTTP ${res.status}`);
  }
  return parsed || {};
}

async function loadSharedUserState(username = AuthService.getCurrentUser()?.username || '') {
  const safeUsername = String(username || '').trim().toLowerCase();
  if (!safeUsername) return null;
  try {
    const data = await requestUserState('GET', safeUsername);
    const state = data?.state || {};
    AppState.userStateCache = {
      username: safeUsername,
      userSettings: state.userSettings || null,
      assessments: Array.isArray(state.assessments) ? state.assessments : [],
      learningStore: state.learningStore && typeof state.learningStore === 'object' ? state.learningStore : { templates: {} },
      draft: state.draft && typeof state.draft === 'object' ? state.draft : null
    };
    if (state.userSettings) {
      localStorage.setItem(buildUserStorageKey(USER_SETTINGS_STORAGE_PREFIX, safeUsername), JSON.stringify(state.userSettings));
    }
    localStorage.setItem(buildUserStorageKey(ASSESSMENTS_STORAGE_PREFIX, safeUsername), JSON.stringify(AppState.userStateCache.assessments));
    localStorage.setItem(buildUserStorageKey(LEARNING_STORAGE_PREFIX, safeUsername), JSON.stringify(AppState.userStateCache.learningStore));
    sessionStorage.setItem(buildUserStorageKey(DRAFT_STORAGE_PREFIX, safeUsername), JSON.stringify(AppState.userStateCache.draft || {}));
    return AppState.userStateCache;
  } catch (error) {
    console.warn('loadSharedUserState fallback:', error.message);
    return null;
  }
}

function queueSharedUserStateSync(username = AuthService.getCurrentUser()?.username || '') {
  const safeUsername = String(username || '').trim().toLowerCase();
  if (!safeUsername) return;
  const payload = {
    userSettings: AppState.userStateCache.userSettings,
    assessments: Array.isArray(AppState.userStateCache.assessments) ? AppState.userStateCache.assessments : [],
    learningStore: AppState.userStateCache.learningStore && typeof AppState.userStateCache.learningStore === 'object' ? AppState.userStateCache.learningStore : { templates: {} },
    draft: AppState.userStateCache.draft && typeof AppState.userStateCache.draft === 'object' ? AppState.userStateCache.draft : null
  };
  requestUserState('PUT', safeUsername, payload).catch(error => console.warn('queueSharedUserStateSync failed:', error.message));
}

function ensureUserStateCache(username = AuthService.getCurrentUser()?.username || '') {
  const safeUsername = String(username || '').trim().toLowerCase();
  if (!safeUsername) {
    return { username: '', userSettings: null, assessments: [], learningStore: { templates: {} }, draft: null };
  }
  if (AppState.userStateCache.username !== safeUsername) {
    AppState.userStateCache = {
      username: safeUsername,
      userSettings: null,
      assessments: null,
      learningStore: null,
      draft: null
    };
  }
  return AppState.userStateCache;
}

const USER_SETTINGS_KEYS = [
  'geography',
  'companyWebsiteUrl',
  'companyContextProfile',
  'companyContextSections',
  'riskAppetiteStatement',
  'applicableRegulations',
  'aiInstructions',
  'benchmarkStrategy',
  'defaultLinkMode',
  'adminContextSummary',
  'userProfile',
  'onboardedAt'
];

const USER_FOCUS_OPTIONS = [
  'Cyber risk',
  'Technology resilience',
  'Operational continuity',
  'Third-party risk',
  'Regulatory compliance',
  'Audit readiness',
  'Data protection',
  'Executive reporting'
];

const GEOGRAPHY_OPTIONS = [
  'United Arab Emirates',
  'Abu Dhabi',
  'Dubai',
  'GCC',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Middle East',
  'North Africa',
  'Europe',
  'United Kingdom',
  'United States',
  'India',
  'Asia Pacific',
  'Global'
];

function normaliseUserGeographies(settings = {}, globalSettings = getAdminSettings()) {
  const primary = String(settings.geographyPrimary || settings.geography || globalSettings.geography || DEFAULT_ADMIN_SETTINGS.geography).trim() || DEFAULT_ADMIN_SETTINGS.geography;
  return {
    geographyPrimary: primary,
    geographySecondary: String(settings.geographySecondary || '').trim(),
    geographyTertiary: String(settings.geographyTertiary || '').trim(),
    geography: primary
  };
}

function renderGeographySelect(id, selected = '', placeholder = 'Choose geography', optional = false) {
  return `<select class="form-select" id="${id}">
    <option value="">${optional ? placeholder : 'Choose geography'}</option>
    ${GEOGRAPHY_OPTIONS.map(option => `<option value="${option}" ${option === selected ? 'selected' : ''}>${option}</option>`).join('')}
  </select>`;
}

const GEOGRAPHY_REGULATION_MAP = {
  'United Arab Emirates': ['UAE PDPL', 'UAE Cybersecurity Council Guidance'],
  'Abu Dhabi': ['UAE PDPL', 'UAE Cybersecurity Council Guidance'],
  'Dubai': ['UAE PDPL', 'UAE Cybersecurity Council Guidance'],
  'GCC': ['GCC cross-border data transfer obligations'],
  'Saudi Arabia': ['Saudi PDPL'],
  'Qatar': ['Qatar Personal Data Privacy Protection Law'],
  'Kuwait': ['Kuwait data privacy obligations'],
  'Bahrain': ['Bahrain PDPL'],
  'Oman': ['Oman Personal Data Protection Law'],
  'Middle East': ['Regional data localisation and sectoral obligations'],
  'North Africa': ['Jurisdiction-specific privacy and cyber obligations'],
  'Europe': ['GDPR', 'NIS2'],
  'United Kingdom': ['UK GDPR', 'UK NIS Regulations'],
  'United States': ['US state privacy laws', 'SEC cyber disclosure rules'],
  'India': ['DPDP Act 2023'],
  'Asia Pacific': ['APAC privacy and localisation obligations'],
  'Global': ['Cross-border data transfer and sanctions obligations']
};

function normaliseScenarioGeographies(geographies = [], fallback = DEFAULT_ADMIN_SETTINGS.geography) {
  const input = Array.isArray(geographies) ? geographies : [geographies];
  const clean = Array.from(new Set(input.map(value => String(value || '').trim()).filter(Boolean)));
  if (clean.length) return clean;
  return [String(fallback || DEFAULT_ADMIN_SETTINGS.geography).trim() || DEFAULT_ADMIN_SETTINGS.geography];
}

function formatScenarioGeographies(geographies = [], fallback = DEFAULT_ADMIN_SETTINGS.geography) {
  return normaliseScenarioGeographies(geographies, fallback).join(', ');
}

function getScenarioGeographies() {
  return normaliseScenarioGeographies(AppState.draft.geographies || AppState.draft.geography, getEffectiveSettings().geography);
}

function deriveGeographyRegulations(geographies = []) {
  return Array.from(new Set(normaliseScenarioGeographies(geographies).flatMap(geo => GEOGRAPHY_REGULATION_MAP[geo] || [])));
}

function getCurrentUserOrThrow() {
  const user = AuthService.getCurrentUser();
  if (!user?.username) {
    throw new Error('No authenticated user session found.');
  }
  return user;
}

function buildUserStorageKey(prefix, username = getCurrentUserOrThrow().username) {
  return `${prefix}__${username}`;
}

function clearUserPersistentState(username) {
  const safeUsername = String(username || '').trim().toLowerCase();
  if (!safeUsername) return;
  localStorage.removeItem(buildUserStorageKey(USER_SETTINGS_STORAGE_PREFIX, safeUsername));
  localStorage.removeItem(buildUserStorageKey(ASSESSMENTS_STORAGE_PREFIX, safeUsername));
  localStorage.removeItem(buildUserStorageKey(LEARNING_STORAGE_PREFIX, safeUsername));
  sessionStorage.removeItem(buildUserStorageKey(DRAFT_STORAGE_PREFIX, safeUsername));
  sessionStorage.removeItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX, safeUsername));
  if (AppState.userStateCache.username === safeUsername) {
    AppState.userStateCache = { username: safeUsername, userSettings: null, assessments: [], learningStore: { templates: {} }, draft: null };
  }
  requestUserState('PUT', safeUsername, { userSettings: null, assessments: [], learningStore: { templates: {} }, draft: null }, { category: 'user_admin', eventType: 'user_state_reset', target: safeUsername }).catch(error => console.warn('clearUserPersistentState sync failed:', error.message));
}

function getUserSettingsDefaults(globalSettings = getAdminSettings()) {
  return {
    geography: globalSettings.geography,
    geographyPrimary: globalSettings.geography,
    geographySecondary: '',
    geographyTertiary: '',
    companyWebsiteUrl: globalSettings.companyWebsiteUrl,
    companyContextProfile: globalSettings.companyContextProfile,
    companyContextSections: globalSettings.companyContextSections,
    riskAppetiteStatement: globalSettings.riskAppetiteStatement,
    applicableRegulations: [...globalSettings.applicableRegulations],
    aiInstructions: globalSettings.aiInstructions,
    benchmarkStrategy: globalSettings.benchmarkStrategy,
    defaultLinkMode: globalSettings.defaultLinkMode,
    adminContextSummary: globalSettings.adminContextSummary,
    onboardedAt: '',
    userProfile: {
      fullName: '',
      jobTitle: '',
      department: '',
      businessUnit: '',
      departmentEntityId: '',
      businessUnitEntityId: '',
      focusAreas: [],
      preferredOutputs: '',
      workingContext: ''
    }
  };
}

function normaliseUserProfile(profile = {}, currentUser = AuthService.getCurrentUser()) {
  return {
    fullName: String(profile.fullName || currentUser?.displayName || '').trim(),
    jobTitle: String(profile.jobTitle || '').trim(),
    department: String(profile.department || '').trim(),
    businessUnit: String(profile.businessUnit || '').trim(),
    departmentEntityId: String(profile.departmentEntityId || '').trim(),
    businessUnitEntityId: String(profile.businessUnitEntityId || '').trim(),
    focusAreas: Array.isArray(profile.focusAreas) ? profile.focusAreas.map(String).filter(Boolean) : [],
    preferredOutputs: String(profile.preferredOutputs || '').trim(),
    workingContext: String(profile.workingContext || '').trim()
  };
}

function buildUserProfileSummary(profile = {}) {
  const parts = [];
  if (profile.fullName) parts.push(`Name: ${profile.fullName}`);
  if (profile.jobTitle) parts.push(`Role: ${profile.jobTitle}`);
  if (profile.department) parts.push(`Department: ${profile.department}`);
  if (profile.businessUnit) parts.push(`Business unit: ${profile.businessUnit}`);
  if (profile.focusAreas?.length) parts.push(`Focus areas: ${profile.focusAreas.join(', ')}`);
  if (profile.preferredOutputs) parts.push(`Preferred outputs: ${profile.preferredOutputs}`);
  if (profile.workingContext) parts.push(`Working context: ${profile.workingContext}`);
  return parts.join('\n');
}

const LEARNING_PARAM_KEYS = [
  'tefLikely',
  'threatCapLikely',
  'controlStrLikely',
  'irLikely',
  'biLikely',
  'dbLikely',
  'rlLikely',
  'tpLikely',
  'rcLikely'
];

const ORG_ENTITY_TYPES = [
  'Holding company',
  'Wholly owned subsidiary',
  'Majority-owned operating company',
  'Joint venture',
  'Listed portfolio company (majority stake)',
  'Listed portfolio company (minority stake)',
  "Arm's-length business partner",
  'Department / function'
];

const DEPARTMENT_RELATIONSHIP_TYPES = [
  'In-house',
  'Outsourced',
  'Hybrid'
];

const TYPICAL_DEPARTMENTS = [
  'Information Security',
  'Technology',
  'Operations',
  'Finance',
  'Procurement',
  'Legal',
  'Risk & Compliance',
  'Human Resources',
  'Internal Audit',
  'Data & AI',
  'Commercial',
  'Shared Services'
];

function getStoredBUOverrides() {
  const settings = getAdminSettings();
  if (Array.isArray(settings.buOverrides)) return settings.buOverrides;
  try {
    const saved = JSON.parse(localStorage.getItem('rq_bu_override') || 'null');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function getCompanyEntities(structure = getAdminSettings().companyStructure || []) {
  return Array.isArray(structure) ? structure.filter(node => isCompanyEntityType(node.type)) : [];
}

function getDepartmentEntities(structure = getAdminSettings().companyStructure || [], parentId = '') {
  const list = Array.isArray(structure) ? structure.filter(node => isDepartmentEntityType(node.type)) : [];
  return parentId ? list.filter(node => node.parentId === parentId) : list;
}

function getEntityById(structure = getAdminSettings().companyStructure || [], entityId = '') {
  return (Array.isArray(structure) ? structure : []).find(node => node.id === entityId) || null;
}

function getCompanyEntityForDepartment(structure = getAdminSettings().companyStructure || [], departmentId = '') {
  const department = getEntityById(structure, departmentId);
  if (!department?.parentId) return null;
  return getEntityById(structure, department.parentId);
}

function getDefaultOrgAssignmentForUser(username = '', settings = getAdminSettings()) {
  const structure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const ownedDepartment = structure.find(node => isDepartmentEntityType(node.type) && node.ownerUsername === username);
  if (!ownedDepartment) return { businessUnitEntityId: '', departmentEntityId: '' };
  return {
    businessUnitEntityId: ownedDepartment.parentId || '',
    departmentEntityId: ownedDepartment.id
  };
}

function resolveUserOrganisationSelection(user = AuthService.getCurrentUser(), userSettings = getUserSettings(), settings = getAdminSettings()) {
  const profile = normaliseUserProfile(userSettings.userProfile, user);
  const fallback = getDefaultOrgAssignmentForUser(user?.username || '', settings);
  const businessUnitEntityId = String(user?.businessUnitEntityId || profile.businessUnitEntityId || fallback.businessUnitEntityId || '').trim();
  const departmentEntityId = String(user?.departmentEntityId || profile.departmentEntityId || fallback.departmentEntityId || '').trim();
  return { businessUnitEntityId, departmentEntityId };
}

function applyEntityLayerToSettings(baseSettings, layer = null, node = null) {
  if (!layer && !node) return baseSettings;
  return {
    ...baseSettings,
    geography: layer?.geography || baseSettings.geography,
    companyContextProfile: node?.profile || baseSettings.companyContextProfile,
    companyContextSections: node?.contextSections || baseSettings.companyContextSections,
    riskAppetiteStatement: layer?.riskAppetiteStatement || baseSettings.riskAppetiteStatement,
    applicableRegulations: Array.from(new Set([...(baseSettings.applicableRegulations || []), ...(layer?.applicableRegulations || [])])),
    aiInstructions: layer?.aiInstructions || baseSettings.aiInstructions,
    benchmarkStrategy: layer?.benchmarkStrategy || baseSettings.benchmarkStrategy,
    adminContextSummary: layer?.contextSummary || node?.profile || baseSettings.adminContextSummary
  };
}

function getAssessments() {
  const cache = ensureUserStateCache();
  if (Array.isArray(cache.assessments)) return cache.assessments;
  try {
    const saved = JSON.parse(localStorage.getItem(buildUserStorageKey(ASSESSMENTS_STORAGE_PREFIX)) || '[]');
    cache.assessments = Array.isArray(saved) ? saved : [];
  } catch {
    cache.assessments = [];
  }
  return cache.assessments;
}
function saveAssessment(a) {
  const list = getAssessments().slice();
  const idx = list.findIndex(x => x.id === a.id);
  if (idx > -1) list[idx] = a; else list.unshift(a);
  const cache = ensureUserStateCache();
  cache.assessments = list;
  localStorage.setItem(buildUserStorageKey(ASSESSMENTS_STORAGE_PREFIX), JSON.stringify(list));
  queueSharedUserStateSync();
}
function getAssessmentById(id) {
  return getAssessments().find(a => a.id === id) || null;
}

function getLearningStore() {
  const cache = ensureUserStateCache();
  if (cache.learningStore && typeof cache.learningStore === 'object') return cache.learningStore;
  try {
    cache.learningStore = JSON.parse(localStorage.getItem(buildUserStorageKey(LEARNING_STORAGE_PREFIX)) || '{"templates":{}}');
  } catch {
    cache.learningStore = { templates: {} };
  }
  return cache.learningStore;
}

function saveLearningStore(store) {
  const cache = ensureUserStateCache();
  cache.learningStore = store && typeof store === 'object' ? store : { templates: {} };
  localStorage.setItem(buildUserStorageKey(LEARNING_STORAGE_PREFIX), JSON.stringify(cache.learningStore));
  queueSharedUserStateSync();
}

function getTemplateLearningProfile(templateId) {
  if (!templateId) return null;
  return getLearningStore().templates?.[templateId] || null;
}

function recordTemplateLoad(templateId) {
  if (!templateId) return;
  const store = getLearningStore();
  const profile = store.templates[templateId] || { loads: 0, completed: 0, avgParams: {}, lastUsed: null };
  profile.loads += 1;
  profile.lastUsed = Date.now();
  store.templates[templateId] = profile;
  saveLearningStore(store);
}

function recordLearningFromAssessment(draft) {
  if (!draft?.templateId || !draft?.fairParams) return;
  const store = getLearningStore();
  const profile = store.templates[draft.templateId] || { loads: 0, completed: 0, avgParams: {}, lastUsed: null };
  profile.completed += 1;
  profile.lastUsed = Date.now();
  LEARNING_PARAM_KEYS.forEach(key => {
    const value = Number(draft.fairParams[key]);
    if (!Number.isFinite(value)) return;
    const previous = Number(profile.avgParams[key]);
    profile.avgParams[key] = Number.isFinite(previous)
      ? ((previous * (profile.completed - 1)) + value) / profile.completed
      : value;
  });
  store.templates[draft.templateId] = profile;
  saveLearningStore(store);
}

function applyLearnedTemplateDraft(tmpl) {
  const profile = getTemplateLearningProfile(tmpl?.id);
  const draft = JSON.parse(JSON.stringify(tmpl?.draft || {}));
  if (!profile || profile.completed < 2 || !draft.fairParams) {
    return { draft, note: '' };
  }
  const learnedWeight = profile.completed >= 5 ? 0.45 : 0.30;
  LEARNING_PARAM_KEYS.forEach(key => {
    const learnedValue = Number(profile.avgParams?.[key]);
    const currentValue = Number(draft.fairParams[key]);
    if (!Number.isFinite(learnedValue) || !Number.isFinite(currentValue)) return;
    draft.fairParams[key] = Number((currentValue * (1 - learnedWeight)) + (learnedValue * learnedWeight)).toFixed(2);
  });
  return {
    draft,
    note: `This template has been adjusted using ${profile.completed} completed assessment${profile.completed === 1 ? '' : 's'} from this browser to provide better starting values.`
  };
}

function saveDraft() {
  try { sessionStorage.setItem(buildUserStorageKey(DRAFT_STORAGE_PREFIX), JSON.stringify(AppState.draft)); } catch {}
  const cache = ensureUserStateCache();
  cache.draft = { ...AppState.draft };
  queueSharedUserStateSync();
}
function loadDraft() {
  const cache = ensureUserStateCache();
  if (cache.draft && typeof cache.draft === 'object') {
    Object.assign(AppState.draft, cache.draft);
    return;
  }
  try {
    const d = JSON.parse(sessionStorage.getItem(buildUserStorageKey(DRAFT_STORAGE_PREFIX)) || 'null');
    if (d) Object.assign(AppState.draft, d);
  } catch {}
}
function resetDraft() {
  AppState.draft = {
    id: 'a_' + Date.now(),
    templateId: null,
    buId: null, buName: null, contextNotes: '',
    narrative: '', structuredScenario: null,
    scenarioTitle: '', llmAssisted: false,
    citations: [], recommendations: [],
    fairParams: {}, results: null,
    geography: DEFAULT_ADMIN_SETTINGS.geography,
    geographies: [DEFAULT_ADMIN_SETTINGS.geography],
    riskCandidates: [],
    selectedRiskIds: [],
    selectedRisks: [],
    sourceNarrative: '',
    enhancedNarrative: '',
    uploadedRegisterName: '',
    registerFindings: '',
    registerMeta: null,
    linkedRisks: DEFAULT_ADMIN_SETTINGS.defaultLinkMode,
    applicableRegulations: [...DEFAULT_ADMIN_SETTINGS.applicableRegulations],
    intakeSummary: '',
    linkAnalysis: '',
    workflowGuidance: [],
    benchmarkBasis: '',
    inputRationale: null,
    learningNote: '',
    guidedInput: {
      event: '',
      asset: '',
      cause: '',
      impact: '',
      urgency: 'medium'
    }
  };
  saveDraft();
}

function activateAuthenticatedState() {
  AppState.currentUser = AuthService.getCurrentUser();
  if (!AppState.currentUser) {
    AppState.draft = {};
    LLMService.clearCompassConfig();
    renderAppBar();
    return;
  }

  AppState.draft = {};
  loadDraft();
  if (!AppState.draft.id) resetDraft();
  ensureDraftShape();
  if (!AppState.draft.applicableRegulations?.length) {
    AppState.draft.applicableRegulations = [...getEffectiveSettings().applicableRegulations];
  }

  const sessionLLM = getSessionLLMConfig();
  if (sessionLLM.apiUrl || sessionLLM.apiKey || sessionLLM.model) {
    LLMService.setCompassConfig(sessionLLM);
  } else {
    LLMService.clearCompassConfig();
  }

  renderAppBar();
}

function ensureDraftShape() {
  AppState.draft = {
    id: AppState.draft.id || 'a_' + Date.now(),
    templateId: AppState.draft.templateId || null,
    buId: AppState.draft.buId || null,
    buName: AppState.draft.buName || null,
    contextNotes: AppState.draft.contextNotes || '',
    narrative: AppState.draft.narrative || '',
    structuredScenario: AppState.draft.structuredScenario || null,
    scenarioTitle: AppState.draft.scenarioTitle || '',
    llmAssisted: !!AppState.draft.llmAssisted,
    citations: Array.isArray(AppState.draft.citations) ? AppState.draft.citations : [],
    recommendations: Array.isArray(AppState.draft.recommendations) ? AppState.draft.recommendations : [],
    fairParams: AppState.draft.fairParams || {},
    results: AppState.draft.results || null,
    geography: formatScenarioGeographies(AppState.draft.geographies || AppState.draft.geography, DEFAULT_ADMIN_SETTINGS.geography),
    geographies: normaliseScenarioGeographies(AppState.draft.geographies || AppState.draft.geography, DEFAULT_ADMIN_SETTINGS.geography),
    riskCandidates: Array.isArray(AppState.draft.riskCandidates) ? AppState.draft.riskCandidates : (Array.isArray(AppState.draft.selectedRisks) ? AppState.draft.selectedRisks : []),
    selectedRiskIds: Array.isArray(AppState.draft.selectedRiskIds) ? AppState.draft.selectedRiskIds : (Array.isArray(AppState.draft.selectedRisks) ? AppState.draft.selectedRisks.map(risk => risk?.id).filter(Boolean) : []),
    selectedRisks: Array.isArray(AppState.draft.selectedRisks) ? AppState.draft.selectedRisks : [],
    sourceNarrative: AppState.draft.sourceNarrative || AppState.draft.narrative || '',
    enhancedNarrative: AppState.draft.enhancedNarrative || '',
    uploadedRegisterName: AppState.draft.uploadedRegisterName || '',
    registerFindings: AppState.draft.registerFindings || '',
    registerMeta: AppState.draft.registerMeta || null,
    linkedRisks: AppState.draft.linkedRisks != null ? !!AppState.draft.linkedRisks : DEFAULT_ADMIN_SETTINGS.defaultLinkMode,
    applicableRegulations: Array.isArray(AppState.draft.applicableRegulations) ? AppState.draft.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations],
    intakeSummary: AppState.draft.intakeSummary || '',
    linkAnalysis: AppState.draft.linkAnalysis || '',
    workflowGuidance: Array.isArray(AppState.draft.workflowGuidance) ? AppState.draft.workflowGuidance : [],
    benchmarkBasis: AppState.draft.benchmarkBasis || '',
    inputRationale: AppState.draft.inputRationale || null,
    learningNote: AppState.draft.learningNote || '',
    guidedInput: {
      event: AppState.draft.guidedInput?.event || '',
      asset: AppState.draft.guidedInput?.asset || '',
      cause: AppState.draft.guidedInput?.cause || '',
      impact: AppState.draft.guidedInput?.impact || '',
      urgency: AppState.draft.guidedInput?.urgency || 'medium'
    }
  };
}

function getBUList() {
  const settings = getAdminSettings();
  const companyStructure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const companyEntities = getCompanyEntities(companyStructure);
  const overrides = getStoredBUOverrides();

  if (!companyEntities.length) {
    return overrides.length ? overrides : AppState.buList;
  }

  const syncedCompanies = companyEntities.map(entity => {
    const generated = buildBUFromOrgEntity(entity, settings);
    const override = overrides.find(bu => bu.orgEntityId === entity.id) || overrides.find(bu => bu.id === generated.id);
    return {
      ...generated,
      ...(override || {}),
      id: override?.id || generated.id,
      name: entity.name || override?.name || generated.name,
      orgEntityId: entity.id
    };
  });

  const legacyEntries = overrides.filter(bu => !bu.orgEntityId || !companyEntities.some(entity => entity.id === bu.orgEntityId));
  return [...syncedCompanies, ...legacyEntries];
}
function saveBUList(list) {
  const next = Array.isArray(list) ? list : [];
  localStorage.setItem('rq_bu_override', JSON.stringify(next));
  const adminSettings = getAdminSettings();
  saveAdminSettings({ ...adminSettings, buOverrides: next, docOverrides: getDocList() });
  AppState.buList = getBUList();
  RAGService.init(getDocList(), AppState.buList);
}
function getDocList() {
  const settings = getAdminSettings();
  if (Array.isArray(settings.docOverrides) && settings.docOverrides.length) return settings.docOverrides;
  try {
    const ov = JSON.parse(localStorage.getItem('rq_doc_override') || 'null');
    return ov || AppState.docList;
  } catch { return AppState.docList; }
}
function saveDocList(list) {
  localStorage.setItem('rq_doc_override', JSON.stringify(list));
  const adminSettings = getAdminSettings();
  saveAdminSettings({ ...adminSettings, docOverrides: list, buOverrides: getStoredBUOverrides() });
  AppState.docList = list;
  RAGService.init(list, getBUList());
}

function getAdminSettings() {
  if (AppState.adminSettingsCache) {
    return {
      ...DEFAULT_ADMIN_SETTINGS,
      ...AppState.adminSettingsCache,
      applicableRegulations: Array.isArray(AppState.adminSettingsCache.applicableRegulations) ? AppState.adminSettingsCache.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations]
    };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(GLOBAL_ADMIN_STORAGE_KEY) || 'null') || {};
    const merged = {
      ...DEFAULT_ADMIN_SETTINGS,
      ...saved,
      applicableRegulations: Array.isArray(saved.applicableRegulations) ? saved.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations]
    };
    AppState.adminSettingsCache = merged;
    return merged;
  } catch {
    return { ...DEFAULT_ADMIN_SETTINGS, applicableRegulations: [...DEFAULT_ADMIN_SETTINGS.applicableRegulations] };
  }
}

function applyManagedAccountAssignmentToSettings(account, updates = {}, baseSettings = getAdminSettings()) {
  const nextRole = updates.role || account.role || 'user';
  const nextBusinessUnitEntityId = updates.businessUnitEntityId !== undefined ? updates.businessUnitEntityId : (account.businessUnitEntityId || '');
  const nextStructure = (Array.isArray(baseSettings.companyStructure) ? baseSettings.companyStructure : []).map(node => {
    if (!isCompanyEntityType(node.type)) return node;
    if (node.ownerUsername !== account.username && !(nextRole === 'bu_admin' && node.id === nextBusinessUnitEntityId)) return node;
    if (nextRole === 'bu_admin' && node.id === nextBusinessUnitEntityId) {
      return { ...node, ownerUsername: account.username };
    }
    if (node.ownerUsername === account.username) {
      return { ...node, ownerUsername: '' };
    }
    return node;
  });
  return {
    ...baseSettings,
    companyStructure: nextStructure
  };
}

function saveAdminSettings(settings, options = {}) {
  const merged = {
    ...DEFAULT_ADMIN_SETTINGS,
    ...settings,
    applicableRegulations: Array.isArray(settings.applicableRegulations) ? settings.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations],
    companyContextSections: settings.companyContextSections && typeof settings.companyContextSections === 'object' ? settings.companyContextSections : null,
    companyStructure: Array.isArray(settings.companyStructure) ? settings.companyStructure : [],
    entityContextLayers: Array.isArray(settings.entityContextLayers) ? settings.entityContextLayers : []
  };
  AppState.adminSettingsCache = merged;
  localStorage.setItem(GLOBAL_ADMIN_STORAGE_KEY, JSON.stringify(merged));
  if (AuthService.getAdminApiSecret() || AuthService.getApiSessionToken()) {
    syncSharedAdminSettings(merged, options.audit || null).catch(error => console.warn('syncSharedAdminSettings failed:', error.message));
  }
}

function getUserSettings() {
  const globalSettings = getAdminSettings();
  const defaults = getUserSettingsDefaults(globalSettings);
  const cache = ensureUserStateCache();
  if (cache.userSettings) {
    return {
      ...defaults,
      ...cache.userSettings,
      applicableRegulations: Array.isArray(cache.userSettings.applicableRegulations) ? cache.userSettings.applicableRegulations : [...defaults.applicableRegulations],
      userProfile: normaliseUserProfile(cache.userSettings.userProfile || defaults.userProfile),
      companyContextSections: cache.userSettings.companyContextSections && typeof cache.userSettings.companyContextSections === 'object'
        ? cache.userSettings.companyContextSections
        : defaults.companyContextSections
    };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(buildUserStorageKey(USER_SETTINGS_STORAGE_PREFIX)) || 'null') || {};
    cache.userSettings = saved;
    return {
      ...defaults,
      ...saved,
      ...normaliseUserGeographies(saved, globalSettings),
      applicableRegulations: Array.isArray(saved.applicableRegulations) ? saved.applicableRegulations : [...defaults.applicableRegulations],
      userProfile: normaliseUserProfile(saved.userProfile || defaults.userProfile),
      companyContextSections: saved.companyContextSections && typeof saved.companyContextSections === 'object'
        ? saved.companyContextSections
        : defaults.companyContextSections
    };
  } catch {
    return {
      ...defaults,
      applicableRegulations: [...defaults.applicableRegulations],
      userProfile: normaliseUserProfile(defaults.userProfile)
    };
  }
}

function saveUserSettings(settings) {
  const globalSettings = getAdminSettings();
  const defaults = getUserSettingsDefaults(globalSettings);
  const merged = {
    ...defaults,
    ...settings,
    ...normaliseUserGeographies(settings, globalSettings),
    applicableRegulations: Array.isArray(settings.applicableRegulations) ? settings.applicableRegulations : [...defaults.applicableRegulations],
    userProfile: normaliseUserProfile(settings.userProfile || defaults.userProfile),
    companyContextSections: settings.companyContextSections && typeof settings.companyContextSections === 'object'
      ? settings.companyContextSections
      : defaults.companyContextSections
  };
  const cache = ensureUserStateCache();
  cache.userSettings = merged;
  localStorage.setItem(buildUserStorageKey(USER_SETTINGS_STORAGE_PREFIX), JSON.stringify(merged));
  queueSharedUserStateSync();
}

function getEffectiveSettings() {
  const globalSettings = getAdminSettings();
  const user = AuthService.getCurrentUser();
  if (!user || user.role === 'admin') {
    return globalSettings;
  }
  const userSettings = getUserSettings();
  const selection = resolveUserOrganisationSelection(user, userSettings, globalSettings);
  const companyNode = getEntityById(globalSettings.companyStructure || [], selection.businessUnitEntityId);
  const departmentNode = getEntityById(globalSettings.companyStructure || [], selection.departmentEntityId);
  const companyLayer = getEntityLayerById(globalSettings, selection.businessUnitEntityId);
  const departmentLayer = getEntityLayerById(globalSettings, selection.departmentEntityId);
  const organisationScopedDefaults = applyEntityLayerToSettings(
    applyEntityLayerToSettings(globalSettings, companyLayer, companyNode),
    departmentLayer,
    departmentNode
  );
  return {
    ...organisationScopedDefaults,
    ...userSettings,
    applicableRegulations: Array.isArray(userSettings.applicableRegulations) ? userSettings.applicableRegulations : [...organisationScopedDefaults.applicableRegulations],
    userProfile: normaliseUserProfile(userSettings.userProfile),
    userProfileSummary: buildUserProfileSummary(normaliseUserProfile(userSettings.userProfile)),
    companyContextSections: userSettings.companyContextSections && typeof userSettings.companyContextSections === 'object'
      ? userSettings.companyContextSections
      : organisationScopedDefaults.companyContextSections,
    selectedBusinessEntity: companyNode,
    selectedDepartmentEntity: departmentNode
  };
}

function getToleranceThreshold() {
  const value = Number(getAdminSettings().toleranceThresholdUsd);
  return Number.isFinite(value) && value > 0 ? value : TOLERANCE_THRESHOLD;
}

function getWarningThreshold() {
  const value = Number(getAdminSettings().warningThresholdUsd);
  return Number.isFinite(value) && value > 0 ? value : 3_000_000;
}

function getAnnualReviewThreshold() {
  const value = Number(getAdminSettings().annualReviewThresholdUsd);
  return Number.isFinite(value) && value > 0 ? value : 12_000_000;
}

function inferCompanyNameFromUrl(url) {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
    const root = hostname.split('.')[0] || hostname;
    return root
      .split(/[-_]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch {
    return '';
  }
}

function renderCompanyStructureSummary(structure = []) {
  if (!structure.length) {
    return `<div class="form-help">No organisation structure saved yet. Add a top-level entity such as a holding company or operating company, then attach subsidiaries, portfolio companies, partners, and departments beneath it.</div>`;
  }
  const managedAccounts = AuthService.getManagedAccounts();
  const accountLabelByUsername = new Map(managedAccounts.map(account => [account.username, account.displayName]));
  const byParent = new Map();
  const settings = getAdminSettings();
  structure.forEach(node => {
    const key = node.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  });

  function sortNodes(nodes = []) {
    return [...nodes].sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  }

  function renderDepartmentList(parentNode) {
    const departments = sortNodes((byParent.get(parentNode.id) || []).filter(node => isDepartmentEntityType(node.type)));
    if (!departments.length) return '';
    return `
      <div class="org-accordion__section">
        <div class="org-accordion__label">Functions</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${departments.map(node => {
            const contextSummary = getEntityLayerById(settings, node.id)?.contextSummary || node.profile || '';
            const ownerLabel = node.ownerUsername ? (accountLabelByUsername.get(node.ownerUsername) || node.ownerUsername) : 'No owner';
            return `
              <div class="org-related-card org-related-card--compact org-theme--department">
                <div class="org-related-card__head">
                  <div>
                    <div class="org-related-card__title">${node.name}</div>
                    <div class="form-help">${node.departmentRelationshipType || 'In-house'} · ${ownerLabel} · ${contextSummary ? 'Context saved' : 'No context'}</div>
                  </div>
                  <div class="flex items-center gap-3" style="flex-wrap:wrap">
                    <button class="btn btn--ghost btn--sm org-entity-context" data-org-id="${node.id}" type="button">Context</button>
                    <button class="btn btn--ghost btn--sm org-entity-edit" data-org-id="${node.id}" type="button">Edit</button>
                    <button class="btn btn--ghost btn--sm org-entity-delete" data-org-id="${node.id}" type="button">Remove</button>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderNodes(parentId, depth = 0) {
    const childCompanies = sortNodes((byParent.get(parentId || 'root') || []).filter(node => isCompanyEntityType(node.type)));
    return childCompanies.map(node => {
      const childMarkup = renderNodes(node.id, depth + 1);
      const contextSummary = truncateText(getEntityLayerById(settings, node.id)?.contextSummary || node.profile || 'No retained context yet.', 100);
      return `
        <details class="org-accordion ${getOrgEntityThemeClass(node.type)}" ${depth < 1 ? 'open' : ''} style="margin-left:${depth * 16}px">
          <summary class="org-accordion__summary">
            <div class="org-accordion__identity">
              <span class="badge badge--gold">${node.type}</span>
              <strong>${node.name}</strong>
            </div>
            <div class="org-accordion__meta">
              <span class="form-help">${getEntityLayerById(settings, node.id)?.contextSummary ? 'Context saved' : 'No context'}</span>
              <button class="btn btn--secondary btn--sm org-entity-add-department org-summary-action" data-org-id="${node.id}" type="button">Add Function</button>
              <button class="btn btn--ghost btn--sm org-entity-context org-summary-action" data-org-id="${node.id}" type="button">Context</button>
              <button class="btn btn--ghost btn--sm org-entity-edit org-summary-action" data-org-id="${node.id}" type="button">Edit</button>
            </div>
          </summary>
          <div class="org-accordion__body">
            <div class="org-accordion__toolbar">
              <div class="form-help">${getEntityLineageLabel(structure, node.id) || node.name}</div>
            </div>
            <div class="org-accordion__snapshot">${contextSummary}</div>
            ${renderDepartmentList(node)}
            ${childMarkup ? `
              <div class="org-accordion__section">
                <div class="org-accordion__label">Child Entities</div>
                <div style="display:flex;flex-direction:column;gap:12px">${childMarkup}</div>
              </div>` : ''}
          </div>
        </details>`;
    }).join('');
  }
  return `<div class="org-accordion-list">${renderNodes('root')}</div>`;
}

function getEntityLineage(structure = [], entityId = '') {
  if (!entityId) return [];
  const byId = new Map(structure.map(node => [node.id, node]));
  const chain = [];
  let cursor = byId.get(entityId);
  const visited = new Set();
  while (cursor && !visited.has(cursor.id)) {
    chain.unshift(cursor);
    visited.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return chain;
}

function getEntityLineageLabel(structure = [], entityId = '') {
  const chain = getEntityLineage(structure, entityId);
  return chain.length ? chain.map(node => node.name).join(' > ') : '';
}

function getChildCompanyEntities(structure = [], parentId = '') {
  return (Array.isArray(structure) ? structure : []).filter(node =>
    isCompanyEntityType(node.type) && String(node.parentId || '') === String(parentId || '')
  );
}

function getOrgEntityThemeClass(type = '') {
  const value = String(type || '').toLowerCase();
  if (value === 'holding company') return 'org-theme--holding';
  if (value.includes('subsidiary')) return 'org-theme--subsidiary';
  if (value.includes('operating company')) return 'org-theme--operating';
  if (value.includes('joint venture')) return 'org-theme--jointventure';
  if (value.includes('portfolio company')) return 'org-theme--portfolio';
  if (value.includes('partner')) return 'org-theme--partner';
  if (value === 'department / function') return 'org-theme--department';
  return 'org-theme--default';
}

function getEntityLayerById(settings = getAdminSettings(), entityId = '') {
  const layers = Array.isArray(settings.entityContextLayers) ? settings.entityContextLayers : [];
  return layers.find(layer => layer.entityId === entityId) || null;
}

function buildBUFromOrgEntity(entity, settings = getAdminSettings()) {
  const layer = getEntityLayerById(settings, entity?.id);
  const contextSections = entity?.contextSections || {};
  return {
    id: slugify(entity?.name || `bu-${Date.now()}`),
    name: entity?.name || '',
    orgEntityId: entity?.id || '',
    geography: layer?.geography || '',
    criticalServices: [],
    keySystems: [],
    dataTypes: [],
    regulatoryTags: [...new Set([
      ...(layer?.applicableRegulations || [])
    ])],
    contextSummary: layer?.contextSummary || contextSections.companySummary || entity?.profile || '',
    aiGuidance: layer?.aiInstructions || '',
    notes: entity?.type ? `Mapped from organisation entity: ${entity.type}.` : '',
    defaultAssumptions: {
      tef: { min: 1, likely: 4, max: 10 },
      controlStrength: { min: 0.4, likely: 0.6, max: 0.85 },
      threatCapability: { min: 0.3, likely: 0.55, max: 0.9 },
      secondaryProbability: { min: 0.05, likely: 0.15, max: 0.3 }
    },
    docIds: []
  };
}

function isDepartmentEntityType(type = '') {
  return String(type).toLowerCase() === 'department / function';
}

function isCompanyEntityType(type = '') {
  return !!type && !isDepartmentEntityType(type);
}

function requiresParentEntity(type = '') {
  return [
    'Wholly owned subsidiary',
    'Majority-owned operating company',
    'Joint venture',
    'Listed portfolio company (majority stake)',
    'Listed portfolio company (minority stake)',
    "Arm's-length business partner",
    'Department / function'
  ].includes(type);
}

function buildCompanyStructureContext(structure = []) {
  if (!structure.length) return '';
  const idToNode = new Map(structure.map(node => [node.id, node]));
  return structure.map(node => {
    const parent = node.parentId ? idToNode.get(node.parentId) : null;
    const parts = [
      `${node.name} (${node.type})`,
      parent ? `sits under ${parent.name}` : 'top-level entity'
    ];
    if (node.websiteUrl) parts.push(`website: ${node.websiteUrl}`);
    if (node.departmentHint) parts.push(`department family: ${node.departmentHint}`);
    if (node.departmentRelationshipType) parts.push(`delivery model: ${node.departmentRelationshipType}`);
    if (node.profile) parts.push(`context: ${truncateText(node.profile, 220)}`);
    return `- ${parts.join(' | ')}`;
  }).join('\n');
}

function buildEntityLayerContext(layers = [], structure = []) {
  if (!layers.length) return '';
  const idToNode = new Map(structure.map(node => [node.id, node]));
  return layers.map(layer => {
    const node = idToNode.get(layer.entityId);
    const parts = [
      `${node?.name || layer.entityName || 'Unknown entity'} layer`
    ];
    if (layer.geography) parts.push(`geography: ${layer.geography}`);
    if (layer.riskAppetiteStatement) parts.push(`appetite: ${truncateText(layer.riskAppetiteStatement, 160)}`);
    if (layer.applicableRegulations?.length) parts.push(`regulations: ${layer.applicableRegulations.join(', ')}`);
    if (layer.aiInstructions) parts.push(`AI guidance: ${truncateText(layer.aiInstructions, 180)}`);
    if (layer.benchmarkStrategy) parts.push(`benchmark strategy: ${truncateText(layer.benchmarkStrategy, 180)}`);
    if (layer.contextSummary) parts.push(`context summary: ${truncateText(layer.contextSummary, 180)}`);
    return `- ${parts.join(' | ')}`;
  }).join('\n');
}

function buildOrganisationContextSummary(settings = getAdminSettings()) {
  const structureText = buildCompanyStructureContext(settings.companyStructure || []);
  const layerText = buildEntityLayerContext(settings.entityContextLayers || [], settings.companyStructure || []);
  return [structureText, layerText ? `Entity context layers:\n${layerText}` : ''].filter(Boolean).join('\n');
}

function buildCompanyContextSections(result = {}) {
  return {
    companySummary: String(result.companySummary || '').trim(),
    businessModel: String(result.businessProfile || '').trim(),
    operatingModel: String(result.operatingModel || '').trim(),
    publicCommitments: Array.isArray(result.publicCommitments) ? result.publicCommitments.map(String).join('\n') : String(result.publicCommitments || '').trim(),
    keyRiskSignals: Array.isArray(result.riskSignals) ? result.riskSignals.map(String).join('\n') : String(result.riskSignals || '').trim(),
    obligations: Array.isArray(result.likelyObligations) ? result.likelyObligations.map(String).join('\n') : String(result.likelyObligations || '').trim(),
    sources: Array.isArray(result.sources) ? result.sources.map(source => source.note || source.url).filter(Boolean).join('\n') : String(result.sources || '').trim()
  };
}

function serialiseCompanyContextSections(sections = {}) {
  return [
    sections.companySummary ? `Company summary:\n${sections.companySummary}` : '',
    sections.businessModel ? `Business model:\n${sections.businessModel}` : '',
    sections.operatingModel ? `Operating model:\n${sections.operatingModel}` : '',
    sections.publicCommitments ? `Public commitments:\n- ${sections.publicCommitments.split(/\r?\n/).filter(Boolean).join('\n- ')}` : '',
    sections.keyRiskSignals ? `Key public risk signals:\n- ${sections.keyRiskSignals.split(/\r?\n/).filter(Boolean).join('\n- ')}` : '',
    sections.obligations ? `Likely obligations and exposures:\n- ${sections.obligations.split(/\r?\n/).filter(Boolean).join('\n- ')}` : '',
    sections.sources ? `Sources reviewed:\n- ${sections.sources.split(/\r?\n/).filter(Boolean).join('\n- ')}` : ''
  ].filter(Boolean).join('\n\n');
}

function formatCompanyContextProfile(result) {
  return serialiseCompanyContextSections(buildCompanyContextSections(result));
}

function getRelationshipOptions(structure = [], type = '', excludeId = '') {
  const nodes = structure.filter(node => node.id !== excludeId);
  if (isDepartmentEntityType(type)) {
    return nodes.filter(node => isCompanyEntityType(node.type));
  }
  return nodes.filter(node => isCompanyEntityType(node.type));
}

function buildOrgParentOptions(structure = [], type = '', excludeId = '') {
  const options = getRelationshipOptions(structure, type, excludeId)
    .map(node => ({ id: node.id, name: `${node.name} (${node.type})` }));
  if (!requiresParentEntity(type)) {
    options.unshift({ id: '', name: 'No parent / top level' });
  }
  return options;
}

function openOrgEntityEditor({ structure = [], existingNode = null, seed = {}, onSave }) {
  const node = existingNode || {};
  const isSeedDepartment = isDepartmentEntityType(node.type || seed.type || '');
  const defaultType = isSeedDepartment ? 'Department / function' : (node.type || seed.type || 'Holding company');
  const defaultDepartmentRelationshipType = node.departmentRelationshipType || seed.departmentRelationshipType || 'In-house';
  const defaultName = node.name || seed.name || '';
  const defaultWebsite = node.websiteUrl || seed.websiteUrl || '';
  const defaultProfile = node.profile || seed.profile || '';
  const defaultSections = node.contextSections || seed.contextSections || null;
  const defaultDepartmentHint = node.departmentHint || seed.departmentHint || '';
  const defaultOwner = node.ownerUsername || seed.ownerUsername || '';
  const managedAccounts = AuthService.getManagedAccounts();
  const body = `
    <div class="context-panel-copy" style="margin-bottom:12px">Capture how this entity fits into the wider group so later assessments inherit the right business, ownership, and department context.</div>
    <div class="grid-2" style="gap:12px">
      <div class="form-group">
        <label class="form-label" for="org-entity-type">Relationship Type</label>
        <select class="form-select" id="org-entity-type">
          ${isSeedDepartment
            ? DEPARTMENT_RELATIONSHIP_TYPES.map(type => `<option value="${type}" ${type === defaultDepartmentRelationshipType ? 'selected' : ''}>${type}</option>`).join('')
            : ORG_ENTITY_TYPES.filter(type => !isDepartmentEntityType(type)).map(type => `<option value="${type}" ${type === defaultType ? 'selected' : ''}>${type}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="org-entity-name">Entity or Department Name</label>
        <input class="form-input" id="org-entity-name" value="${defaultName}" placeholder="e.g. Group Holding, Abu Dhabi Operations, Information Security">
      </div>
      <div class="form-group" id="org-parent-wrap">
        <label class="form-label" for="org-parent-id">Parent Business</label>
        <select class="form-select" id="org-parent-id"></select>
        <span class="form-help" id="org-parent-help"></span>
      </div>
      <div class="form-group" id="org-website-wrap">
        <label class="form-label" for="org-website-url">Website</label>
        <input class="form-input" id="org-website-url" value="${defaultWebsite}" placeholder="https://example.com">
      </div>
      <div class="form-group" id="org-department-wrap" style="display:none">
        <label class="form-label" for="org-department-template">Typical Department</label>
        <select class="form-select" id="org-department-template">
          <option value="">Choose a typical department or keep a custom name</option>
          ${TYPICAL_DEPARTMENTS.map(name => `<option value="${name}" ${name === defaultDepartmentHint ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
        <span class="form-help">This helps standardise department naming, but you can still use your own wording.</span>
      </div>
      <div class="form-group" id="org-owner-wrap">
        <label class="form-label" for="org-owner-username" id="org-owner-label">Business Unit Admin</label>
        <select class="form-select" id="org-owner-username">
          <option value="">Choose a user account</option>
          ${managedAccounts.map(account => `<option value="${account.username}" ${account.username === defaultOwner ? 'selected' : ''}>${account.displayName} (${account.username})</option>`).join('')}
        </select>
        <span class="form-help" id="org-owner-help">The assigned user can manage the departments and retained context for this business unit from their Settings page.</span>
      </div>
    </div>
    <div class="form-group mt-4">
      <label class="form-label" for="org-profile">Context Summary</label>
      <textarea class="form-textarea" id="org-profile" rows="7" placeholder="Business profile, strategic role, technology dependence, ownership context, or department remit.">${defaultProfile}</textarea>
      <span class="form-help" id="org-profile-help">For company entities, this can be built from the public website and then refined by the admin user.</span>
    </div>
    <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-elevated)" id="org-context-sections-wrap">
      <div class="context-panel-title">Editable Company Brief Sections</div>
      <p class="form-help">These named sections can be edited any time and will be retained for this entity.</p>
      <div class="form-group mt-3">
        <label class="form-label" for="org-section-summary">Company Summary</label>
        <textarea class="form-textarea" id="org-section-summary" rows="3">${defaultSections?.companySummary || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="org-section-business-model">Business Model</label>
        <textarea class="form-textarea" id="org-section-business-model" rows="3">${defaultSections?.businessModel || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="org-section-operating-model">Operating Model</label>
        <textarea class="form-textarea" id="org-section-operating-model" rows="3">${defaultSections?.operatingModel || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="org-section-commitments">Public Commitments</label>
        <textarea class="form-textarea" id="org-section-commitments" rows="4" placeholder="One commitment per line">${defaultSections?.publicCommitments || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="org-section-risks">Key Risk Signals</label>
        <textarea class="form-textarea" id="org-section-risks" rows="4" placeholder="One risk signal per line">${defaultSections?.keyRiskSignals || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="org-section-obligations">Obligations and Exposures</label>
        <textarea class="form-textarea" id="org-section-obligations" rows="4" placeholder="One obligation or exposure per line">${defaultSections?.obligations || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="org-section-sources">Sources Reviewed</label>
        <textarea class="form-textarea" id="org-section-sources" rows="4" placeholder="One source note per line">${defaultSections?.sources || ''}</textarea>
      </div>
    </div>
    <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap" id="org-context-actions">
      <button class="btn btn--secondary" id="btn-org-build-context" type="button">Build Context from Website</button>
      <span class="form-help" id="org-context-actions-help">Use AI to gather website and public-source context before saving.</span>
    </div>`;
  const modal = UI.modal({
    title: isSeedDepartment
      ? (existingNode ? 'Edit Function / Department' : 'Add Function / Department')
      : (existingNode ? 'Edit Organisation Entity' : 'Add Organisation Entity'),
    body,
    footer: `<button class="btn btn--ghost" id="org-cancel">Cancel</button><button class="btn btn--primary" id="org-save">${isSeedDepartment ? 'Save Function' : 'Save Entity'}</button>`
  });

  const departmentEditorMode = isSeedDepartment;
  const typeEl = document.getElementById('org-entity-type');
  const nameEl = document.getElementById('org-entity-name');
  const parentEl = document.getElementById('org-parent-id');
  const parentHelpEl = document.getElementById('org-parent-help');
  const websiteWrapEl = document.getElementById('org-website-wrap');
  const websiteEl = document.getElementById('org-website-url');
  const profileEl = document.getElementById('org-profile');
  const profileHelpEl = document.getElementById('org-profile-help');
  const departmentWrapEl = document.getElementById('org-department-wrap');
  const departmentTemplateEl = document.getElementById('org-department-template');
  const ownerWrapEl = document.getElementById('org-owner-wrap');
  const ownerEl = document.getElementById('org-owner-username');
  const ownerLabelEl = document.getElementById('org-owner-label');
  const ownerHelpEl = document.getElementById('org-owner-help');
  const contextActionsEl = document.getElementById('org-context-actions');
  const contextActionsHelpEl = document.getElementById('org-context-actions-help');
  const contextSectionsWrapEl = document.getElementById('org-context-sections-wrap');

  function getSelectedNodeType() {
    return departmentEditorMode ? 'Department / function' : typeEl.value;
  }

  function refreshEntityEditorState() {
    const selectedNodeType = getSelectedNodeType();
    const parentOptions = buildOrgParentOptions(structure, selectedNodeType, node.id);
    const currentParentId = node.parentId || seed.parentId || '';
    parentEl.innerHTML = parentOptions.map(option => `<option value="${option.id}" ${option.id === currentParentId ? 'selected' : ''}>${option.name}</option>`).join('');
    parentEl.disabled = !parentOptions.length;
    parentHelpEl.textContent = departmentEditorMode
      ? 'Departments and functions must be attached to a business entity.'
      : requiresParentEntity(selectedNodeType)
        ? 'This relationship should sit under an existing business or holding entity.'
        : 'Use a parent when this entity sits within a wider group. Leave top level for the main holding business.';
    departmentWrapEl.style.display = departmentEditorMode ? '' : 'none';
    ownerWrapEl.style.display = isCompanyEntityType(selectedNodeType) || departmentEditorMode ? '' : 'none';
    websiteWrapEl.style.display = departmentEditorMode ? 'none' : '';
    contextActionsEl.style.display = '';
    contextSectionsWrapEl.style.display = departmentEditorMode ? 'none' : '';
    const buildContextBtn = document.getElementById('btn-org-build-context');
    if (buildContextBtn) buildContextBtn.textContent = departmentEditorMode ? 'AI Assist Context' : 'Build Context from Website';
    if (contextActionsHelpEl) {
      contextActionsHelpEl.textContent = departmentEditorMode
        ? 'Use AI to derive a starter function context from the parent business unit and its retained context.'
        : 'Use AI to gather website and public-source context before saving.';
    }
    ownerLabelEl.textContent = departmentEditorMode ? 'Department Owner' : 'Business Unit Admin';
    ownerHelpEl.textContent = departmentEditorMode
      ? 'The assigned owner can maintain department context from their Settings page.'
      : 'The assigned user can manage the departments and retained context for this business unit from their Settings page.';
    profileHelpEl.textContent = departmentEditorMode
      ? 'Describe what this department owns, supports, or controls within the business.'
      : 'Capture public business profile, ownership context, strategic role, and major risk signals for this entity.';
  }

  if (!departmentEditorMode) typeEl.addEventListener('change', refreshEntityEditorState);
  departmentTemplateEl.addEventListener('change', () => {
    if (departmentTemplateEl.value && (!nameEl.value.trim() || TYPICAL_DEPARTMENTS.includes(nameEl.value.trim()))) {
      nameEl.value = departmentTemplateEl.value;
    }
  });
  document.getElementById('org-cancel').addEventListener('click', () => modal.close());
  async function buildDepartmentContextFromParent() {
    const parentId = parentEl.value || node.parentId || seed.parentId || '';
    if (!parentId) {
      UI.toast('Choose the parent business before using AI assist for a function.', 'warning');
      return;
    }
    const settings = getAdminSettings();
    const parentEntity = getEntityById(structure, parentId);
    const parentLayer = parentEntity?.id ? getEntityLayerById(settings, parentEntity.id) : null;
    const llmConfig = getSessionLLMConfig();
    LLMService.setCompassConfig({
      apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
      model: llmConfig.model || 'gpt-5.1',
      apiKey: llmConfig.apiKey || ''
    });
    const result = await LLMService.buildEntityContext({
      entity: {
        id: node.id || '',
        name: nameEl.value.trim() || defaultDepartmentHint || 'New function',
        type: 'Department / function',
        profile: profileEl.value.trim(),
        departmentHint: departmentTemplateEl.value || defaultDepartmentHint || '',
        departmentRelationshipType: typeEl.value || defaultDepartmentRelationshipType,
        ownerUsername: ownerEl.value || ''
      },
      parentEntity: parentEntity ? {
        id: parentEntity.id,
        name: parentEntity.name,
        type: parentEntity.type,
        profile: parentEntity.profile || '',
        websiteUrl: parentEntity.websiteUrl || ''
      } : null,
      existingLayer: null,
      parentLayer: parentLayer || null,
      adminSettings: {
        geography: settings.geography || '',
        applicableRegulations: Array.isArray(settings.applicableRegulations) ? settings.applicableRegulations : [],
        aiInstructions: settings.aiInstructions || '',
        benchmarkStrategy: settings.benchmarkStrategy || '',
        riskAppetiteStatement: settings.riskAppetiteStatement || ''
      }
    });
    if (result.contextSummary) profileEl.value = result.contextSummary;
  }

  if (departmentEditorMode) {
    document.getElementById('btn-org-build-context').addEventListener('click', async () => {
      const btn = document.getElementById('btn-org-build-context');
      btn.disabled = true;
      btn.textContent = 'Building context…';
      try {
        await buildDepartmentContextFromParent();
        UI.toast('Function context drafted from the parent business context.', 'success', 5000);
      } catch (error) {
        UI.toast('Context build failed: ' + error.message, 'danger', 6000);
      } finally {
        btn.disabled = false;
        btn.textContent = 'AI Assist Context';
      }
    });
  }
  document.getElementById('org-save').addEventListener('click', () => {
    const selectedNodeType = getSelectedNodeType();
    const parentId = parentEl.value;
    if (requiresParentEntity(selectedNodeType) && !parentId) {
      UI.toast(departmentEditorMode ? 'Choose the business this department sits under.' : 'Choose the parent business for this entity.', 'warning');
      return;
    }
    const name = nameEl.value.trim();
    if (!name) {
      UI.toast(departmentEditorMode ? 'Enter the department or function name.' : 'Enter the entity name.', 'warning');
      return;
    }
    onSave?.({
      ...node,
      id: node.id || `org_${Date.now()}`,
      type: selectedNodeType,
      name,
      parentId: parentId || null,
      websiteUrl: departmentEditorMode ? '' : websiteEl.value.trim(),
      profile: profileEl.value.trim(),
      ownerUsername: ownerEl.value,
      departmentRelationshipType: departmentEditorMode ? typeEl.value : '',
      contextSections: departmentEditorMode ? null : {
        companySummary: document.getElementById('org-section-summary').value.trim(),
        businessModel: document.getElementById('org-section-business-model').value.trim(),
        operatingModel: document.getElementById('org-section-operating-model').value.trim(),
        publicCommitments: document.getElementById('org-section-commitments').value.trim(),
        keyRiskSignals: document.getElementById('org-section-risks').value.trim(),
        obligations: document.getElementById('org-section-obligations').value.trim(),
        sources: document.getElementById('org-section-sources').value.trim()
      },
      departmentHint: departmentEditorMode ? (departmentTemplateEl.value || name) : ''
    }, modal);
  });
  refreshEntityEditorState();
  return {
    close: modal.close,
    setProfile(value) { profileEl.value = value || ''; },
    setSections(sections = {}) {
      document.getElementById('org-section-summary').value = sections.companySummary || '';
      document.getElementById('org-section-business-model').value = sections.businessModel || '';
      document.getElementById('org-section-operating-model').value = sections.operatingModel || '';
      document.getElementById('org-section-commitments').value = sections.publicCommitments || '';
      document.getElementById('org-section-risks').value = sections.keyRiskSignals || '';
      document.getElementById('org-section-obligations').value = sections.obligations || '';
      document.getElementById('org-section-sources').value = sections.sources || '';
    },
    setWebsite(value) { websiteEl.value = value || ''; },
    setName(value) { nameEl.value = value || ''; },
    setType(value) {
      if (departmentEditorMode) {
        if (DEPARTMENT_RELATIONSHIP_TYPES.includes(value)) {
          typeEl.value = value;
          refreshEntityEditorState();
        }
        return;
      }
      if (ORG_ENTITY_TYPES.includes(value) && !isDepartmentEntityType(value)) {
        typeEl.value = value;
        refreshEntityEditorState();
      }
    }
  };
}

function buildEntityContextRequest(entity, settings = getAdminSettings(), existingLayer = null) {
  const structure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const parentEntity = entity?.parentId ? getEntityById(structure, entity.parentId) : null;
  const parentLayer = parentEntity?.id ? getEntityLayerById(settings, parentEntity.id) : null;
  return {
    entity: {
      id: entity?.id || '',
      name: entity?.name || '',
      type: entity?.type || '',
      profile: entity?.profile || '',
      departmentHint: entity?.departmentHint || '',
      departmentRelationshipType: entity?.departmentRelationshipType || '',
      ownerUsername: entity?.ownerUsername || ''
    },
    parentEntity: parentEntity ? {
      id: parentEntity.id,
      name: parentEntity.name,
      type: parentEntity.type,
      profile: parentEntity.profile || '',
      websiteUrl: parentEntity.websiteUrl || ''
    } : null,
    existingLayer: existingLayer || {},
    parentLayer: parentLayer || null,
    adminSettings: {
      geography: settings.geography || '',
      applicableRegulations: Array.isArray(settings.applicableRegulations) ? settings.applicableRegulations : [],
      aiInstructions: settings.aiInstructions || '',
      benchmarkStrategy: settings.benchmarkStrategy || '',
      riskAppetiteStatement: settings.riskAppetiteStatement || ''
    }
  };
}

function openEntityContextLayerEditor({ entity, settings = getAdminSettings(), onSave, readOnlyIdentity = false }) {
  if (!entity?.id) return null;
  const existingLayer = getEntityLayerById(settings, entity.id) || {};
  const contextRequest = buildEntityContextRequest(entity, settings, existingLayer);
  const parentName = contextRequest.parentEntity?.name || '';
  const modal = UI.modal({
    title: `Manage Context: ${entity.name}`,
    body: `
      <div class="context-panel-copy" style="margin-bottom:12px">This context sits under <strong>${entity.name}</strong> and helps the platform retain what is unique about this ${isDepartmentEntityType(entity.type) ? 'department' : 'business unit'}.</div>
      ${parentName ? `<div class="form-help" style="margin-bottom:12px">AI assist will inherit context from <strong>${parentName}</strong> and specialise it for this ${isDepartmentEntityType(entity.type) ? 'function' : 'entity'}.</div>` : ''}
      <div class="grid-2" style="gap:12px">
        <div class="form-group">
          <label class="form-label" for="entity-layer-name">Entity</label>
          <input class="form-input" id="entity-layer-name" value="${entity.name}" ${readOnlyIdentity ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label" for="entity-layer-geo">Geography</label>
          <input class="form-input" id="entity-layer-geo" value="${existingLayer.geography || ''}" placeholder="e.g. UAE, GCC, Global">
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="entity-layer-summary">Context Summary</label>
        <textarea class="form-textarea" id="entity-layer-summary" rows="4" placeholder="Describe the remit, critical processes, dependencies, and regulatory exposure.">${existingLayer.contextSummary || entity.profile || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="entity-layer-appetite">Risk Appetite</label>
        <textarea class="form-textarea" id="entity-layer-appetite" rows="3">${existingLayer.riskAppetiteStatement || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Applicable Regulations</label>
        <div class="tag-input-wrap" id="ti-entity-layer-regulations"></div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="entity-layer-ai">AI Guidance</label>
        <textarea class="form-textarea" id="entity-layer-ai" rows="3">${existingLayer.aiInstructions || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="entity-layer-benchmark">Benchmark Strategy</label>
        <textarea class="form-textarea" id="entity-layer-benchmark" rows="3">${existingLayer.benchmarkStrategy || ''}</textarea>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-entity-layer-ai" type="button">Build with AI</button>
        <span class="form-help">Derive context from the entity, the parent BU, and the current admin baseline.</span>
      </div>`,
    footer: `<button class="btn btn--ghost" id="entity-layer-cancel">Cancel</button><button class="btn btn--primary" id="entity-layer-save">Save Context</button>`
  });

  const regsInput = UI.tagInput('ti-entity-layer-regulations', existingLayer.applicableRegulations || []);
  document.getElementById('entity-layer-cancel').addEventListener('click', () => modal.close());
  document.getElementById('btn-entity-layer-ai').addEventListener('click', async () => {
    const btn = document.getElementById('btn-entity-layer-ai');
    const llmConfig = getSessionLLMConfig();
    btn.disabled = true;
    btn.textContent = 'Building context…';
    try {
      LLMService.setCompassConfig({
        apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
        model: llmConfig.model || 'gpt-5.1',
        apiKey: llmConfig.apiKey || ''
      });
      const result = await LLMService.buildEntityContext(contextRequest);
      if (result.geography && !document.getElementById('entity-layer-geo').value.trim()) {
        document.getElementById('entity-layer-geo').value = result.geography;
      }
      if (result.contextSummary) {
        document.getElementById('entity-layer-summary').value = result.contextSummary;
      }
      if (result.riskAppetiteStatement) {
        document.getElementById('entity-layer-appetite').value = result.riskAppetiteStatement;
      }
      if (Array.isArray(result.applicableRegulations) && result.applicableRegulations.length) {
        regsInput.setTags(Array.from(new Set([...regsInput.getTags(), ...result.applicableRegulations])));
      }
      if (result.aiInstructions) {
        document.getElementById('entity-layer-ai').value = result.aiInstructions;
      }
      if (result.benchmarkStrategy) {
        document.getElementById('entity-layer-benchmark').value = result.benchmarkStrategy;
      }
      UI.toast(`Context built for ${entity.name}. Review and save it.`, 'success', 5000);
    } catch (error) {
      UI.toast('Context build failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Build with AI';
    }
  });
  document.getElementById('entity-layer-save').addEventListener('click', () => {
    onSave?.({
      entityId: entity.id,
      entityName: entity.name,
      geography: document.getElementById('entity-layer-geo').value.trim(),
      contextSummary: document.getElementById('entity-layer-summary').value.trim(),
      riskAppetiteStatement: document.getElementById('entity-layer-appetite').value.trim(),
      applicableRegulations: regsInput.getTags(),
      aiInstructions: document.getElementById('entity-layer-ai').value.trim(),
      benchmarkStrategy: document.getElementById('entity-layer-benchmark').value.trim()
    }, modal);
  });
  return modal;
}

function getAdminLLMConfig() {
  const saved = getSessionLLMConfig();
  const apiUrlEl = document.getElementById('admin-compass-url');
  const modelEl = document.getElementById('admin-compass-model');
  const apiKeyEl = document.getElementById('admin-compass-key');
  return {
    apiUrl: apiUrlEl?.value.trim() || saved.apiUrl || DEFAULT_COMPASS_PROXY_URL,
    model: modelEl?.value.trim() || saved.model || 'gpt-5.1',
    apiKey: apiKeyEl?.value.trim() || saved.apiKey || ''
  };
}

function getSessionLLMConfig() {
  try {
    const config = JSON.parse(sessionStorage.getItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX)) || 'null') || {};
    if (typeof config.apiUrl === 'string' && config.apiUrl.includes('api.core42.ai/v1/chat/completions')) {
      config.apiUrl = DEFAULT_COMPASS_PROXY_URL;
      sessionStorage.setItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX), JSON.stringify(config));
    }
    return config;
  } catch {
    return {};
  }
}

function saveSessionLLMConfig(config) {
  sessionStorage.setItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX), JSON.stringify(config));
}

function fmtCurrency(usdValue) {
  if (AppState.currency === 'AED') {
    const v = usdValue * AppState.fxRate;
    if (v >= 1_000_000) return 'AED ' + (v / 1_000_000).toFixed(2) + 'M';
    if (v >= 1_000) return 'AED ' + (v / 1_000).toFixed(0) + 'K';
    return 'AED ' + v.toFixed(0);
  }
  const v = usdValue;
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

function parseFlexibleNumber(value) {
  const cleaned = String(value == null ? '' : value)
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return NaN;
  return Number(cleaned);
}

function formatGroupedNumber(value) {
  const numeric = parseFlexibleNumber(value);
  if (!Number.isFinite(numeric)) return '';
  const sign = numeric < 0 ? '-' : '';
  const abs = Math.abs(numeric);
  const asText = String(abs);
  const parts = asText.split('.');
  const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + (parts[1] ? `${whole}.${parts[1]}` : whole);
}

function attachFormattedMoneyInputs() {
  document.querySelectorAll('.money-input').forEach(input => {
    if (input.dataset.moneyBound === 'true') return;
    input.dataset.moneyBound = 'true';
    input.addEventListener('focus', () => {
      const numeric = parseFlexibleNumber(input.value);
      input.value = Number.isFinite(numeric) ? String(numeric) : '';
    });
    input.addEventListener('blur', () => {
      input.value = formatGroupedNumber(input.value);
    });
    input.value = formatGroupedNumber(input.value);
  });
}

function setPage(html) {
  document.getElementById('main-content').innerHTML = html;
}

async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function prettifyRiskText(value) {
  return String(value || '')
    .replace(/^\d+\.\s*/,'')
    .replace(/\btitle:\s*/i, '')
    .replace(/\bcategory:\s*/i, '')
    .replace(/\bdescription:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoiseRiskText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!text || text === '-') return true;
  return /^sheet:|^columns:|^rows:|^no non-empty rows found/.test(text);
}

function parseStructuredRiskLine(raw) {
  const text = String(raw || '').trim();
  if (!text || isNoiseRiskText(text)) return null;
  const pieces = text.split('|').map(part => part.trim()).filter(Boolean);
  if (!pieces.some(part => /title:|category:|description:/i.test(part))) return null;
  const fields = {};
  pieces.forEach(part => {
    const match = part.match(/^(?:\d+\.\s*)?([^:]+):\s*(.+)$/);
    if (!match) return;
    fields[match[1].trim().toLowerCase()] = match[2].trim();
  });
  return {
    title: prettifyRiskText(fields.title || ''),
    category: prettifyRiskText(fields.category || 'Register'),
    description: prettifyRiskText(fields.description || '')
  };
}

function normaliseRisk(risk, source = 'manual') {
  const parsedLine = typeof risk === 'string' ? parseStructuredRiskLine(risk) : parseStructuredRiskLine(risk?.title);
  const title = prettifyRiskText(parsedLine?.title || risk?.title || risk?.name || risk || '');
  if (!title || isNoiseRiskText(title)) return null;
  const description = prettifyRiskText(parsedLine?.description || risk?.description || '');
  const category = prettifyRiskText(parsedLine?.category || risk?.category || 'General');
  if (title === '-' || category === '-') return null;
  return {
    id: risk?.id || ('risk-' + slugify(title) + '-' + Math.random().toString(36).slice(2, 7)),
    title,
    category,
    description,
    source: risk?.source || source,
    regulations: Array.isArray(risk?.regulations) ? risk.regulations : [],
    linkedTo: Array.isArray(risk?.linkedTo) ? risk.linkedTo : []
  };
}

function mergeRisks(existing, incoming) {
  const map = new Map();
  [...existing, ...incoming]
    .map(r => normaliseRisk(r))
    .filter(Boolean)
    .forEach(r => {
      const key = r.title.toLowerCase();
      if (!map.has(key)) {
        map.set(key, r);
        return;
      }
      const prev = map.get(key);
      map.set(key, {
        ...prev,
        ...r,
        regulations: Array.from(new Set([...(prev.regulations || []), ...(r.regulations || [])])),
        linkedTo: Array.from(new Set([...(prev.linkedTo || []), ...(r.linkedTo || [])]))
      });
    });
  return Array.from(map.values());
}

function getRiskCandidates() {
  return mergeRisks(AppState.draft.riskCandidates || [], AppState.draft.selectedRisks || []);
}

function syncRiskSelection(defaultSelectAll = false) {
  const candidates = getRiskCandidates();
  const validIds = new Set(candidates.map(risk => risk.id));
  let selectedIds = Array.isArray(AppState.draft.selectedRiskIds)
    ? AppState.draft.selectedRiskIds.filter(id => validIds.has(id))
    : [];
  if (!selectedIds.length && defaultSelectAll && candidates.length) {
    selectedIds = candidates.map(risk => risk.id);
  }
  AppState.draft.riskCandidates = candidates;
  AppState.draft.selectedRiskIds = selectedIds;
  AppState.draft.selectedRisks = candidates.filter(risk => selectedIds.includes(risk.id));
  return AppState.draft.selectedRisks;
}

function getSelectedRisks() {
  return syncRiskSelection().filter(Boolean);
}

const GENERIC_RISK_TITLES = new Set([
  'material technology and cyber risk requiring structured assessment',
  'technology outage affecting core business services'
]);

function appendRiskCandidates(incoming, { selectNew = true } = {}) {
  const incomingRisks = mergeRisks([], incoming || []);
  const incomingTitles = new Set(incomingRisks.map(risk => risk.title.toLowerCase()));
  const hasSpecificIncoming = incomingRisks.some(risk => !GENERIC_RISK_TITLES.has(risk.title.toLowerCase()));
  const baseCandidates = hasSpecificIncoming
    ? getRiskCandidates().filter(risk => !GENERIC_RISK_TITLES.has(String(risk.title || '').toLowerCase()))
    : getRiskCandidates();
  const merged = mergeRisks(baseCandidates, incomingRisks);
  const existingIds = new Set(Array.isArray(AppState.draft.selectedRiskIds) ? AppState.draft.selectedRiskIds : []);
  const selectedIds = merged
    .filter(risk => existingIds.has(risk.id) || (selectNew && incomingTitles.has(risk.title.toLowerCase())))
    .map(risk => risk.id);
  AppState.draft.riskCandidates = merged;
  AppState.draft.selectedRiskIds = selectedIds;
  AppState.draft.selectedRisks = merged.filter(risk => selectedIds.includes(risk.id));
}

function getLinkedRiskRecommendations(selectedRisks) {
  const groups = [
    {
      label: 'Technology control weakness -> service disruption',
      test: risk => /patch|monitor|control|documentation|issue tracking|assessment/i.test(`${risk.title} ${risk.description}`)
    },
    {
      label: 'Third-party governance -> operational disruption',
      test: risk => /vendor|supplier|third-party|supplier assurance|due diligence/i.test(`${risk.title} ${risk.description}`)
    },
    {
      label: 'Compliance lapse -> regulatory exposure',
      test: risk => /compliance|certification|policy|attestation/i.test(`${risk.title} ${risk.description}`)
    }
  ];
  return groups
    .map(group => ({
      label: group.label,
      risks: selectedRisks.filter(group.test).map(risk => risk.title)
    }))
    .filter(group => group.risks.length > 1);
}

function getScenarioMultipliers() {
  const riskCount = Math.max(1, getSelectedRisks().length);
  const linked = !!AppState.draft.linkedRisks && riskCount > 1;
  return {
    riskCount,
    linked,
    tefMultiplier: 1 + (riskCount - 1) * (linked ? 0.35 : 0.18),
    lossMultiplier: 1 + (riskCount - 1) * (linked ? 0.22 : 0.10),
    secondaryMultiplier: 1 + (riskCount - 1) * (linked ? 0.25 : 0.08)
  };
}

function deriveApplicableRegulations(bu, selectedRisks = [], geographies = getScenarioGeographies()) {
  const settings = getEffectiveSettings();
  const tags = [
    ...settings.applicableRegulations,
    ...(AppState.draft.applicableRegulations || []),
    ...(bu?.regulatoryTags || []),
    ...deriveGeographyRegulations(geographies),
    ...selectedRisks.flatMap(r => r.regulations || [])
  ].filter(Boolean);
  return Array.from(new Set(tags));
}

function normaliseCitations(citations) {
  const list = Array.isArray(citations) ? citations : [];
  const seen = new Set();
  return list.filter((citation) => {
    const key = [citation?.docId || '', citation?.title || '', citation?.url || '', citation?.excerpt || '']
      .join('|')
      .trim()
      .toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getScenarioAssistSeedNarrative(currentValue) {
  const current = String(currentValue || '').trim();
  const enhanced = String(AppState.draft.enhancedNarrative || '').trim();
  const base = String(AppState.draft.narrative || '').trim();
  if (current && enhanced && base && current === enhanced) return base;
  return current || enhanced || base;
}

function normaliseScenarioSeedText(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const sentences = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const filtered = sentences.filter((sentence) => {
    const key = sentence.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    if (/^in .*faces a material .*scenario in which/i.test(sentence)) return false;
    if (/^this scenario should be assessed/i.test(sentence)) return false;
    if (/^a likely progression is/i.test(sentence)) return false;
    if (/^in practice, this can drive/i.test(sentence)) return false;
    if (/^given the stated urgency/i.test(sentence)) return false;
    if (/^current urgency is assessed as /i.test(sentence)) return false;
    return true;
  });
  return (filtered.join(' ').trim() || raw);
}

function getIntakeAssistSeedNarrative(currentValue) {
  const current = normaliseScenarioSeedText(currentValue);
  const source = normaliseScenarioSeedText(AppState.draft.sourceNarrative || '');
  const base = normaliseScenarioSeedText(AppState.draft.narrative || '');
  const enhanced = normaliseScenarioSeedText(AppState.draft.enhancedNarrative || '');
  if (current && enhanced && current === enhanced && (source || base)) return source || base;
  return source || current || base || enhanced;
}

function buildScenarioNarrative(introOverride = '') {
  const selected = getSelectedRisks();
  const titles = selected.map(r => r.title);
  const intro = String(introOverride || AppState.draft.enhancedNarrative || AppState.draft.narrative || '').trim();
  if (!titles.length) return intro;
  const linkage = AppState.draft.linkedRisks && titles.length > 1
    ? 'These risks should be treated as linked and capable of cascading into one another.'
    : 'These risks may be assessed together but should be treated as distinct drivers.';
  return `${intro}\n\nSelected risks:\n- ${titles.join('\n- ')}\n\n${linkage}`.trim();
}

function guessRisksFromText(text) {
  const source = String(text || '').toLowerCase();
  const patterns = [
    ['Ransomware attack on critical platforms', 'Cyber', ['UAE PDPL']],
    ['Cloud misconfiguration exposing sensitive data', 'Cloud', ['UAE PDPL']],
    ['Data breach involving regulated or personal data', 'Data Protection', ['UAE PDPL', 'GDPR']],
    ['Insider misuse of privileged access', 'Insider Threat', ['UAE Cybersecurity Council Guidance']],
    ['Third-party or supply chain compromise', 'Third Party', ['BIS Export Controls']],
    ['Export control or sanctions breach', 'Regulatory', ['BIS Export Controls', 'OFAC Sanctions']],
    ['Operational outage affecting core services', 'Operational Resilience', ['UAE NESA IAS']],
    ['Fraud or payment manipulation event', 'Financial Crime', ['UAE AML/CFT']]
  ];
  const found = patterns.filter(([title]) => {
    const key = title.toLowerCase();
    return source.includes('ransom') && key.includes('ransom')
      || source.includes('cloud') && key.includes('cloud')
      || (source.includes('breach') || source.includes('privacy')) && key.includes('data breach')
      || (source.includes('insider') || source.includes('privileged')) && key.includes('insider')
      || (source.includes('vendor') || source.includes('supplier') || source.includes('third')) && key.includes('third-party')
      || (source.includes('export') || source.includes('sanction') || source.includes('bis')) && key.includes('export control')
      || (source.includes('outage') || source.includes('availability') || source.includes('disruption')) && key.includes('operational outage')
      || (source.includes('fraud') || source.includes('payment') || source.includes('invoice')) && key.includes('fraud');
  }).map(([title, category, regulations]) => ({ title, category, regulations, description: 'Extracted from the provided narrative or risk register.' }));
  return found.length ? found : [{ title: 'Technology and cyber risk requiring further triage', category: 'General', regulations: [] }];
}

function parseRegisterText(text) {
  return String(text || '')
    .split(/\r?\n|;/)
    .map(line => line.trim())
    .filter(line => line && !/^risk[\s,_-]*id/i.test(line) && line.length > 10 && !isNoiseRiskText(line))
    .slice(0, 25);
}

function getFileExtension(name = '') {
  const parts = String(name).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function looksLikeBinaryRegister(text) {
  const sample = String(text || '').slice(0, 400);
  if (!sample) return false;
  if (sample.startsWith('PK') || /docProps\/|word\/|xl\//i.test(sample)) return true;
  const controlChars = (sample.match(/[\u0000-\u0008\u000E-\u001F]/g) || []).length;
  return controlChars > 8;
}

function truncateText(value, max = 180) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function sanitiseHeaderCell(value, index) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!text || /^__empty/i.test(text)) return `column_${index + 1}`;
  return text;
}

function scoreHeaderRow(cells) {
  const joined = cells.join(' ').toLowerCase();
  let score = 0;
  if (/risk title|risk name|risk description|risk category|risk id/.test(joined)) score += 8;
  if (/entity|business area|operating role|owner|function/.test(joined)) score += 3;
  if (/if .* then|template|provide a short|drop down/.test(joined)) score -= 6;
  return score;
}

function normaliseWorksheetRows(matrix) {
  const rows = (matrix || [])
    .map(row => Array.isArray(row) ? row.map(cell => String(cell == null ? '' : cell).trim()) : [])
    .filter(row => row.some(cell => cell));
  if (!rows.length) return [];

  let headerIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  rows.slice(0, 12).forEach((row, idx) => {
    const score = scoreHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = idx;
    }
  });

  const headers = rows[headerIndex].map((cell, idx) => sanitiseHeaderCell(cell, idx));
  return rows.slice(headerIndex + 1).map(row => {
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] != null ? row[idx] : '';
    });
    return record;
  });
}

function isLikelyTemplateRow(row) {
  const values = Object.entries(row || {})
    .map(([key, value]) => [String(key || '').trim().toLowerCase(), String(value || '').trim()])
    .filter(([, value]) => value);
  if (!values.length) return true;
  const joined = values.map(([, value]) => value).join(' ').toLowerCase();
  if (/risk register template|provide a short|drop down selection|automatic unique identifier|use the following structure/.test(joined)) return true;
  if (values.every(([key]) => /^column_\d+$/.test(key))) return true;
  return false;
}

function extractRiskFields(row) {
  const entries = Object.entries(row || {})
    .map(([key, value]) => [String(key || '').trim(), String(value == null ? '' : value).trim()])
    .filter(([, value]) => value);
  if (!entries.length || isLikelyTemplateRow(row)) return null;

  const titleEntry = entries.find(([key]) => /risk title|title|name/i.test(key));
  const descriptionEntry = entries.find(([key]) => /risk description|description|statement|summary/i.test(key));
  const categoryEntry = entries.find(([key]) => /risk category|category|taxonomy/i.test(key));
  const contextEntries = entries.filter(([key]) => /entity|business area|operating role|owner|function|affiliate/i.test(key));

  const title = titleEntry?.[1];
  const description = descriptionEntry?.[1];
  if (!title && !description) return null;
  if (title && /risk register template|entity \/ affiliate|business area|risk title/i.test(title.toLowerCase())) return null;

  const context = contextEntries.map(([key, value]) => `${key}: ${truncateText(value, 60)}`).slice(0, 3).join(' | ');
  return {
    title: title || truncateText(description, 90),
    category: categoryEntry?.[1] || 'Register',
    description: [description, context].filter(Boolean).join(' | ')
  };
}

function rowsToStructuredRegisterText(sheetName, rows) {
  const cleanedRows = rows
    .map(row => extractRiskFields(row))
    .filter(Boolean)
    .slice(0, 120);
  const trimmedRows = cleanedRows.length ? cleanedRows : rows
    .filter(row => row && Object.values(row).some(v => String(v ?? '').trim()))
    .slice(0, 120);
  if (!trimmedRows.length) return `Sheet: ${sheetName}\nNo non-empty rows found.`;
  const headers = Array.from(new Set(trimmedRows.flatMap(row => Object.keys(row).filter(Boolean)))).slice(0, 12);
  const renderedRows = trimmedRows.map((row, idx) => {
    const cols = headers
      .map(key => `${key}: ${truncateText(row[key])}`)
      .filter(entry => !entry.endsWith(':'))
      .slice(0, 6);
    return `${idx + 1}. ${cols.join(' | ')}`;
  });
  return [
    `Sheet: ${sheetName}`,
    `Columns: ${headers.join(', ')}`,
    `Rows:`,
    ...renderedRows
  ].join('\n');
}

function parseDelimitedText(text, delimiter = ',') {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(delimiter).map(h => h.trim()).filter(Boolean);
  return lines.slice(1).map(line => {
    const values = line.split(delimiter);
    const row = {};
    headers.forEach((header, idx) => { row[header] = values[idx] != null ? values[idx].trim() : ''; });
    return row;
  });
}

function extractTextFromBinaryDocument(buffer) {
  const ascii = new TextDecoder('latin1').decode(buffer);
  const textChunks = [];
  const xmlChunks = ascii.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
  if (xmlChunks.length) {
    xmlChunks.forEach(chunk => {
      const match = chunk.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
      if (match?.[1]) textChunks.push(match[1]);
    });
  }
  const pdfChunks = ascii.match(/\(([^()\\]{3,})\)/g) || [];
  pdfChunks.slice(0, 400).forEach(chunk => {
    const cleaned = chunk.slice(1, -1).replace(/\[nrtbf()\]/g, ' ').trim();
    if (cleaned.length > 3) textChunks.push(cleaned);
  });
  const plainChunks = ascii.match(/[A-Za-z0-9][A-Za-z0-9 ,.;:()\/\-]{20,}/g) || [];
  plainChunks.slice(0, 400).forEach(chunk => textChunks.push(chunk));
  return textChunks.join('\n').replace(/\s+/g, ' ').trim();
}

async function parseRegisterFile(file) {
  const ext = getFileExtension(file.name);
  if (ext === 'xlsx' || ext === 'xls') {
    if (typeof XLSX === 'undefined') {
      throw new Error('Spreadsheet parser not loaded. Refresh the page and try again.');
    }
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetSummaries = workbook.SheetNames.map(sheetName => {
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
      const rows = normaliseWorksheetRows(rawRows);
      return {
        sheetName,
        rowCount: rows.length,
        text: rowsToStructuredRegisterText(sheetName, rows)
      };
    });
    return {
      text: sheetSummaries.map(s => s.text).join('\n\n'),
      meta: {
        type: 'spreadsheet',
        extension: ext,
        sheetCount: workbook.SheetNames.length,
        sheets: sheetSummaries.map(s => ({ sheetName: s.sheetName, rowCount: s.rowCount }))
      }
    };
  }

  if (ext === 'pdf' || ext === 'doc' || ext === 'docx') {
    const buffer = await file.arrayBuffer();
    const extracted = extractTextFromBinaryDocument(buffer);
    return {
      text: extracted || `${file.name} was uploaded, but only limited text could be extracted in the browser.`,
      meta: {
        type: 'document',
        extension: ext,
        sheetCount: 1,
        sheets: [{ sheetName: file.name, rowCount: extracted ? extracted.split(/\r?\n/).length : 0 }]
      }
    };
  }

  const text = await file.text();
  if (ext === 'csv' || ext === 'tsv') {
    const rows = parseDelimitedText(text, ext === 'tsv' ? '\t' : ',');
    return {
      text: rowsToStructuredRegisterText(file.name, rows),
      meta: {
        type: 'delimited',
        extension: ext,
        sheetCount: 1,
        sheets: [{ sheetName: file.name, rowCount: rows.length }]
      }
    };
  }

  return {
    text,
    meta: {
      type: 'text',
      extension: ext || 'txt',
      sheetCount: 1,
      sheets: [{ sheetName: file.name, rowCount: parseRegisterText(text).length }]
    }
  };
}

function composeGuidedNarrative(guidedInput = {}) {
  const event = String(guidedInput.event || '').trim();
  const asset = String(guidedInput.asset || '').trim();
  const cause = String(guidedInput.cause || '').trim();
  const impact = String(guidedInput.impact || '').trim();
  const urgency = String(guidedInput.urgency || 'medium').trim().toLowerCase();
  const urgencyPrefix = urgency ? `${urgency.charAt(0).toUpperCase() + urgency.slice(1)}-urgency` : 'Material';
  if (!event && !asset && !cause && !impact) return '';

  let primaryClause = event;
  if (cause && event) {
    primaryClause = `${cause.toLowerCase()} could lead to ${event.charAt(0).toLowerCase() + event.slice(1)}`;
  } else if (cause) {
    primaryClause = `${cause} could trigger a material risk event`;
  } else if (event) {
    primaryClause = `${event.charAt(0).toLowerCase() + event.slice(1)}`;
  }

  const parts = [];
  if (primaryClause) {
    parts.push(`${urgencyPrefix} scenario: ${primaryClause.charAt(0).toUpperCase() + primaryClause.slice(1)}.`);
  }
  if (asset) {
    parts.push(`${asset} is the primary asset or service in scope.`);
  }
  if (impact) {
    parts.push(`The scenario could result in ${impact.charAt(0).toLowerCase() + impact.slice(1)}.`);
  }
  if (asset && /identity|directory|sso|email|azure ad|active directory/i.test(`${event} ${asset} ${cause}`.toLowerCase())) {
    parts.push('Likely knock-on effects include mailbox compromise, privileged misuse, downstream service disruption, and data exposure if the event is not contained quickly.');
  }
  return parts.join(' ');
}

// ─── APP BAR ──────────────────────────────────────────────────
function renderAppBar() {
  const currentUser = AuthService.getCurrentUser();
  const homeHref = currentUser?.role === 'admin' ? '#/admin/settings' : currentUser ? '#/dashboard' : '#/';
  const settingsHref = currentUser?.role === 'admin' ? '#/admin/settings' : '#/settings';
  const bar = document.getElementById('app-bar');
  bar.innerHTML = `
    <div class="bar-inner">
      <a href="${homeHref}" class="bar-logo">Risk <span>Intelligence</span> Platform</a>
      <nav class="flex items-center gap-3">
        <a href="${homeHref}" class="bar-nav-link">${currentUser?.role === 'admin' ? 'Global Admin' : currentUser ? 'Dashboard' : 'Home'}</a>
        ${currentUser && currentUser.role !== 'admin' ? `<a href="#/settings" class="bar-nav-link">Settings</a>` : ''}
      </nav>
      <div class="bar-spacer"></div>
      ${currentUser ? `
        <a href="${settingsHref}" class="bar-nav-link bar-nav-link--admin">${currentUser.role === 'admin' ? 'Global Admin' : 'Personal Settings'}</a>
        <span class="bar-nav-link" style="pointer-events:none">${currentUser.displayName}</span>
        <button type="button" class="btn btn--ghost btn--sm" id="btn-sign-out">Sign Out</button>
      ` : `<a href="#/login" class="bar-nav-link bar-nav-link--admin">Sign In</a>`}
      <div class="currency-toggle" role="group" aria-label="Currency">
        <button id="cur-usd" class="${AppState.currency==='USD'?'active':''}">USD</button>
        <button id="cur-aed" class="${AppState.currency==='AED'?'active':''}">AED</button>
      </div>
      <span class="bar-poc-tag">PoC</span>
    </div>`;
  document.getElementById('cur-usd').addEventListener('click', () => { AppState.currency='USD'; renderAppBar(); Router.resolve(); });
  document.getElementById('cur-aed').addEventListener('click', () => { AppState.currency='AED'; renderAppBar(); Router.resolve(); });
  document.getElementById('btn-sign-out')?.addEventListener('click', () => {
    performLogout();
  });
}

// ─── LANDING ──────────────────────────────────────────────────
function renderLanding() {
  const assessments = getAssessments().slice(0, 5);
  const learningStore = getLearningStore();
  setPage(`
    <main class="page">
      <div class="container">

        <!-- Hero -->
        <section class="landing-hero">
          <div class="landing-badge">🔐 Internal Tool — Start Here</div>
          <h1>Risk Intelligence Platform</h1>
          <p class="landing-subtitle">Use this guide to turn a plain-English risk idea, issue, or register into a quantified FAIR analysis. You do not need to know FAIR in advance; the platform guides you step by step.</p>
          <div class="flex items-center gap-4" style="flex-wrap:wrap">
            <button class="btn btn--primary btn--lg" id="btn-start-new">Start Guided Assessment</button>
            <button class="btn btn--secondary" id="btn-show-templates">⚡ Start from a Template</button>
          </div>
          <div class="flex items-center gap-4 mt-4" style="flex-wrap:wrap">
            <span style="font-size:.78rem;color:var(--text-muted)">First time using the tool?</span>
            <button class="btn btn--ghost btn--sm" id="btn-how-it-works">Open quick guide →</button>
          </div>
        </section>

        <!-- How it works (collapsible) -->
        <div id="how-it-works-panel" class="hidden" style="margin-bottom:var(--sp-8)">
          <div class="card card--elevated anim-fade-in">
            <h3 style="font-size:var(--text-lg);margin-bottom:var(--sp-5)">How it works</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--sp-5)">
              ${[
                ['1','Describe the issue','Start with a simple risk statement such as “A supplier with privileged access is compromised” or upload a risk register for AI review.'],
                ['2','Let the platform structure it','The AI builder enhances the wording, identifies candidate risks, and suggests which risks may be linked.'],
                ['3','Check the assumptions','Review the FAIR inputs. If you are unsure, stay in Basic mode and use the AI-preloaded values as your starting point.'],
                ['4','Run and interpret results','The simulation shows likely loss ranges, annual exposure, and whether the scenario breaches the configured tolerance threshold.']
              ].map(([n,title,desc]) => `
                <div style="display:flex;gap:var(--sp-4)">
                  <div style="width:32px;height:32px;background:rgba(26,86,219,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:700;color:var(--color-primary-300);flex-shrink:0">${n}</div>
                  <div><div style="font-weight:600;font-size:.9rem;margin-bottom:4px">${title}</div><p style="font-size:.8rem;line-height:1.6">${desc}</p></div>
                </div>`).join('')}
            </div>
            <div class="banner banner--info mt-6" style="font-size:.82rem">
              <span class="banner-icon">ℹ</span>
              <span class="banner-text"><strong>Beginner tip:</strong> if you are unsure what to enter, choose a template first or write the scenario in plain English. The tool will help translate it into FAIR-style inputs. Results are saved in your browser only.</span>
            </div>
          </div>
        </div>

        <section style="margin-bottom:var(--sp-8)">
          <div class="card card--elevated anim-fade-in">
            <div class="flex items-center justify-between mb-4" style="flex-wrap:wrap;gap:var(--sp-3)">
              <h3 style="font-size:var(--text-xl)">Quick Start Guide</h3>
              <span class="badge badge--neutral">For novice users</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--sp-4)">
              ${[
                ['What to prepare','A short risk statement, affected business unit, and any known business or regulatory impact.'],
                ['When to use templates','Use a template when the scenario is similar to ransomware, BEC, insider threat, cloud exposure, or supply chain compromise.'],
                ['When to upload a register','Upload a register when you want AI to extract multiple risks and let you assess several together.'],
                ['How to read the result','Focus first on P90 per-event loss, annual exposure, and whether the scenario sits above or within tolerance.']
              ].map(([title, desc]) => `
                <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:var(--sp-4)">
                  <div style="font-weight:600;color:var(--text-primary);margin-bottom:6px">${title}</div>
                  <p style="font-size:.84rem;line-height:1.6">${desc}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <!-- Scenario Templates -->
        <div id="templates-panel" class="hidden" style="margin-bottom:var(--sp-8)">
          <div class="flex items-center justify-between mb-4">
            <h3 style="font-size:var(--text-xl)">Scenario Templates</h3>
            <button class="btn btn--ghost btn--sm" id="btn-hide-templates">✕ Close</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp-4)">
            ${ScenarioTemplates.map(t => `
              ${(() => {
                const profile = learningStore.templates?.[t.id];
                const learnedLabel = profile?.completed ? `<span class="badge badge--gold" style="font-size:.6rem">Learnt from ${profile.completed}</span>` : '';
                return `
              <button class="template-card" data-template-id="${t.id}" aria-label="Use template: ${t.label}">
                <div style="display:flex;align-items:flex-start;gap:var(--sp-3);margin-bottom:var(--sp-3)">
                  <span style="font-size:14px;line-height:1;font-weight:700;letter-spacing:.08em;min-width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(26,86,219,.16);border:1px solid rgba(26,86,219,.28);color:var(--color-primary-300)">${t.icon}</span>
                  <div style="flex:1;text-align:left">
                    <div style="font-family:var(--font-display);font-size:.95rem;font-weight:600;color:var(--text-primary);margin-bottom:4px">${t.label}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px">${t.tags.map(tag=>`<span class="badge badge--neutral" style="font-size:.6rem">${tag}</span>`).join('')}${learnedLabel}</div>
                  </div>
                </div>
                <p style="font-size:.8rem;color:var(--text-secondary);line-height:1.6;text-align:left">${t.description}</p>
                <div style="margin-top:var(--sp-3);text-align:right;font-size:.8rem;color:var(--color-primary-400);font-weight:600">Use this template →</div>
              </button>`;
              })()}
            `).join('')}
          </div>
        </div>

        <!-- Feature grid -->
        <div class="landing-grid">
          <div class="feature-card anim-fade-in anim-delay-1">
            <div class="feature-icon">🤖</div>
            <div class="feature-title">AI Risk Builder</div>
            <p class="feature-desc">Paste a simple description of the risk. The platform helps convert it into a structured assessment.</p>
          </div>
          <div class="feature-card anim-fade-in anim-delay-2">
            <div class="feature-icon">📊</div>
            <div class="feature-title">Monte Carlo Simulation</div>
            <p class="feature-desc">The model runs thousands of simulations so you can see a range of possible outcomes instead of a single guessed number.</p>
          </div>
          <div class="feature-card anim-fade-in anim-delay-3">
            <div class="feature-icon">🎯</div>
            <div class="feature-title">Tolerance Flagging</div>
            <p class="feature-desc">The platform shows clear threshold signals so users know when a scenario is within appetite, approaching concern, or above tolerance.</p>
          </div>
          <div class="feature-card anim-fade-in anim-delay-4">
            <div class="feature-icon">🔗</div>
            <div class="feature-title">Linked Risk Scenarios</div>
            <p class="feature-desc">Choose several related risks together when one issue can trigger another, such as a cyber event causing regulatory and operational impact.</p>
          </div>
        </div>

        <!-- Recent assessments -->
        ${assessments.length ? `
        <section style="margin-top:var(--sp-12)">
          <div class="flex items-center justify-between mb-4">
            <h3 style="font-size:var(--text-xl)">Recent Assessments <span class="badge badge--neutral" style="margin-left:8px;font-size:.65rem">Browser only</span></h3>
            <button class="btn btn--ghost btn--sm" id="btn-clear-all">Clear All</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--sp-3)">
            ${assessments.map(a => `
              <div class="assessment-item" data-id="${a.id}" role="button" tabindex="0">
                <div class="assessment-meta">
                  <div class="assessment-title">${a.scenarioTitle || 'Untitled'}</div>
                  <div class="assessment-detail">${a.buName || '—'} · ${new Date(parseInt((a.id||'0').replace('a_',''))).toLocaleDateString('en-AE')}</div>
                </div>
                ${a.results ? `<span class="badge ${a.results.toleranceBreached?'badge--danger':'badge--success'}">${a.results.toleranceBreached?'Above Tolerance':'Within Tolerance'}</span>` : '<span class="badge badge--neutral">Draft</span>'}
                <span style="color:var(--text-muted);font-size:20px">→</span>
              </div>`).join('')}
          </div>
        </section>` : ''}

      </div>
    </main>

    <style>
      .template-card {
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--sp-5);
        cursor: pointer;
        transition: all var(--transition-base);
        text-align: left;
        width: 100%;
      }
      .template-card:hover {
        border-color: var(--color-primary-600);
        background: var(--bg-overlay-hover);
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }
    </style>`);

  // Wiring
  document.getElementById('btn-start-new').addEventListener('click', () => { resetDraft(); Router.navigate('/wizard/1'); });

  document.getElementById('btn-how-it-works').addEventListener('click', () => {
    const panel = document.getElementById('how-it-works-panel');
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    document.getElementById('btn-how-it-works').textContent = isHidden ? 'Hide ↑' : 'How it works →';
  });

  document.getElementById('btn-show-templates').addEventListener('click', () => {
    document.getElementById('templates-panel').classList.remove('hidden');
    document.getElementById('templates-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('btn-hide-templates')?.addEventListener('click', () => {
    document.getElementById('templates-panel').classList.add('hidden');
  });

  document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const tmpl = ScenarioTemplates.find(t => t.id === card.dataset.templateId);
      if (tmpl) loadTemplate(tmpl);
    });
  });

  document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
    if (await UI.confirm('Clear all saved assessments from this browser?')) {
      localStorage.removeItem(buildUserStorageKey(ASSESSMENTS_STORAGE_PREFIX));
      Router.resolve();
    }
  });

  document.querySelectorAll('.assessment-item').forEach(el => {
    const open = () => Router.navigate('/results/' + el.dataset.id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
}

function renderUserDashboard() {
  if (!requireAuth()) return;
  if (AuthService.isAdminAuthenticated()) {
    Router.navigate('/admin/settings');
    return;
  }

  const settings = getUserSettings();
  if (!settings.onboardedAt) {
    renderUserOnboarding(settings);
    return;
  }

  const user = AppState.currentUser || AuthService.getCurrentUser();
  const globalSettings = getAdminSettings();
  const profile = normaliseUserProfile(settings.userProfile, user);
  const assessments = getAssessments()
    .slice()
    .sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
  const recentAssessments = assessments.slice(0, 3);
  const latestAssessment = recentAssessments[0] || null;
  const learningStore = getLearningStore();
  const templateLoads = Object.values(learningStore.templates || {}).reduce((sum, item) => sum + Number(item.loads || 0), 0);
  const draftTitle = String(AppState.draft?.scenarioTitle || AppState.draft?.scenarioNarrative || '').trim();
  const focusAreas = Array.isArray(profile.focusAreas) ? profile.focusAreas.filter(Boolean) : [];
  const dashboardPriorities = [
    focusAreas.length
      ? `Your saved focus areas are ${focusAreas.slice(0, 3).join(', ')}${focusAreas.length > 3 ? ', and related topics.' : '.'}`
      : 'Add focus areas in Personal Settings so AI outputs reflect what matters most in your role.',
    latestAssessment
      ? `Your latest completed assessment is ${latestAssessment.scenarioTitle || 'an untitled scenario'} from ${new Date(latestAssessment.completedAt || latestAssessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })}.`
      : 'You have not completed a risk assessment yet. Start one to establish a baseline view for your area.',
    profile.workingContext
      ? 'Your working context is saved and will be reused automatically in AI-assisted steps.'
      : 'Your working context is still thin. Add a few lines in Personal Settings to improve the usefulness of generated outputs.'
  ];

  setPage(`
    <main class="page">
      <div class="container container--wide" style="padding:var(--sp-10) var(--sp-6)">
        <section class="card card--elevated" style="padding:var(--sp-8);background:linear-gradient(135deg, rgba(11,15,28,.98), rgba(18,27,49,.96));border-color:rgba(244,193,90,.18)">
          <div class="flex items-start justify-between" style="gap:var(--sp-6);flex-wrap:wrap">
            <div style="max-width:760px">
              <div class="landing-badge">Personal Dashboard</div>
              <h2 style="margin-top:var(--sp-4)">Welcome back, ${user?.displayName || 'there'}.</h2>
              <p style="margin-top:10px;color:rgba(255,255,255,.74);max-width:680px">This is your main working space. Use it to start a new risk assessment, keep track of what you have already analysed, and stay on top of the context that shapes your outputs.</p>
              <div class="flex items-center gap-3 mt-6" style="flex-wrap:wrap">
                <button class="btn btn--primary btn--lg" id="btn-dashboard-new-assessment">Run New Risk Assessment</button>
                <button class="btn btn--secondary" id="btn-dashboard-open-settings">Review Personal Settings</button>
              </div>
            </div>
            <div class="card" style="min-width:280px;max-width:340px;padding:var(--sp-5);background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)">
              <div class="context-panel-title">Your saved context</div>
              <div class="context-panel-copy" style="margin-top:8px">${profile.jobTitle || 'Role not yet set'} · ${profile.businessUnit || user?.businessUnit || 'Business unit not yet set'}${profile.department || user?.department ? ` · ${profile.department || user?.department}` : ''}</div>
              <div class="form-help" style="margin-top:10px;color:rgba(255,255,255,.65)">Default geography: ${settings.geographyPrimary || settings.geography || globalSettings.geography}</div>
            </div>
          </div>
        </section>

        <section class="admin-overview-grid" style="margin-top:var(--sp-8)">
          <div class="admin-overview-card">
            <div class="admin-overview-label">Assessments Completed</div>
            <div class="admin-overview-value" style="font-size:1.2rem">${assessments.length}</div>
            <div class="admin-overview-foot">${latestAssessment ? `Latest: ${new Date(latestAssessment.completedAt || latestAssessment.createdAt || Date.now()).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No completed assessments yet'}</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Focus Areas</div>
            <div class="admin-overview-value" style="font-size:1.2rem">${focusAreas.length}</div>
            <div class="admin-overview-foot">${focusAreas.length ? focusAreas.join(', ') : 'Add your priorities in Personal Settings'}</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Templates Started</div>
            <div class="admin-overview-value" style="font-size:1.2rem">${templateLoads}</div>
            <div class="admin-overview-foot">${draftTitle ? 'You also have an assessment draft in progress' : 'No draft in progress right now'}</div>
          </div>
        </section>

        <section class="grid-2" style="margin-top:var(--sp-8);align-items:start">
          <div class="card card--elevated" style="padding:var(--sp-6)">
            <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
              <div>
                <div class="context-panel-title">What to track next</div>
                <div class="form-help">A concise working view of what deserves attention.</div>
              </div>
              <span class="badge badge--neutral">${dashboardPriorities.length} items</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
              ${dashboardPriorities.map((item, index) => `
                <div style="display:flex;gap:12px;align-items:flex-start;background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                  <div style="width:28px;height:28px;border-radius:999px;background:rgba(244,193,90,.18);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:var(--accent-gold);flex-shrink:0">${index + 1}</div>
                  <div style="font-size:.9rem;line-height:1.6">${item}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="context-panel-title">Current activity</div>
              <div style="display:grid;gap:12px;margin-top:var(--sp-5)">
                <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                  <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Setup status</div>
                  <div style="margin-top:6px;font-weight:600">Completed on ${new Date(settings.onboardedAt).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                  <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Draft assessment</div>
                  <div style="margin-top:6px;font-weight:600">${draftTitle || 'No draft in progress'}</div>
                  <div class="form-help" style="margin-top:6px">${draftTitle ? 'Continue from where you left off or start a new analysis.' : 'A new draft will be created when you start your next assessment.'}</div>
                </div>
              </div>
              <div class="flex items-center gap-3 mt-5" style="flex-wrap:wrap">
                <button class="btn btn--secondary" id="btn-dashboard-continue-draft" ${draftTitle ? '' : 'disabled'}>Continue Draft</button>
                <button class="btn btn--ghost" id="btn-dashboard-settings-secondary">Open Settings</button>
              </div>
            </div>

            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
                <div>
                  <div class="context-panel-title">Recent assessments</div>
                  <div class="form-help">Your latest saved analysis outputs.</div>
                </div>
                <span class="badge badge--neutral">${recentAssessments.length}</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
                ${recentAssessments.length ? recentAssessments.map(assessment => `
                  <button type="button" class="card dashboard-assessment-row" data-assessment-id="${assessment.id}" style="padding:var(--sp-4);background:var(--bg-elevated);text-align:left;cursor:pointer">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                      <div>
                        <div style="font-weight:600;color:var(--text-primary)">${assessment.scenarioTitle || 'Untitled assessment'}</div>
                        <div class="form-help" style="margin-top:6px">${assessment.buName || profile.businessUnit || user?.businessUnit || 'Business unit not set'} · ${new Date(assessment.completedAt || assessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                      </div>
                      <span class="badge badge--gold">Open</span>
                    </div>
                  </button>
                `).join('') : `<div class="form-help">No completed assessments yet. Your completed analyses will appear here.</div>`}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>`);

  document.getElementById('btn-dashboard-new-assessment')?.addEventListener('click', () => {
    resetDraft();
    Router.navigate('/wizard/1');
  });
  document.getElementById('btn-dashboard-open-settings')?.addEventListener('click', () => Router.navigate('/settings'));
  document.getElementById('btn-dashboard-settings-secondary')?.addEventListener('click', () => Router.navigate('/settings'));
  document.getElementById('btn-dashboard-continue-draft')?.addEventListener('click', () => Router.navigate('/wizard/1'));
  document.querySelectorAll('.dashboard-assessment-row').forEach(button => {
    button.addEventListener('click', () => Router.navigate(`/results/${button.dataset.assessmentId}`));
  });
}

function loadTemplate(tmpl) {
  resetDraft();
  const learned = applyLearnedTemplateDraft(tmpl);
  recordTemplateLoad(tmpl.id);
  // Pick a sensible default BU if suggested ones are available
  const buList = getBUList();
  const preferredBU = tmpl.suggestedBUTypes
    .map(id => buList.find(b => b.id === id))
    .find(Boolean);

  Object.assign(AppState.draft, {
    ...learned.draft,
    templateId: tmpl.id,
    buId: preferredBU?.id || null,
    buName: preferredBU?.name || null,
    llmAssisted: false,
    learningNote: learned.note
  });
  saveDraft();
  Router.navigate('/wizard/1');
  UI.toast(learned.note ? `Template loaded with learned defaults: "${tmpl.label}".` : `Template loaded: "${tmpl.label}". Review inputs and run the simulation.`, 'info', 4500);
}

// ─── WIZARD 1 ─────────────────────────────────────────────────
function renderWizard1() {
  ensureDraftShape();
  const draft = AppState.draft;
  const settings = getEffectiveSettings();
  const buList = getBUList();
  const preferredBusinessUnitId = settings.userProfile?.businessUnitEntityId || AppState.currentUser?.businessUnitEntityId || '';
  if (!draft.buId && preferredBusinessUnitId) {
    const preferredBU = buList.find(bu => bu.orgEntityId === preferredBusinessUnitId || bu.id === preferredBusinessUnitId);
    if (preferredBU) {
      draft.buId = preferredBU.id;
      draft.buName = preferredBU.name;
      draft.applicableRegulations = deriveApplicableRegulations(preferredBU, getSelectedRisks());
      saveDraft();
    }
  }
  const selectedRisks = syncRiskSelection(true);
  const riskCandidates = getRiskCandidates();
  const scenarioGeographies = getScenarioGeographies();
  const regs = deriveApplicableRegulations(buList.find(b => b.id === draft.buId), selectedRisks, scenarioGeographies);

  setPage(`
    <main class="page">
      <div class="wizard-layout container container--narrow">
        <div class="wizard-header">
          ${UI.renderStepper(1)}
          <h2 class="wizard-step-title">AI-Assisted Risk &amp; Context Builder</h2>
          <p class="wizard-step-desc">Start with a risk statement or upload a register. AI will enhance the context, extract candidate risks, and prepare a linked scenario for quantification.</p>
        </div>
        <div class="wizard-body">
          ${draft.learningNote ? `<div class="card card--elevated anim-fade-in"><div class="context-panel-title">Learnt from prior use</div><p class="context-panel-copy">${draft.learningNote}</p></div>` : ''}
          <div class="card card--elevated anim-fade-in">
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label" for="wizard-bu">Business Unit <span class="required">*</span></label>
                <select class="form-select" id="wizard-bu">
                  <option value="">— Select —</option>
                  ${buList.map(b => `<option value="${b.id}" ${draft.buId===b.id?'selected':''}>${b.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Geographies</label>
                <div class="tag-input-wrap" id="ti-wizard-geographies"></div>
                <div class="citation-chips" style="margin-top:10px">
                  ${GEOGRAPHY_OPTIONS.map(option => `<button type="button" class="chip wizard-geo-chip" data-geo="${option}">${option}</button>`).join('')}
                </div>
                <span class="form-help">Select all countries or regions relevant to this scenario. Applicable regulations will update from the combined footprint.</span>
              </div>
            </div>
            <div class="context-grid mt-4">
              <div class="context-chip-panel">
                <div class="context-panel-title">Risk Appetite</div>
                <p class="context-panel-copy">${settings.riskAppetiteStatement}</p>
                <div class="context-panel-foot">Current P90 per-event tolerance: ${fmtCurrency(getToleranceThreshold())}. Warning trigger: ${fmtCurrency(getWarningThreshold())}.</div>
              </div>
              <div class="context-chip-panel">
                <div class="context-panel-title">Applicable Regulations</div>
                <div class="citation-chips">
                  ${regs.map(tag => `<span class="badge badge--gold">${tag}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="card anim-fade-in anim-delay-1">
            <div class="admin-section-head" style="margin-bottom:var(--sp-5)">
              <div>
                <h3>Guided Input for Non-Specialists</h3>
                <p>Answer the simple questions below. The platform will turn them into a structured risk statement for you.</p>
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label" for="guided-event">What happened or what could happen?</label>
                <textarea class="form-textarea" id="guided-event" rows="3" placeholder="Example: a supplier with privileged access could be compromised">${draft.guidedInput?.event || ''}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label" for="guided-asset">What is affected?</label>
                <input class="form-input" id="guided-asset" type="text" placeholder="Example: payment platform, HR system, cloud data store" value="${draft.guidedInput?.asset || ''}">
              </div>
              <div class="form-group">
                <label class="form-label" for="guided-cause">What is the likely cause or trigger?</label>
                <input class="form-input" id="guided-cause" type="text" placeholder="Example: supplier breach, human error, phishing, control gap" value="${draft.guidedInput?.cause || ''}">
              </div>
              <div class="form-group">
                <label class="form-label" for="guided-impact">What is the main impact you care about?</label>
                <input class="form-input" id="guided-impact" type="text" placeholder="Example: outage, regulatory breach, customer loss, financial exposure" value="${draft.guidedInput?.impact || ''}">
              </div>
            </div>
            <div class="grid-2 mt-4">
              <div class="form-group">
                <label class="form-label" for="guided-urgency">How urgent does it feel?</label>
                <select class="form-select" id="guided-urgency">
                  <option value="low" ${draft.guidedInput?.urgency === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${!draft.guidedInput?.urgency || draft.guidedInput?.urgency === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${draft.guidedInput?.urgency === 'high' ? 'selected' : ''}>High</option>
                  <option value="critical" ${draft.guidedInput?.urgency === 'critical' ? 'selected' : ''}>Critical</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Quick Start Prompts</label>
                <div class="citation-chips">
                  <button class="citation-chip guided-prompt-chip" data-prompt="Supplier compromise affecting a regulated platform">Supplier compromise</button>
                  <button class="citation-chip guided-prompt-chip" data-prompt="Cloud misconfiguration exposing sensitive data">Cloud exposure</button>
                  <button class="citation-chip guided-prompt-chip" data-prompt="Ransomware disrupting critical business services">Ransomware outage</button>
                </div>
              </div>
            </div>
            <div class="admin-inline-actions mt-4">
              <button class="btn btn--secondary" id="btn-build-guided-narrative" type="button">Build Risk Statement from Answers</button>
              <span class="form-help">You can still edit the generated statement manually afterwards.</span>
            </div>
            <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-elevated)">
              <div class="context-panel-title">Generated Statement Preview</div>
              <p class="context-panel-copy" id="guided-preview">${composeGuidedNarrative(draft.guidedInput) || 'Complete the guided questions and click “Build Risk Statement from Answers”.'}</p>
            </div>
          </div>

          <div class="card anim-fade-in anim-delay-1">
            <div class="form-group">
              <label class="form-label" for="intake-risk-statement">Risk Statement</label>
              <textarea class="form-textarea" id="intake-risk-statement" rows="6" placeholder="Describe the risk in plain English. Include what could happen, the affected platform or service, likely triggers, and the business or regulatory impact.">${draft.narrative || ''}</textarea>
            </div>
            <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
              <button class="btn btn--secondary" id="btn-enhance-risk-statement" type="button">Enhance with AI</button>
              <span class="form-help">Refines the typed risk statement, adds nuance, and extracts candidate risks you can choose from.</span>
            </div>
            <div class="grid-2 mt-5">
              <div class="form-group">
                <label class="form-label" for="risk-register-file">Risk Register Upload</label>
                <input class="form-input" id="risk-register-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls">
                <div class="form-help">${draft.uploadedRegisterName ? `Current file: ${draft.uploadedRegisterName}${draft.registerMeta?.sheetCount ? ` · ${draft.registerMeta.sheetCount} sheet(s)` : ''}` : 'Upload TXT, CSV, TSV, JSON, Markdown, or Excel. Word and PDF still need conversion before upload.'}</div>
                <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
                  <button class="btn btn--primary" id="btn-register-analyse">Upload, Extract, Analyse &amp; Enhance Risks</button>
                  <span class="form-help">Processes the uploaded file and proposes candidate risks for selection.</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="manual-risk-add">Add Risk Manually</label>
                <div class="inline-action-row">
                  <input class="form-input" id="manual-risk-add" type="text" placeholder="e.g. Export control screening failure">
                  <button class="btn btn--secondary" id="btn-add-manual-risk" type="button">Add</button>
                </div>
                <div class="form-help" style="margin-top:10px">Manual risks are added to the same candidate list and selected by default.</div>
              </div>
            </div>
            <p class="form-help mt-4">Uses runtime AI if a key has been set with <code>LLMService.setOpenAIKey(...)</code>. Otherwise the local extraction stub is used.</p>
          </div>

          <div id="intake-output">
            ${draft.intakeSummary ? `<div class="card card--glow anim-fade-in"><div class="context-panel-title">AI Intake Summary</div><p class="context-panel-copy">${draft.intakeSummary}</p>${draft.linkAnalysis ? `<div class="context-panel-foot">${draft.linkAnalysis}</div>` : ''}</div>` : ''}
          </div>

          <div class="card anim-fade-in anim-delay-2">
            <div class="flex items-center justify-between mb-4" style="flex-wrap:wrap;gap:var(--sp-3)">
              <div>
                <div class="context-panel-title">Select Risks To Analyse</div>
                <p class="context-panel-copy">Review the extracted and manual risks below, then tick the ones you want to carry into the assessment.</p>
              </div>
              <label class="toggle-row">
                <span class="toggle-label">Treat as linked scenario</span>
                <label class="toggle"><input type="checkbox" id="linked-risks-toggle" ${draft.linkedRisks ? 'checked' : ''}><div class="toggle-track"></div></label>
              </label>
            </div>
            <div id="selected-risks-wrap">
              ${renderSelectedRiskCards(riskCandidates, selectedRisks, regs)}
            </div>
          </div>
        </div>
        <div class="wizard-footer">
          <a class="btn btn--ghost" href="#/">← Home</a>
          <button class="btn btn--primary" id="btn-next-1">Next: Refine Scenario →</button>
        </div>
      </div>
    </main>`);

  document.getElementById('wizard-bu').addEventListener('change', function() {
    const bu = buList.find(b => b.id === this.value) || null;
    AppState.draft.buId = bu?.id || null;
    AppState.draft.buName = bu?.name || null;
    AppState.draft.applicableRegulations = deriveApplicableRegulations(bu, getSelectedRisks(), getScenarioGeographies());
    saveDraft();
    renderWizard1();
  });
  const syncWizardGeographies = nextGeographies => {
    AppState.draft.geographies = normaliseScenarioGeographies(nextGeographies, settings.geography);
    AppState.draft.geography = formatScenarioGeographies(AppState.draft.geographies, settings.geography);
    AppState.draft.applicableRegulations = deriveApplicableRegulations(buList.find(b => b.id === AppState.draft.buId), getSelectedRisks(), AppState.draft.geographies);
    saveDraft();
    renderWizard1();
  };
  const wizardGeographyInput = UI.tagInput('ti-wizard-geographies', scenarioGeographies, syncWizardGeographies);
  document.querySelectorAll('.wizard-geo-chip').forEach(button => {
    button.addEventListener('click', () => {
      const next = Array.from(new Set([...(wizardGeographyInput.getTags() || []), button.dataset.geo]));
      wizardGeographyInput.setTags(next);
    });
  });
  ['event', 'asset', 'cause', 'impact'].forEach(key => {
    document.getElementById(`guided-${key}`).addEventListener('input', function() {
      AppState.draft.guidedInput[key] = this.value;
      document.getElementById('guided-preview').textContent = composeGuidedNarrative(AppState.draft.guidedInput) || 'Complete the guided questions and click “Build Risk Statement from Answers”.';
    });
  });
  document.getElementById('guided-urgency').addEventListener('change', function() {
    AppState.draft.guidedInput.urgency = this.value;
    document.getElementById('guided-preview').textContent = composeGuidedNarrative(AppState.draft.guidedInput) || 'Complete the guided questions and click “Build Risk Statement from Answers”.';
  });
  document.getElementById('intake-risk-statement').addEventListener('input', function() {
    AppState.draft.narrative = this.value;
    AppState.draft.sourceNarrative = this.value;
  });
  document.getElementById('btn-build-guided-narrative').addEventListener('click', () => {
    const composed = composeGuidedNarrative(AppState.draft.guidedInput);
    if (!composed) {
      UI.toast('Answer at least one guided question first.', 'warning');
      return;
    }
    AppState.draft.narrative = composed;
    AppState.draft.sourceNarrative = composed;
    document.getElementById('intake-risk-statement').value = composed;
    saveDraft();
    UI.toast('Risk statement created from guided answers.', 'success');
  });
  document.querySelectorAll('.guided-prompt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.draft.guidedInput.event = btn.dataset.prompt;
      document.getElementById('guided-event').value = btn.dataset.prompt;
      document.getElementById('guided-preview').textContent = composeGuidedNarrative(AppState.draft.guidedInput);
    });
  });
  document.getElementById('linked-risks-toggle').addEventListener('change', function() {
    AppState.draft.linkedRisks = this.checked;
    saveDraft();
  });
  document.getElementById('btn-add-manual-risk').addEventListener('click', () => {
    const input = document.getElementById('manual-risk-add');
    const value = input.value.trim();
    if (!value) return;
    appendRiskCandidates([{ title: value, category: 'Manual', source: 'manual' }], { selectNew: true });
    AppState.draft.applicableRegulations = deriveApplicableRegulations(buList.find(b => b.id === AppState.draft.buId), getSelectedRisks(), getScenarioGeographies());
    input.value = '';
    saveDraft();
    renderWizard1();
  });
  document.getElementById('risk-register-file').addEventListener('change', handleRegisterUpload);
  document.getElementById('btn-enhance-risk-statement').addEventListener('click', enhanceNarrativeWithAI);
  document.getElementById('btn-register-analyse').addEventListener('click', analyseUploadedRegister);
  document.getElementById('btn-next-1').addEventListener('click', () => {
    const buId = document.getElementById('wizard-bu').value;
    const narrative = document.getElementById('intake-risk-statement').value.trim();
    const selected = getSelectedRisks();
    if (!buId) { UI.toast('Please select a business unit.', 'warning'); return; }
    if (!narrative) {
      const composed = composeGuidedNarrative(AppState.draft.guidedInput);
      if (composed) {
        AppState.draft.narrative = composed;
        AppState.draft.sourceNarrative = composed;
        document.getElementById('intake-risk-statement').value = composed;
      }
    }
    if (!AppState.draft.narrative.trim() && !selected.length) { UI.toast('Please complete the guided questions, enter a risk statement, or select at least one risk.', 'warning'); return; }
    AppState.draft.geographies = normaliseScenarioGeographies(wizardGeographyInput.getTags(), settings.geography);
    AppState.draft.geography = formatScenarioGeographies(AppState.draft.geographies, settings.geography);
    AppState.draft.narrative = AppState.draft.narrative.trim();
    AppState.draft.sourceNarrative = normaliseScenarioSeedText(AppState.draft.sourceNarrative || AppState.draft.narrative);
    AppState.draft.enhancedNarrative = AppState.draft.enhancedNarrative || AppState.draft.narrative;
    AppState.draft.applicableRegulations = deriveApplicableRegulations(buList.find(b => b.id === buId), selected, AppState.draft.geographies);
    if (!AppState.draft.scenarioTitle) {
      AppState.draft.scenarioTitle = selected.length === 1 ? selected[0].title : `${selected.length || 1}-risk scenario for ${AppState.draft.buName}`;
    }
    saveDraft();
    Router.navigate('/wizard/2');
  });

  bindRiskCardActions();
}

function renderSelectedRiskCards(riskCandidates, selectedRisks, regulations) {
  const cleanedRisks = (riskCandidates || []).filter(risk => !isNoiseRiskText(risk.title) && risk.title !== '-');
  const selectedIds = new Set((selectedRisks || []).map(risk => risk.id));
  const sourceLabel = risk => risk.source === 'manual' ? 'Manual' : risk.source === 'register' || risk.source === 'ai+register' ? 'Upload' : 'AI generated';
  if (!cleanedRisks.length) {
    return `<div class="empty-state">No candidate risks yet. Use AI enhancement, upload a register, or add risks manually.</div>`;
  }
  const linkedRecommendations = getLinkedRiskRecommendations(selectedRisks || []);
  return `${linkedRecommendations.length ? `<div class="card mb-4" style="background:var(--bg-elevated)"><div class="context-panel-title">Suggested linked-risk groupings</div><div style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-3)">${linkedRecommendations.map(group => `<div><div style="font-size:.78rem;font-weight:600;color:var(--text-primary)">${group.label}</div><div class="context-panel-copy" style="margin-top:4px">${group.risks.join(', ')}</div></div>`).join('')}</div><div class="context-panel-foot">${AppState.draft.linkAnalysis || 'Treat these as linked where one control or event could trigger the others in the same scenario.'}</div></div>` : ''}
  <div class="flex items-center gap-3 mb-4" style="flex-wrap:wrap">
    <button class="btn btn--ghost btn--sm" id="btn-select-all-risks" type="button">Select All</button>
    <button class="btn btn--ghost btn--sm" id="btn-clear-all-risks" type="button">Clear All</button>
    <span class="form-help">${selectedRisks.length} of ${cleanedRisks.length} selected for analysis.</span>
  </div>
  <div class="risk-selection-grid">
    ${cleanedRisks.map(risk => `
      <div class="risk-pick-card">
        <div class="risk-pick-head" style="align-items:flex-start">
          <label style="display:flex;gap:12px;align-items:flex-start;flex:1;cursor:pointer">
            <input type="checkbox" class="risk-select-checkbox" data-risk-id="${risk.id}" ${selectedIds.has(risk.id) ? 'checked' : ''} style="margin-top:4px">
            <div>
              <div class="risk-pick-title">${risk.title}</div>
              <div class="risk-pick-badges">
                <span class="risk-pick-badge">${risk.category}</span>
                <span class="risk-pick-badge risk-pick-badge--source">${sourceLabel(risk)}</span>
              </div>
            </div>
          </label>
          <button class="btn btn--ghost btn--sm btn-remove-risk" data-risk-id="${risk.id}" type="button">Remove</button>
        </div>
        ${risk.description ? `<p class="risk-pick-desc">${risk.description}</p>` : ''}
        <div class="citation-chips">
          ${(risk.regulations || []).length ? risk.regulations.slice(0, 4).map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('') : regulations.slice(0, 2).map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function bindRiskCardActions() {
  document.querySelectorAll('.risk-select-checkbox').forEach(box => {
    box.addEventListener('change', () => {
      const selectedIds = new Set(Array.isArray(AppState.draft.selectedRiskIds) ? AppState.draft.selectedRiskIds : []);
      if (box.checked) selectedIds.add(box.dataset.riskId);
      else selectedIds.delete(box.dataset.riskId);
      AppState.draft.selectedRiskIds = Array.from(selectedIds);
      syncRiskSelection();
      AppState.draft.applicableRegulations = deriveApplicableRegulations(getBUList().find(b => b.id === AppState.draft.buId), getSelectedRisks(), getScenarioGeographies());
      saveDraft();
      renderWizard1();
    });
  });
  document.getElementById('btn-select-all-risks')?.addEventListener('click', () => {
    AppState.draft.selectedRiskIds = getRiskCandidates().map(risk => risk.id);
    syncRiskSelection();
    AppState.draft.applicableRegulations = deriveApplicableRegulations(getBUList().find(b => b.id === AppState.draft.buId), getSelectedRisks(), getScenarioGeographies());
    saveDraft();
    renderWizard1();
  });
  document.getElementById('btn-clear-all-risks')?.addEventListener('click', () => {
    AppState.draft.selectedRiskIds = [];
    syncRiskSelection();
    AppState.draft.applicableRegulations = deriveApplicableRegulations(getBUList().find(b => b.id === AppState.draft.buId), getSelectedRisks(), getScenarioGeographies());
    saveDraft();
    renderWizard1();
  });
  document.querySelectorAll('.btn-remove-risk').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.draft.riskCandidates = getRiskCandidates().filter(r => r.id !== btn.dataset.riskId);
      AppState.draft.selectedRiskIds = (AppState.draft.selectedRiskIds || []).filter(id => id !== btn.dataset.riskId);
      syncRiskSelection();
      AppState.draft.applicableRegulations = deriveApplicableRegulations(getBUList().find(b => b.id === AppState.draft.buId), getSelectedRisks(), getScenarioGeographies());
      saveDraft();
      renderWizard1();
    });
  });
}

async function handleRegisterUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const ext = getFileExtension(file.name);
  const unsupported = ['docx', 'pptx', 'pdf', 'zip'];
  if (unsupported.includes(ext)) {
    AppState.draft.uploadedRegisterName = '';
    AppState.draft.registerFindings = '';
    AppState.draft.registerMeta = null;
    saveDraft();
    e.target.value = '';
    UI.toast('This file type is not supported for direct browser parsing. Please export the register as Excel, TXT, CSV, TSV, JSON, or Markdown first.', 'warning', 7000);
    return;
  }
  const parsed = await parseRegisterFile(file);
  if (looksLikeBinaryRegister(parsed.text) && !['xlsx', 'xls'].includes(ext)) {
    AppState.draft.uploadedRegisterName = '';
    AppState.draft.registerFindings = '';
    AppState.draft.registerMeta = null;
    saveDraft();
    e.target.value = '';
    UI.toast('The uploaded file appears to be binary or unreadable. Please convert it to Excel, TXT, CSV, TSV, JSON, or Markdown before uploading.', 'warning', 7000);
    return;
  }
  AppState.draft.uploadedRegisterName = file.name;
  AppState.draft.registerFindings = parsed.text;
  AppState.draft.registerMeta = parsed.meta;
  saveDraft();
  const sheetInfo = parsed.meta?.sheetCount > 1 ? ` (${parsed.meta.sheetCount} sheets parsed)` : '';
  UI.toast(`Loaded ${file.name}${sheetInfo}.`, 'success');
}

async function runIntakeAssist() {
  const narrative = document.getElementById('intake-risk-statement')?.value.trim() || AppState.draft.narrative || '';
  const assistSeed = getIntakeAssistSeedNarrative(narrative || AppState.draft.registerFindings);
  const output = document.getElementById('intake-output');
  const bu = getBUList().find(b => b.id === (document.getElementById('wizard-bu')?.value || AppState.draft.buId));
  if (!narrative && !AppState.draft.registerFindings) {
    UI.toast('Add a risk statement or upload a risk register first.', 'warning');
    return;
  }
  output.innerHTML = `<div class="card">${UI.skeletonBlock(18)}<div class="mt-3">${UI.skeletonBlock(14, 4)}</div><div class="mt-3">${UI.skeletonBlock(90, 10)}</div></div>`;
  try {
    const citations = await RAGService.retrieveRelevantDocs(bu?.id, assistSeed || AppState.draft.registerFindings, 5);
    const result = await LLMService.enhanceRiskContext({
      riskStatement: assistSeed || narrative,
      registerText: AppState.draft.registerFindings,
      registerMeta: AppState.draft.registerMeta,
      businessUnit: bu,
      geography: formatScenarioGeographies(getScenarioGeographies()),
      applicableRegulations: deriveApplicableRegulations(bu, getSelectedRisks(), getScenarioGeographies()),
      guidedInput: { ...AppState.draft.guidedInput },
      citations,
      adminSettings: {
        ...getEffectiveSettings(),
        companyStructureContext: buildOrganisationContextSummary(getAdminSettings())
      }
    });
    const nextNarrative = result.enhancedStatement || narrative;
    AppState.draft.llmAssisted = true;
    AppState.draft.sourceNarrative = assistSeed || narrative;
    AppState.draft.narrative = assistSeed || narrative;
    AppState.draft.enhancedNarrative = nextNarrative;
    AppState.draft.intakeSummary = result.summary || '';
    AppState.draft.linkAnalysis = result.linkAnalysis || '';
    AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : AppState.draft.workflowGuidance;
    AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis;
    appendRiskCandidates(result.risks || guessRisksFromText(narrative + '\n' + AppState.draft.registerFindings), { selectNew: true });
    AppState.draft.applicableRegulations = Array.from(new Set([...(deriveApplicableRegulations(bu, getSelectedRisks(), getScenarioGeographies()) || []), ...(result.regulations || [])]));
    AppState.draft.citations = normaliseCitations(result.citations || citations);
    if (!AppState.draft.scenarioTitle && getSelectedRisks()[0]) AppState.draft.scenarioTitle = getSelectedRisks()[0].title;
    saveDraft();
    renderWizard1();
    UI.toast('AI intake completed.', 'success');
  } catch (e1) {
    output.innerHTML = `<div class="banner banner--danger"><span class="banner-icon">⚠</span><span class="banner-text">AI intake error: ${e1.message}</span></div>`;
  }
}

async function enhanceNarrativeWithAI() {
  const narrative = document.getElementById('intake-risk-statement')?.value.trim() || AppState.draft.narrative || '';
  const assistSeed = getIntakeAssistSeedNarrative(narrative);
  const output = document.getElementById('intake-output');
  const bu = getBUList().find(b => b.id === (document.getElementById('wizard-bu')?.value || AppState.draft.buId));
  if (!narrative) {
    UI.toast('Enter a risk statement first.', 'warning');
    return;
  }
  const button = document.getElementById('btn-enhance-risk-statement');
  button.disabled = true;
  button.textContent = 'Enhancing…';
  output.innerHTML = `<div class="card">${UI.skeletonBlock(18)}<div class="mt-3">${UI.skeletonBlock(14, 4)}</div><div class="mt-3">${UI.skeletonBlock(90, 10)}</div></div>`;
  try {
    const citations = await RAGService.retrieveRelevantDocs(bu?.id, assistSeed || narrative, 5);
    const result = await LLMService.enhanceRiskContext({
      riskStatement: assistSeed || narrative,
      registerText: '',
      registerMeta: null,
      businessUnit: bu,
      geography: formatScenarioGeographies(getScenarioGeographies()),
      applicableRegulations: deriveApplicableRegulations(bu, getSelectedRisks(), getScenarioGeographies()),
      guidedInput: { ...AppState.draft.guidedInput },
      citations,
      adminSettings: {
        ...getEffectiveSettings(),
        companyStructureContext: buildOrganisationContextSummary(getAdminSettings())
      }
    });
    const nextNarrative = result.enhancedStatement || narrative;
    AppState.draft.llmAssisted = true;
    AppState.draft.sourceNarrative = assistSeed || narrative;
    AppState.draft.narrative = assistSeed || narrative;
    AppState.draft.enhancedNarrative = nextNarrative;
    AppState.draft.intakeSummary = result.summary || AppState.draft.intakeSummary;
    AppState.draft.linkAnalysis = result.linkAnalysis || AppState.draft.linkAnalysis;
    AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : AppState.draft.workflowGuidance;
    AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis;
    AppState.draft.citations = normaliseCitations(result.citations || citations);
    appendRiskCandidates(result.risks || guessRisksFromText(nextNarrative), { selectNew: true });
    AppState.draft.applicableRegulations = Array.from(new Set([...(deriveApplicableRegulations(bu, getSelectedRisks(), getScenarioGeographies()) || []), ...(result.regulations || [])]));
    if (!AppState.draft.scenarioTitle && getSelectedRisks()[0]) AppState.draft.scenarioTitle = getSelectedRisks()[0].title;
    saveDraft();
    renderWizard1();
    UI.toast('Risk statement enhanced.', 'success');
  } catch (error) {
    output.innerHTML = `<div class="banner banner--danger"><span class="banner-icon">⚠</span><span class="banner-text">AI enhancement error: ${error.message}</span></div>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Enhance with AI';
  }
}

async function analyseUploadedRegister() {
  if (!AppState.draft.registerFindings) {
    UI.toast('Upload a risk register first.', 'warning');
    return;
  }
  if (looksLikeBinaryRegister(AppState.draft.registerFindings)) {
    UI.toast('This uploaded file still looks binary and cannot be analysed safely. Please convert it to TXT, CSV, TSV, JSON, or Markdown.', 'warning', 7000);
    return;
  }
  const bu = getBUList().find(b => b.id === AppState.draft.buId);
  try {
    const result = await LLMService.analyseRiskRegister({
      registerText: AppState.draft.registerFindings,
      registerMeta: AppState.draft.registerMeta,
      businessUnit: bu,
      geography: formatScenarioGeographies(getScenarioGeographies()),
      applicableRegulations: AppState.draft.applicableRegulations || [],
      adminSettings: {
        ...getEffectiveSettings(),
        companyStructureContext: buildOrganisationContextSummary(getAdminSettings())
      }
    });
    const parsedFallback = parseRegisterText(AppState.draft.registerFindings).map(title => ({ title, source: 'register' }));
    const extractedRisks = result.risks || parsedFallback;
    if (!extractedRisks.length) {
      UI.toast('No usable risk lines were found in that file. Try a cleaner TXT/CSV export or paste the risks directly.', 'warning', 7000);
      return;
    }
    appendRiskCandidates(extractedRisks, { selectNew: true });
    const workbookSummary = AppState.draft.registerMeta?.sheetCount > 1 ? ` across ${AppState.draft.registerMeta.sheetCount} sheets` : '';
    AppState.draft.intakeSummary = result.summary || `Extracted ${getSelectedRisks().length} risks from ${AppState.draft.uploadedRegisterName}${workbookSummary}.`;
    AppState.draft.linkAnalysis = result.linkAnalysis || AppState.draft.linkAnalysis;
    AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : AppState.draft.workflowGuidance;
    AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis;
    saveDraft();
    renderWizard1();
    UI.toast('Risk register analysed.', 'success');
  } catch (e2) {
    UI.toast('Register analysis failed: ' + e2.message, 'danger');
  }
}

// ─── WIZARD 2 ─────────────────────────────────────────────────
function renderWizard2() {
  const draft = AppState.draft;
  const selectedRisks = getSelectedRisks();
  setPage(`
    <main class="page">
      <div class="wizard-layout container container--narrow">
        <div class="wizard-header">
          ${UI.renderStepper(2)}
          <h2 class="wizard-step-title">Refine the Scenario</h2>
          <p class="wizard-step-desc">Review the AI-built context, refine the narrative, and confirm how the selected risks should be quantified together.</p>
        </div>
        <div class="wizard-body">
          <div class="card card--elevated anim-fade-in">
            <div class="context-panel-title">What to do on this step</div>
            <div class="context-grid">
              <div class="context-chip-panel">
                <div class="context-panel-title">1. Read the draft</div>
                <p class="context-panel-copy">Check that the scenario describes the event, the affected asset, the likely cause, and the impact you care about.</p>
              </div>
              <div class="context-chip-panel">
                <div class="context-panel-title">2. Improve if needed</div>
                <p class="context-panel-copy">Edit the wording in plain English. You do not need formal risk language.</p>
              </div>
              <div class="context-chip-panel">
                <div class="context-panel-title">3. Use AI assist if useful</div>
                <p class="context-panel-copy">AI assist will structure the scenario and prepare FAIR inputs for the next step.</p>
              </div>
            </div>
          </div>
          ${draft.workflowGuidance?.length ? renderWorkflowGuidanceBlock(draft.workflowGuidance, 'What AI recommends you do next') : ''}
          ${selectedRisks.length ? `<div class="card card--elevated anim-fade-in"><div class="context-panel-title">Selected Risks</div><div class="citation-chips">${selectedRisks.map(r => `<span class="badge badge--neutral">${r.title}</span>`).join('')}</div><div class="context-panel-foot">${draft.linkedRisks && selectedRisks.length > 1 ? 'Linked scenario uplift will be applied in the simulation.' : 'Risks will be assessed as a combined scenario without linked uplift.'}</div></div>` : ''}
          ${draft.benchmarkBasis ? `<div class="card anim-fade-in"><div class="context-panel-title">Benchmark Approach</div><p class="context-panel-copy">${draft.benchmarkBasis}</p></div>` : ''}
          <div class="card anim-fade-in">
            <div class="form-group">
              <label class="form-label" for="narrative">Risk Scenario Narrative <span class="required">*</span></label>
              <textarea class="form-textarea" id="narrative" rows="5" placeholder="Describe the risk: What could happen? Who might cause it? What assets are at risk? What are the potential impacts?" style="min-height:160px">${draft.enhancedNarrative || draft.narrative || ''}</textarea>
            </div>
          </div>
          <div class="card anim-fade-in anim-delay-1">
            <div style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:var(--sp-4)">Optional Structured Fields</div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label" for="asset-service">Asset / Service</label>
                <input class="form-input" id="asset-service" type="text" placeholder="e.g. Payment gateway" value="${draft.structuredScenario?.assetService||''}">
              </div>
              <div class="form-group">
                <label class="form-label" for="threat-type">Threat Type</label>
                <select class="form-select" id="threat-type">
                  <option value="">— Select —</option>
                  ${['Ransomware','Data Breach / Exfiltration','Phishing / BEC','Cloud Misconfiguration','Insider Threat','Supply Chain','DDoS','Zero-day Exploit'].map(t=>`<option value="${t}">${t}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="anim-fade-in anim-delay-2">
            <button class="btn btn--primary" id="btn-llm-assist" style="width:100%;justify-content:center;padding:14px">
              <span id="llm-btn-text">🤖 LLM Assist — Draft Scenario &amp; Suggest FAIR Inputs</span>
            </button>
            <p style="text-align:center;font-size:.75rem;color:var(--text-muted);margin-top:8px">Retrieves relevant internal docs and uses AI to suggest FAIR inputs with citations.</p>
          </div>
          <div id="llm-output-area"></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn--ghost" id="btn-back-2">← Back</button>
          <button class="btn btn--primary" id="btn-next-2">Next: FAIR Inputs →</button>
        </div>
      </div>
    </main>`);

  document.getElementById('btn-back-2').addEventListener('click', () => Router.navigate('/wizard/1'));
  document.getElementById('narrative').addEventListener('input', function() {
    AppState.draft.enhancedNarrative = this.value;
    if (!AppState.draft.narrative) AppState.draft.narrative = this.value;
  });
  document.getElementById('btn-llm-assist').addEventListener('click', runLLMAssist);
  document.getElementById('btn-next-2').addEventListener('click', () => {
    const n = document.getElementById('narrative').value.trim();
    if (!n) { UI.toast('Please enter a risk narrative.', 'warning'); return; }
    AppState.draft.enhancedNarrative = n;
    AppState.draft.narrative = AppState.draft.narrative || n;
    saveDraft(); Router.navigate('/wizard/3');
  });
  attachCitationHandlers();
}

async function runLLMAssist() {
  const narrative = document.getElementById('narrative').value.trim();
  if (!narrative) { UI.toast('Please enter a narrative first.', 'warning'); return; }
  const assistSeed = getScenarioAssistSeedNarrative(narrative);
  const btn = document.getElementById('btn-llm-assist');
  const btnText = document.getElementById('llm-btn-text');
  const output = document.getElementById('llm-output-area');
  btn.disabled = true; btn.classList.add('loading');
  btnText.textContent = '⏳ Retrieving docs and generating inputs…';
  output.innerHTML = `<div class="card mt-4">${UI.skeletonBlock(20)}<div style="margin-top:12px">${UI.skeletonBlock(14,4)}</div><div style="margin-top:8px">${UI.skeletonBlock(14,4)}</div></div>`;
  try {
    const bu = getBUList().find(b => b.id === AppState.draft.buId);
    const scenarioText = buildScenarioNarrative(assistSeed);
    const citations = await RAGService.retrieveRelevantDocs(AppState.draft.buId, scenarioText);
    const result = await LLMService.generateScenarioAndInputs(scenarioText, {
      ...bu,
      regulatoryTags: deriveApplicableRegulations(bu, getSelectedRisks(), getScenarioGeographies()),
      geography: formatScenarioGeographies(getScenarioGeographies()),
      benchmarkStrategy: getEffectiveSettings().benchmarkStrategy,
      companyContextProfile: getEffectiveSettings().companyContextProfile,
      companyStructureContext: buildOrganisationContextSummary(getAdminSettings())
    }, citations);
    AppState.draft.scenarioTitle = result.scenarioTitle;
    AppState.draft.structuredScenario = result.structuredScenario;
    AppState.draft.llmAssisted = true;
    AppState.draft.enhancedNarrative = narrative;
    AppState.draft.citations = normaliseCitations(result.citations || citations);
    AppState.draft.recommendations = result.recommendations || [];
    AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : AppState.draft.workflowGuidance;
    AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis;
    AppState.draft.inputRationale = result.inputRationale || AppState.draft.inputRationale;
    const s = result.suggestedInputs;
    if (s) {
      const currentFair = AppState.draft.fairParams || {};
      const lc = s.lossComponents || {};
      AppState.draft.fairParams = {
        ...currentFair,
        tefMin: s.TEF?.min ?? currentFair.tefMin,
        tefLikely: s.TEF?.likely ?? currentFair.tefLikely,
        tefMax: s.TEF?.max ?? currentFair.tefMax,
        controlStrMin: s.controlStrength?.min ?? currentFair.controlStrMin,
        controlStrLikely: s.controlStrength?.likely ?? currentFair.controlStrLikely,
        controlStrMax: s.controlStrength?.max ?? currentFair.controlStrMax,
        threatCapMin: s.threatCapability?.min ?? currentFair.threatCapMin,
        threatCapLikely: s.threatCapability?.likely ?? currentFair.threatCapLikely,
        threatCapMax: s.threatCapability?.max ?? currentFair.threatCapMax,
        irMin: lc.incidentResponse?.min ?? currentFair.irMin,
        irLikely: lc.incidentResponse?.likely ?? currentFair.irLikely,
        irMax: lc.incidentResponse?.max ?? currentFair.irMax,
        biMin: lc.businessInterruption?.min ?? currentFair.biMin,
        biLikely: lc.businessInterruption?.likely ?? currentFair.biLikely,
        biMax: lc.businessInterruption?.max ?? currentFair.biMax,
        dbMin: lc.dataBreachRemediation?.min ?? currentFair.dbMin,
        dbLikely: lc.dataBreachRemediation?.likely ?? currentFair.dbLikely,
        dbMax: lc.dataBreachRemediation?.max ?? currentFair.dbMax,
        rlMin: lc.regulatoryLegal?.min ?? currentFair.rlMin,
        rlLikely: lc.regulatoryLegal?.likely ?? currentFair.rlLikely,
        rlMax: lc.regulatoryLegal?.max ?? currentFair.rlMax,
        tpMin: lc.thirdPartyLiability?.min ?? currentFair.tpMin,
        tpLikely: lc.thirdPartyLiability?.likely ?? currentFair.tpLikely,
        tpMax: lc.thirdPartyLiability?.max ?? currentFair.tpMax,
        rcMin: lc.reputationContract?.min ?? currentFair.rcMin,
        rcLikely: lc.reputationContract?.likely ?? currentFair.rcLikely,
        rcMax: lc.reputationContract?.max ?? currentFair.rcMax,
      };
    }
    saveDraft();
    output.innerHTML = `<div class="card card--glow mt-4 anim-fade-in">
      <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4)">
        <span style="font-size:24px">✅</span>
        <div>
          <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700;color:var(--text-primary)">${result.scenarioTitle}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">AI-structured · FAIR inputs pre-loaded to Step 3</div>
        </div>
      </div>
      ${result.structuredScenario?`<div class="grid-2"><div><div class="form-label" style="font-size:.7rem">Threat Community</div><p style="font-size:.85rem;margin-top:4px">${result.structuredScenario.threatCommunity}</p></div><div><div class="form-label" style="font-size:.7rem">Attack Vector</div><p style="font-size:.85rem;margin-top:4px">${result.structuredScenario.attackType}</p></div></div>`:''}
    </div>${renderWorkflowGuidanceBlock(AppState.draft.workflowGuidance, 'What AI thinks you should do next')}${renderBenchmarkRationaleBlock(AppState.draft.benchmarkBasis, AppState.draft.inputRationale)}${renderCitationBlock(AppState.draft.citations)}`;
    attachCitationHandlers();
  } catch(e) {
    output.innerHTML = `<div class="banner banner--danger mt-4"><span class="banner-icon">⚠</span><span class="banner-text">LLM Assist error: ${e.message}</span></div>`;
  }
  btn.disabled = false; btn.classList.remove('loading');
  btnText.innerHTML = '🤖 LLM Assist — Draft Scenario &amp; Suggest FAIR Inputs';
}

function renderCitationBlock(citations) {
  const unique = normaliseCitations(citations);
  if (!unique.length) return '';
  return `<div class="card mt-4 anim-fade-in">
    <div class="context-panel-title">📚 Citations — Internal Documents</div>
    <div class="citation-chips">
      ${unique.map(c=>`<button class="citation-chip" data-doc-id="${c.docId}"><span class="citation-chip-icon">📄</span>${c.title}</button>`).join('')}
    </div>
  </div>`;
}

function renderWorkflowGuidanceBlock(items, title = 'AI Guidance Through the Workflow') {
  if (!items?.length) return '';
  return `<div class="card card--elevated anim-fade-in">
    <div class="context-panel-title">${title}</div>
    <div style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-4)">
      ${items.map((item, idx) => `<div style="display:flex;gap:var(--sp-3);align-items:flex-start"><span class="badge badge--gold" style="min-width:28px;justify-content:center">${idx + 1}</span><div class="context-panel-copy" style="margin:0">${item}</div></div>`).join('')}
    </div>
  </div>`;
}

function renderBenchmarkRationaleBlock(benchmarkBasis, inputRationale) {
  if (!benchmarkBasis && !inputRationale) return '';
  const rows = [
    ['Benchmark basis', benchmarkBasis],
    ['Why TEF looks like this', inputRationale?.tef],
    ['Why vulnerability looks like this', inputRationale?.vulnerability],
    ['Why the loss ranges look like this', inputRationale?.lossComponents]
  ].filter(([, value]) => value);
  return `<div class="card card--elevated anim-fade-in">
    <div class="context-panel-title">Benchmark Logic and Number Rationale</div>
    <div style="display:flex;flex-direction:column;gap:var(--sp-4);margin-top:var(--sp-4)">
      ${rows.map(([label, value]) => `<div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">${label}</div><div style="font-size:.85rem;color:var(--text-secondary);margin-top:6px;line-height:1.7">${value}</div></div>`).join('')}
    </div>
  </div>`;
}

function formatPlainCurrency(value, currency = 'USD') {
  const amount = Number(value || 0);
  if (currency === 'AED') {
    return `AED ${Math.round(amount * AppState.fxRate).toLocaleString('en-AE')}`;
  }
  return `USD ${Math.round(amount).toLocaleString('en-US')}`;
}

function describeExposureBand(value) {
  const num = Number(value || 0);
  if (num <= 0.25) return 'low chance of succeeding';
  if (num <= 0.5) return 'meaningful but not easy to pull off';
  if (num <= 0.75) return 'plausible if the attacker is capable';
  return 'highly plausible unless controls hold up well';
}

function buildEstimateExplainer(draft, bu, isAdv, currency) {
  const p = draft.fairParams || {};
  const hasAI = !!draft.llmAssisted;
  const tef = [p.tefMin, p.tefLikely, p.tefMax].every(v => v != null)
    ? `AI is currently assuming this could happen between ${p.tefMin} and ${p.tefMax} times per year, with ${p.tefLikely} as the most realistic planning case.`
    : 'Use the range to describe how often this could happen in a quiet year, a typical year, and a severe but still plausible year.';
  const exposure = isAdv && p.vulnDirect
    ? ([p.vulnMin, p.vulnLikely, p.vulnMax].every(v => v != null)
      ? `The direct exposure values mean the event has roughly a ${Math.round((p.vulnMin || 0) * 100)}% to ${Math.round((p.vulnMax || 0) * 100)}% chance of succeeding if attempted, with ${Math.round((p.vulnLikely || 0) * 100)}% as the working case.`
      : 'Direct exposure means you are estimating the chance that the event succeeds if attempted.')
    : ([p.threatCapLikely, p.controlStrLikely].every(v => v != null)
      ? `In basic mode, these numbers are split into attacker capability and control strength. Right now the AI is saying the attacker looks ${describeExposureBand(p.threatCapLikely)} while your controls look ${describeExposureBand(1 - (p.controlStrLikely || 0)) === 'low chance of succeeding' ? 'stronger than average' : 'material but not absolute'}.`
      : 'In basic mode, you do not estimate exposure directly. You describe attacker capability and how strong your controls are, and the model derives exposure from that.')
  const likelyLoss = ['irLikely','biLikely','dbLikely','rlLikely','tpLikely','rcLikely'].reduce((sum, key) => sum + Number(p[key] || 0), 0);
  const severeLoss = ['irMax','biMax','dbMax','rlMax','tpMax','rcMax'].reduce((sum, key) => sum + Number(p[key] || 0), 0);
  const loss = likelyLoss || severeLoss
    ? `Using the current values, the model reads this as roughly ${formatPlainCurrency(likelyLoss, currency)} in a realistic single-event case, rising to about ${formatPlainCurrency(severeLoss, currency)} in a severe case before annual frequency is applied.`
    : 'Each cost row is a per-event estimate. The model adds those rows together to understand what one event might cost before frequency is applied across a year.';
  const source = hasAI
    ? `These starting numbers were pre-filled from the scenario narrative, selected risks, ${bu?.name ? `${bu.name} context and defaults, ` : ''}any linked internal citations, and FAIR-style benchmark logic. They are starting assumptions, not final answers.`
    : `These are your working assumptions. If you have internal incident data, control evidence, or finance input, adjust the ranges to reflect that evidence.`;
  return { source, tef, exposure, loss };
}

function renderEstimateExplainerCard(draft, bu, isAdv, currency) {
  const explainer = buildEstimateExplainer(draft, bu, isAdv, currency);
  return `<div class="card card--elevated anim-fade-in">
    <div class="context-panel-title">What These AI Values Mean</div>
    <div style="display:flex;flex-direction:column;gap:var(--sp-4);margin-top:var(--sp-3)">
      <div class="context-chip-panel">
        <div class="context-panel-title">Where the starting values came from</div>
        <p class="context-panel-copy">${explainer.source}</p>
      </div>
      <div class="context-grid">
        <div class="context-chip-panel">
          <div class="context-panel-title">Frequency</div>
          <p class="context-panel-copy">${explainer.tef}</p>
        </div>
        <div class="context-chip-panel">
          <div class="context-panel-title">Exposure</div>
          <p class="context-panel-copy">${explainer.exposure}</p>
        </div>
        <div class="context-chip-panel">
          <div class="context-panel-title">Cost</div>
          <p class="context-panel-copy">${explainer.loss}</p>
        </div>
      </div>
      <div class="context-panel-foot">Read the three columns as: low case = quieter outcome, expected case = planning assumption, severe case = bad but still plausible outcome. You are not trying to predict one perfect number.</div>
    </div>
  </div>`;
}

function attachCitationHandlers() {
  document.querySelectorAll('.citation-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      const doc = getDocList().find(d => d.id === docId) || AppState.draft.citations?.find(c => c.docId === docId);
      if (doc) UI.citationModal({ title: doc.title, excerpt: doc.contentExcerpt || doc.excerpt, tags: doc.tags||[], lastUpdated: doc.lastUpdated, url: doc.url });
    });
  });
}

// ─── WIZARD 3 ─────────────────────────────────────────────────
function renderWizard3() {
  const draft = AppState.draft;
  const p = draft.fairParams || {};
  const bu = getBUList().find(b => b.id === draft.buId);
  const da = bu?.defaultAssumptions || {};
  const isAdv = AppState.mode === 'advanced';
  const cur = AppState.currency;
  const sym = cur === 'AED' ? 'AED' : 'USD $';

  const v = (key, def) => p[key] != null ? p[key] : def;

  setPage(`
    <main class="page">
      <div class="wizard-layout container container--narrow">
        <div class="wizard-header">
          ${UI.renderStepper(3)}
          <div class="flex items-center justify-between">
            <div>
              <h2 class="wizard-step-title">Estimate the Scenario in Plain Language</h2>
              <p class="wizard-step-desc">Answer a few practical questions about how often this could happen, how exposed you are, and what the impact could cost. ${draft.llmAssisted?'<span style="color:var(--color-success-400)">✓ Pre-loaded from AI assist</span>':''}</p>
            </div>
            <div class="mode-toggle">
              <button class="${!isAdv?'active':''}" id="mode-basic">Basic</button>
              <button class="${isAdv?'active':''}" id="mode-advanced">Advanced</button>
            </div>
          </div>
        </div>
        <div class="wizard-body">
          ${draft.learningNote ? `<div class="card card--elevated anim-fade-in"><div class="context-panel-title">Template learning</div><p class="context-panel-copy">${draft.learningNote}</p></div>` : ''}
          ${draft.workflowGuidance?.length ? renderWorkflowGuidanceBlock(draft.workflowGuidance) : ''}
          ${renderBenchmarkRationaleBlock(draft.benchmarkBasis, draft.inputRationale)}
          ${renderEstimateExplainerCard(draft, bu, isAdv, cur)}

          <div class="card card--elevated anim-fade-in">
            <div class="context-panel-title">How to complete this step</div>
            <div class="context-grid">
              <div class="context-chip-panel">
                <div class="context-panel-title">1. Start with the AI values</div>
                <p class="context-panel-copy">If the AI suggestions look broadly right, adjust only the values you have evidence for.</p>
              </div>
              <div class="context-chip-panel">
                <div class="context-panel-title">2. Think in ranges, not exact numbers</div>
                <p class="context-panel-copy">Use a low, expected, and severe case. You do not need one perfect number.</p>
              </div>
              <div class="context-chip-panel">
                <div class="context-panel-title">3. Stay in Basic unless needed</div>
                <p class="context-panel-copy">Advanced mode is for direct probability inputs, correlations, and simulation tuning.</p>
              </div>
            </div>
          </div>

          <div class="card anim-fade-in">
            <h3 style="margin-bottom:var(--sp-2);font-size:var(--text-base)">How often could this happen? <span data-tooltip="How many times per year this type of event could realistically occur." style="cursor:help;color:var(--color-accent-300);font-size:.8rem">ⓘ</span></h3>
            <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">Enter the number of events you think could happen in a year. Use a cautious low case, your expected case, and a severe but plausible high case.</p>
            ${tripleInput('tef','Threat Event Frequency', v('tefMin',da.TEF?.min||0.5), v('tefLikely',da.TEF?.likely||2), v('tefMax',da.TEF?.max||8), { minLabel: 'Low case', likelyLabel: 'Expected case', maxLabel: 'High case' })}
          </div>

          <div class="card anim-fade-in anim-delay-1">
            <h3 style="margin-bottom:var(--sp-2);font-size:var(--text-base)">How exposed are you if it happens? <span data-tooltip="This estimates how likely the event is to succeed given attacker capability and current controls." style="cursor:help;color:var(--color-accent-300);font-size:.8rem">ⓘ</span></h3>
            <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">In Basic mode, answer this through attacker strength and control strength. In Advanced mode, you can enter vulnerability directly.</p>
            ${isAdv?`<div class="flex items-center gap-3 mb-4"><label class="toggle"><input type="checkbox" id="vuln-direct-toggle" ${p.vulnDirect?'checked':''}><div class="toggle-track"></div></label><span class="toggle-label">Enter exposure directly</span></div>
            <div id="vuln-direct-section" ${!p.vulnDirect?'class="hidden"':''}>
              <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">Use a value between 0 and 1, where 0 means very unlikely to succeed and 1 means almost certain to succeed.</p>
              ${tripleInput('vuln','Vulnerability', v('vulnMin',0.1), v('vulnLikely',0.35), v('vulnMax',0.7), { minLabel: 'Low success chance', likelyLabel: 'Expected success chance', maxLabel: 'High success chance' })}
            </div>`:''}
            <div id="vuln-derived-section" ${isAdv&&p.vulnDirect?'class="hidden"':''}>
              <div class="grid-2">
                <div>
                  <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">How capable is the attacker or threat source? 0 means weak or opportunistic, 1 means very capable and well resourced.</p>
                  ${tripleInput('threatCap','Threat capability', v('threatCapMin',da.threatCapability?.min||0.45), v('threatCapLikely',da.threatCapability?.likely||0.62), v('threatCapMax',da.threatCapability?.max||0.82), { minLabel: 'Low capability', likelyLabel: 'Expected capability', maxLabel: 'High capability' })}
                </div>
                <div>
                  <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">How strong are your current preventive and detective controls? 0 means weak, 1 means strong and consistently effective.</p>
                  ${tripleInput('controlStr','Control strength', v('controlStrMin',da.controlStrength?.min||0.5), v('controlStrLikely',da.controlStrength?.likely||0.68), v('controlStrMax',da.controlStrength?.max||0.85), { minLabel: 'Weak controls', likelyLabel: 'Expected control strength', maxLabel: 'Strong controls' })}
                </div>
              </div>
            </div>
          </div>

          <div class="card anim-fade-in anim-delay-2">
            <h3 style="margin-bottom:var(--sp-2);font-size:var(--text-base)">What could this cost if it happens?</h3>
            <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:var(--sp-5)">For each cost area, enter a low, expected, and severe per-event estimate in ${sym}. These values are added together in the simulation.</p>
            <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
              ${lossRow('ir','Response and recovery cost', v('irMin',da.incidentResponse?.min||50000), v('irLikely',da.incidentResponse?.likely||180000), v('irMax',da.incidentResponse?.max||600000), 'Containment, forensics, internal recovery effort, and external incident response support.')}
              ${lossRow('bi','Business disruption cost', v('biMin',da.businessInterruption?.min||100000), v('biLikely',da.businessInterruption?.likely||450000), v('biMax',da.businessInterruption?.max||2500000), 'Lost revenue, delayed operations, and productivity impact while the issue is active.')}
              ${lossRow('db','Data remediation cost', v('dbMin',da.dataBreachRemediation?.min||30000), v('dbLikely',da.dataBreachRemediation?.likely||120000), v('dbMax',da.dataBreachRemediation?.max||500000), 'Notification, monitoring, remediation, and cleanup when data is affected.')}
              ${lossRow('rl','Regulatory and legal cost', v('rlMin',da.regulatoryLegal?.min||0), v('rlLikely',da.regulatoryLegal?.likely||80000), v('rlMax',da.regulatoryLegal?.max||800000), 'Fines, legal support, regulatory response, and formal notices.')}
              ${lossRow('tp','Third-party impact cost', v('tpMin',da.thirdPartyLiability?.min||0), v('tpLikely',da.thirdPartyLiability?.likely||50000), v('tpMax',da.thirdPartyLiability?.max||400000), 'Claims, service credits, or compensation for partners and customers.')}
              ${lossRow('rc','Reputation and contract cost', v('rcMin',da.reputationContract?.min||50000), v('rcLikely',da.reputationContract?.likely||200000), v('rcMax',da.reputationContract?.max||1200000), 'Customer churn, commercial loss, and contract penalties after the event.')}
            </div>
          </div>

          <div class="card anim-fade-in anim-delay-3">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 style="font-size:var(--text-base)">Extra downstream impact <span class="badge badge--neutral" style="margin-left:6px">Optional</span></h3>
                <p style="font-size:.78rem;color:var(--text-muted)">Use this only if the main event could trigger another follow-on loss, such as a lawsuit, major partner claim, or wider business consequence.</p>
              </div>
              <label class="toggle"><input type="checkbox" id="secondary-toggle" ${p.secondaryEnabled?'checked':''}><div class="toggle-track"></div></label>
            </div>
            <div id="secondary-inputs" ${!p.secondaryEnabled?'class="hidden"':''}>
              <div class="grid-2">
                <div><p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">How likely is the follow-on impact? Use 0 to 1.</p>${tripleInput('secProb','Secondary probability', v('secProbMin',0.1), v('secProbLikely',0.3), v('secProbMax',0.7), { minLabel: 'Low chance', likelyLabel: 'Expected chance', maxLabel: 'High chance' })}</div>
                <div><p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">If it happens, how large could that extra impact be in ${sym}?</p>${tripleInput('secMag','Secondary magnitude', v('secMagMin',100000), v('secMagLikely',500000), v('secMagMax',2000000), { minLabel: 'Low cost', likelyLabel: 'Expected cost', maxLabel: 'High cost', money: true, inputType: 'text' })}</div>
              </div>
            </div>
          </div>

          ${isAdv?`
          <div class="card anim-fade-in">
            <h3 style="margin-bottom:var(--sp-4);font-size:var(--text-base)">Advanced Simulation Settings</h3>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Distribution Type <span data-tooltip="Triangular: intuitive. Lognormal: heavier right tail (better for cyber)." style="cursor:help;color:var(--color-accent-300)">ⓘ</span></label>
                <select class="form-select" id="adv-dist">
                  <option value="triangular" ${(p.distType||'triangular')==='triangular'?'selected':''}>Triangular</option>
                  <option value="lognormal" ${p.distType==='lognormal'?'selected':''}>Lognormal</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Iterations</label>
                <input class="form-input" id="adv-iter" type="number" min="1000" max="100000" step="1000" value="${p.iterations||10000}">
              </div>
              <div class="form-group">
                <label class="form-label">Random Seed <span class="text-muted text-xs">(reproducibility)</span></label>
                <input class="form-input" id="adv-seed" type="number" placeholder="Leave empty for random" value="${p.seed||''}">
              </div>
              <div class="form-group">
                <label class="form-label">Correlations <span data-tooltip="BI-IR: Business Interruption & IR correlation. RL-RC: Regulatory & Reputation." style="cursor:help;color:var(--color-accent-300)">ⓘ</span></label>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
                  <label style="font-size:.72rem;color:var(--text-muted)">BI↔IR</label>
                  <input class="form-input" id="corr-bi-ir" type="number" min="-1" max="1" step="0.05" value="${p.corrBiIr||0.3}" style="width:72px">
                  <label style="font-size:.72rem;color:var(--text-muted)">Reg↔Rep</label>
                  <input class="form-input" id="corr-rl-rc" type="number" min="-1" max="1" step="0.05" value="${p.corrRlRc||0.2}" style="width:72px">
                </div>
              </div>
            </div>
          </div>`:''}

        </div>
        <div class="wizard-footer">
          <button class="btn btn--ghost" id="btn-back-3">← Back</button>
          <button class="btn btn--primary" id="btn-next-3">Next: Review →</button>
        </div>
      </div>
    </main>`);

  document.getElementById('mode-basic')?.addEventListener('click', () => { AppState.mode='basic'; renderWizard3(); });
  document.getElementById('mode-advanced')?.addEventListener('click', () => { AppState.mode='advanced'; renderWizard3(); });
  document.getElementById('secondary-toggle').addEventListener('change', function() {
    document.getElementById('secondary-inputs').classList.toggle('hidden', !this.checked);
    AppState.draft.fairParams.secondaryEnabled = this.checked;
  });
  document.getElementById('vuln-direct-toggle')?.addEventListener('change', function() {
    document.getElementById('vuln-direct-section')?.classList.toggle('hidden', !this.checked);
    document.getElementById('vuln-derived-section')?.classList.toggle('hidden', this.checked);
    AppState.draft.fairParams.vulnDirect = this.checked;
  });
  attachFormattedMoneyInputs();
  document.getElementById('btn-back-3').addEventListener('click', () => Router.navigate('/wizard/2'));
  document.getElementById('btn-next-3').addEventListener('click', () => {
    collectFairParams();
    if (!validateFairParams()) return;
    saveDraft(); Router.navigate('/wizard/4');
  });
}

function tripleInput(prefix, label, min, likely, max, labels = {}) {
  const minLabel = labels.minLabel || 'Min';
  const likelyLabel = labels.likelyLabel || 'Most Likely';
  const maxLabel = labels.maxLabel || 'Max';
  const inputType = labels.inputType || 'number';
  const inputClass = labels.money ? 'form-input fair-input money-input' : 'form-input fair-input';
  const stepAttr = inputType === 'number' ? ' step="any"' : '';
  const inputMode = labels.money ? 'decimal' : (labels.inputMode || 'decimal');
  const formatValue = value => labels.money ? formatGroupedNumber(value) : value;
  return `<div class="range-group">
    <div class="form-group"><div class="range-col-label">${minLabel}</div><input class="${inputClass}" id="${prefix}-min" data-key="${prefix}Min" type="${inputType}"${stepAttr} inputmode="${inputMode}" value="${formatValue(min)}" aria-label="${label} min"></div>
    <div class="form-group"><div class="range-col-label" style="color:var(--color-primary-300)">${likelyLabel}</div><input class="${inputClass}" id="${prefix}-likely" data-key="${prefix}Likely" type="${inputType}"${stepAttr} inputmode="${inputMode}" value="${formatValue(likely)}" aria-label="${label} likely"></div>
    <div class="form-group"><div class="range-col-label">${maxLabel}</div><input class="${inputClass}" id="${prefix}-max" data-key="${prefix}Max" type="${inputType}"${stepAttr} inputmode="${inputMode}" value="${formatValue(max)}" aria-label="${label} max"></div>
  </div>`;
}

function lossRow(prefix, label, min, likely, max, tooltip) {
  return `<div>
    <div style="font-size:.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:6px">${label}<span data-tooltip="${tooltip}" style="cursor:help;color:var(--color-accent-300);font-size:.72rem">ⓘ</span></div>
    ${tripleInput(prefix, label, min, likely, max, { minLabel: 'Low cost', likelyLabel: 'Expected cost', maxLabel: 'Severe cost', money: true, inputType: 'text' })}
  </div>`;
}

function collectFairParams() {
  const p = AppState.draft.fairParams;
  document.querySelectorAll('.fair-input').forEach(input => {
    const val = parseFlexibleNumber(input.value);
    if (!Number.isNaN(val)) p[input.dataset.key] = val;
  });
  const dist = document.getElementById('adv-dist');
  const iter = document.getElementById('adv-iter');
  const seed = document.getElementById('adv-seed');
  const cbir = document.getElementById('corr-bi-ir');
  const crlr = document.getElementById('corr-rl-rc');
  if (dist) p.distType = dist.value;
  if (iter) p.iterations = parseInt(iter.value) || 10000;
  if (seed) p.seed = seed.value ? parseInt(seed.value) : null;
  if (cbir) p.corrBiIr = parseFloat(cbir.value) || 0.3;
  if (crlr) p.corrRlRc = parseFloat(crlr.value) || 0.2;
  p.secondaryEnabled = document.getElementById('secondary-toggle')?.checked || false;
  p.distType = p.distType || 'triangular';
}

function averageRange(min, likely, max) {
  const values = [min, likely, max].map(Number).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateRelativeRange(min, likely, max) {
  const mn = Number(min);
  const lk = Number(likely);
  const mx = Number(max);
  if (![mn, lk, mx].every(Number.isFinite)) return 1;
  const baseline = Math.max(Math.abs(lk), 1);
  return Math.max(0, (mx - mn) / baseline);
}

function buildAssessmentConfidence(draft, results, modelInputs, scenarioMeta) {
  let score = 58;
  const citations = Array.isArray(draft.citations) ? draft.citations.length : 0;
  const selectedRisks = Array.isArray(draft.selectedRisks) ? draft.selectedRisks.length : 0;
  const hasStructuredScenario = !!draft.structuredScenario;
  const aiAssisted = !!draft.llmAssisted;
  const tefRange = calculateRelativeRange(modelInputs.tefMin, modelInputs.tefLikely, modelInputs.tefMax);
  const lossLikely = ['irLikely','biLikely','dbLikely','rlLikely','tpLikely','rcLikely'].reduce((sum, key) => sum + Number(modelInputs[key] || 0), 0);
  const lossMin = ['irMin','biMin','dbMin','rlMin','tpMin','rcMin'].reduce((sum, key) => sum + Number(modelInputs[key] || 0), 0);
  const lossMax = ['irMax','biMax','dbMax','rlMax','tpMax','rcMax'].reduce((sum, key) => sum + Number(modelInputs[key] || 0), 0);
  const lossRange = calculateRelativeRange(lossMin, lossLikely, lossMax);
  const reasons = [];
  const improvements = [];

  if (hasStructuredScenario) { score += 8; reasons.push('The scenario has been structured into asset, threat, attack type, and effect.'); }
  else improvements.push('Capture a more structured scenario definition so the estimate is anchored to one clear event path.');

  if (citations >= 2) { score += 8; reasons.push('Internal citations or source material are linked to the assessment.'); }
  else improvements.push('Add internal documents, incident evidence, or control references to strengthen the basis for the numbers.');

  if (selectedRisks >= 2) { score += 4; reasons.push('The scenario scope has been linked to multiple selected risks rather than a single generic risk statement.'); }

  if (aiAssisted) { score -= 4; reasons.push('Some starting values were AI-assisted, so they should still be treated as analyst-reviewed assumptions rather than facts.'); }

  if (tefRange <= 1.5) { score += 8; reasons.push('The event-frequency range is reasonably tight, which improves confidence in the annual view.'); }
  else { score -= 10; improvements.push('Tighten the event-frequency range using internal incident history or SME input.'); }

  if (lossRange <= 2.5) { score += 8; reasons.push('The loss ranges are not excessively wide, which makes the result more decision-useful.'); }
  else { score -= 12; improvements.push('Narrow the loss ranges, especially business interruption and response cost, with finance or operations input.'); }

  if (scenarioMeta?.linked) {
    score -= 4;
    reasons.push('This is a linked multi-risk scenario, so combined uplift adds more uncertainty than a single isolated scenario.');
  }

  if (results?.iterations >= 10000) score += 2;

  score = Math.max(18, Math.min(92, score));
  let label = 'Moderate confidence';
  if (score >= 75) label = 'High confidence';
  else if (score <= 44) label = 'Low confidence';

  const summary = label === 'High confidence'
    ? 'This assessment is well formed for decision support, although it is still based on modelled ranges rather than certainty.'
    : label === 'Low confidence'
      ? 'This result is directionally useful, but the ranges and evidence base are still too loose for strong decision-making.'
      : 'This assessment is useful for management discussion, but some assumptions still need tightening before stronger reliance.';

  return {
    score,
    label,
    summary,
    reasons: reasons.slice(0, 4),
    improvements: improvements.slice(0, 3)
  };
}

function buildAssessmentAssumptions(draft, results, modelInputs, scenarioMeta) {
  const assumptions = [];
  const geography = draft.geography || 'the selected geography';
  const asset = draft.structuredScenario?.assetService || 'the affected service';
  const threatCommunity = draft.structuredScenario?.threatCommunity || 'the relevant threat actor set';
  assumptions.push({ category: 'Scenario', text: `Assumes ${asset} remains the main point of impact across ${geography}.` });
  assumptions.push({ category: 'Threat', text: `Assumes ${threatCommunity} remains a realistic source of this scenario during the assessment period.` });
  assumptions.push({ category: 'Frequency', text: `Assumes the event could occur between ${modelInputs.tefMin ?? '—'} and ${modelInputs.tefMax ?? '—'} times per year, with ${modelInputs.tefLikely ?? '—'} as the working case after any linked-scenario uplift.` });
  if (modelInputs.vulnDirect) assumptions.push({ category: 'Exposure', text: `Assumes direct event success remains within the stated exposure range rather than changing materially because of control drift or attacker capability changes.` });
  else assumptions.push({ category: 'Exposure', text: `Assumes current control strength and attacker capability are reasonably represented by the selected FAIR ranges.` });
  assumptions.push({ category: 'Loss', text: `Assumes business interruption, response, legal, data, third-party, and reputation impacts can be represented as per-event ranges rather than one fixed value.` });
  if (scenarioMeta?.linked) assumptions.push({ category: 'Portfolio', text: 'Assumes the selected linked risks can escalate together and justify the applied scenario uplift in frequency and loss.' });
  if (Array.isArray(draft.applicableRegulations) && draft.applicableRegulations.length) assumptions.push({ category: 'Regulatory', text: `Assumes the currently selected regulatory set remains the most relevant set for this scenario: ${draft.applicableRegulations.slice(0, 4).join(', ')}${draft.applicableRegulations.length > 4 ? ' and others' : ''}.` });
  return assumptions.slice(0, 6);
}

function buildAssessmentDrivers(draft, results, modelInputs) {
  const upward = [];
  const stabilisers = [];
  const lossDrivers = [
    ['Business interruption', averageRange(modelInputs.biMin, modelInputs.biLikely, modelInputs.biMax)],
    ['Response and recovery', averageRange(modelInputs.irMin, modelInputs.irLikely, modelInputs.irMax)],
    ['Reputation and contract', averageRange(modelInputs.rcMin, modelInputs.rcLikely, modelInputs.rcMax)],
    ['Regulatory and legal', averageRange(modelInputs.rlMin, modelInputs.rlLikely, modelInputs.rlMax)],
    ['Data remediation', averageRange(modelInputs.dbMin, modelInputs.dbLikely, modelInputs.dbMax)],
    ['Third-party impact', averageRange(modelInputs.tpMin, modelInputs.tpLikely, modelInputs.tpMax)]
  ].sort((a, b) => b[1] - a[1]);

  if ((modelInputs.tefLikely || 0) >= 3) upward.push(`Threat frequency is materially lifting annual exposure because the working case assumes about ${modelInputs.tefLikely} events per year.`);
  if ((modelInputs.controlStrLikely ?? 1) <= 0.55) upward.push('Control strength is a major driver upward because the current controls are not strong enough to suppress event success consistently.');
  if (lossDrivers[0]?.[1] > 0) upward.push(`${lossDrivers[0][0]} is one of the biggest cost drivers in the current scenario.`);
  if (lossDrivers[1]?.[1] > 0) upward.push(`${lossDrivers[1][0]} is also materially contributing to the modelled loss range.`);
  if (modelInputs.secondaryEnabled) upward.push('Secondary loss is enabled, which increases the tail of the loss distribution.');
  if (results?.portfolioMeta?.linked) upward.push('Linked-risk uplift is increasing both frequency and loss because the scenario is being treated as connected rather than isolated.');

  if ((modelInputs.controlStrLikely ?? 0) >= 0.7) stabilisers.push('Current control strength is helping contain the scenario and reduce success likelihood.');
  if ((modelInputs.tefLikely || 0) <= 1) stabilisers.push('The working frequency assumption is relatively low, which helps contain annual exposure.');
  if (!modelInputs.secondaryEnabled) stabilisers.push('Secondary loss is disabled, so the model is not adding a follow-on loss tail beyond the primary event.');
  if ((modelInputs.rlLikely || 0) < (modelInputs.biLikely || 0)) stabilisers.push('Regulatory and legal costs are not the dominant driver in the current estimate.');

  return {
    upward: upward.slice(0, 4),
    stabilisers: stabilisers.slice(0, 3)
  };
}

function buildAssessmentIntelligence(draft, results, modelInputs, scenarioMeta) {
  return {
    confidence: buildAssessmentConfidence(draft, results, modelInputs, scenarioMeta),
    assumptions: buildAssessmentAssumptions(draft, results, modelInputs, scenarioMeta),
    drivers: buildAssessmentDrivers(draft, results, modelInputs)
  };
}

function renderAssessmentConfidenceBlock(confidence) {
  if (!confidence) return '';
  const badgeClass = confidence.label === 'High confidence' ? 'badge--success' : confidence.label === 'Low confidence' ? 'badge--danger' : 'badge--warning';
  return `<div class="results-decision-card">
    <div class="results-section-heading">Confidence in this assessment</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);flex-wrap:wrap">
      <span class="badge ${badgeClass}">${confidence.label}</span>
      <strong style="font-family:var(--font-display);font-size:var(--text-lg);color:var(--text-primary)">${confidence.score}/100</strong>
    </div>
    <p class="results-decision-copy" style="margin-top:var(--sp-3)">${confidence.summary}</p>
    ${confidence.reasons?.length ? `<div class="results-decision-row"><span class="results-decision-label">Why it scored this way</span><div class="results-decision-copy">${confidence.reasons.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
    ${confidence.improvements?.length ? `<div class="results-decision-row"><span class="results-decision-label">What would improve confidence</span><div class="results-decision-copy">${confidence.improvements.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
  </div>`;
}

function renderAssessmentDriversBlock(drivers) {
  if (!drivers) return '';
  return `<div class="results-summary-card">
    <div class="results-section-heading">What is driving the result</div>
    ${drivers.upward?.length ? `<div class="results-driver-group"><div class="results-driver-label">Main upward drivers</div><div class="results-summary-copy">${drivers.upward.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
    ${drivers.stabilisers?.length ? `<div class="results-driver-group" style="margin-top:var(--sp-4)"><div class="results-driver-label">Main stabilisers</div><div class="results-summary-copy">${drivers.stabilisers.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
  </div>`;
}

function renderAssessmentAssumptionsBlock(assumptions) {
  if (!assumptions?.length) return '';
  return `<section class="results-section-stack">
    <div class="results-section-heading">Key assumptions behind the result</div>
    <div class="results-assumptions-grid">
      ${assumptions.map(item => `<div class="results-assumption-card"><div class="results-assumption-label">${item.category}</div><div class="results-assumption-copy">${item.text}</div></div>`).join('')}
    </div>
  </section>`;
}

function validateFairParams() {
  const p = AppState.draft.fairParams;
  const checks = [['tef','TEF'],['ir','IR'],['bi','BI'],['db','DB'],['rl','RL'],['tp','TP'],['rc','RC']];
  for (const [k, label] of checks) {
    const mn=p[k+'Min'], ml=p[k+'Likely'], mx=p[k+'Max'];
    if (mn==null||ml==null||mx==null) { UI.toast(`${label}: all three values required.`,'danger'); return false; }
    if (mn>ml||ml>mx) { UI.toast(`${label}: must be min ≤ likely ≤ max.`,'danger'); return false; }
  }
  return true;
}

// ─── WIZARD 4 ─────────────────────────────────────────────────
function renderWizard4() {
  const draft = AppState.draft;
  const p = draft.fairParams;
  const selectedRisks = getSelectedRisks();
  const multipliers = getScenarioMultipliers();
  setPage(`
    <main class="page">
      <div class="wizard-layout container container--narrow">
        <div class="wizard-header">
          ${UI.renderStepper(4)}
          <h2 class="wizard-step-title">Review &amp; Run Simulation</h2>
          <p class="wizard-step-desc">Review your inputs, then run the Monte Carlo simulation.</p>
        </div>
        <div class="wizard-body">
          <div class="card card--elevated anim-fade-in">
            <div style="display:flex;align-items:center;gap:var(--sp-4);margin-bottom:var(--sp-5)">
              <div style="width:48px;height:48px;background:rgba(26,86,219,.15);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🏢</div>
              <div>
                <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)">Business Unit</div>
                <div style="font-size:var(--text-lg);font-weight:600;font-family:var(--font-display)">${draft.buName||'—'}</div>
              </div>
            </div>
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:var(--sp-2)">Scenario</div>
            <div style="font-size:var(--text-base);font-weight:600;font-family:var(--font-display);margin-bottom:var(--sp-3)">${draft.scenarioTitle||'Untitled'}</div>
            <p style="font-size:.85rem;color:var(--text-secondary);line-height:1.7">${(draft.enhancedNarrative || draft.narrative || '').substring(0,280)}${(draft.enhancedNarrative || draft.narrative || '').length>280?'…':''}</p>
            ${draft.llmAssisted?'<span class="badge badge--success" style="margin-top:12px">✓ AI-Assisted</span>':''}
            ${selectedRisks.length ? `<div class="mt-4"><div class="context-panel-title">Scenario Scope</div><div class="citation-chips">${selectedRisks.map(r => `<span class="badge badge--neutral">${r.title}</span>`).join('')}</div><div class="context-panel-foot">${multipliers.linked ? `${selectedRisks.length} linked risks selected. Uplift is being applied to TEF and loss components.` : `${selectedRisks.length} risks selected. Combined scenario, no linked uplift.`}</div></div>` : ''}
          </div>
          <div class="card anim-fade-in anim-delay-1">
            <h3 style="font-size:var(--text-base);margin-bottom:var(--sp-4)">Key Parameters</h3>
            <div class="grid-3">
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">TEF</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${p.tefMin}–${p.tefLikely}–${p.tefMax}</div><div style="font-size:.7rem;color:var(--text-muted)">events/year</div></div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Threat Cap</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${p.threatCapMin}–${p.threatCapLikely}–${p.threatCapMax}</div><div style="font-size:.7rem;color:var(--text-muted)">0–1 scale</div></div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Control Str</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${p.controlStrMin}–${p.controlStrLikely}–${p.controlStrMax}</div><div style="font-size:.7rem;color:var(--text-muted)">0–1 scale</div></div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">IR & Recovery</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${fmtCurrency(p.irMin)}–${fmtCurrency(p.irMax)}</div></div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Business Int.</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${fmtCurrency(p.biMin)}–${fmtCurrency(p.biMax)}</div></div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Reg & Legal</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${fmtCurrency(p.rlMin)}–${fmtCurrency(p.rlMax)}</div></div>
            </div>
            <div class="mt-4" style="font-size:.78rem;color:var(--text-muted)">Iterations: <strong>${p.iterations||10000}</strong> · Distribution: <strong>${p.distType||'triangular'}</strong> · Threshold: <strong>${fmtCurrency(getToleranceThreshold())}</strong> · Geography: <strong>${draft.geography || '—'}</strong></div>
            ${draft.applicableRegulations?.length ? `<div class="citation-chips mt-3">${draft.applicableRegulations.map(tag => `<span class="badge badge--gold">${tag}</span>`).join('')}</div>` : ''}
          </div>
          <div class="banner banner--poc anim-fade-in anim-delay-2"><span class="banner-icon">⚠</span><span class="banner-text">PoC tool. FAIR input ranges should be validated through expert elicitation for production risk decisions.</span></div>
          <div id="run-area">
            <button class="btn btn--primary btn--lg" id="btn-run-sim" style="width:100%;justify-content:center">🚀 Run Monte Carlo Simulation (${p.iterations||10000} iterations)</button>
          </div>
          <div id="sim-progress" class="hidden">
            <div class="card" style="text-align:center;padding:var(--sp-10)">
              <div style="font-size:48px;margin-bottom:var(--sp-4);animation:spin 1s linear infinite">⚙️</div>
              <div style="font-family:var(--font-display);font-size:var(--text-xl);margin-bottom:var(--sp-2)">Running Simulation…</div>
              <div style="font-size:var(--text-sm);color:var(--text-muted)">Computing ${p.iterations||10000} Monte Carlo iterations…</div>
            </div>
          </div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn--ghost" id="btn-back-4">← Back</button>
        </div>
      </div>
    </main>
    <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>`);

  document.getElementById('btn-back-4').addEventListener('click', () => Router.navigate('/wizard/3'));
  document.getElementById('btn-run-sim').addEventListener('click', runSimulation);
}

async function runSimulation() {
  document.getElementById('run-area').classList.add('hidden');
  document.getElementById('sim-progress').classList.remove('hidden');
  await new Promise(r => setTimeout(r, 80));
  try {
    const p = AppState.draft.fairParams;
    const scenario = getScenarioMultipliers();
    const toleranceThreshold = getToleranceThreshold();
    const warningThreshold = getWarningThreshold();
    const annualReviewThreshold = getAnnualReviewThreshold();
    const fxMul = AppState.currency === 'AED' ? (1 / AppState.fxRate) : 1;
    const toUSD = v => (v||0) * fxMul;
    const ep = {
      distType: p.distType||'triangular', iterations: p.iterations||10000, seed: p.seed||null,
      tefMin: p.tefMin * scenario.tefMultiplier, tefLikely: p.tefLikely * scenario.tefMultiplier, tefMax: p.tefMax * scenario.tefMultiplier,
      vulnDirect: p.vulnDirect||false,
      vulnMin: p.vulnMin, vulnLikely: p.vulnLikely, vulnMax: p.vulnMax,
      threatCapMin: p.threatCapMin, threatCapLikely: p.threatCapLikely, threatCapMax: p.threatCapMax,
      controlStrMin: p.controlStrMin, controlStrLikely: p.controlStrLikely, controlStrMax: p.controlStrMax,
      irMin: toUSD(p.irMin) * scenario.lossMultiplier, irLikely: toUSD(p.irLikely) * scenario.lossMultiplier, irMax: toUSD(p.irMax) * scenario.lossMultiplier,
      biMin: toUSD(p.biMin) * scenario.lossMultiplier, biLikely: toUSD(p.biLikely) * scenario.lossMultiplier, biMax: toUSD(p.biMax) * scenario.lossMultiplier,
      dbMin: toUSD(p.dbMin) * scenario.lossMultiplier, dbLikely: toUSD(p.dbLikely) * scenario.lossMultiplier, dbMax: toUSD(p.dbMax) * scenario.lossMultiplier,
      rlMin: toUSD(p.rlMin) * scenario.lossMultiplier, rlLikely: toUSD(p.rlLikely) * scenario.lossMultiplier, rlMax: toUSD(p.rlMax) * scenario.lossMultiplier,
      tpMin: toUSD(p.tpMin) * scenario.lossMultiplier, tpLikely: toUSD(p.tpLikely) * scenario.lossMultiplier, tpMax: toUSD(p.tpMax) * scenario.lossMultiplier,
      rcMin: toUSD(p.rcMin) * scenario.lossMultiplier, rcLikely: toUSD(p.rcLikely) * scenario.lossMultiplier, rcMax: toUSD(p.rcMax) * scenario.lossMultiplier,
      corrBiIr: p.corrBiIr||0.3, corrRlRc: p.corrRlRc||0.2,
      secondaryEnabled: p.secondaryEnabled||false,
      secProbMin: Math.min(1, (p.secProbMin || 0) * scenario.secondaryMultiplier), secProbLikely: Math.min(1, (p.secProbLikely || 0) * scenario.secondaryMultiplier), secProbMax: Math.min(1, (p.secProbMax || 0) * scenario.secondaryMultiplier),
      secMagMin: toUSD(p.secMagMin) * scenario.lossMultiplier, secMagLikely: toUSD(p.secMagLikely) * scenario.lossMultiplier, secMagMax: toUSD(p.secMagMax) * scenario.lossMultiplier,
      threshold: toleranceThreshold
    };
    const results = RiskEngine.run(ep);
    results.inputs = { ...ep };
    results.portfolioMeta = scenario;
    results.selectedRiskCount = scenario.riskCount;
    results.applicableRegulations = [...(AppState.draft.applicableRegulations || [])];
    results.warningThreshold = warningThreshold;
    results.annualReviewThreshold = annualReviewThreshold;
    results.nearTolerance = results.lm.p90 >= warningThreshold && results.lm.p90 < toleranceThreshold;
    results.annualReviewTriggered = results.ale.p90 >= annualReviewThreshold;
    const assessmentIntelligence = buildAssessmentIntelligence(AppState.draft, results, ep, scenario);
    if (!AppState.draft.id) AppState.draft.id = 'a_' + Date.now();
    const assessment = { ...AppState.draft, results, assessmentIntelligence, completedAt: Date.now() };
    saveAssessment(assessment);
    recordLearningFromAssessment(assessment);
    saveDraft();
    Router.navigate('/results/' + AppState.draft.id);
  } catch(e) {
    document.getElementById('sim-progress').classList.add('hidden');
    document.getElementById('run-area').classList.remove('hidden');
    UI.toast('Simulation error: ' + e.message, 'danger');
    console.error(e);
  }
}

// ─── RESULTS ──────────────────────────────────────────────────
function renderResults(id, isShared) {
  if (!isShared) {
    const shared = ShareService.parseShareFromURL();
    if (shared && shared.id === id && shared.results) {
      if (!getAssessmentById(id)) saveAssessment({ ...shared, _shared: true });
      isShared = true;
    }
  }
  const assessment = getAssessmentById(id);
  if (!assessment || !assessment.results) {
    setPage(`<div class="container" style="padding:var(--sp-12)"><h2>Assessment not found</h2><p style="margin-top:var(--sp-4);color:var(--text-muted)">ID "${id}" not found in local storage.</p><a href="#/" class="btn btn--primary" style="margin-top:var(--sp-6)">← Home</a></div>`);
    return;
  }

  const sharedBanner = (isShared || assessment._shared) ? `
    <div class="banner banner--info mb-6" style="font-size:.82rem">
      <span class="banner-icon">🔗</span>
      <span class="banner-text"><strong>Shared view.</strong> This assessment was shared with you. <a href="#/" style="color:var(--color-accent-300)">Start your own →</a></span>
    </div>` : '';

  const r = assessment.results;
  const activeTab = String(AppState.resultsTab || 'executive');
  const statusClass = r.toleranceBreached ? 'above' : r.nearTolerance ? 'warning' : 'within';
  const statusIcon = r.toleranceBreached ? '🔴' : r.nearTolerance ? '🟠' : '🟢';
  const statusTitle = r.toleranceBreached ? 'Above Tolerance Threshold' : r.nearTolerance ? 'Approaching Tolerance Threshold' : 'Within Tolerance Threshold';
  const statusDetail = r.toleranceBreached
    ? `Per-event P90 ${fmtCurrency(r.lm.p90)} is above the tolerance threshold of ${fmtCurrency(r.threshold)}.`
    : r.nearTolerance
      ? `Per-event P90 ${fmtCurrency(r.lm.p90)} is above the warning trigger of ${fmtCurrency(r.warningThreshold)} but still below tolerance.`
      : `Per-event P90 ${fmtCurrency(r.lm.p90)} remains below the warning trigger of ${fmtCurrency(r.warningThreshold)}.`;
  const executiveHeadline = r.toleranceBreached
    ? `This scenario is above tolerance and needs leadership attention now.`
    : r.nearTolerance
      ? `This scenario is close to tolerance and should be actively managed before it escalates.`
      : `This scenario is within tolerance today, but should stay under active monitoring.`;
  const executiveAction = r.toleranceBreached
    ? 'Escalate to the accountable executive, confirm an owner, and agree immediate treatment actions.'
    : r.nearTolerance
      ? 'Agree targeted reduction actions and management review before the scenario moves above tolerance.'
      : 'Maintain controls, monitor change signals, and revisit the scenario if threat, exposure, or scope changes.';
  const executiveAnnualView = r.annualReviewTriggered
    ? `Annual exposure is material at ${fmtCurrency(r.ale.p90)} on a severe-but-plausible basis, so it also merits annual leadership review.`
    : `Annual exposure is ${fmtCurrency(r.ale.p90)} on a severe-but-plausible basis, which stays below the annual review trigger.`;
  const scenarioScopeSummary = r.portfolioMeta?.linked
    ? `${r.selectedRiskCount || assessment.selectedRisks?.length || 1} linked risks are being treated as one connected scenario.`
    : `${r.selectedRiskCount || assessment.selectedRisks?.length || 1} risks are being assessed together without linked uplift.`;
  const exceedancePct = ((r.toleranceDetail?.lmExceedProb || 0) * 100).toFixed(1);
  const completedLabel = new Date(assessment.completedAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' });
  const scenarioNarrative = assessment.enhancedNarrative || assessment.narrative || assessment.scenarioText || 'No scenario narrative available.';
  const technicalInputs = r.inputs || assessment.fairParams || {};
  const assessmentIntelligence = assessment.assessmentIntelligence || buildAssessmentIntelligence(assessment, r, technicalInputs, r.portfolioMeta || {});
  const recommendationCards = assessment.recommendations?.length ? `
    <section class="results-section-stack">
      <div class="results-section-heading">Priority actions</div>
      <div class="results-recommendations-grid">
        ${assessment.recommendations.slice(0, 3).map((rec, idx) => `
          <div class="results-priority-card">
            <div class="results-priority-index">${idx + 1}</div>
            <div>
              <div class="results-priority-title">${rec.title}</div>
              <div class="results-priority-copy">${rec.why}</div>
              <div class="results-priority-impact">${rec.impact}</div>
            </div>
          </div>`).join('')}
      </div>
    </section>` : '';

  const executiveTab = `
    <section class="results-executive-view" id="results-tab-executive">
      <div class="results-hero ${statusClass}">
        <div class="results-hero-main">
          <div class="results-kicker">Assessment outcome</div>
          <h2 class="results-hero-title">${executiveHeadline}</h2>
          <p class="results-hero-copy">${statusDetail} ${executiveAnnualView}</p>
          <div class="results-hero-tags">
            <span class="badge ${r.toleranceBreached ? 'badge--danger' : r.nearTolerance ? 'badge--warning' : 'badge--success'}">${statusTitle}</span>
            <span class="badge badge--neutral">${assessment.buName || 'No business unit'}</span>
            <span class="badge badge--neutral">${assessment.geography || 'No geography'}</span>
            <span class="badge badge--neutral">${completedLabel}</span>
          </div>
        </div>
        <div class="results-hero-side">
          <div class="results-signal-ring ${statusClass}">
            <div class="results-signal-ring-inner">${statusIcon}</div>
          </div>
          <div class="results-signal-label">${exceedancePct}% chance of breaching tolerance</div>
        </div>
      </div>

      <div class="results-exec-metrics">
        <div class="results-impact-card">
          <div class="results-impact-label">If one major event happens</div>
          <div class="results-impact-value ${r.toleranceBreached ? 'danger' : ''}">${fmtCurrency(r.lm.p90)}</div>
          <div class="results-impact-copy">Think of this as the downside case for one serious incident. This is the number compared against tolerance.</div>
        </div>
        <div class="results-impact-card">
          <div class="results-impact-label">Likely yearly impact</div>
          <div class="results-impact-value">${fmtCurrency(r.ale.mean)}</div>
          <div class="results-impact-copy">If conditions stay broadly the same, this is the modelled average loss across a year.</div>
        </div>
        <div class="results-impact-card">
          <div class="results-impact-label">High-end yearly impact</div>
          <div class="results-impact-value warning">${fmtCurrency(r.ale.p90)}</div>
          <div class="results-impact-copy">Use this as the heavy-stress annual view for planning, resilience, and escalation discussions.</div>
        </div>
      </div>

      <div class="results-decision-grid">
        <div class="results-decision-card">
          <div class="results-section-heading">What leaders should do now</div>
          <div class="results-decision-row">
            <span class="results-decision-label">Immediate action</span>
            <div class="results-decision-copy">${executiveAction}</div>
          </div>
          <div class="results-decision-row">
            <span class="results-decision-label">Why this matters</span>
            <div class="results-decision-copy">${scenarioScopeSummary}</div>
          </div>
          <div class="results-decision-row">
            <span class="results-decision-label">Escalation rule</span>
            <div class="results-decision-copy">${getEffectiveSettings().escalationGuidance}</div>
          </div>
        </div>
        <div class="results-decision-card">
          <div class="results-section-heading">Threshold view</div>
          <div class="results-threshold-stack">
            <div class="results-threshold-row"><span>Warning trigger</span><strong>${fmtCurrency(r.warningThreshold || getWarningThreshold())}</strong></div>
            <div class="results-threshold-row"><span>Tolerance threshold</span><strong>${fmtCurrency(r.threshold)}</strong></div>
            <div class="results-threshold-row"><span>Annual review trigger</span><strong>${fmtCurrency(r.annualReviewThreshold || getAnnualReviewThreshold())}</strong></div>
          </div>
          <p class="results-threshold-foot">The page is ordered so leaders see the decision threshold first, then the numbers that explain why.</p>
        </div>
      </div>

      <div class="results-summary-grid">
        <div class="results-summary-card results-summary-card--wide">
          <div class="results-section-heading">Scenario in plain language</div>
          <p class="results-summary-copy">${scenarioNarrative}</p>
        </div>
        ${renderAssessmentDriversBlock(assessmentIntelligence.drivers)}
      </div>

      <div class="results-decision-grid">
        ${renderAssessmentConfidenceBlock(assessmentIntelligence.confidence)}
        <div class="results-summary-card">
          <div class="results-section-heading">Scenario scope</div>
          <div class="results-chip-block">
            ${(assessment.selectedRisks?.length ? assessment.selectedRisks.map(risk => `<span class="badge badge--gold">${risk.title}</span>`).join('') : '<span class="badge badge--neutral">No linked risks selected</span>')}
          </div>
          ${(assessment.applicableRegulations?.length ? `<div class="results-chip-block">${assessment.applicableRegulations.map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('')}</div>` : '')}
        </div>
      </div>

      ${renderAssessmentAssumptionsBlock(assessmentIntelligence.assumptions)}

      ${recommendationCards}
    </section>`;

  const technicalTab = `
    <section class="results-technical-view ${activeTab === 'technical' ? '' : 'hidden'}" id="results-tab-technical">
      ${(assessment.workflowGuidance?.length || assessment.benchmarkBasis || assessment.inputRationale) ? `
      <div class="grid-2 mb-6 anim-fade-in">
        ${renderWorkflowGuidanceBlock(assessment.workflowGuidance || [], 'How AI guided this assessment')}
        ${renderBenchmarkRationaleBlock(assessment.benchmarkBasis, assessment.inputRationale)}
      </div>` : ''}

      <div class="grid-3 mb-6 anim-fade-in">
        <div class="metric-card"><div class="metric-label">Typical event cost</div><div class="metric-value">${fmtCurrency(r.lm.p50)}</div><div class="metric-sub">Midpoint single-event view</div></div>
        <div class="metric-card"><div class="metric-label">Severe event cost</div><div class="metric-value ${r.toleranceBreached ? 'danger' : ''}">${fmtCurrency(r.lm.p90)}</div><div class="metric-sub">Used for tolerance check</div></div>
        <div class="metric-card"><div class="metric-label">Expected event cost</div><div class="metric-value">${fmtCurrency(r.lm.mean)}</div><div class="metric-sub">Average single-event loss</div></div>
      </div>

      <div class="grid-3 mb-8 anim-fade-in anim-delay-1">
        <div class="metric-card"><div class="metric-label">Typical annual exposure</div><div class="metric-value">${fmtCurrency(r.ale.p50)}</div><div class="metric-sub">Midpoint annual view</div></div>
        <div class="metric-card"><div class="metric-label">Severe annual exposure</div><div class="metric-value warning">${fmtCurrency(r.ale.p90)}</div><div class="metric-sub">Annual severe-but-plausible view</div></div>
        <div class="metric-card"><div class="metric-label">Expected annual exposure</div><div class="metric-value">${fmtCurrency(r.ale.mean)}</div><div class="metric-sub">Average annual loss</div></div>
      </div>

      <div class="grid-2 mb-8 anim-fade-in anim-delay-2">
        <div class="chart-wrap">
          <div class="chart-title">ALE Distribution</div>
          <div class="chart-subtitle">Annual Loss Exposure · ${r.iterations.toLocaleString()} iterations · ${AppState.currency}</div>
          <canvas id="chart-hist"></canvas>
        </div>
        <div class="chart-wrap">
          <div class="chart-title">Loss Exceedance Curve</div>
          <div class="chart-subtitle">P(Annual Loss &gt; x) · orange line = ${fmtCurrency(r.threshold)} threshold</div>
          <canvas id="chart-lec"></canvas>
        </div>
      </div>

      ${assessment.structuredScenario ? `
      <div class="card mb-6 anim-fade-in">
        <h3 style="font-size:var(--text-base);margin-bottom:var(--sp-4)">Scenario Details</h3>
        <div class="grid-2">
          ${Object.entries({
            'Asset / Service': assessment.structuredScenario.assetService,
            'Threat Community': assessment.structuredScenario.threatCommunity,
            'Attack Type': assessment.structuredScenario.attackType,
            'Effect': assessment.structuredScenario.effect
          }).map(([k, v]) => `<div style="background:var(--bg-elevated);padding:var(--sp-3) var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">${k}</div><div style="font-size:.85rem;color:var(--text-secondary);margin-top:4px">${v || '—'}</div></div>`).join('')}
        </div>
      </div>` : ''}

      <div class="card mb-6 anim-fade-in">
        <h3 style="font-size:var(--text-base);margin-bottom:var(--sp-4)">Simulation context</h3>
        <div class="grid-3">
          <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">TEF</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${technicalInputs.tefMin ?? '—'}–${technicalInputs.tefLikely ?? '—'}–${technicalInputs.tefMax ?? '—'}</div><div style="font-size:.7rem;color:var(--text-muted)">events/year</div></div>
          <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Threat capability</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${technicalInputs.threatCapMin ?? '—'}–${technicalInputs.threatCapLikely ?? '—'}–${technicalInputs.threatCapMax ?? '—'}</div><div style="font-size:.7rem;color:var(--text-muted)">0–1 scale</div></div>
          <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Control strength</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${technicalInputs.controlStrMin ?? '—'}–${technicalInputs.controlStrLikely ?? '—'}–${technicalInputs.controlStrMax ?? '—'}</div><div style="font-size:.7rem;color:var(--text-muted)">0–1 scale</div></div>
        </div>
        <div class="mt-4" style="font-size:.78rem;color:var(--text-muted)">Iterations: <strong>${r.iterations.toLocaleString()}</strong> · Distribution: <strong>${r.distType || assessment.fairParams?.distType || 'triangular'}</strong> · Threshold: <strong>${fmtCurrency(r.threshold)}</strong></div>
      </div>

      ${assessment.citations?.length ? renderCitationBlock(assessment.citations) : ''}

      ${assessment.recommendations?.length ? `
      <div class="mb-8 anim-fade-in">
        <h3 style="font-size:var(--text-xl);margin-bottom:var(--sp-5)">Recommended Risk Treatments</h3>
        <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
          ${assessment.recommendations.map((rec, i) => `
            <div class="rec-card">
              <div class="flex items-start gap-4">
                <div class="rec-number">${i + 1}</div>
                <div style="flex:1">
                  <div class="rec-title">${rec.title}</div>
                  <div class="rec-why">${rec.why}</div>
                  <div class="rec-impact">↑ ${rec.impact}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </section>`;

  setPage(`
    <main class="page">
      <div class="container container--wide" style="padding:var(--sp-8) var(--sp-6)">
        ${sharedBanner}
        <div class="flex items-center justify-between mb-6 anim-fade-in" style="gap:var(--sp-4);flex-wrap:wrap">
          <div>
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:4px">Assessment Results</div>
            <h1 style="font-size:var(--text-3xl)">${assessment.scenarioTitle || 'Risk Assessment'}</h1>
            <div style="font-size:var(--text-sm);color:var(--text-muted);margin-top:4px">${assessment.buName || '—'} · ${assessment.geography || '—'} · ${completedLabel}</div>
          </div>
          <div class="flex items-center gap-3" style="flex-wrap:wrap">
            <button class="btn btn--secondary btn--sm" id="btn-share-results">Share</button>
            <button class="btn btn--secondary btn--sm" id="btn-export-json">↓ JSON</button>
            <button class="btn btn--secondary btn--sm" id="btn-export-pptx">↓ PPTX Spec</button>
            <button class="btn btn--primary btn--sm" id="btn-export-pdf">↓ PDF Report</button>
          </div>
        </div>

        <div class="results-tabbar mb-6">
          <button class="results-tab ${activeTab === 'executive' ? 'active' : ''}" data-results-tab="executive">Executive Summary</button>
          <button class="results-tab ${activeTab === 'technical' ? 'active' : ''}" data-results-tab="technical">Technical Detail</button>
        </div>

        <div class="${activeTab === 'executive' ? '' : 'hidden'}" id="results-tab-executive-wrap">${executiveTab}</div>
        ${technicalTab}

        <div class="flex items-center gap-4 mt-8 pt-6" style="border-top:1px solid var(--border-subtle)">
          <a href="#/" class="btn btn--ghost">← Home</a>
          <button class="btn btn--secondary" id="btn-new-assess">New Assessment</button>
          <div class="bar-spacer"></div>
          <span style="font-size:.72rem;color:var(--text-muted)">ID: ${assessment.id} · ${r.iterations.toLocaleString()} iterations</span>
        </div>
      </div>
    </main>`);

  function drawTechnicalCharts() {
    requestAnimationFrame(() => {
      const hc = document.getElementById('chart-hist');
      const lc = document.getElementById('chart-lec');
      if (hc) UI.drawHistogram(hc, r.histogram, r.threshold, AppState.currency, AppState.fxRate);
      if (lc) UI.drawLEC(lc, r.lec, r.threshold, AppState.currency, AppState.fxRate);
      attachCitationHandlers();
    });
  }

  document.querySelectorAll('[data-results-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.resultsTab = btn.dataset.resultsTab;
      renderResults(id, isShared || assessment._shared);
    });
  });
  if (activeTab === 'technical') drawTechnicalCharts();
  else attachCitationHandlers();
  document.getElementById('btn-share-results').addEventListener('click', () => ShareService.copyShareLink(assessment));
  document.getElementById('btn-export-json').addEventListener('click', () => { ExportService.exportJSON(assessment); UI.toast('JSON exported.','success'); });
  document.getElementById('btn-export-pdf').addEventListener('click', () => ExportService.exportPDF(assessment, AppState.currency, AppState.fxRate));
  document.getElementById('btn-export-pptx').addEventListener('click', () => { ExportService.exportPPTXSpec(assessment, AppState.currency, AppState.fxRate); UI.toast('PPTX spec exported as JSON. See README.','info',5000); });
  document.getElementById('btn-new-assess').addEventListener('click', () => { resetDraft(); Router.navigate('/wizard/1'); });
}

// ─── AUTH & SETTINGS ──────────────────────────────────────────
function getDefaultRouteForCurrentUser() {
  const user = AuthService.getCurrentUser();
  return user?.role === 'admin' ? '/admin/settings' : '/dashboard';
}

function userNeedsOrganisationSelection(user = AuthService.getCurrentUser(), settings = getAdminSettings()) {
  if (!user || user.role === 'admin') return false;
  const companyStructure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const companies = getCompanyEntities(companyStructure);
  if (!companies.length) return false;
  const storedSettings = getUserSettings();
  const selection = resolveUserOrganisationSelection(user, storedSettings, settings);
  const businessUnitEntityId = String(selection.businessUnitEntityId || '').trim();
  const departmentEntityId = String(selection.departmentEntityId || '').trim();
  if (!businessUnitEntityId) return true;
  const departments = getDepartmentEntities(companyStructure, businessUnitEntityId);
  return !!departments.length && !departmentEntityId;
}

function requireAuth() {
  const user = AuthService.getCurrentUser();
  if (!user) {
    AppState.currentUser = null;
    Router.navigate('/login');
    return false;
  }
  AppState.currentUser = user;
  return true;
}

function renderLoginOrganisationSelection(currentUser, existingSettings = getUserSettings()) {
  const adminSettings = getAdminSettings();
  const companyStructure = Array.isArray(adminSettings.companyStructure) ? adminSettings.companyStructure : [];
  const companies = getCompanyEntities(companyStructure);
  if (!companies.length) {
    Router.navigate('/dashboard');
    return;
  }
  const selection = resolveUserOrganisationSelection(currentUser, existingSettings, adminSettings);
  let selectedBusinessId = selection.businessUnitEntityId || companies[0]?.id || '';
  const ownedDefault = getDefaultOrgAssignmentForUser(currentUser.username, adminSettings);
  if (!selectedBusinessId && ownedDefault.businessUnitEntityId) {
    selectedBusinessId = ownedDefault.businessUnitEntityId;
  }
  const settings = {
    ...existingSettings,
    userProfile: normaliseUserProfile(existingSettings.userProfile, currentUser)
  };

  function renderSelectionStep() {
    const departmentOptions = getDepartmentEntities(companyStructure, selectedBusinessId);
    let selectedDepartmentId = String(settings.userProfile.departmentEntityId || selection.departmentEntityId || ownedDefault.departmentEntityId || '').trim();
    if (!departmentOptions.some(option => option.id === selectedDepartmentId)) {
      selectedDepartmentId = departmentOptions.find(option => option.ownerUsername === currentUser.username)?.id || departmentOptions[0]?.id || '';
    }
    settings.userProfile.departmentEntityId = selectedDepartmentId;

    setPage(`
      <main class="page">
        <div class="container container--narrow" style="padding:var(--sp-16) var(--sp-6);max-width:760px">
          <div class="card card--elevated">
            <div class="landing-badge">Sign In</div>
            <h2 style="margin-top:var(--sp-4)">Choose where you sit in the organisation</h2>
            <p style="margin-top:8px;color:var(--text-muted)">This sets your default business-unit and department context for this session. You can refine it later from Settings.</p>
            <div class="form-group mt-6">
              <label class="form-label" for="login-business-unit">Business unit / company</label>
              <select class="form-select" id="login-business-unit">
                ${companies.map(entity => `<option value="${entity.id}" ${entity.id === selectedBusinessId ? 'selected' : ''}>${entity.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group mt-4">
              <label class="form-label" for="login-department">Function / department</label>
              <select class="form-select" id="login-department" ${departmentOptions.length ? '' : 'disabled'}>
                ${departmentOptions.length
                  ? departmentOptions.map(entity => `<option value="${entity.id}" ${entity.id === selectedDepartmentId ? 'selected' : ''}>${entity.name}${entity.ownerUsername === currentUser.username ? ' · your department' : ''}</option>`).join('')
                  : '<option value="">No departments configured yet</option>'}
              </select>
              <span class="form-help">${departmentOptions.length ? 'Choose the function you work within. Department owners can maintain this context from Settings.' : 'No department has been configured beneath this business yet. The admin can add one from Org Customisation.'}</span>
            </div>
            <div class="flex items-center justify-between mt-6" style="gap:var(--sp-4);flex-wrap:wrap">
              <button class="btn btn--ghost" id="btn-login-switch-account">Switch Account</button>
              <button class="btn btn--primary" id="btn-login-context-continue">Continue</button>
            </div>
          </div>
        </div>
      </main>`);

    document.getElementById('login-business-unit').addEventListener('change', event => {
      selectedBusinessId = event.target.value;
      settings.userProfile.businessUnitEntityId = selectedBusinessId;
      renderSelectionStep();
    });
    document.getElementById('btn-login-switch-account').addEventListener('click', () => {
      performLogout({ renderLoginScreen: true });
    });
    document.getElementById('btn-login-context-continue').addEventListener('click', async () => {
      const businessUnitEntityId = document.getElementById('login-business-unit').value;
      const departmentEntityId = document.getElementById('login-department').value;
      const businessEntity = getEntityById(companyStructure, businessUnitEntityId);
      const departmentEntity = getEntityById(companyStructure, departmentEntityId);
      const availableDepartments = getDepartmentEntities(companyStructure, businessUnitEntityId);
      if (!businessEntity) {
        UI.toast('Choose a business unit first.', 'warning');
        return;
      }
      if (availableDepartments.length && !departmentEntity) {
        UI.toast('Choose a department or function for this sign-in session.', 'warning');
        return;
      }
      saveUserSettings({
        ...settings,
        userProfile: {
          ...settings.userProfile,
          businessUnit: businessEntity.name,
          businessUnitEntityId,
          department: departmentEntity?.name || '',
          departmentEntityId: departmentEntity?.id || ''
        }
      });
      await AuthService.updateManagedAccount(currentUser.username, {
        businessUnitEntityId,
        departmentEntityId: departmentEntity?.id || ''
      });
      AuthService.updateSessionContext({
        businessUnitEntityId,
        departmentEntityId: departmentEntity?.id || ''
      });
      activateAuthenticatedState();
      Router.navigate('/dashboard');
    });
  }

  settings.userProfile.businessUnitEntityId = selectedBusinessId;
  renderSelectionStep();
}

function renderLogin() {
  const currentUser = AuthService.getCurrentUser();
  if (currentUser) {
    if (userNeedsOrganisationSelection(currentUser)) {
      renderLoginOrganisationSelection(currentUser);
      return;
    }
    Router.navigate(getDefaultRouteForCurrentUser());
    return;
  }
  setPage(`
    <main class="page">
      <div class="container container--narrow" style="padding:var(--sp-16) var(--sp-6);max-width:640px">
        <div class="banner banner--poc mb-6"><span class="banner-icon">⚠</span><span class="banner-text"><strong>PoC Security:</strong> Shared team credentials only. Replace with Microsoft Entra ID before production. [ENTRA-INTEGRATION]</span></div>
        <div class="card card--elevated">
          <h2 style="margin-bottom:var(--sp-2)">Sign In</h2>
          <p style="margin-bottom:var(--sp-6);color:var(--text-muted)">Each user keeps their own draft state, saved assessments, and assigned BU/function context. Ask the global admin for your username and password.</p>
          <div>
            <div class="form-group mb-4">
              <label class="form-label" for="login-user">Username</label>
              <input class="form-input" id="login-user" type="text" placeholder="Enter username" autocomplete="username">
            </div>
            <div class="form-group mb-4">
              <label class="form-label" for="login-pass">Password</label>
              <input class="form-input" id="login-pass" type="password" placeholder="Enter password" autocomplete="current-password">
              <span class="form-error hidden" id="login-err">⚠ Invalid username or password</span>
            </div>
            <button class="btn btn--primary w-full" id="btn-login" style="justify-content:center">Sign In</button>
          </div>
        </div>
      </div>
    </main>`);

  const login = async () => {
    const username = document.getElementById('login-user').value;
    const pw = document.getElementById('login-pass').value;
    const result = await AuthService.login(username, pw);
    if (result.success) {
      await loadSharedUserState(result.user.username);
      activateAuthenticatedState();
      UI.toast(`Logged in as ${result.user.displayName}.`, 'success');
      if (userNeedsOrganisationSelection(AuthService.getCurrentUser())) {
        renderLogin();
      } else {
        Router.navigate(getDefaultRouteForCurrentUser());
      }
    }
    else {
      document.getElementById('login-err').textContent = `⚠ ${result.error || 'Invalid username or password'}`;
      document.getElementById('login-err').classList.remove('hidden');
      document.getElementById('login-user').classList.add('error');
      document.getElementById('login-pass').classList.add('error');
    }
  };

  document.getElementById('btn-login').addEventListener('click', login);
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key==='Enter') login(); });
  document.getElementById('login-user').addEventListener('keydown', e => { if (e.key==='Enter') login(); });
}

function requireAdmin() {
  if (!requireAuth()) return false;
  if (!AuthService.isAdminAuthenticated()) { Router.navigate('/settings'); return false; }
  return true;
}

function withAuth(renderer) {
  return (params, hash) => {
    if (!requireAuth()) return;
    renderer(params, hash);
  };
}

function adminLayout(active, content, activeSettingsSection = 'org') {
  return `<div style="display:flex;min-height:calc(100vh - 60px)">
    <nav class="admin-sidebar">
      <div style="font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:var(--sp-3)">Admin</div>
      <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:var(--sp-2)">Setup</div>
      <a href="#/admin/settings/org" class="admin-nav-link ${active==='settings' && activeSettingsSection==='org' ? 'active' : ''}">🌐 Organisation Setup</a>
      <a href="#/admin/settings/company" class="admin-nav-link ${active==='settings' && activeSettingsSection==='company' ? 'active' : ''}">🧠 AI Company Builder</a>
      <a href="#/admin/settings/defaults" class="admin-nav-link ${active==='settings' && activeSettingsSection==='defaults' ? 'active' : ''}">🛡 Platform Defaults</a>
      <a href="#/admin/settings/access" class="admin-nav-link ${active==='settings' && activeSettingsSection==='access' ? 'active' : ''}">🔐 System Access</a>
      <a href="#/admin/settings/users" class="admin-nav-link ${active==='settings' && activeSettingsSection==='users' ? 'active' : ''}">👥 User Accounts</a>
      <a href="#/admin/settings/audit" class="admin-nav-link ${active==='settings' && activeSettingsSection==='audit' ? 'active' : ''}">🧾 Audit Log</a>
      <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:var(--sp-4) 0 var(--sp-2)">Libraries</div>
      <a href="#/admin/bu" class="admin-nav-link ${active==='bu'?'active':''}">🏢 Org Customisation</a>
      <a href="#/admin/docs" class="admin-nav-link ${active==='docs'?'active':''}">📚 Document Library</a>
      <div style="flex:1"></div>
      <div style="border-top:1px solid var(--border-subtle);padding-top:var(--sp-3)">
        <div class="banner banner--poc" style="font-size:.7rem;padding:8px 10px">⚠ PoC — replace with Entra ID</div>
        <button class="btn btn--ghost btn--sm" id="btn-admin-logout" style="margin-top:8px;width:100%;justify-content:center">Sign Out</button>
      </div>
    </nav>
    <div style="flex:1;padding:var(--sp-8);overflow-y:auto">${content}</div>
  </div>`;
}

function renderUserSettings() {
  if (!requireAuth()) return;
  if (AuthService.isAdminAuthenticated()) {
    Router.navigate('/admin/settings');
    return;
  }

  const settings = getUserSettings();
  if (!settings.onboardedAt) {
    renderUserOnboarding(settings);
    return;
  }
  renderUserPreferences(settings);
}

function renderUserOnboarding(existingSettings = getUserSettings(), startStep = 0) {
  if (!requireAuth()) return;
  const globalSettings = getAdminSettings();
  const settings = getUserSettings();
  const companyStructure = Array.isArray(globalSettings.companyStructure) ? globalSettings.companyStructure : [];
  const companies = getCompanyEntities(companyStructure);
  const profile = normaliseUserProfile(existingSettings.userProfile || settings.userProfile);
  const draftSettings = {
    ...settings,
    ...existingSettings,
    userProfile: profile
  };
  let currentStep = Math.max(0, Math.min(4, Number(startStep) || 0));
  let onboardingAiSourceText = '';
  let onboardingAiSourceName = '';

  function saveProgress(markComplete = false) {
    saveUserSettings({
      ...draftSettings,
      onboardedAt: markComplete ? (draftSettings.onboardedAt || new Date().toISOString()) : draftSettings.onboardedAt || ''
    });
  }

  function renderStep() {
    const stepMeta = [
      {
        title: 'Let the platform know who you are',
        prompt: 'Start with your name and role so the platform can tailor guidance to your perspective.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-name">What should the platform call you?</label>
            <input class="form-input" id="onboard-name" value="${draftSettings.userProfile.fullName || AppState.currentUser?.displayName || ''}" placeholder="Your full name">
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-title">What is your role?</label>
            <input class="form-input" id="onboard-title" value="${draftSettings.userProfile.jobTitle || ''}" placeholder="e.g. Risk Manager, Technology Lead, Compliance Officer">
          </div>`
      },
      {
        title: 'Where do you sit in the organisation?',
        prompt: 'This helps the platform interpret scenarios using the right business context.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-bu">Business unit or entity</label>
            <select class="form-select" id="onboard-bu">
              <option value="">Choose your business unit</option>
              ${companies.map(entity => `<option value="${entity.id}" ${entity.id === draftSettings.userProfile.businessUnitEntityId ? 'selected' : ''}>${entity.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-department">Department or function</label>
            <select class="form-select" id="onboard-department"></select>
          </div>`
      },
      {
        title: 'What do you care about most?',
        prompt: 'Choose the themes that should influence how the platform frames analysis for you.',
        body: `
          <div class="grid-3" style="gap:12px">
            <div class="form-group">
              <label class="form-label" for="onboard-geo-primary">Primary geography</label>
              ${renderGeographySelect('onboard-geo-primary', draftSettings.geographyPrimary || draftSettings.geography || globalSettings.geography)}
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-geo-secondary">Secondary geography</label>
              ${renderGeographySelect('onboard-geo-secondary', draftSettings.geographySecondary || '', 'Optional', true)}
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-geo-tertiary">Tertiary geography</label>
              ${renderGeographySelect('onboard-geo-tertiary', draftSettings.geographyTertiary || '', 'Optional', true)}
            </div>
          </div>
          <div class="form-group mt-4">
            <label class="form-label">Focus areas</label>
            <div class="tag-input-wrap" id="ti-onboard-focus"></div>
            <div class="citation-chips" style="margin-top:10px">
              ${USER_FOCUS_OPTIONS.map(option => `<button type="button" class="chip onboard-focus-chip" data-focus="${option}">${option}</button>`).join('')}
            </div>
          </div>`
      },
      {
        title: 'What makes a useful answer for you?',
        prompt: 'Tell the platform how you want outputs to be framed.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-preferred-outputs">Preferred output style</label>
            <textarea class="form-textarea" id="onboard-preferred-outputs" rows="4" placeholder="e.g. Give me crisp executive summaries, clear risk drivers, and actions I can take with my team.">${draftSettings.userProfile.preferredOutputs || ''}</textarea>
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-working-context">Anything important about your working context?</label>
            <textarea class="form-textarea" id="onboard-working-context" rows="4" placeholder="e.g. I mostly support regulated services and need outputs that balance resilience, compliance, and board reporting.">${draftSettings.userProfile.workingContext || ''}</textarea>
          </div>
          <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-elevated)">
            <div class="context-panel-title">AI Assist</div>
            <div class="form-group mt-3">
              <label class="form-label" for="onboard-answer-notes">Notes for AI assist</label>
              <textarea class="form-textarea" id="onboard-answer-notes" rows="3" placeholder="Paste role notes, writing preferences, reporting expectations, board-facing requirements, or any other helpful context."></textarea>
            </div>
            <div class="form-group mt-3">
              <label class="form-label" for="onboard-answer-file">Upload source material</label>
              <input class="form-input" id="onboard-answer-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls,.doc,.docx,.pdf">
              <div class="form-help" id="onboard-answer-file-help">Upload TXT, CSV, TSV, JSON, Markdown, Excel, DOC, DOCX, or PDF. The extracted text will be used only to draft this step.</div>
            </div>
            <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
              <button class="btn btn--secondary" id="btn-onboard-answer-ai" type="button">AI Assist This Step</button>
              <span class="form-help">Drafts your working context and preferred output style from your role, BU, and uploaded material.</span>
            </div>
          </div>`
      },
      {
        title: 'Seed your personal defaults',
        prompt: 'You can keep this light. The idea is to give your account a useful starting point, not to fill in a full admin form.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-company-url">Company website URL</label>
            <input class="form-input" id="onboard-company-url" value="${draftSettings.companyWebsiteUrl || ''}" placeholder="https://example.com">
            <span class="form-help">Optional now. You can build company context later from your settings screen.</span>
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-ai-guidance">Personal AI guidance</label>
            <textarea class="form-textarea" id="onboard-ai-guidance" rows="4" placeholder="e.g. Prefer plain-English recommendations, focus on operational resilience, and keep regional context explicit.">${draftSettings.aiInstructions || ''}</textarea>
          </div>`
      }
    ];

    const step = stepMeta[currentStep];
    setPage(`
      <main class="page">
        <div class="container container--narrow" style="padding:var(--sp-12) var(--sp-6);max-width:760px">
          <div class="card card--elevated" style="padding:var(--sp-8)">
            <div class="landing-badge">Personal Setup</div>
            <div style="margin-top:var(--sp-4);display:flex;align-items:center;justify-content:space-between;gap:var(--sp-4);flex-wrap:wrap">
              <div>
                <h2>${step.title}</h2>
                <p style="margin-top:8px;color:var(--text-muted)">${step.prompt}</p>
              </div>
              <div style="min-width:140px;text-align:right">
                <div style="font-size:.78rem;color:var(--text-muted)">Step ${currentStep + 1} of ${stepMeta.length}</div>
                <div style="height:8px;border-radius:999px;background:var(--bg-elevated);margin-top:8px;overflow:hidden">
                  <div style="height:100%;width:${((currentStep + 1) / stepMeta.length) * 100}%;background:var(--accent-gold)"></div>
                </div>
              </div>
            </div>

            <div class="card mt-6" style="padding:var(--sp-6);background:var(--bg-canvas)">
              ${step.body}
            </div>

            <div class="flex items-center justify-between mt-6" style="gap:var(--sp-4);flex-wrap:wrap">
              <button class="btn btn--ghost" id="btn-onboard-back" ${currentStep === 0 ? 'disabled' : ''}>Back</button>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                ${currentStep === stepMeta.length - 1
                  ? `<button class="btn btn--primary" id="btn-onboard-finish">Finish Setup</button>`
                  : `<button class="btn btn--primary" id="btn-onboard-next">Continue</button>`}
              </div>
            </div>
          </div>
        </div>
      </main>`);

    let focusInput = null;
    if (currentStep === 2) {
      focusInput = UI.tagInput('ti-onboard-focus', draftSettings.userProfile.focusAreas || []);
      document.querySelectorAll('.onboard-focus-chip').forEach(button => {
        button.addEventListener('click', () => {
          const next = Array.from(new Set([...(focusInput.getTags() || []), button.dataset.focus]));
          focusInput.setTags(next);
        });
      });
    }
    if (currentStep === 1) {
      const buEl = document.getElementById('onboard-bu');
      const deptEl = document.getElementById('onboard-department');
      const renderDepartmentOptions = () => {
        const departments = getDepartmentEntities(companyStructure, buEl.value);
        const selectedDepartmentId = draftSettings.userProfile.departmentEntityId;
        deptEl.innerHTML = departments.length
          ? departments.map(entity => `<option value="${entity.id}" ${entity.id === selectedDepartmentId ? 'selected' : ''}>${entity.name}</option>`).join('')
          : '<option value="">No departments configured yet</option>';
        deptEl.disabled = !departments.length;
      };
      buEl.addEventListener('change', () => {
        draftSettings.userProfile.businessUnitEntityId = buEl.value;
        draftSettings.userProfile.departmentEntityId = '';
        renderDepartmentOptions();
      });
      renderDepartmentOptions();
    }
    if (currentStep === 3) {
      async function loadOnboardingAiSource() {
        const notes = document.getElementById('onboard-answer-notes')?.value.trim() || '';
        const file = document.getElementById('onboard-answer-file')?.files?.[0];
        let uploadedText = '';
        if (file) {
          const parsed = await parseRegisterFile(file);
          uploadedText = parsed.text || '';
          onboardingAiSourceText = uploadedText;
          onboardingAiSourceName = file.name;
          const help = document.getElementById('onboard-answer-file-help');
          if (help) help.textContent = `Loaded ${file.name}. AI assist will use the extracted text for this setup step.`;
        }
        return [notes, uploadedText || onboardingAiSourceText].filter(Boolean).join('\n\n');
      }

      document.getElementById('btn-onboard-answer-ai')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-onboard-answer-ai');
        btn.disabled = true;
        btn.textContent = 'Drafting…';
        try {
          const sourceText = await loadOnboardingAiSource();
          const llmConfig = getSessionLLMConfig();
          LLMService.setCompassConfig({
            apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
            model: llmConfig.model || 'gpt-5.1',
            apiKey: llmConfig.apiKey || ''
          });
          const businessEntity = getEntityById(companyStructure, draftSettings.userProfile.businessUnitEntityId || '');
          const departmentEntity = getEntityById(companyStructure, draftSettings.userProfile.departmentEntityId || '');
          const result = await LLMService.buildUserPreferenceAssist({
            userProfile: {
              fullName: draftSettings.userProfile.fullName || AppState.currentUser?.displayName || '',
              jobTitle: draftSettings.userProfile.jobTitle || '',
              businessUnit: businessEntity?.name || draftSettings.userProfile.businessUnit || '',
              department: departmentEntity?.name || draftSettings.userProfile.department || '',
              focusAreas: draftSettings.userProfile.focusAreas || [],
              preferredOutputs: document.getElementById('onboard-preferred-outputs').value.trim(),
              workingContext: document.getElementById('onboard-working-context').value.trim()
            },
            organisationContext: {
              businessUnitContext: businessEntity?.profile || getEntityLayerById(globalSettings, businessEntity?.id || '')?.contextSummary || '',
              departmentContext: departmentEntity?.profile || getEntityLayerById(globalSettings, departmentEntity?.id || '')?.contextSummary || ''
            },
            currentSettings: {
              aiInstructions: draftSettings.aiInstructions || globalSettings.aiInstructions,
              adminContextSummary: draftSettings.adminContextSummary || globalSettings.adminContextSummary
            },
            uploadedText: sourceText
          });
          document.getElementById('onboard-working-context').value = result.workingContext || document.getElementById('onboard-working-context').value;
          document.getElementById('onboard-preferred-outputs').value = result.preferredOutputs || document.getElementById('onboard-preferred-outputs').value;
          UI.toast(`Drafted this step${onboardingAiSourceName ? ` using ${onboardingAiSourceName}` : ''}.`, 'success');
        } catch (error) {
          UI.toast('AI assist failed: ' + error.message, 'danger');
        } finally {
          btn.disabled = false;
          btn.textContent = 'AI Assist This Step';
        }
      });
    }

    function captureStepValues() {
      if (currentStep === 0) {
        draftSettings.userProfile.fullName = document.getElementById('onboard-name').value.trim() || AppState.currentUser?.displayName || '';
        draftSettings.userProfile.jobTitle = document.getElementById('onboard-title').value.trim();
      }
      if (currentStep === 1) {
        const businessUnitEntityId = document.getElementById('onboard-bu').value.trim();
        const departmentEntityId = document.getElementById('onboard-department').value.trim();
        const businessEntity = getEntityById(companyStructure, businessUnitEntityId);
        const departmentEntity = getEntityById(companyStructure, departmentEntityId);
        draftSettings.userProfile.businessUnitEntityId = businessUnitEntityId;
        draftSettings.userProfile.businessUnit = businessEntity?.name || '';
        draftSettings.userProfile.departmentEntityId = departmentEntityId;
        draftSettings.userProfile.department = departmentEntity?.name || '';
      }
      if (currentStep === 2) {
        draftSettings.geographyPrimary = document.getElementById('onboard-geo-primary').value.trim() || globalSettings.geography;
        draftSettings.geographySecondary = document.getElementById('onboard-geo-secondary').value.trim();
        draftSettings.geographyTertiary = document.getElementById('onboard-geo-tertiary').value.trim();
        draftSettings.geography = draftSettings.geographyPrimary;
        draftSettings.userProfile.focusAreas = focusInput?.getTags() || [];
      }
      if (currentStep === 3) {
        draftSettings.userProfile.preferredOutputs = document.getElementById('onboard-preferred-outputs').value.trim();
        draftSettings.userProfile.workingContext = document.getElementById('onboard-working-context').value.trim();
      }
      if (currentStep === 4) {
        draftSettings.companyWebsiteUrl = document.getElementById('onboard-company-url').value.trim();
        draftSettings.aiInstructions = document.getElementById('onboard-ai-guidance').value.trim() || globalSettings.aiInstructions;
      }
      draftSettings.userProfile = normaliseUserProfile(draftSettings.userProfile);
    }

    document.getElementById('btn-onboard-back')?.addEventListener('click', () => {
      captureStepValues();
      saveProgress(false);
      currentStep -= 1;
      renderStep();
    });

    document.getElementById('btn-onboard-next')?.addEventListener('click', () => {
      captureStepValues();
      saveProgress(false);
      currentStep += 1;
      renderStep();
    });

    document.getElementById('btn-onboard-finish')?.addEventListener('click', async () => {
      captureStepValues();
      saveUserSettings({
        ...draftSettings,
        onboardedAt: new Date().toISOString(),
        adminContextSummary: draftSettings.userProfile.workingContext || draftSettings.adminContextSummary || globalSettings.adminContextSummary
      });
      await AuthService.updateManagedAccount(AppState.currentUser?.username, {
        businessUnitEntityId: draftSettings.userProfile.businessUnitEntityId || '',
        departmentEntityId: draftSettings.userProfile.departmentEntityId || ''
      });
      if (!AppState.draft.geography) AppState.draft.geography = draftSettings.geography || globalSettings.geography;
      saveDraft();
      UI.toast('Personal setup complete.', 'success');
      Router.navigate('/dashboard');
    });
  }

  renderStep();
}


function getSettingsSectionStateKey(scope, title) {
  return `${scope}::${String(title || '').trim().toLowerCase()}`;
}

function rememberSettingsScroll(scope) {
  AppState.settingsScrollState[scope] = window.scrollY || 0;
}

function restoreSettingsScroll(scope) {
  const nextY = Number(AppState.settingsScrollState[scope] || 0);
  window.requestAnimationFrame(() => window.scrollTo({ top: nextY, left: 0, behavior: 'auto' }));
}

function bindSettingsSectionState(scope, root = document) {
  root.querySelectorAll('.settings-section[data-settings-section-key]').forEach(section => {
    const key = section.dataset.settingsSectionKey;
    section.addEventListener('toggle', () => {
      AppState.settingsSectionState[key] = section.open;
      rememberSettingsScroll(scope);
    });
  });
}

function renderSettingsSection({ title, description = '', body = '', open = false, meta = '', scope = 'global-settings' }) {
  const key = getSettingsSectionStateKey(scope, title);
  const isOpen = Object.prototype.hasOwnProperty.call(AppState.settingsSectionState, key)
    ? !!AppState.settingsSectionState[key]
    : open;
  return `<details class="settings-section" data-settings-section-key="${key}"${isOpen ? ' open' : ''}>
    <summary class="settings-section__summary">
      <div>
        <div class="settings-section__title-row">
          <span class="settings-section__title">${title}</span>
          ${meta ? `<span class="settings-section__meta">${meta}</span>` : ''}
        </div>
        ${description ? `<p class="settings-section__description">${description}</p>` : ''}
      </div>
      <span class="settings-section__chevron">⌄</span>
    </summary>
    <div class="settings-section__body">${body}</div>
  </details>`;
}

function createDebouncedSaver(callback, delay = 350) {
  let timeoutId = null;
  return () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(), delay);
  };
}

function bindAutosave(container, callback, { events = ['input', 'change'] } = {}) {
  if (!container || typeof callback !== 'function') return () => {};
  const run = createDebouncedSaver(callback);
  const listeners = events.map(eventName => {
    const handler = event => {
      if (!event.target || !(event.target instanceof HTMLElement)) return;
      if (event.target.closest('.tag-input-chip button')) return;
      run();
    };
    container.addEventListener(eventName, handler);
    return { eventName, handler };
  });
  return () => listeners.forEach(({ eventName, handler }) => container.removeEventListener(eventName, handler));
}

function renderUserPreferences(existingSettings = getUserSettings()) {
  if (!requireAuth()) return;
  if (AuthService.isAdminAuthenticated()) {
    Router.navigate('/admin/settings');
    return;
  }
  const globalSettings = getAdminSettings();
  const settings = existingSettings;
  const profile = normaliseUserProfile(settings.userProfile);
  const companyStructure = Array.isArray(globalSettings.companyStructure) ? globalSettings.companyStructure : [];
  const companyOptions = getCompanyEntities(companyStructure);
  const selectedBusinessId = profile.businessUnitEntityId || resolveUserOrganisationSelection(AppState.currentUser, settings, globalSettings).businessUnitEntityId;
  const selectedBusinessEntity = getEntityById(companyStructure, selectedBusinessId);
  const selectedBusinessDepartments = getDepartmentEntities(companyStructure, selectedBusinessId);
  const businessOwner = (AppState.currentUser?.role === 'bu_admin' && selectedBusinessEntity?.id === AppState.currentUser?.businessUnitEntityId) || selectedBusinessEntity?.ownerUsername === AppState.currentUser?.username;
  const selectedDepartment = getEntityById(companyStructure, profile.departmentEntityId);
  const departmentOwner = selectedDepartment?.ownerUsername === AppState.currentUser?.username;
  const companyContextSections = settings.companyContextSections || buildCompanyContextSections({
    companySummary: settings.adminContextSummary || '',
    businessProfile: settings.companyContextProfile || ''
  });
  const userContextSection = renderSettingsSection({
    title: 'Profile And Role Context',
    description: 'Set who you are, where you sit, and how you want outputs framed.',
    open: true,
    meta: `${profile.jobTitle || 'Role not set'} · ${profile.businessUnit || 'No BU selected'}`,
    body: `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="user-full-name">Name</label>
          <input class="form-input" id="user-full-name" value="${profile.fullName || AppState.currentUser?.displayName || ''}">
        </div>
        <div class="form-group">
          <label class="form-label" for="user-job-title">Role</label>
          <input class="form-input" id="user-job-title" value="${profile.jobTitle || ''}" placeholder="e.g. Risk Manager">
        </div>
      </div>
      <div class="grid-2 mt-4">
        <div class="form-group">
          <label class="form-label" for="user-business-unit">Business unit or entity</label>
          <select class="form-select" id="user-business-unit">
            <option value="">Choose your business unit</option>
            ${companyOptions.map(entity => `<option value="${entity.id}" ${entity.id === selectedBusinessId ? 'selected' : ''}>${entity.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="user-department">Department or function</label>
          <select class="form-select" id="user-department"></select>
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Focus areas</label>
        <div class="tag-input-wrap" id="ti-user-focus-areas"></div>
        <div class="citation-chips" style="margin-top:10px">
          ${USER_FOCUS_OPTIONS.map(option => `<button type="button" class="chip user-focus-chip" data-focus="${option}">${option}</button>`).join('')}
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-working-context">Working context</label>
        <textarea class="form-textarea" id="user-working-context" rows="4">${profile.workingContext || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-preferred-outputs">Preferred output style</label>
        <textarea class="form-textarea" id="user-preferred-outputs" rows="4">${profile.preferredOutputs || ''}</textarea>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-user-role-ai">AI Assist Role Context</button>
        <span class="form-help">Use your role, BU, department, and uploaded source material to draft these fields.</span>
      </div>`
  });
  const aiWorkspaceSection = renderSettingsSection({
    title: 'AI Assist Workspace',
    scope: 'user-settings',
    description: 'Upload notes, role descriptions, team material, or planning documents, then use AI assist across your settings.',
    meta: 'Shared source',
    open: true,
    body: `
      <div class="form-group">
        <label class="form-label" for="user-ai-source-notes">Notes for AI assist</label>
        <textarea class="form-textarea" id="user-ai-source-notes" rows="4" placeholder="Paste role notes, remit details, team responsibilities, reporting expectations, or any other useful context."></textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-ai-source-file">Upload source material</label>
        <input class="form-input" id="user-ai-source-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls">
        <div class="form-help" id="user-ai-source-file-help">Upload TXT, CSV, TSV, JSON, Markdown, or Excel. The content will be used only to draft your personal settings.</div>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-user-defaults-ai">AI Assist Personal Defaults</button>
        <span class="form-help">Fills personal context summary and AI guidance from the same source material.</span>
      </div>`
  });
  const companyContextSection = renderSettingsSection({
    title: 'Personal Company Context',
    scope: 'user-settings',
    description: 'Optional overlay on top of the admin baseline for this account only.',
    meta: settings.companyWebsiteUrl ? 'Website linked' : 'Optional',
    body: `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="user-company-url">Company Website URL</label>
          <input class="form-input" id="user-company-url" value="${settings.companyWebsiteUrl || ''}" placeholder="https://example.com">
        </div>
        <div class="form-group">
          <label class="form-label" for="user-company-profile">Company Risk Context Profile</label>
          <textarea class="form-textarea" id="user-company-profile" rows="6">${settings.companyContextProfile || ''}</textarea>
        </div>
      </div>
      <details class="mt-4">
        <summary style="cursor:pointer;font-weight:600;color:var(--text-primary)">Edit detailed company brief</summary>
        <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-canvas)">
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-summary">Company Summary</label>
            <textarea class="form-textarea" id="user-company-section-summary" rows="3">${companyContextSections.companySummary || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-business-model">Business Model</label>
            <textarea class="form-textarea" id="user-company-section-business-model" rows="3">${companyContextSections.businessModel || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-operating-model">Operating Model</label>
            <textarea class="form-textarea" id="user-company-section-operating-model" rows="3">${companyContextSections.operatingModel || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-commitments">Public Commitments</label>
            <textarea class="form-textarea" id="user-company-section-commitments" rows="4">${companyContextSections.publicCommitments || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-risks">Key Risk Signals</label>
            <textarea class="form-textarea" id="user-company-section-risks" rows="4">${companyContextSections.keyRiskSignals || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-obligations">Obligations and Exposures</label>
            <textarea class="form-textarea" id="user-company-section-obligations" rows="4">${companyContextSections.obligations || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-sources">Sources Reviewed</label>
            <textarea class="form-textarea" id="user-company-section-sources" rows="4">${companyContextSections.sources || ''}</textarea>
          </div>
        </div>
      </details>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-build-user-context">Build from Website</button>
        <span class="form-help">Builds a personal context draft for this account only.</span>
      </div>`
  });
  const roleManagementSection = `${businessOwner ? renderSettingsSection({
    title: 'Business Unit Admin Controls',
    scope: 'user-settings',
    description: `You can add functions beneath ${selectedBusinessEntity?.name || profile.businessUnit} and maintain their retained context.`,
    meta: `${selectedBusinessDepartments.length} department${selectedBusinessDepartments.length === 1 ? '' : 's'}`,
    body: `
      <div class="flex items-center gap-3" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-user-add-department">Add Function / Department</button>
      </div>
      <div class="mt-4" style="display:flex;flex-direction:column;gap:12px">
        ${selectedBusinessDepartments.length ? selectedBusinessDepartments.map(department => `
          <div class="card" style="padding:var(--sp-4);background:var(--bg-canvas)">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <div class="context-panel-title">${department.name}</div>
                <div class="form-help">${department.ownerUsername ? `Owner: ${department.ownerUsername}` : 'Owner not assigned yet'}</div>
                <div class="form-help">${getEntityLayerById(globalSettings, department.id)?.contextSummary || department.profile || 'No retained department context yet'}</div>
              </div>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--ghost btn--sm btn-user-edit-department" data-department-id="${department.id}" type="button">Edit Department</button>
                <button class="btn btn--secondary btn--sm btn-user-edit-department-context" data-department-id="${department.id}" type="button">Manage Context</button>
              </div>
            </div>
          </div>`).join('') : '<div class="form-help">No functions or departments exist under this business unit yet.</div>'}
      </div>`
  }) : ''}
  ${departmentOwner ? renderSettingsSection({
    title: 'Department Context You Own',
    description: `You are the assigned owner for ${selectedDepartment?.name || profile.department}.`,
    meta: 'Department owner',
    body: `<div class="flex items-center gap-3" style="flex-wrap:wrap"><button class="btn btn--secondary" id="btn-manage-owned-department">Manage Department Context</button></div>`
  }) : ''}`;
  const defaultsSection = renderSettingsSection({
    title: 'Personal Defaults',
    description: 'These defaults shape new assessments for this account.',
    meta: settings.geography || globalSettings.geography,
    body: `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="user-geo-primary">Primary Geography</label>
          ${renderGeographySelect('user-geo-primary', settings.geographyPrimary || settings.geography || globalSettings.geography)}
        </div>
        <div class="form-group">
          <label class="form-label" for="user-link-mode">Default Linked-Risk Mode</label>
          <select class="form-select" id="user-link-mode">
            <option value="yes" ${settings.defaultLinkMode ? 'selected' : ''}>Enabled</option>
            <option value="no" ${!settings.defaultLinkMode ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
      </div>
      <div class="grid-2 mt-4">
        <div class="form-group">
          <label class="form-label" for="user-geo-secondary">Secondary Geography</label>
          ${renderGeographySelect('user-geo-secondary', settings.geographySecondary || '', 'Optional', true)}
        </div>
        <div class="form-group">
          <label class="form-label" for="user-geo-tertiary">Tertiary Geography</label>
          ${renderGeographySelect('user-geo-tertiary', settings.geographyTertiary || '', 'Optional', true)}
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-context-summary">Personal Context Summary</label>
        <textarea class="form-textarea" id="user-context-summary" rows="3">${settings.adminContextSummary || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-appetite">Risk Appetite Statement</label>
        <textarea class="form-textarea" id="user-appetite" rows="4">${settings.riskAppetiteStatement || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Applicable Regulations</label>
        <div class="tag-input-wrap" id="ti-user-regulations"></div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-ai-instructions">AI Guidance</label>
        <textarea class="form-textarea" id="user-ai-instructions" rows="3">${settings.aiInstructions || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-benchmark-strategy">Benchmark Strategy</label>
        <textarea class="form-textarea" id="user-benchmark-strategy" rows="3">${settings.benchmarkStrategy || ''}</textarea>
      </div>`
  });
  setPage(`
    <main class="page">
      <div class="container container--narrow" style="padding:var(--sp-10) var(--sp-6);max-width:960px">
        <div class="settings-shell">
          <div class="settings-shell__header">
            <div>
              <h2>Personal Settings</h2>
              <p style="margin-top:6px;color:var(--text-muted)">These settings apply only to <strong>${AppState.currentUser?.displayName || 'your account'}</strong>. Global thresholds, organisation structure, BU customisation, and document library remain controlled by the global admin.</p>
            </div>
            <div class="flex items-center gap-3" style="flex-wrap:wrap">
              <button class="btn btn--ghost" id="btn-rerun-onboarding">Re-run Setup</button>
              <button class="btn btn--secondary" id="btn-reset-user-settings">Reset My Settings</button>
            </div>
          </div>

          <div class="admin-overview-grid mb-6">
            <div class="admin-overview-card">
              <div class="admin-overview-label">Role</div>
              <div class="admin-overview-value" style="font-size:1.1rem">${profile.jobTitle || 'Not set'}</div>
              <div class="admin-overview-foot">${profile.department || 'No department set'}${profile.businessUnit ? ` · ${profile.businessUnit}` : ''}</div>
            </div>
            <div class="admin-overview-card">
              <div class="admin-overview-label">Focus Areas</div>
              <div class="admin-overview-value" style="font-size:1.1rem">${profile.focusAreas?.length || 0}</div>
              <div class="admin-overview-foot">${profile.focusAreas?.length ? profile.focusAreas.join(', ') : 'No focus areas selected yet'}</div>
            </div>
            <div class="admin-overview-card">
              <div class="admin-overview-label">Personal Geography</div>
              <div class="admin-overview-value" style="font-size:1.1rem">${settings.geography || globalSettings.geography}</div>
              <div class="admin-overview-foot">Used as your default context in new assessments</div>
            </div>
          </div>

          <div class="settings-accordion">
            ${userContextSection}
            ${aiWorkspaceSection}
            ${companyContextSection}
            ${roleManagementSection}
            ${defaultsSection}
          </div>

          <div class="settings-shell__footer">
            <div class="flex items-center gap-3" style="flex-wrap:wrap">
              <button class="btn btn--primary" id="btn-save-user-settings">Save My Settings</button>
              <span class="form-help">These values will be used as your personal defaults in future assessments.</span>
            </div>
            <div class="banner banner--poc mt-6">
              <span class="banner-icon">ℹ</span>
              <span class="banner-text">Global admin context still applies underneath your personal overrides for organisation structure, BU definitions, document library, thresholds, and escalation logic.</span>
            </div>
          </div>
        </div>
      </div>
    </main>`);

  const regsInput = UI.tagInput('ti-user-regulations', settings.applicableRegulations);
  const focusInput = UI.tagInput('ti-user-focus-areas', profile.focusAreas || []);
  const profileEl = document.getElementById('user-company-profile');
  const websiteEl = document.getElementById('user-company-url');
  const businessUnitEl = document.getElementById('user-business-unit');
  const departmentEl = document.getElementById('user-department');
  let userAiSourceText = '';
  let userAiSourceName = '';

  function renderUserDepartmentOptions() {
    const departments = getDepartmentEntities(companyStructure, businessUnitEl.value);
    const preferredDepartmentId = profile.departmentEntityId;
    const fallbackDepartmentId = departments.some(entity => entity.id === preferredDepartmentId) ? preferredDepartmentId : (departments[0]?.id || '');
    departmentEl.innerHTML = departments.length
      ? departments.map(entity => `<option value="${entity.id}" ${entity.id === fallbackDepartmentId ? 'selected' : ''}>${entity.name}</option>`).join('')
      : '<option value="">No departments configured yet</option>';
    departmentEl.disabled = !departments.length;
  }
  businessUnitEl.addEventListener('change', renderUserDepartmentOptions);
  renderUserDepartmentOptions();

  document.querySelectorAll('.user-focus-chip').forEach(button => {
    button.addEventListener('click', () => {
      const next = Array.from(new Set([...(focusInput.getTags() || []), button.dataset.focus]));
      focusInput.setTags(next);
    });
  });

  async function loadUserAiSource() {
    const notes = document.getElementById('user-ai-source-notes')?.value.trim() || '';
    const file = document.getElementById('user-ai-source-file')?.files?.[0];
    let uploadedText = '';
    if (file) {
      const parsed = await parseRegisterFile(file);
      if (looksLikeBinaryRegister(parsed.text) && !['xlsx', 'xls'].includes(getFileExtension(file.name))) {
        throw new Error('The uploaded file appears unreadable. Please use Excel, TXT, CSV, TSV, JSON, or Markdown.');
      }
      uploadedText = parsed.text;
      userAiSourceText = uploadedText;
      userAiSourceName = file.name;
      const help = document.getElementById('user-ai-source-file-help');
      if (help) help.textContent = `Loaded ${file.name}. AI assist will use this content for your personal settings.`;
    }
    return [notes, uploadedText || userAiSourceText].filter(Boolean).join('\n\n');  }

  function buildUserAssistInput(sourceText = '') {
    const businessEntity = getEntityById(companyStructure, businessUnitEl.value.trim());
    const departmentEntity = getEntityById(companyStructure, departmentEl.value.trim());
    return {
      userProfile: {
        fullName: document.getElementById('user-full-name').value.trim() || AppState.currentUser?.displayName || '',
        jobTitle: document.getElementById('user-job-title').value.trim(),
        businessUnit: businessEntity?.name || profile.businessUnit || '',
        department: departmentEntity?.name || profile.department || '',
        focusAreas: focusInput.getTags(),
        preferredOutputs: document.getElementById('user-preferred-outputs').value.trim(),
        workingContext: document.getElementById('user-working-context').value.trim()
      },
      organisationContext: {
        businessUnitContext: businessEntity?.profile || getEntityLayerById(globalSettings, businessEntity?.id || '')?.contextSummary || '',
        departmentContext: departmentEntity?.profile || getEntityLayerById(globalSettings, departmentEntity?.id || '')?.contextSummary || ''
      },
      currentSettings: {
        aiInstructions: document.getElementById('user-ai-instructions').value.trim(),
        adminContextSummary: document.getElementById('user-context-summary').value.trim()
      },
      uploadedText: sourceText
    };
  }

  function buildUserSettingsPayload() {
    const businessUnitEntityId = businessUnitEl.value.trim();
    const departmentEntityId = departmentEl.value.trim();
    const businessEntity = getEntityById(companyStructure, businessUnitEntityId);
    const departmentEntity = getEntityById(companyStructure, departmentEntityId);
    return {
      payload: {
        companyContextSections: {
          companySummary: document.getElementById('user-company-section-summary').value.trim(),
          businessModel: document.getElementById('user-company-section-business-model').value.trim(),
          operatingModel: document.getElementById('user-company-section-operating-model').value.trim(),
          publicCommitments: document.getElementById('user-company-section-commitments').value.trim(),
          keyRiskSignals: document.getElementById('user-company-section-risks').value.trim(),
          obligations: document.getElementById('user-company-section-obligations').value.trim(),
          sources: document.getElementById('user-company-section-sources').value.trim()
        },
        geographyPrimary: document.getElementById('user-geo-primary').value.trim() || globalSettings.geography,
        geographySecondary: document.getElementById('user-geo-secondary').value.trim(),
        geographyTertiary: document.getElementById('user-geo-tertiary').value.trim(),
        geography: document.getElementById('user-geo-primary').value.trim() || globalSettings.geography,
        companyWebsiteUrl: websiteEl.value.trim(),
        companyContextProfile: serialiseCompanyContextSections({
          companySummary: document.getElementById('user-company-section-summary').value.trim(),
          businessModel: document.getElementById('user-company-section-business-model').value.trim(),
          operatingModel: document.getElementById('user-company-section-operating-model').value.trim(),
          publicCommitments: document.getElementById('user-company-section-commitments').value.trim(),
          keyRiskSignals: document.getElementById('user-company-section-risks').value.trim(),
          obligations: document.getElementById('user-company-section-obligations').value.trim(),
          sources: document.getElementById('user-company-section-sources').value.trim()
        }),
        userProfile: {
          fullName: document.getElementById('user-full-name').value.trim() || AppState.currentUser?.displayName || '',
          jobTitle: document.getElementById('user-job-title').value.trim(),
          department: departmentEntity?.name || '',
          businessUnit: businessEntity?.name || '',
          departmentEntityId: departmentEntity?.id || '',
          businessUnitEntityId,
          focusAreas: focusInput.getTags(),
          preferredOutputs: document.getElementById('user-preferred-outputs').value.trim(),
          workingContext: document.getElementById('user-working-context').value.trim()
        },
        defaultLinkMode: document.getElementById('user-link-mode').value === 'yes',
        riskAppetiteStatement: document.getElementById('user-appetite').value.trim() || globalSettings.riskAppetiteStatement,
        applicableRegulations: regsInput.getTags(),
        aiInstructions: document.getElementById('user-ai-instructions').value.trim(),
        benchmarkStrategy: document.getElementById('user-benchmark-strategy').value.trim() || globalSettings.benchmarkStrategy,
        adminContextSummary: document.getElementById('user-context-summary').value.trim() || globalSettings.adminContextSummary
      },
      businessUnitEntityId,
      departmentEntityId: departmentEntity?.id || ''
    };
  }

  function persistUserSettings(showToast = false) {
    const { payload, businessUnitEntityId, departmentEntityId } = buildUserSettingsPayload();
    saveUserSettings(payload);
    AuthService.updateSessionContext({ businessUnitEntityId, departmentEntityId });
    if (!AppState.draft.geography) AppState.draft.geography = getEffectiveSettings().geography;
    saveDraft();
    if (showToast) UI.toast('Personal settings saved.', 'success');
  }

  const userSettingsRoot = document.querySelector('.settings-shell');
  bindAutosave(userSettingsRoot, () => persistUserSettings(false));

  document.getElementById('btn-save-user-settings').addEventListener('click', async () => {
    persistUserSettings(true);
    await logAuditEvent({ category: 'profile', eventType: 'personal_settings_saved', target: AuthService.getCurrentUser()?.username || '', status: 'success', source: 'client' });
  });

  document.getElementById('btn-user-add-department')?.addEventListener('click', () => {
    if (!selectedBusinessEntity) return;
    openOrgEntityEditor({
      structure: companyStructure,
      seed: {
        type: 'Department / function',
        parentId: selectedBusinessEntity.id
      },
      onSave: (node, modal) => {
        const nextSettings = getAdminSettings();
        const nextStructure = Array.isArray(nextSettings.companyStructure) ? [...nextSettings.companyStructure] : [];
        nextStructure.push(node);
        saveAdminSettings({
          ...nextSettings,
          companyStructure: nextStructure
        });
        modal.close();
        UI.toast(`${node.name} added beneath ${selectedBusinessEntity.name}.`, 'success');
        renderUserPreferences(getUserSettings());
      }
    });
  });

  document.querySelectorAll('.btn-user-edit-department').forEach(button => {
    button.addEventListener('click', () => {
      const department = getEntityById(companyStructure, button.dataset.departmentId || '');
      if (!department) return;
      openOrgEntityEditor({
        structure: companyStructure,
        existingNode: department,
        onSave: (node, modal) => {
          const nextSettings = getAdminSettings();
          const nextStructure = Array.isArray(nextSettings.companyStructure) ? [...nextSettings.companyStructure] : [];
          const index = nextStructure.findIndex(item => item.id === node.id);
          if (index > -1) nextStructure[index] = node;
          saveAdminSettings({
            ...nextSettings,
            companyStructure: nextStructure
          });
          modal.close();
          UI.toast(`${node.name} updated.`, 'success');
          renderUserPreferences(getUserSettings());
        }
      });
    });
  });

  document.querySelectorAll('.btn-user-edit-department-context').forEach(button => {
    button.addEventListener('click', () => {
      const department = getEntityById(companyStructure, button.dataset.departmentId || '');
      if (!department) return;
      openEntityContextLayerEditor({
        entity: department,
        settings: globalSettings,
        onSave: (nextLayer, modal) => {
          const nextSettings = getAdminSettings();
          const layers = Array.isArray(nextSettings.entityContextLayers) ? [...nextSettings.entityContextLayers] : [];
          const index = layers.findIndex(item => item.entityId === nextLayer.entityId);
          if (index > -1) layers[index] = nextLayer;
          else layers.push(nextLayer);
          saveAdminSettings({
            ...nextSettings,
            entityContextLayers: layers
          });
          modal.close();
          UI.toast(`Saved context for ${department.name}.`, 'success');
          renderUserPreferences(getUserSettings());
        }
      });
    });
  });

  document.getElementById('btn-manage-owned-department')?.addEventListener('click', () => {
    if (!selectedDepartment) return;
    openEntityContextLayerEditor({
      entity: selectedDepartment,
      onSave: (nextLayer, modal) => {
        const nextSettings = getAdminSettings();
        const layers = Array.isArray(nextSettings.entityContextLayers) ? [...nextSettings.entityContextLayers] : [];
        const index = layers.findIndex(item => item.entityId === nextLayer.entityId);
        if (index > -1) layers[index] = nextLayer;
        else layers.push(nextLayer);
        saveAdminSettings({
          ...nextSettings,
          entityContextLayers: layers
        });
        modal.close();
        UI.toast(`Saved context for ${selectedDepartment.name}.`, 'success');
        renderUserPreferences(getUserSettings());
      },
      readOnlyIdentity: true
    });
  });

  document.getElementById('btn-build-user-context').addEventListener('click', async () => {
    const btn = document.getElementById('btn-build-user-context');
    const websiteUrl = websiteEl.value.trim();
    const llmConfig = getSessionLLMConfig();
    if (!websiteUrl) {
      UI.toast('Enter a company website URL first.', 'warning');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Building context…';
    try {
      LLMService.setCompassConfig(llmConfig);
      const result = await LLMService.buildCompanyContext(websiteUrl);
      const sections = buildCompanyContextSections(result);
      const profileText = serialiseCompanyContextSections(sections);
      profileEl.value = profileText;
      document.getElementById('user-company-section-summary').value = sections.companySummary || '';
      document.getElementById('user-company-section-business-model').value = sections.businessModel || '';
      document.getElementById('user-company-section-operating-model').value = sections.operatingModel || '';
      document.getElementById('user-company-section-commitments').value = sections.publicCommitments || '';
      document.getElementById('user-company-section-risks').value = sections.keyRiskSignals || '';
      document.getElementById('user-company-section-obligations').value = sections.obligations || '';
      document.getElementById('user-company-section-sources').value = sections.sources || '';
      if (!document.getElementById('user-context-summary').value.trim()) {
        document.getElementById('user-context-summary').value = result.companySummary || '';
      }
      if (result.aiGuidance) {
        document.getElementById('user-ai-instructions').value = result.aiGuidance;
      }
      if (result.suggestedGeography && !document.getElementById('user-geo').value.trim()) {
        document.getElementById('user-geo').value = result.suggestedGeography;
      }
      if (Array.isArray(result.regulatorySignals) && result.regulatorySignals.length) {
        regsInput.setTags(Array.from(new Set([...regsInput.getTags(), ...result.regulatorySignals])));
      }
      UI.toast('Personal company context built from public sources.', 'success', 5000);
    } catch (error) {
      UI.toast('Company context build failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Build from Website';
    }
  });

  document.getElementById('btn-user-role-ai').addEventListener('click', async () => {
    const btn = document.getElementById('btn-user-role-ai');
    btn.disabled = true;
    btn.textContent = 'Building…';
    try {
      const sourceText = await loadUserAiSource();
      const llmConfig = getSessionLLMConfig();
      LLMService.setCompassConfig({
        apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
        model: llmConfig.model || 'gpt-5.1',
        apiKey: llmConfig.apiKey || ''
      });
      const result = await LLMService.buildUserPreferenceAssist(buildUserAssistInput(sourceText));
      document.getElementById('user-working-context').value = result.workingContext || document.getElementById('user-working-context').value;
      document.getElementById('user-preferred-outputs').value = result.preferredOutputs || document.getElementById('user-preferred-outputs').value;
      if (result.aiInstructions && !document.getElementById('user-ai-instructions').value.trim()) {
        document.getElementById('user-ai-instructions').value = result.aiInstructions;
      }
      UI.toast('Role context and preferred output style drafted.', 'success', 5000);
    } catch (error) {
      UI.toast('AI assist failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI Assist Role Context';
    }
  });

  document.getElementById('btn-user-defaults-ai').addEventListener('click', async () => {
    const btn = document.getElementById('btn-user-defaults-ai');
    btn.disabled = true;
    btn.textContent = 'Building…';
    try {
      const sourceText = await loadUserAiSource();
      const llmConfig = getSessionLLMConfig();
      LLMService.setCompassConfig({
        apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
        model: llmConfig.model || 'gpt-5.1',
        apiKey: llmConfig.apiKey || ''
      });
      const result = await LLMService.buildUserPreferenceAssist(buildUserAssistInput(sourceText));
      document.getElementById('user-context-summary').value = result.adminContextSummary || document.getElementById('user-context-summary').value;
      document.getElementById('user-ai-instructions').value = result.aiInstructions || document.getElementById('user-ai-instructions').value;
      UI.toast('Personal defaults drafted from your source material.', 'success', 5000);
    } catch (error) {
      UI.toast('AI assist failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI Assist Personal Defaults';
    }
  });

  document.getElementById('btn-reset-user-settings').addEventListener('click', async () => {
    if (await UI.confirm('Reset your personal settings to the global admin defaults?')) {
      localStorage.removeItem(buildUserStorageKey(USER_SETTINGS_STORAGE_PREFIX));
      UI.toast('Your personal settings were reset.', 'success');
      renderUserOnboarding(getUserSettings(), 0);
    }
  });

  document.getElementById('btn-rerun-onboarding').addEventListener('click', () => {
    renderUserOnboarding(getUserSettings(), 0);
  });
}

function renderAdminSettings(activeSection = 'org') {
  if (!requireAdmin()) return;
  const settings = getAdminSettings();
  const companyStructure = Array.isArray(settings.companyStructure) ? [...settings.companyStructure] : [];
  const entityContextLayers = Array.isArray(settings.entityContextLayers) ? [...settings.entityContextLayers] : [];
  const companyContextSections = settings.companyContextSections || buildCompanyContextSections({
    companySummary: settings.adminContextSummary || '',
    businessProfile: settings.companyContextProfile || ''
  });
  const sessionLLM = getSessionLLMConfig();
  const directCompass = !sessionLLM.apiUrl || sessionLLM.apiUrl.includes('api.core42.ai');
  const buCount = getBUList().length;
  const docCount = getDocList().length;
  const managedAccounts = AuthService.getManagedAccounts();
  const companyEntities = companyStructure.filter(node => isCompanyEntityType(node.type));
  const departmentEntities = companyStructure.filter(node => isDepartmentEntityType(node.type));
  const settingsSectionMeta = {
    org: { title: 'Organisation Setup', description: 'Build the organisation tree first, then tune risk context from the left navigation.' },
    company: { title: 'AI Company Context Builder', description: 'Build public company context and place it into the organisation structure.' },
    defaults: { title: 'Platform Defaults And Governance', description: 'Manage thresholds, regulations, risk appetite, and global AI defaults.' },
    access: { title: 'System Access', description: 'Configure the Compass proxy, model, and session-level access controls.' },
    users: { title: 'User Account Control', description: 'Manage shared users, roles, BU assignments, and issued passwords.' },
    audit: { title: 'Audit Log', description: 'Review short-retention PoC audit events and sign-in statistics.' }
  };
  const currentSettingsSection = settingsSectionMeta[activeSection] ? activeSection : 'org';
  const adminIntroSection = renderSettingsSection({
    title: 'How This Screen Works',
    scope: 'admin-settings',
    description: 'Build the organisation tree first, manage context from each entity, then rely on platform defaults as fallback.',
    open: true,
    meta: `${companyEntities.length} business units mapped`,
    body: `<div class="context-grid">
      <div class="context-chip-panel">
        <div class="context-panel-title">1. Build the organisation tree</div>
        <p class="context-panel-copy">Add holdings, subsidiaries, portfolio companies, partners, and departments in one place.</p>
      </div>
      <div class="context-chip-panel">
        <div class="context-panel-title">2. Manage context from each node</div>
        <p class="context-panel-copy">Use the tree actions to edit retained business or department context directly on the entity you are working on.</p>
      </div>
      <div class="context-chip-panel">
        <div class="context-panel-title">3. Use platform defaults as fallback</div>
        <p class="context-panel-copy">Global geography, regulations, thresholds, and AI defaults sit underneath the entity-specific setup.</p>
      </div>
    </div>`
  });
  const organisationTreeSection = renderSettingsSection({
    title: 'Organisation Tree',
    scope: 'admin-settings',
    description: "Use this as the main operating view. Add businesses and departments here, then manage each node's retained context from the same tree.",
    meta: `${companyEntities.length} businesses · ${departmentEntities.length} departments`,
    open: true,
    body: `<div class="card" style="padding:var(--sp-5);background:var(--bg-elevated)">
      <div class="context-panel-title">Organisation Tree</div>
      <div class="flex items-center gap-3 mt-3" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-add-org-entity">Add Entity</button>
        <button class="btn btn--secondary" id="btn-add-org-function">Add Function / Department</button>
        <span class="form-help">Context is now managed directly inside the tree.</span>
      </div>
      <div id="admin-company-structure-summary" class="mt-4">${renderCompanyStructureSummary(companyStructure)}</div>
    </div>`
  });
  const companyBuilderSection = renderSettingsSection({
    title: 'AI Company Context Builder',
    scope: 'admin-settings',
    description: 'Build public context for a company website, then place it into the organisation tree as a holding company, subsidiary, portfolio company, partner, or operating business.',
    meta: settings.companyWebsiteUrl ? 'Website loaded' : 'Optional',
    body: `<div class="grid-2">
      <div class="form-group">
        <label class="form-label" for="admin-company-url">Company Website URL</label>
        <input class="form-input" id="admin-company-url" value="${settings.companyWebsiteUrl || ''}" placeholder="https://example.com">
        <span class="form-help">Works through the hosted proxy. Direct browser-to-Compass mode cannot build website context.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="admin-company-profile">Company Risk Context Profile</label>
        <textarea class="form-textarea" id="admin-company-profile" rows="6" placeholder="Public business profile, operating model, technology exposure, and likely risk signals.">${settings.companyContextProfile || ''}</textarea>
      </div>
    </div>
    <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-canvas)">
      <div class="context-panel-title">Editable Company Brief</div>
      <div class="form-group mt-3">
        <label class="form-label" for="admin-company-section-summary">Company Summary</label>
        <textarea class="form-textarea" id="admin-company-section-summary" rows="3">${companyContextSections.companySummary || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="admin-company-section-business-model">Business Model</label>
        <textarea class="form-textarea" id="admin-company-section-business-model" rows="3">${companyContextSections.businessModel || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="admin-company-section-operating-model">Operating Model</label>
        <textarea class="form-textarea" id="admin-company-section-operating-model" rows="3">${companyContextSections.operatingModel || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="admin-company-section-commitments">Public Commitments</label>
        <textarea class="form-textarea" id="admin-company-section-commitments" rows="4">${companyContextSections.publicCommitments || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="admin-company-section-risks">Key Risk Signals</label>
        <textarea class="form-textarea" id="admin-company-section-risks" rows="4">${companyContextSections.keyRiskSignals || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="admin-company-section-obligations">Obligations And Exposures</label>
        <textarea class="form-textarea" id="admin-company-section-obligations" rows="4">${companyContextSections.obligations || ''}</textarea>
      </div>
      <div class="form-group mt-3">
        <label class="form-label" for="admin-company-section-sources">Sources Reviewed</label>
        <textarea class="form-textarea" id="admin-company-section-sources" rows="4">${companyContextSections.sources || ''}</textarea>
      </div>
    </div>
    <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
      <button class="btn btn--secondary" id="btn-build-company-context">Build from Website</button>
      <span class="form-help">This opens a review step so you can decide where the entity sits in the group.</span>
    </div>`
  });
  const platformDefaultsSection = renderSettingsSection({
    title: 'Platform Defaults And Governance',
    scope: 'admin-settings',
    description: 'These are fallback rules for the whole platform after the organisation tree and entity context are in place.',
    meta: `${settings.geography} default geography`,
    body: `<div class="grid-3">
      <div class="form-group">
        <label class="form-label" for="admin-warning-threshold">Warning Trigger (USD)</label>
        <input class="form-input" id="admin-warning-threshold" type="number" min="0" step="100000" value="${settings.warningThresholdUsd}">
        <span class="form-help">Amber signal when per-event P90 reaches this value.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="admin-tolerance-threshold">Tolerance Threshold (USD)</label>
        <input class="form-input" id="admin-tolerance-threshold" type="number" min="0" step="100000" value="${settings.toleranceThresholdUsd}">
        <span class="form-help">Red trigger when per-event P90 exceeds this value.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="admin-annual-threshold">Annual Review Trigger (USD)</label>
        <input class="form-input" id="admin-annual-threshold" type="number" min="0" step="100000" value="${settings.annualReviewThresholdUsd}">
        <span class="form-help">Used to flag high annual exposure in the results view.</span>
      </div>
    </div>
    <div class="form-group mt-4">
      <label class="form-label" for="admin-escalation-guidance">Escalation Guidance</label>
      <textarea class="form-textarea" id="admin-escalation-guidance" rows="3">${settings.escalationGuidance}</textarea>
    </div>
    <div class="form-group mt-4">
      <label class="form-label" for="admin-appetite">Risk Appetite Statement</label>
      <textarea class="form-textarea" id="admin-appetite" rows="4">${settings.riskAppetiteStatement}</textarea>
    </div>
    <div class="grid-2 mt-4">
      <div class="form-group">
        <label class="form-label" for="admin-geo">Default Geography</label>
        <input class="form-input" id="admin-geo" value="${settings.geography}">
      </div>
      <div class="form-group">
        <label class="form-label" for="admin-link-mode">Default Linked-Risk Mode</label>
        <select class="form-select" id="admin-link-mode">
          <option value="yes" ${settings.defaultLinkMode ? 'selected' : ''}>Enabled</option>
          <option value="no" ${!settings.defaultLinkMode ? 'selected' : ''}>Disabled</option>
        </select>
      </div>
    </div>
    <div class="form-group mt-4">
      <label class="form-label" for="admin-context-summary">Admin Context Summary</label>
      <textarea class="form-textarea" id="admin-context-summary" rows="2">${settings.adminContextSummary}</textarea>
    </div>
    <div class="form-group mt-4">
      <label class="form-label">Applicable Regulations</label>
      <div class="tag-input-wrap" id="ti-admin-regulations"></div>
    </div>
    <div class="form-group mt-4">
      <label class="form-label" for="admin-ai-instructions">AI Guidance</label>
      <textarea class="form-textarea" id="admin-ai-instructions" rows="3">${settings.aiInstructions}</textarea>
    </div>
    <div class="form-group mt-4">
      <label class="form-label" for="admin-benchmark-strategy">Benchmark Strategy</label>
      <textarea class="form-textarea" id="admin-benchmark-strategy" rows="3">${settings.benchmarkStrategy}</textarea>
      <span class="form-help">Explain whether the AI should prefer GCC or UAE references first, and how it should justify any global fallback.</span>
    </div>
    <div class="admin-inline-actions mt-4">
      <a class="btn btn--secondary" href="#/admin/bu">Open Org Customisation</a>
      <a class="btn btn--secondary" href="#/admin/docs">Open Document Library</a>
    </div>`
  });
  const systemAccessSection = renderSettingsSection({
    title: 'System Access',
    scope: 'admin-settings',
    description: directCompass ? 'Use direct Compass access for temporary testing only. For production, prefer a hosted proxy URL such as the Vercel endpoint.' : 'A hosted proxy URL is configured. Leave the browser key blank and test through the proxy.',
    meta: sessionLLM.model || 'gpt-5.1',
    body: `<div class="grid-2">
      <div class="form-group">
        <label class="form-label" for="admin-compass-url">Compass URL</label>
        <input class="form-input" id="admin-compass-url" value="${sessionLLM.apiUrl || DEFAULT_COMPASS_PROXY_URL}">
        <span class="form-help">Use <code>${DEFAULT_COMPASS_PROXY_URL}</code> for the hosted proxy path.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="admin-compass-model">Model</label>
        <input class="form-input" id="admin-compass-model" value="${sessionLLM.model || 'gpt-5.1'}">
      </div>
    </div>
    <div class="form-group mt-4">
      <label class="form-label" for="admin-compass-key">Compass API Key</label>
      <input class="form-input" id="admin-compass-key" type="password" value="${sessionLLM.apiKey || ''}" placeholder="Paste key for this browser session">
      <span class="form-help">Leave blank when using the hosted proxy. Only use a browser key for temporary direct testing.</span>
    </div>
    <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
      <button class="btn btn--secondary" id="btn-save-session-llm">Save Session Key</button>
      <button class="btn btn--secondary" id="btn-test-session-llm">Test Connection</button>
      <button class="btn btn--ghost" id="btn-clear-session-llm">Clear Session Key</button>
      <span class="form-help">Stored in this admin browser for the PoC until you clear it.</span>
    </div>`
  });
  const auditCache = AppState.auditLogCache || { loaded: false, loading: false, entries: [], summary: null, error: '' };
  const auditSummary = auditCache.summary || {};
  const auditEntries = Array.isArray(auditCache.entries) ? auditCache.entries.slice(0, 25) : [];
  const auditLogSection = renderSettingsSection({
    title: 'Audit Log',
    scope: 'admin-settings',
    description: 'Short-retention PoC audit trail for login activity, user management, and shared settings changes.',
    meta: auditSummary.total ? `${auditSummary.total} retained events` : 'Demo retention only',
    body: `<div class="admin-overview-grid">
      <div class="admin-overview-card"><div class="admin-overview-label">Login Success</div><div class="admin-overview-value">${auditSummary.loginSuccessCount || 0}</div></div>
      <div class="admin-overview-card"><div class="admin-overview-label">Login Failure</div><div class="admin-overview-value">${auditSummary.loginFailureCount || 0}</div></div>
      <div class="admin-overview-card"><div class="admin-overview-label">Logout</div><div class="admin-overview-value">${auditSummary.logoutCount || 0}</div></div>
      <div class="admin-overview-card"><div class="admin-overview-label">Admin Actions</div><div class="admin-overview-value">${auditSummary.adminActionCount || 0}</div></div>
      <div class="admin-overview-card"><div class="admin-overview-label">BU Admin Actions</div><div class="admin-overview-value">${auditSummary.buAdminActionCount || 0}</div></div>
      <div class="admin-overview-card"><div class="admin-overview-label">User Actions</div><div class="admin-overview-value">${auditSummary.userActionCount || 0}</div></div>
    </div>
    <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
      <button class="btn btn--secondary" id="btn-refresh-audit-log" type="button">${auditCache.loading ? 'Refreshing…' : 'Refresh Audit Log'}</button>
      <span class="form-help" id="audit-log-status">${auditCache.error || `Retention is capped at ${auditSummary.retainedCapacity || 200} recent events and older entries are overwritten.`}</span>
    </div>
    <div class="table-wrap mt-4">
      <table>
        <thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Event</th><th>Target</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>${auditEntries.length ? auditEntries.map(entry => `<tr><td>${new Date(entry.ts).toLocaleString()}</td><td>${entry.actorUsername || 'system'}</td><td>${entry.actorRole || 'system'}</td><td>${entry.eventType || 'event'}</td><td>${entry.target || '—'}</td><td>${entry.status || 'success'}</td><td>${formatAuditDetails(entry.details) || '—'}</td></tr>`).join('') : '<tr><td colspan="7">No audit events loaded yet.</td></tr>'}</tbody>
      </table>
    </div>`
  });

  const userControlsSection = renderSettingsSection({
    title: 'User Account Control',
    scope: 'admin-settings',
    description: 'Create PoC users, assign them to a BU and function, and verify whether the shared user store is live.',
    meta: `${managedAccounts.length} managed accounts`,
    body: `<div class="card" style="padding:var(--sp-4);background:var(--bg-canvas)">
      <div class="context-panel-title">Shared User Store</div>
      <div class="grid-2 mt-3">
        <div class="form-group">
          <label class="form-label" for="admin-api-secret">Admin API Secret</label>
          <input class="form-input" id="admin-api-secret" type="password" placeholder="Paste the Vercel admin secret for this browser" value="${AuthService.getAdminApiSecret() || ''}">
          <span class="form-help">Stored in this browser for the PoC. Required for admin-only user actions.</span>
        </div>
      </div>
      <div class="flex items-center gap-3 mt-3" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-save-admin-secret" type="button">Save Admin Secret</button>
        <button class="btn btn--ghost" id="btn-clear-admin-secret" type="button">Clear Admin Secret</button>
        <button class="btn btn--secondary" id="btn-test-users-store" type="button">Test Shared User Store</button>
        <span class="form-help" id="admin-users-store-status">Checks whether the Vercel user store is reachable from this browser.</span>
      </div>
    </div>
    <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-canvas)">
      <div class="context-panel-title">Add User</div>
      <div class="grid-4 mt-3">
        <div class="form-group">
          <label class="form-label" for="admin-new-user-name">Display name</label>
          <input class="form-input" id="admin-new-user-name" placeholder="e.g. Sara Finance">
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-new-user-role">Role</label>
          <select class="form-select" id="admin-new-user-role">
            <option value="user">Standard user</option>
            <option value="bu_admin">BU admin</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-new-user-bu">Business unit</label>
          <select class="form-select" id="admin-new-user-bu">
            <option value="">Choose BU</option>
            ${companyEntities.map(entity => `<option value="${entity.id}">${entity.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-new-user-department">Function / department</label>
          <select class="form-select" id="admin-new-user-department"><option value="">Choose function</option></select>
        </div>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-admin-add-user">Add User</button>
        <span class="form-help" id="admin-new-user-result">${AppState.adminNewUserStatus || 'A username and password will be generated automatically. Passwords are shown only when first issued or reset in this admin session.'}</span>
      </div>
    </div>
    <div class="table-wrap mt-4">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Username</th>
            <th>Role</th>
            <th>Assigned BU</th>
            <th>Assigned Function</th>
            <th>Issued Password</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${managedAccounts.map(account => {
            const departmentsForAccount = getDepartmentEntities(companyStructure, account.businessUnitEntityId || '');
            return `
            <tr class="managed-account-row" data-username="${account.username}">
              <td>${account.displayName}</td>
              <td><code>${account.username}</code></td>
              <td>
                <select class="form-select form-select--sm account-role-select" data-username="${account.username}">
                  <option value="user" ${account.role === 'user' ? 'selected' : ''}>Standard user</option>
                  <option value="bu_admin" ${account.role === 'bu_admin' ? 'selected' : ''}>BU admin</option>
                </select>
              </td>
              <td>
                <select class="form-select form-select--sm account-bu-select" data-username="${account.username}">
                  <option value="">Choose BU</option>
                  ${companyEntities.map(entity => `<option value="${entity.id}" ${entity.id === (account.businessUnitEntityId || '') ? 'selected' : ''}>${entity.name}</option>`).join('')}
                </select>
              </td>
              <td>
                <select class="form-select form-select--sm account-department-select" data-username="${account.username}">
                  <option value="">${account.role === 'bu_admin' ? 'Optional for BU admin' : 'Choose function'}</option>
                  ${departmentsForAccount.map(entity => `<option value="${entity.id}" ${entity.id === (account.departmentEntityId || '') ? 'selected' : ''}>${entity.name}</option>`).join('')}
                </select>
              </td>
              <td><code>${AppState.adminVisiblePasswords[account.username] || 'Reset to issue'}</code></td>
              <td style="text-align:right">
                <button class="btn btn--secondary btn--sm btn-apply-user-access" data-username="${account.username}" data-display-name="${account.displayName}" type="button">Apply</button>
                <button class="btn btn--ghost btn--sm btn-reset-user-account" data-username="${account.username}" data-display-name="${account.displayName}" type="button">Reset User</button>
                <button class="btn btn--secondary btn--sm btn-reset-user-password" data-username="${account.username}" data-display-name="${account.displayName}" type="button">Reset Password</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="form-help mt-3">Reset only affects browser-stored state. Account creation and BU/function assignment are shared through the Vercel user store.</div>`
  });
  const adminSectionBody = {
    org: adminIntroSection + organisationTreeSection,
    company: companyBuilderSection,
    defaults: platformDefaultsSection,
    access: systemAccessSection,
    users: userControlsSection,
    audit: auditLogSection
  }[currentSettingsSection] || (adminIntroSection + organisationTreeSection);

  setPage(adminLayout('settings', `
    <div class="settings-shell">
      <div class="settings-shell__header">
        <div class="flex items-center justify-between" style="gap:var(--sp-4);flex-wrap:wrap">
          <div>
            <h2>${settingsSectionMeta[currentSettingsSection].title}</h2>
            <p style="margin-top:6px">${settingsSectionMeta[currentSettingsSection].description}</p>
          </div>
          <button class="btn btn--secondary" id="btn-reset-settings">Reset Defaults</button>
        </div>
        <div class="admin-overview-grid">
          <div class="admin-overview-card">
            <div class="admin-overview-label">Businesses</div>
            <div class="admin-overview-value">${companyEntities.length}</div>
            <div class="admin-overview-foot">Holding, operating, JV, listed, and partner entities in the structure</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Departments</div>
            <div class="admin-overview-value">${departmentEntities.length}</div>
            <div class="admin-overview-foot">Functions attached beneath business entities</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Context Layers</div>
            <div class="admin-overview-value">${entityContextLayers.length}</div>
            <div class="admin-overview-foot">Entity-specific overlays for regulations, appetite, and AI behaviour</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Org Customisation</div>
            <div class="admin-overview-value">${buCount}</div>
            <div class="admin-overview-foot">Assessment-ready BU context derived from the organisation tree</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Document Library</div>
            <div class="admin-overview-value">${docCount}</div>
            <div class="admin-overview-foot">Used for citations and document-grounded AI support</div>
          </div>
        </div>
      </div>
      <div class="settings-accordion">
        ${adminSectionBody}
      </div>
      <div class="settings-shell__footer">
        <div class="flex items-center gap-3" style="flex-wrap:wrap">
          <button class="btn btn--primary" id="btn-save-settings">Save Settings</button>
          <span class="form-help">Applies to new and in-progress assessments immediately.</span>
        </div>
      </div>
    </div>`, currentSettingsSection));
  bindSettingsSectionState('admin-settings', document);
  restoreSettingsScroll('admin-settings');

  document.getElementById('btn-admin-logout').addEventListener('click', () => { performLogout(); });
  document.getElementById('btn-refresh-audit-log')?.addEventListener('click', async () => {
    try {
      await loadAuditLog();
      rememberSettingsScroll('admin-settings');
      renderAdminSettings();
    } catch (error) {
      UI.toast(`Audit log refresh failed: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    }
  });
  if (!AppState.auditLogCache.loaded && !AppState.auditLogCache.loading) {
    loadAuditLog().then(() => {
      rememberSettingsScroll('admin-settings');
      renderAdminSettings();
    }).catch(() => {});
  }
  const regsInput = UI.tagInput('ti-admin-regulations', settings.applicableRegulations);
  const structureSummaryEl = document.getElementById('admin-company-structure-summary');
  const layerSummaryEl = document.getElementById('admin-layer-summary-list');
  const profileEl = document.getElementById('admin-company-profile');
  const websiteEl = document.getElementById('admin-company-url');

  function persistAdminTreeState() {
    saveAdminSettings({
      ...getAdminSettings(),
      companyStructure,
      entityContextLayers
    });
  }

  function refreshStructureSummary() {
    structureSummaryEl.innerHTML = renderCompanyStructureSummary(companyStructure);
    bindStructureActionHandlers();
  }

  function renderEntityLayerSummary() {
    if (!layerSummaryEl) return;
    if (!entityContextLayers.length) {
      layerSummaryEl.innerHTML = `<div class="form-help">No business or department context layers saved yet.</div>`;
      return;
    }
    const idToNode = new Map(companyStructure.map(node => [node.id, node]));
    layerSummaryEl.innerHTML = entityContextLayers.map(layer => {
      const node = idToNode.get(layer.entityId);
      return `
        <div class="card" style="padding:var(--sp-4);margin-top:12px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="badge badge--gold">${node?.type || 'Saved layer'}</span>
            <strong style="color:var(--text-primary)">${node?.name || layer.entityName}</strong>
            ${layer.geography ? `<span class="form-help" style="margin-top:0">${layer.geography}</span>` : ''}
            <button class="btn btn--ghost btn--sm admin-layer-edit" data-layer-id="${layer.entityId}" type="button">Edit</button>
            <button class="btn btn--ghost btn--sm admin-layer-delete" data-layer-id="${layer.entityId}" type="button">Remove</button>
          </div>
          ${layer.contextSummary ? `<div class="form-help" style="margin-top:8px">${layer.contextSummary}</div>` : ''}
          ${layer.applicableRegulations?.length ? `<div class="citation-chips" style="margin-top:8px">${layer.applicableRegulations.map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('')}</div>` : ''}
        </div>`;
    }).join('');
    bindLayerActionHandlers();
  }


  function bindLayerActionHandlers() {
    layerSummaryEl?.querySelectorAll('.admin-layer-edit').forEach(button => {
      button.addEventListener('click', () => {
        const target = companyStructure.find(item => item.id === button.dataset.layerId);
        if (!target) return;
        openEntityContextLayerEditor({
          entity: target,
          settings: getAdminSettings(),
          onSave: (nextLayer, modal) => {
            const existingIndex = entityContextLayers.findIndex(item => item.entityId === nextLayer.entityId);
            if (existingIndex > -1) entityContextLayers[existingIndex] = nextLayer;
            else entityContextLayers.push(nextLayer);
            persistAdminTreeState();
            modal.close();
            renderEntityLayerSummary();
            UI.toast(`Saved context for ${target.name}.`, 'success');
          }
        });
      });
    });
    layerSummaryEl?.querySelectorAll('.admin-layer-delete').forEach(button => {
      button.addEventListener('click', async () => {
        const entityId = button.dataset.layerId;
        const index = entityContextLayers.findIndex(item => item.entityId === entityId);
        if (index < 0) return;
        if (!await UI.confirm('Remove this business or department context layer?')) return;
        entityContextLayers.splice(index, 1);
        persistAdminTreeState();
        renderEntityLayerSummary();
        UI.toast('Context layer removed.', 'success');
      });
    });
  }

  function upsertCompanyStructureNode(node) {
    const index = companyStructure.findIndex(item => item.id === node.id);
    if (index > -1) companyStructure[index] = node;
    else companyStructure.push(node);
    persistAdminTreeState();
    refreshStructureSummary();
    renderEntityLayerSummary();
  }

  function openEntityEditor(existingNode = null, seed = {}) {
    const departmentEditorMode = isDepartmentEntityType(existingNode?.type || seed.type || '');
    const editor = openOrgEntityEditor({
      structure: companyStructure,
      existingNode,
      seed,
      onSave: (node, modal) => {
        if (node.contextSections) {
          node.profile = serialiseCompanyContextSections(node.contextSections);
        }
        upsertCompanyStructureNode(node);
        if (node.profile && profileEl) profileEl.value = node.profile;
        if (node.websiteUrl && websiteEl) websiteEl.value = node.websiteUrl;
        modal.close();
        UI.toast(`${node.name} saved to the organisation tree.`, 'success', 5000);
      }
    });
    const buildContextBtn = document.getElementById('btn-org-build-context');
    if (buildContextBtn && !departmentEditorMode) {
      buildContextBtn.addEventListener('click', async () => {
        const llmConfig = getAdminLLMConfig();
        const targetUrl = document.getElementById('org-website-url').value.trim();
        if (!targetUrl) {
          UI.toast('Enter a company website URL first.', 'warning');
          return;
        }
        buildContextBtn.disabled = true;
        buildContextBtn.textContent = 'Building context…';
        try {
          LLMService.setCompassConfig(llmConfig);
          const result = await LLMService.buildCompanyContext(targetUrl);
          const sections = buildCompanyContextSections(result);
          const profileText = serialiseCompanyContextSections(sections);
          editor.setProfile(profileText);
          editor.setSections(sections);
          if (!document.getElementById('org-entity-name').value.trim()) {
            editor.setName(inferCompanyNameFromUrl(targetUrl));
          }
          if (Array.isArray(result.regulatorySignals) && result.regulatorySignals.length && regsInput?.setTags) {
            regsInput.setTags(Array.from(new Set([...(regsInput.getTags() || []), ...result.regulatorySignals])));
          }
          const adminAiInstructionsEl = document.getElementById('admin-ai-instructions');
          if (result.aiGuidance && adminAiInstructionsEl) {
            adminAiInstructionsEl.value = result.aiGuidance;
          }
          const adminGeoEl = document.getElementById('admin-geo');
          if (result.suggestedGeography && adminGeoEl && !adminGeoEl.value.trim()) {
            adminGeoEl.value = result.suggestedGeography;
          }
          UI.toast('Company context built. Review the entity details and save it into the organisation tree.', 'success', 5000);
        } catch (error) {
          UI.toast('Company context build failed: ' + error.message, 'danger', 6000);
        } finally {
          buildContextBtn.disabled = false;
          buildContextBtn.textContent = 'Build Context from Website';
        }
      });
    }
  }

  function bindStructureActionHandlers() {
    structureSummaryEl.querySelectorAll('.org-summary-action').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-context').forEach(button => {
      button.addEventListener('click', () => {
        const target = companyStructure.find(node => node.id === button.dataset.orgId);
        if (!target) return;
        openEntityContextLayerEditor({
          entity: target,
          settings: getAdminSettings(),
          onSave: (nextLayer, modal) => {
            const existingIndex = entityContextLayers.findIndex(item => item.entityId === nextLayer.entityId);
            if (existingIndex > -1) entityContextLayers[existingIndex] = nextLayer;
            else entityContextLayers.push(nextLayer);
            persistAdminTreeState();
            modal.close();
            renderEntityLayerSummary();
            UI.toast(`Saved context for ${target.name}.`, 'success');
          }
        });
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-add-department').forEach(button => {
      button.addEventListener('click', () => {
        openEntityEditor(null, {
          type: 'Department / function',
          parentId: button.dataset.orgId || ''
        });
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-edit').forEach(button => {
      button.addEventListener('click', () => {
        const target = companyStructure.find(node => node.id === button.dataset.orgId);
        if (target) openEntityEditor(target);
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-delete').forEach(button => {
      button.addEventListener('click', async () => {
        const targetId = button.dataset.orgId;
        const target = companyStructure.find(node => node.id === targetId);
        if (!target) return;
        if (!await UI.confirm(`Remove ${target.name} and anything nested beneath it from the organisation tree?`)) return;
        const removeIds = new Set([targetId]);
        let changed = true;
        while (changed) {
          changed = false;
          companyStructure.forEach(node => {
            if (node.parentId && removeIds.has(node.parentId) && !removeIds.has(node.id)) {
              removeIds.add(node.id);
              changed = true;
            }
          });
        }
        for (let i = companyStructure.length - 1; i >= 0; i -= 1) {
          if (removeIds.has(companyStructure[i].id)) companyStructure.splice(i, 1);
        }
        for (let i = entityContextLayers.length - 1; i >= 0; i -= 1) {
          if (removeIds.has(entityContextLayers[i].entityId)) entityContextLayers.splice(i, 1);
        }
        persistAdminTreeState();
        refreshStructureSummary();
        renderEntityLayerSummary();
        UI.toast(`${target.name} removed from the organisation tree.`, 'success');
      });
    });
  }

  document.getElementById('btn-add-org-entity').addEventListener('click', () => openEntityEditor());
  document.getElementById('btn-add-org-function')?.addEventListener('click', () => openEntityEditor(null, { type: 'Department / function' }));
  bindStructureActionHandlers();
  renderEntityLayerSummary();
  function buildAdminSettingsPayload() {
    const currentSettings = getAdminSettings();
    const getInputValue = (id, fallback = '') => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : fallback;
    };
    const getNumericValue = (id, fallback) => {
      const el = document.getElementById(id);
      return Math.max(0, parseFloat(el?.value) || fallback);
    };
    const warningThresholdUsd = getNumericValue('admin-warning-threshold', currentSettings.warningThresholdUsd || DEFAULT_ADMIN_SETTINGS.warningThresholdUsd);
    const toleranceThresholdUsd = getNumericValue('admin-tolerance-threshold', currentSettings.toleranceThresholdUsd || TOLERANCE_THRESHOLD);
    const annualReviewThresholdUsd = getNumericValue('admin-annual-threshold', currentSettings.annualReviewThresholdUsd || DEFAULT_ADMIN_SETTINGS.annualReviewThresholdUsd);
    const companyContextSections = {
      companySummary: getInputValue('admin-company-section-summary', currentSettings.companyContextSections?.companySummary || ''),
      businessModel: getInputValue('admin-company-section-business-model', currentSettings.companyContextSections?.businessModel || ''),
      operatingModel: getInputValue('admin-company-section-operating-model', currentSettings.companyContextSections?.operatingModel || ''),
      publicCommitments: getInputValue('admin-company-section-commitments', currentSettings.companyContextSections?.publicCommitments || ''),
      keyRiskSignals: getInputValue('admin-company-section-risks', currentSettings.companyContextSections?.keyRiskSignals || ''),
      obligations: getInputValue('admin-company-section-obligations', currentSettings.companyContextSections?.obligations || ''),
      sources: getInputValue('admin-company-section-sources', currentSettings.companyContextSections?.sources || '')
    };
    return {
      warningThresholdUsd,
      toleranceThresholdUsd,
      annualReviewThresholdUsd,
      payload: {
        ...currentSettings,
        companyContextSections,
        geography: getInputValue('admin-geo', currentSettings.geography || DEFAULT_ADMIN_SETTINGS.geography) || DEFAULT_ADMIN_SETTINGS.geography,
        companyWebsiteUrl: getInputValue('admin-company-url', currentSettings.companyWebsiteUrl || ''),
        companyContextProfile: serialiseCompanyContextSections(companyContextSections),
        companyStructure,
        entityContextLayers,
        defaultLinkMode: document.getElementById('admin-link-mode') ? document.getElementById('admin-link-mode').value === 'yes' : !!currentSettings.defaultLinkMode,
        toleranceThresholdUsd,
        warningThresholdUsd,
        annualReviewThresholdUsd,
        riskAppetiteStatement: getInputValue('admin-appetite', currentSettings.riskAppetiteStatement || DEFAULT_ADMIN_SETTINGS.riskAppetiteStatement) || DEFAULT_ADMIN_SETTINGS.riskAppetiteStatement,
        applicableRegulations: regsInput?.getTags ? regsInput.getTags() : (Array.isArray(currentSettings.applicableRegulations) ? currentSettings.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations]),
        aiInstructions: getInputValue('admin-ai-instructions', currentSettings.aiInstructions || ''),
        benchmarkStrategy: getInputValue('admin-benchmark-strategy', currentSettings.benchmarkStrategy || DEFAULT_ADMIN_SETTINGS.benchmarkStrategy) || DEFAULT_ADMIN_SETTINGS.benchmarkStrategy,
        adminContextSummary: getInputValue('admin-context-summary', currentSettings.adminContextSummary || DEFAULT_ADMIN_SETTINGS.adminContextSummary) || DEFAULT_ADMIN_SETTINGS.adminContextSummary,
        escalationGuidance: getInputValue('admin-escalation-guidance', currentSettings.escalationGuidance || DEFAULT_ADMIN_SETTINGS.escalationGuidance) || DEFAULT_ADMIN_SETTINGS.escalationGuidance
      }
    };
  }

  function persistAdminSettings(showToast = false) {
    const { warningThresholdUsd, toleranceThresholdUsd, annualReviewThresholdUsd, payload } = buildAdminSettingsPayload();
    if (warningThresholdUsd > toleranceThresholdUsd) return false;
    if (annualReviewThresholdUsd < toleranceThresholdUsd) return false;
    saveAdminSettings(payload);
    if (!AppState.draft.geography) AppState.draft.geography = getAdminSettings().geography;
    saveDraft();
    if (showToast) UI.toast('Settings saved.', 'success');
    return true;
  }

  const adminSettingsRoot = document.querySelector('.settings-shell');
  bindAutosave(adminSettingsRoot, () => persistAdminSettings(false));

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const { warningThresholdUsd, toleranceThresholdUsd, annualReviewThresholdUsd } = buildAdminSettingsPayload();
    if (warningThresholdUsd > toleranceThresholdUsd) {
      UI.toast('Warning trigger must be less than or equal to the tolerance threshold.', 'warning');
      return;
    }
    if (annualReviewThresholdUsd < toleranceThresholdUsd) {
      UI.toast('Annual review trigger should be greater than or equal to the tolerance threshold.', 'warning');
      return;
    }
    persistAdminSettings(true);
  });
  document.getElementById('btn-build-company-context').addEventListener('click', async () => {
    const btn = document.getElementById('btn-build-company-context');
    const websiteUrl = websiteEl.value.trim();
    const llmConfig = {
      apiUrl: document.getElementById('admin-compass-url').value.trim() || '${DEFAULT_COMPASS_PROXY_URL}',
      model: document.getElementById('admin-compass-model').value.trim() || 'gpt-5.1',
      apiKey: document.getElementById('admin-compass-key').value.trim()
    };
    if (!websiteUrl) {
      UI.toast('Enter a company website URL first.', 'warning');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Building context…';
    try {
      LLMService.setCompassConfig(llmConfig);
      const result = await LLMService.buildCompanyContext(websiteUrl);
      const sections = buildCompanyContextSections(result);
      const profileText = serialiseCompanyContextSections(sections);
      if (profileEl) profileEl.value = profileText;
      const adminCompanySummaryEl = document.getElementById('admin-company-section-summary');
      const adminBusinessModelEl = document.getElementById('admin-company-section-business-model');
      const adminOperatingModelEl = document.getElementById('admin-company-section-operating-model');
      const adminCommitmentsEl = document.getElementById('admin-company-section-commitments');
      const adminRisksEl = document.getElementById('admin-company-section-risks');
      const adminObligationsEl = document.getElementById('admin-company-section-obligations');
      const adminSourcesEl = document.getElementById('admin-company-section-sources');
      if (adminCompanySummaryEl) adminCompanySummaryEl.value = sections.companySummary || '';
      if (adminBusinessModelEl) adminBusinessModelEl.value = sections.businessModel || '';
      if (adminOperatingModelEl) adminOperatingModelEl.value = sections.operatingModel || '';
      if (adminCommitmentsEl) adminCommitmentsEl.value = sections.publicCommitments || '';
      if (adminRisksEl) adminRisksEl.value = sections.keyRiskSignals || '';
      if (adminObligationsEl) adminObligationsEl.value = sections.obligations || '';
      if (adminSourcesEl) adminSourcesEl.value = sections.sources || '';
      const adminContextSummaryEl = document.getElementById('admin-context-summary');
      if (adminContextSummaryEl && !adminContextSummaryEl.value.trim()) {
        adminContextSummaryEl.value = result.companySummary || '';
      }
      const adminAiInstructionsEl = document.getElementById('admin-ai-instructions');
      if (result.aiGuidance && adminAiInstructionsEl) {
        adminAiInstructionsEl.value = result.aiGuidance;
      }
      const adminGeoEl = document.getElementById('admin-geo');
      if (result.suggestedGeography && adminGeoEl && !adminGeoEl.value.trim()) {
        adminGeoEl.value = result.suggestedGeography;
      }
      if (Array.isArray(result.regulatorySignals) && result.regulatorySignals.length && regsInput?.setTags) {
        regsInput.setTags(Array.from(new Set([...(regsInput.getTags() || []), ...result.regulatorySignals])));
      }
      openEntityEditor(null, {
        name: inferCompanyNameFromUrl(websiteUrl),
        websiteUrl,
        profile: profileText,
        contextSections: sections,
        type: 'Holding company'
      });
      UI.toast('Company context built from public sources. Review the entity and place it into the organisation tree.', 'success', 5000);
    } catch (error) {
      UI.toast('Company context build failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Build from Website';
    }
  });
  document.getElementById('btn-save-session-llm').addEventListener('click', () => {
    const config = getAdminLLMConfig();
    saveSessionLLMConfig(config);
    LLMService.setCompassConfig(config);
    UI.toast(config.apiKey ? 'Compass session key loaded for this session.' : 'Compass proxy/session settings loaded for this session.', 'success');
  });
  document.getElementById('btn-test-session-llm').addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-session-llm');
    const config = getAdminLLMConfig();
    btn.disabled = true;
    btn.textContent = 'Testing…';
    try {
      LLMService.setCompassConfig(config);
      const result = await LLMService.testCompassConnection();
      UI.toast(result.message || 'Compass connection successful.', 'success', 5000);
    } catch (e) {
      UI.toast('Compass test failed: ' + e.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Connection';
    }
  });
  document.getElementById('btn-clear-session-llm').addEventListener('click', () => {
    localStorage.removeItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX));
    sessionStorage.removeItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX));
    LLMService.clearCompassConfig();
    rememberSettingsScroll('admin-settings');
      renderAdminSettings();
    UI.toast('Compass browser key cleared.', 'success');
  });

  document.querySelectorAll('.btn-reset-user-account').forEach(button => {
    button.addEventListener('click', async () => {
      const username = button.dataset.username || '';
      const displayName = button.dataset.displayName || username;
      if (!await UI.confirm(`Reset ${displayName} to a first-time user state? This will clear their stored context, memory, assessments, and session settings in this browser.`)) return;
      clearUserPersistentState(username);
      UI.toast(`${displayName} was reset.`, 'success');
      rememberSettingsScroll('admin-settings');
      renderAdminSettings();
    });
  });
  document.querySelectorAll('.btn-reset-user-password').forEach(button => {
    button.addEventListener('click', async () => {
      const username = button.dataset.username || '';
      const displayName = button.dataset.displayName || username;
      if (!await UI.confirm(`Issue a new password for ${displayName}? The old password will stop working.`)) return;
      try {
        const result = await AuthService.resetManagedPassword(username);
        AppState.adminVisiblePasswords[username] = result.password || '';
        AppState.adminNewUserStatus = `Password reset for ${displayName}: username ${username} / password ${result.password}`;
        UI.toast(`Password reset for ${username}.`, 'success');
        rememberSettingsScroll('admin-settings');
      renderAdminSettings();
      } catch (error) {
        AppState.adminNewUserStatus = `Password reset failed: ${error instanceof Error ? error.message : String(error)}`;
        document.getElementById('admin-new-user-result').textContent = AppState.adminNewUserStatus;
        UI.toast('Password reset failed.', 'danger');
      }
    });
  });

  document.querySelectorAll('.btn-apply-user-access').forEach(button => {
    button.addEventListener('click', async () => {
      const username = button.dataset.username || '';
      const displayName = button.dataset.displayName || username;
      const row = button.closest('.managed-account-row');
      if (!row) return;
      const role = row.querySelector('.account-role-select')?.value || 'user';
      const businessUnitEntityId = row.querySelector('.account-bu-select')?.value || '';
      const departmentEntityId = row.querySelector('.account-department-select')?.value || '';
      if (!businessUnitEntityId) {
        UI.toast(role === 'bu_admin' ? 'Choose the business unit this BU admin will manage.' : 'Choose a business unit for this user.', 'warning');
        return;
      }
      if (role !== 'bu_admin' && !departmentEntityId) {
        UI.toast('Choose a function or department for this standard user.', 'warning');
        return;
      }
      button.disabled = true;
      button.textContent = 'Applying…';
      try {
        const currentAccount = AuthService.getManagedAccounts().find(account => account.username === username) || { username, role: 'user', businessUnitEntityId: '', departmentEntityId: '' };
        const updatedAccount = await AuthService.adminUpdateManagedAccount(username, {
          role,
          businessUnitEntityId,
          departmentEntityId: role === 'bu_admin' ? '' : departmentEntityId
        });
        const nextSettings = applyManagedAccountAssignmentToSettings(currentAccount, {
          role: updatedAccount?.role || role,
          businessUnitEntityId: updatedAccount?.businessUnitEntityId || businessUnitEntityId
        }, getAdminSettings());
        saveAdminSettings(nextSettings);
        AppState.adminNewUserStatus = `Applied ${role === 'bu_admin' ? 'BU admin' : 'standard user'} access for ${displayName}.`;
        UI.toast(`Updated access for ${displayName}.`, 'success');
        rememberSettingsScroll('admin-settings');
        renderAdminSettings();
      } catch (error) {
        AppState.adminNewUserStatus = `User update failed: ${error instanceof Error ? error.message : String(error)}`;
        document.getElementById('admin-new-user-result').textContent = AppState.adminNewUserStatus;
        UI.toast('User update failed.', 'danger');
        button.disabled = false;
        button.textContent = 'Apply';
      }
    });
  });
  function renderAdminNewUserDepartments() {
    const buId = document.getElementById('admin-new-user-bu')?.value || '';
    const role = document.getElementById('admin-new-user-role')?.value || 'user';
    const departmentEl = document.getElementById('admin-new-user-department');
    if (!departmentEl) return;
    const departments = getDepartmentEntities(companyStructure, buId);
    const placeholder = role === 'bu_admin' ? 'Optional for BU admin' : 'Choose function';
    departmentEl.innerHTML = `<option value="">${departments.length || role === 'bu_admin' ? placeholder : 'No functions configured'}</option>${departments.map(entity => `<option value="${entity.id}">${entity.name}</option>`).join('')}`;
    departmentEl.disabled = !buId || (!departments.length && role !== 'bu_admin');
  }

  function renderManagedAccountDepartmentOptions(row) {
    if (!row) return;
    const role = row.querySelector('.account-role-select')?.value || 'user';
    const buId = row.querySelector('.account-bu-select')?.value || '';
    const departmentEl = row.querySelector('.account-department-select');
    if (!departmentEl) return;
    const departments = getDepartmentEntities(companyStructure, buId);
    const currentValue = departmentEl.value || departmentEl.dataset.currentValue || '';
    const placeholder = role === 'bu_admin' ? 'Optional for BU admin' : 'Choose function';
    departmentEl.innerHTML = `<option value="">${departments.length || role === 'bu_admin' ? placeholder : 'No functions configured'}</option>${departments.map(entity => `<option value="${entity.id}" ${entity.id === currentValue ? 'selected' : ''}>${entity.name}</option>`).join('')}`;
    departmentEl.disabled = !buId || (!departments.length && role !== 'bu_admin');
    if (!departments.some(entity => entity.id === currentValue)) departmentEl.value = '';
  }

  document.getElementById('admin-new-user-bu')?.addEventListener('change', renderAdminNewUserDepartments);
  document.getElementById('admin-new-user-role')?.addEventListener('change', renderAdminNewUserDepartments);
  renderAdminNewUserDepartments();
  document.querySelectorAll('.managed-account-row').forEach(row => {
    row.querySelector('.account-bu-select')?.addEventListener('change', () => renderManagedAccountDepartmentOptions(row));
    row.querySelector('.account-role-select')?.addEventListener('change', () => renderManagedAccountDepartmentOptions(row));
    renderManagedAccountDepartmentOptions(row);
  });
  document.getElementById('btn-save-admin-secret')?.addEventListener('click', async () => {
    const secret = document.getElementById('admin-api-secret')?.value || '';
    AuthService.setAdminApiSecret(secret);
    if (!secret) {
      UI.toast('Admin API secret cleared.', 'success');
      return;
    }
    try {
      await syncSharedAdminSettings(getAdminSettings());
      UI.toast('Admin API secret saved and current admin settings synced.', 'success');
    } catch (error) {
      UI.toast(`Admin API secret saved, but settings sync failed: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    }
  });
  document.getElementById('btn-clear-admin-secret')?.addEventListener('click', () => {
    AuthService.setAdminApiSecret('');
    const input = document.getElementById('admin-api-secret');
    if (input) input.value = '';
    UI.toast('Admin API secret cleared.', 'success');
  });

  document.getElementById('btn-test-users-store')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-users-store');
    const statusEl = document.getElementById('admin-users-store-status');
    if (!btn || !statusEl) return;
    btn.disabled = true;
    btn.textContent = 'Testing…';
    statusEl.textContent = 'Checking shared Vercel user store…';
    const result = await AuthService.testUsersStoreHealth();
    if (result.ok) {
      if (result.writable) {
        statusEl.textContent = `Connected to shared user store at ${result.apiUrl} · writable · ${result.accountCount} account(s) available.`;
        UI.toast('Shared user store is reachable and writable.', 'success');
      } else {
        statusEl.textContent = `Connected to ${result.apiUrl}, but it is running in ${result.mode} mode. Check the shared store configuration in Vercel.`;
        UI.toast('Shared user store is reachable but not writable.', 'warning');
      }
    } else {
      statusEl.textContent = `Shared user store check failed: ${result.error}`;
      UI.toast('Shared user store check failed.', 'warning');
    }
    btn.disabled = false;
    btn.textContent = 'Test Shared User Store';
  });
  document.getElementById('btn-admin-add-user')?.addEventListener('click', async () => {
    const button = document.getElementById('btn-admin-add-user');
    const resultEl = document.getElementById('admin-new-user-result');
    const displayName = document.getElementById('admin-new-user-name').value.trim();
    const role = document.getElementById('admin-new-user-role').value.trim() || 'user';
    const businessUnitEntityId = document.getElementById('admin-new-user-bu').value.trim();
    const departmentEntityId = document.getElementById('admin-new-user-department').value.trim();
    if (!displayName) {
      AppState.adminNewUserStatus = 'Enter a display name for the new user.';
      resultEl.textContent = AppState.adminNewUserStatus;
      UI.toast(AppState.adminNewUserStatus, 'warning');
      return;
    }
    if (!businessUnitEntityId) {
      AppState.adminNewUserStatus = role === 'bu_admin' ? 'Choose the business unit this BU admin will manage.' : 'Choose a business unit before creating the user.';
      resultEl.textContent = AppState.adminNewUserStatus;
      UI.toast(AppState.adminNewUserStatus, 'warning');
      return;
    }
    if (role !== 'bu_admin' && !departmentEntityId) {
      AppState.adminNewUserStatus = 'Choose a function or department before creating the user.';
      resultEl.textContent = AppState.adminNewUserStatus;
      UI.toast(AppState.adminNewUserStatus, 'warning');
      return;
    }
    button.disabled = true;
    button.textContent = 'Creating…';
    resultEl.textContent = 'Creating shared user account…';
    try {
      const account = await AuthService.createManagedAccount({ displayName, role, businessUnitEntityId, departmentEntityId: role === 'bu_admin' ? '' : departmentEntityId });
      const nextSettings = applyManagedAccountAssignmentToSettings(account, { role: account.role, businessUnitEntityId: account.businessUnitEntityId }, getAdminSettings());
      saveAdminSettings(nextSettings);
      AppState.adminVisiblePasswords[account.username] = account.password || '';
      AppState.adminNewUserStatus = `Created ${account.displayName}: username ${account.username} / password ${account.password}`;
      UI.toast(`Created ${account.username}.`, 'success');
      rememberSettingsScroll('admin-settings');
      renderAdminSettings();
    } catch (error) {
      AppState.adminNewUserStatus = `User creation failed: ${error instanceof Error ? error.message : String(error)}`;
      resultEl.textContent = AppState.adminNewUserStatus;
      UI.toast('User creation failed.', 'danger');
      button.disabled = false;
      button.textContent = 'Add User';
    }
  });

  document.getElementById('btn-reset-settings').addEventListener('click', async () => {
    if (await UI.confirm('Reset platform settings to defaults?')) {
      localStorage.removeItem(GLOBAL_ADMIN_STORAGE_KEY);
      UI.toast('Settings reset.', 'success');
      rememberSettingsScroll('admin-settings');
      renderAdminSettings();
    }
  });
}

function renderAdminBU() {
  if (!requireAdmin()) return;
  const settings = getAdminSettings();
  const companyStructure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const structureMap = new Map(companyStructure.map(node => [node.id, node]));
  const companyEntities = getCompanyEntities(companyStructure);
  const departmentEntities = getDepartmentEntities(companyStructure);
  const managedAccounts = AuthService.getManagedAccounts();
  const accountLabelByUsername = new Map(managedAccounts.map(account => [account.username, account.displayName]));
  const topLevelCompanies = getChildCompanyEntities(companyStructure, '');

  function renderDepartmentCard(department) {
    const departmentLayer = getEntityLayerById(settings, department.id);
    const ownerLabel = department.ownerUsername ? (accountLabelByUsername.get(department.ownerUsername) || department.ownerUsername) : 'No owner';
    const contextLabel = departmentLayer?.contextSummary ? 'Context saved' : 'No context';
    return `
      <div class="org-related-card org-related-card--compact org-theme--department">
        <div class="org-related-card__head">
          <div>
            <div class="org-related-card__title">${department.name}</div>
            <div class="form-help">${department.departmentRelationshipType || 'In-house'} · ${ownerLabel} · ${contextLabel}</div>
          </div>
          <div class="flex items-center gap-3" style="flex-wrap:wrap">
            <button class="btn btn--ghost btn--sm btn-edit-department" data-department-id="${department.id}" type="button">Edit</button>
            <button class="btn btn--secondary btn--sm btn-edit-department-context" data-department-id="${department.id}" type="button">Context</button>
          </div>
        </div>
      </div>`;
  }

  function renderCompanyNode(entity, depth = 0) {
    const entityLayer = getEntityLayerById(settings, entity.id);
    const departments = getDepartmentEntities(companyStructure, entity.id);
    const childCompanies = getChildCompanyEntities(companyStructure, entity.id);
    const lineage = getEntityLineageLabel(companyStructure, entity.id) || entity.name;
    const summary = truncateText(entityLayer?.contextSummary || entity.profile || 'No retained context yet.', 120);
    const childMarkup = childCompanies.length ? childCompanies.map(child => renderCompanyNode(child, depth + 1)).join('') : '';
    return `
      <details class="org-accordion ${getOrgEntityThemeClass(entity.type)}" ${depth < 1 ? 'open' : ''} style="margin-left:${depth * 16}px">
        <summary class="org-accordion__summary">
          <div class="org-accordion__identity">
            <span class="badge badge--gold">${entity.type}</span>
            <strong>${entity.name}</strong>
            <span class="form-help">${departments.length} functions · ${childCompanies.length} child entities</span>
          </div>
          <div class="org-accordion__meta">
            <span class="form-help">${entityLayer?.contextSummary ? 'Context saved' : 'No context'}</span>
          </div>
        </summary>
        <div class="org-accordion__body">
          <div class="org-accordion__toolbar">
            <div class="form-help">${lineage}</div>
            <div class="flex items-center gap-3" style="flex-wrap:wrap">
              <button class="btn btn--secondary btn--sm btn-edit-company-context" data-company-id="${entity.id}" type="button">Manage Context</button>
              <button class="btn btn--primary btn--sm btn-create-department" data-company-id="${entity.id}" type="button">Add Function</button>
            </div>
          </div>
          <div class="org-accordion__snapshot">${summary}</div>
          ${departments.length ? `
            <div class="org-accordion__section">
              <div class="org-accordion__label">Functions</div>
              <div style="display:flex;flex-direction:column;gap:8px">${departments.map(renderDepartmentCard).join('')}</div>
            </div>` : ''}
          ${childMarkup ? `
            <div class="org-accordion__section">
              <div class="org-accordion__label">Child Entities</div>
              <div style="display:flex;flex-direction:column;gap:12px">${childMarkup}</div>
            </div>` : ''}
        </div>
      </details>`;
  }

  setPage(adminLayout('bu', `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2>Organisation Customisation</h2>
        <p style="margin-top:6px">Compact hierarchy view for entities and their functions.</p>
      </div>
      <div class="flex gap-3">
        <a class="btn btn--primary btn--sm" href="#/admin/settings/org">Organisation Setup</a>
      </div>
    </div>
    <div class="admin-overview-grid mb-5">
      <div class="admin-overview-card">
        <div class="admin-overview-label">Top Level</div>
        <div class="admin-overview-value">${topLevelCompanies.length}</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">Entities</div>
        <div class="admin-overview-value">${companyEntities.length}</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">Functions</div>
        <div class="admin-overview-value">${departmentEntities.length}</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">Owners</div>
        <div class="admin-overview-value">${companyEntities.filter(entity => entity.ownerUsername).length + departmentEntities.filter(entity => entity.ownerUsername).length}</div>
      </div>
    </div>
    ${topLevelCompanies.length ? `
      <div class="org-accordion-list">
        ${topLevelCompanies.map(entity => renderCompanyNode(entity)).join('')}
      </div>` : `
      <div class="card card--elevated">
        <div class="context-panel-title">No organisation structure yet</div>
        <p class="context-panel-copy">Add entities first, then add functions underneath the owning entity.</p>
      </div>`}`));

  document.getElementById('btn-admin-logout').addEventListener('click', () => { performLogout(); });
  document.querySelectorAll('.btn-edit-company-context').forEach(button => {
    button.addEventListener('click', () => {
      const entity = structureMap.get(button.dataset.companyId || '');
      if (!entity) return;
      openEntityContextLayerEditor({
        entity,
        settings,
        onSave: (nextLayer, modal) => {
          const nextSettings = getAdminSettings();
          const layers = Array.isArray(nextSettings.entityContextLayers) ? [...nextSettings.entityContextLayers] : [];
          const index = layers.findIndex(item => item.entityId === nextLayer.entityId);
          if (index > -1) layers[index] = nextLayer;
          else layers.push(nextLayer);
          saveAdminSettings({
            ...nextSettings,
            entityContextLayers: layers
          });
          modal.close();
          UI.toast(`Saved context for ${entity.name}.`, 'success');
          renderAdminBU();
        }
      });
    });
  });
  document.querySelectorAll('.btn-create-department').forEach(button => {
    button.addEventListener('click', () => {
      const company = structureMap.get(button.dataset.companyId || '');
      if (!company) return;
      openOrgEntityEditor({
        structure: companyStructure,
        seed: {
          type: 'Department / function',
          parentId: company.id
        },
        onSave: (node, modal) => {
          const nextSettings = getAdminSettings();
          const nextStructure = Array.isArray(nextSettings.companyStructure) ? [...nextSettings.companyStructure] : [];
          nextStructure.push(node);
          saveAdminSettings({
            ...nextSettings,
            companyStructure: nextStructure
          });
          modal.close();
          UI.toast(`${node.name} added beneath ${company.name}.`, 'success');
          renderAdminBU();
        }
      });
    });
  });
  document.querySelectorAll('.btn-edit-department').forEach(button => {
    button.addEventListener('click', () => {
      const department = structureMap.get(button.dataset.departmentId || '');
      if (!department) return;
      openOrgEntityEditor({
        structure: companyStructure,
        existingNode: department,
        onSave: (node, modal) => {
          const nextSettings = getAdminSettings();
          const nextStructure = Array.isArray(nextSettings.companyStructure) ? [...nextSettings.companyStructure] : [];
          const index = nextStructure.findIndex(item => item.id === node.id);
          if (index > -1) nextStructure[index] = node;
          saveAdminSettings({
            ...nextSettings,
            companyStructure: nextStructure
          });
          modal.close();
          UI.toast(`${node.name} updated.`, 'success');
          renderAdminBU();
        }
      });
    });
  });
  document.querySelectorAll('.btn-edit-department-context').forEach(button => {
    button.addEventListener('click', () => {
      const department = structureMap.get(button.dataset.departmentId || '');
      if (!department) return;
      openEntityContextLayerEditor({
        entity: department,
        settings,
        onSave: (nextLayer, modal) => {
          const nextSettings = getAdminSettings();
          const layers = Array.isArray(nextSettings.entityContextLayers) ? [...nextSettings.entityContextLayers] : [];
          const index = layers.findIndex(item => item.entityId === nextLayer.entityId);
          if (index > -1) layers[index] = nextLayer;
          else layers.push(nextLayer);
          saveAdminSettings({
            ...nextSettings,
            entityContextLayers: layers
          });
          modal.close();
          UI.toast(`Saved context for ${department.name}.`, 'success');
          renderAdminBU();
        }
      });
    });
  });
}

function openBUEditor(bu) {
  const isNew = !bu;
  const settings = getAdminSettings();
  const companyStructure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const structureMap = new Map(companyStructure.map(node => [node.id, node]));
  let ti = {};
  const m = UI.modal({
    title: isNew ? 'Add Business Unit Context' : `Manage BU Context: ${bu.name}`,
    body: `<form id="bu-form"><div class="grid-2" style="gap:12px">
      <div class="form-group"><label class="form-label">ID</label><input class="form-input" id="bu-id" value="${bu?.id||''}" placeholder="bu-example" ${!isNew?'readonly':''}></div>
      <div class="form-group"><label class="form-label">Business Unit Name</label><input class="form-input" id="bu-name" value="${bu?.name||''}"></div>
    </div>
    <div class="grid-2 mt-4" style="gap:12px">
      <div class="form-group">
        <label class="form-label">Mapped Company Entity</label>
        <select class="form-select" id="bu-org-entity">
          <option value="">Not linked yet</option>
          ${getCompanyEntities(companyStructure).map(node => `<option value="${node.id}" ${bu?.orgEntityId === node.id ? 'selected' : ''}>${node.name} (${node.type})</option>`).join('')}
        </select>
        <span class="form-help">Link this business unit to the company entity it represents in Organisation Setup.</span>
      </div>
      <div class="form-group">
        <label class="form-label">BU Geography Override</label>
        <input class="form-input" id="bu-geo" value="${bu?.geography || ''}" placeholder="Optional geography override">
      </div>
    </div>
    <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-canvas)">
      <div class="context-panel-title">Linked Entity Context</div>
      <div id="bu-linked-entity-summary" class="form-help">Select a mapped company entity to see inherited organisation context.</div>
      <div class="flex items-center gap-3 mt-3" style="flex-wrap:wrap">
        <button class="btn btn--ghost btn--sm" id="btn-apply-linked-context" type="button">Apply Linked Context</button>
        <span class="form-help">Fills empty or default business-unit fields from the linked company entity and its context layer.</span>
      </div>
    </div>
    <div class="form-group mt-4"><label class="form-label">Critical Services</label><div class="tag-input-wrap" id="ti-services"></div></div>
    <div class="form-group mt-4"><label class="form-label">Key Systems</label><div class="tag-input-wrap" id="ti-systems"></div></div>
    <div class="form-group mt-4"><label class="form-label">Data Types</label><div class="tag-input-wrap" id="ti-datatypes"></div></div>
    <div class="form-group mt-4"><label class="form-label">Regulatory Tags</label><div class="tag-input-wrap" id="ti-regtags"></div></div>
    <div class="form-group mt-4"><label class="form-label">Business Unit Context Summary</label><textarea class="form-textarea" id="bu-context" rows="3">${bu?.contextSummary||''}</textarea></div>
    <div class="form-group mt-4"><label class="form-label">Business Unit AI Guidance</label><textarea class="form-textarea" id="bu-ai-guidance" rows="3">${bu?.aiGuidance||''}</textarea></div>
    <div class="form-group mt-4"><label class="form-label">Notes</label><textarea class="form-textarea" id="bu-notes" rows="2">${bu?.notes||''}</textarea></div>
    </form>`,
    footer: `<button class="btn btn--ghost" id="bu-cancel">Cancel</button><button class="btn btn--primary" id="bu-save">Save</button>`
  });
  requestAnimationFrame(() => {
    ti.services  = UI.tagInput('ti-services',  bu?.criticalServices||[]);
    ti.systems   = UI.tagInput('ti-systems',   bu?.keySystems||[]);
    ti.datatypes = UI.tagInput('ti-datatypes', bu?.dataTypes||[]);
    ti.regtags   = UI.tagInput('ti-regtags',   bu?.regulatoryTags||[]);
  });

  function renderLinkedEntitySummary() {
    const entityId = document.getElementById('bu-org-entity').value || '';
    const summaryEl = document.getElementById('bu-linked-entity-summary');
    const entity = structureMap.get(entityId);
    const layer = getEntityLayerById(settings, entityId);
    if (!entity || !summaryEl) {
      summaryEl.innerHTML = 'Select a mapped company entity to see inherited organisation context.';
      return;
    }
    const parts = [
      `<strong>${entity.name}</strong>`,
      entity.type,
      getEntityLineageLabel(companyStructure, entityId),
      layer?.geography ? `Layer geography: ${layer.geography}` : '',
      layer?.applicableRegulations?.length ? `Layer regulations: ${layer.applicableRegulations.join(', ')}` : '',
      layer?.contextSummary ? `Layer summary: ${layer.contextSummary}` : '',
      entity.profile ? `Entity profile captured` : ''
    ].filter(Boolean);
    summaryEl.innerHTML = parts.join('<br>');
  }

  function applyLinkedEntityContext(force = false) {
    const entityId = document.getElementById('bu-org-entity').value || '';
    const entity = structureMap.get(entityId);
    if (!entity) return;
    const layer = getEntityLayerById(settings, entityId);
    const geoEl = document.getElementById('bu-geo');
    const contextEl = document.getElementById('bu-context');
    const aiEl = document.getElementById('bu-ai-guidance');
    const notesEl = document.getElementById('bu-notes');
    const inheritedRegs = Array.from(new Set([...(layer?.applicableRegulations || [])]));
    if (force || !geoEl.value.trim()) geoEl.value = layer?.geography || geoEl.value;
    if (force || !contextEl.value.trim()) contextEl.value = layer?.contextSummary || entity.profile || contextEl.value;
    if (force || !aiEl.value.trim()) aiEl.value = layer?.aiInstructions || aiEl.value;
    if (force || !notesEl.value.trim()) notesEl.value = entity.type ? `Mapped from organisation entity: ${entity.type}.` : notesEl.value;
    if (inheritedRegs.length) {
      const nextTags = force
        ? inheritedRegs
        : Array.from(new Set([...(ti.regtags?.getTags() || []), ...inheritedRegs]));
      ti.regtags?.setTags(nextTags);
    }
    renderLinkedEntitySummary();
  }

  document.getElementById('bu-org-entity').addEventListener('change', () => {
    renderLinkedEntitySummary();
    if (isNew) applyLinkedEntityContext(false);
  });
  document.getElementById('btn-apply-linked-context').addEventListener('click', () => applyLinkedEntityContext(true));
  setTimeout(renderLinkedEntitySummary, 0);
  document.getElementById('bu-cancel').addEventListener('click', () => m.close());
  document.getElementById('bu-save').addEventListener('click', () => {
    const id = document.getElementById('bu-id').value.trim();
    const name = document.getElementById('bu-name').value.trim();
    if (!id||!name) { UI.toast('ID and Name required.','warning'); return; }
    const updated = {
      id,
      name,
      orgEntityId: document.getElementById('bu-org-entity').value || '',
      geography: document.getElementById('bu-geo').value.trim(),
      criticalServices: ti.services.getTags(),
      keySystems: ti.systems.getTags(),
      dataTypes: ti.datatypes.getTags(),
      regulatoryTags: ti.regtags.getTags(),
      contextSummary: document.getElementById('bu-context').value.trim(),
      aiGuidance: document.getElementById('bu-ai-guidance').value.trim(),
      notes: document.getElementById('bu-notes').value,
      defaultAssumptions: bu?.defaultAssumptions||{},
      docIds: bu?.docIds||[]
    };
    const list = getBUList();
    const idx = list.findIndex(b=>b.id===id);
    if (idx>-1) list[idx]=updated; else list.push(updated);
    saveBUList(list); m.close(); Router.resolve();
    UI.toast(`Context for "${name}" ${isNew?'added':'updated'}.`,'success');
  });
}

function renderAdminDocs() {
  if (!requireAdmin()) return;
  const docList = getDocList();
  setPage(adminLayout('docs', `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2>Internal Documents</h2>
        <p style="margin-top:6px">Maintain the internal sources used for AI retrieval, citation chips, and richer scenario context.</p>
      </div>
      <div class="flex gap-3">
        <button class="btn btn--ghost btn--sm" id="btn-reset-docs">Reset Defaults</button>
        <button class="btn btn--secondary btn--sm" id="btn-reindex">⟳ Re-index</button>
        <button class="btn btn--primary" id="btn-add-doc">+ Add Doc</button>
      </div>
    </div>
    <div class="admin-overview-grid mb-6">
      <div class="admin-overview-card">
        <div class="admin-overview-label">Indexed Documents</div>
        <div class="admin-overview-value">${docList.length}</div>
        <div class="admin-overview-foot">Available for citation and context retrieval</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">Documents Updated This Year</div>
        <div class="admin-overview-value">${docList.filter(doc => String(doc.lastUpdated || '').startsWith(String(new Date().getFullYear()))).length}</div>
        <div class="admin-overview-foot">Useful for judging freshness of context sources</div>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Title</th><th>Tags</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>${docList.map(doc=>`<tr>
          <td><strong style="color:var(--text-primary);font-size:.875rem">${doc.title}</strong><br><span style="font-size:.68rem;color:var(--text-muted)">${doc.id}</span></td>
          <td>${(doc.tags||[]).slice(0,3).map(t=>`<span class="badge badge--primary" style="font-size:.6rem;margin:2px">${t}</span>`).join('')}</td>
          <td style="font-size:.8rem;white-space:nowrap">${doc.lastUpdated||'—'}</td>
          <td><button class="btn btn--ghost btn--sm" data-id="${doc.id}" id="edit-doc-${doc.id}">Edit</button> <button class="btn btn--ghost btn--sm" data-id="${doc.id}" id="del-doc-${doc.id}" style="color:var(--color-danger-400)">Delete</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`));

  document.getElementById('btn-admin-logout').addEventListener('click', () => { performLogout(); });
  document.getElementById('btn-reindex').addEventListener('click', () => { RAGService.init(getDocList(), getBUList()); UI.toast('Index rebuilt.','success'); });
  document.getElementById('btn-reset-docs').addEventListener('click', async () => {
    if (await UI.confirm('Reset docs to defaults?')) {
      localStorage.removeItem('rq_doc_override');
      AppState.docList = await loadJSON('./data/docs.json');
      RAGService.init(AppState.docList, getBUList());
      Router.resolve(); UI.toast('Reset to defaults.','success');
    }
  });
  document.getElementById('btn-add-doc').addEventListener('click', () => openDocEditor(null));
  docList.forEach(doc => {
    document.getElementById('edit-doc-'+doc.id)?.addEventListener('click', () => openDocEditor(doc));
    document.getElementById('del-doc-'+doc.id)?.addEventListener('click', async () => {
      if (await UI.confirm(`Delete "${doc.title}"?`)) {
        saveDocList(getDocList().filter(d=>d.id!==doc.id));
        Router.resolve(); UI.toast('Deleted.','success');
      }
    });
  });
}

function openDocEditor(doc) {
  const isNew = !doc;
  let tiTags;
  const m = UI.modal({
    title: isNew ? 'Add Document' : `Edit: ${doc.title}`,
    body: `<form id="doc-form">
      <div class="form-group"><label class="form-label">ID</label><input class="form-input" id="doc-id" value="${doc?.id||''}" ${!isNew?'readonly':''}></div>
      <div class="form-group mt-3"><label class="form-label">Title</label><input class="form-input" id="doc-title" value="${doc?.title||''}"></div>
      <div class="form-group mt-3"><label class="form-label">URL</label><input class="form-input" id="doc-url" type="url" value="${doc?.url||'#/admin/docs'}" placeholder="https://…"></div>
      <div class="form-group mt-3"><label class="form-label">Last Updated</label><input class="form-input" id="doc-updated" type="date" value="${doc?.lastUpdated||''}"></div>
      <div class="form-group mt-3"><label class="form-label">Tags</label><div class="tag-input-wrap" id="ti-doc-tags"></div></div>
      <div class="form-group mt-3"><label class="form-label">Content Excerpt</label><textarea class="form-textarea" id="doc-excerpt" rows="4">${doc?.contentExcerpt||''}</textarea></div>
    </form>`,
    footer: `<button class="btn btn--ghost" id="doc-cancel">Cancel</button><button class="btn btn--primary" id="doc-save">Save</button>`
  });
  requestAnimationFrame(() => { tiTags = UI.tagInput('ti-doc-tags', doc?.tags||[]); });
  document.getElementById('doc-cancel').addEventListener('click', () => m.close());
  document.getElementById('doc-save').addEventListener('click', () => {
    const id = document.getElementById('doc-id').value.trim();
    const title = document.getElementById('doc-title').value.trim();
    if (!id||!title) { UI.toast('ID and Title required.','warning'); return; }
    const updated = { id, title, url: document.getElementById('doc-url').value||'#', tags: tiTags.getTags(), lastUpdated: document.getElementById('doc-updated').value, contentExcerpt: document.getElementById('doc-excerpt').value };
    const list = getDocList();
    const idx = list.findIndex(d=>d.id===id);
    if (idx>-1) list[idx]=updated; else list.push(updated);
    saveDocList(list); m.close(); Router.resolve();
    UI.toast(`Doc "${title}" ${isNew?'added':'updated'}.`,'success');
  });
}

// ─── INIT ─────────────────────────────────────────────────────
async function init() {
  try {
    await AuthService.init();
    await loadSharedAdminSettings();
    if (AuthService.getCurrentUser()?.username) {
      await loadSharedUserState(AuthService.getCurrentUser().username);
    }
    AppState.buList  = await loadJSON('./data/bu.json');
    AppState.docList = await loadJSON('./data/docs.json');
  } catch(e) {
    console.error('Failed to load JSON data:', e);
    AppState.buList = []; AppState.docList = [];
  }
  RAGService.init(getDocList(), getBUList());
  activateAuthenticatedState();

  Router
    .on('/login', renderLogin)
    .on('/', withAuth(renderLanding))
    .on('/dashboard', renderUserDashboard)
    .on('/wizard/1', withAuth(renderWizard1))
    .on('/wizard/2', withAuth(renderWizard2))
    .on('/wizard/3', withAuth(renderWizard3))
    .on('/wizard/4', withAuth(renderWizard4))
    .on('/results/:id', withAuth(params => renderResults(params.id)))
    .on('/settings', renderUserSettings)
    .on('/admin', renderLogin)
    .on('/admin/settings', () => renderAdminSettings('org'))
    .on('/admin/settings/org', () => renderAdminSettings('org'))
    .on('/admin/settings/company', () => renderAdminSettings('company'))
    .on('/admin/settings/defaults', () => renderAdminSettings('defaults'))
    .on('/admin/settings/access', () => renderAdminSettings('access'))
    .on('/admin/settings/users', () => renderAdminSettings('users'))
    .on('/admin/settings/audit', () => renderAdminSettings('audit'))
    .on('/admin/bu', renderAdminBU)
    .on('/admin/docs', renderAdminDocs)
    .notFound(() => {
      if (!AuthService.isAuthenticated()) {
        Router.navigate('/login');
        return;
      }
      setPage(`<div class="container" style="padding:var(--sp-12)"><h2>Page Not Found</h2><a href="#/" class="btn btn--primary" style="margin-top:var(--sp-4)">← Home</a></div>`);
    });

  Router.init();
}

document.addEventListener('DOMContentLoaded', init);
