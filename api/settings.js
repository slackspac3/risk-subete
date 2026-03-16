const crypto = require('crypto');
const { appendAuditEvent, verifySessionToken } = require('./_audit');

const SETTINGS_KEY = process.env.SETTINGS_STORE_KEY || 'risk_calculator_settings';
const DEFAULT_TYPICAL_DEPARTMENTS = [
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
const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || '';

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

function hasWritableKv() {
  return !!(getKvUrl() && getKvToken());
}

function getDefaultSettings() {
  return {
    geography: 'United Arab Emirates',
    companyWebsiteUrl: '',
    companyContextProfile: '',
    companyContextSections: null,
    companyStructure: [],
    entityContextLayers: [],
    buOverrides: [],
    docOverrides: [],
    riskAppetiteStatement: 'Moderate. Escalate risks that threaten regulated operations, cross-border data movement, or strategic platforms.',
    applicableRegulations: ['UAE PDPL', 'BIS Export Controls', 'OFAC Sanctions', 'UAE Cybersecurity Council Guidance', 'NIST SP 800-53', 'NIST RMF', 'ISO 27001', 'ISO 27002', 'ISO 27005', 'ISO 27017', 'ISO 27018', 'ISO 27701', 'ISO 22301', 'ISO 22313', 'ISO 27036', 'ISO 28000', 'ISO 31000'],
    aiInstructions: 'Prioritise operational, regulatory, and strategic impact. Use British English.',
    benchmarkStrategy: 'Prefer GCC and UAE benchmark references where relevant. Where GCC data is thin, use the best available global benchmark and explain the fallback clearly.',
    defaultLinkMode: true,
    toleranceThresholdUsd: 5000000,
    warningThresholdUsd: 3000000,
    annualReviewThresholdUsd: 12000000,
    adminContextSummary: 'Use this workspace to maintain geography, regulations, thresholds, and AI guidance for the platform.',
    escalationGuidance: 'Escalate to leadership when the scenario is above tolerance, close to tolerance, or materially affects regulated services.',
    typicalDepartments: [...DEFAULT_TYPICAL_DEPARTMENTS]
  };
}

function normaliseSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const mergedRegulations = Array.from(new Set([
    ...defaults.applicableRegulations,
    ...(Array.isArray(settings.applicableRegulations) ? settings.applicableRegulations : [])
  ].map(value => String(value || '').trim()).filter(Boolean)));
  return {
    ...defaults,
    ...settings,
    applicableRegulations: mergedRegulations,
    companyContextSections: settings.companyContextSections && typeof settings.companyContextSections === 'object' ? settings.companyContextSections : null,
    companyStructure: Array.isArray(settings.companyStructure) ? settings.companyStructure : [],
    entityContextLayers: Array.isArray(settings.entityContextLayers) ? settings.entityContextLayers : [],
    buOverrides: Array.isArray(settings.buOverrides) ? settings.buOverrides : [],
    docOverrides: Array.isArray(settings.docOverrides) ? settings.docOverrides : [],
    typicalDepartments: Array.isArray(settings.typicalDepartments) && settings.typicalDepartments.length
      ? settings.typicalDepartments.map(name => String(name || '').trim()).filter(Boolean)
      : [...defaults.typicalDepartments]
  };
}

async function readSettings() {
  const response = await runKvCommand(['GET', SETTINGS_KEY]);
  const raw = response?.result;
  if (!raw) return getDefaultSettings();
  try {
    return normaliseSettings(JSON.parse(raw));
  } catch {
    return getDefaultSettings();
  }
}

async function writeSettings(settings) {
  if (!hasWritableKv()) {
    throw new Error('Shared settings store is not writable. Configure the shared store environment variables in Vercel.');
  }
  const next = normaliseSettings(settings);
  await runKvCommand(['SET', SETTINGS_KEY, JSON.stringify(next)]);
  return next;
}

function isAdminSecretValid(req) {
  return !!ADMIN_API_SECRET && req.headers['x-admin-secret'] === ADMIN_API_SECRET;
}

function stableSortById(items = []) {
  return [...items].sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));
}

function normaliseStructureNode(node = {}) {
  return {
    id: String(node.id || ''),
    parentId: String(node.parentId || ''),
    type: String(node.type || ''),
    name: String(node.name || ''),
    websiteUrl: String(node.websiteUrl || ''),
    profile: String(node.profile || ''),
    departmentHint: String(node.departmentHint || ''),
    departmentRelationshipType: String(node.departmentRelationshipType || ''),
    ownerUsername: String(node.ownerUsername || ''),
    contextSections: node.contextSections && typeof node.contextSections === 'object' ? node.contextSections : null
  };
}

function normaliseLayer(layer = {}) {
  return {
    entityId: String(layer.entityId || ''),
    entityName: String(layer.entityName || ''),
    geography: String(layer.geography || ''),
    riskAppetiteStatement: String(layer.riskAppetiteStatement || ''),
    applicableRegulations: Array.isArray(layer.applicableRegulations) ? [...layer.applicableRegulations].sort() : [],
    aiInstructions: String(layer.aiInstructions || ''),
    benchmarkStrategy: String(layer.benchmarkStrategy || ''),
    contextSummary: String(layer.contextSummary || '')
  };
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canBuAdminWriteSettings(currentSettings, proposedSettings, session) {
  const ownedBusinessUnitId = String(session?.businessUnitEntityId || '').trim();
  if (!ownedBusinessUnitId) return false;

  const guardedGlobalKeys = [
    'geography',
    'companyWebsiteUrl',
    'companyContextProfile',
    'companyContextSections',
    'buOverrides',
    'docOverrides',
    'riskAppetiteStatement',
    'applicableRegulations',
    'aiInstructions',
    'benchmarkStrategy',
    'defaultLinkMode',
    'toleranceThresholdUsd',
    'warningThresholdUsd',
    'annualReviewThresholdUsd',
    'adminContextSummary',
    'escalationGuidance',
    'typicalDepartments'
  ];

  for (const key of guardedGlobalKeys) {
    if (!sameValue(currentSettings[key], proposedSettings[key])) {
      return false;
    }
  }

  const currentStructure = Array.isArray(currentSettings.companyStructure) ? currentSettings.companyStructure : [];
  const proposedStructure = Array.isArray(proposedSettings.companyStructure) ? proposedSettings.companyStructure : [];
  const isDepartment = node => String(node.type || '').toLowerCase() === 'department / function';

  const currentCompanyNodes = stableSortById(currentStructure.filter(node => !isDepartment(node)).map(normaliseStructureNode));
  const proposedCompanyNodes = stableSortById(proposedStructure.filter(node => !isDepartment(node)).map(normaliseStructureNode));
  if (!sameValue(currentCompanyNodes, proposedCompanyNodes)) {
    return false;
  }

  const currentOutsideDepartments = stableSortById(
    currentStructure.filter(node => isDepartment(node) && String(node.parentId || '') !== ownedBusinessUnitId).map(normaliseStructureNode)
  );
  const proposedOutsideDepartments = stableSortById(
    proposedStructure.filter(node => isDepartment(node) && String(node.parentId || '') !== ownedBusinessUnitId).map(normaliseStructureNode)
  );
  if (!sameValue(currentOutsideDepartments, proposedOutsideDepartments)) {
    return false;
  }

  const proposedInsideDepartments = proposedStructure.filter(node => isDepartment(node) && String(node.parentId || '') === ownedBusinessUnitId);
  const allowedLayerEntityIds = new Set([
    ownedBusinessUnitId,
    ...currentStructure
      .filter(node => isDepartment(node) && String(node.parentId || '') === ownedBusinessUnitId)
      .map(node => String(node.id || '')),
    ...proposedInsideDepartments.map(node => String(node.id || ''))
  ]);

  const currentOutsideLayers = stableSortById(
    (Array.isArray(currentSettings.entityContextLayers) ? currentSettings.entityContextLayers : [])
      .filter(layer => !allowedLayerEntityIds.has(String(layer.entityId || '')))
      .map(normaliseLayer)
  );
  const proposedOutsideLayers = stableSortById(
    (Array.isArray(proposedSettings.entityContextLayers) ? proposedSettings.entityContextLayers : [])
      .filter(layer => !allowedLayerEntityIds.has(String(layer.entityId || '')))
      .map(normaliseLayer)
  );
  return sameValue(currentOutsideLayers, proposedOutsideLayers);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
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
      const settings = await readSettings();
      res.status(200).json({
        settings,
        storage: {
          writable: hasWritableKv(),
          mode: hasWritableKv() ? 'shared-kv' : 'fallback-defaults'
        }
      });
      return;
    }

    if (req.method === 'PUT') {
      const session = verifySessionToken(req.headers['x-session-token']);
      if (!isAdminSecretValid(req) && !session) {
        res.status(403).json({ error: 'Admin secret or valid session token required.' });
        return;
      }
      const currentSettings = await readSettings();
      const nextSettings = normaliseSettings(body.settings || {});
      const isAdminActor = isAdminSecretValid(req) || session?.role === 'admin';
      const isScopedBuAdmin = session?.role === 'bu_admin' && canBuAdminWriteSettings(currentSettings, nextSettings, session);
      if (!isAdminActor && !isScopedBuAdmin) {
        res.status(403).json({ error: 'You are not allowed to modify these shared settings.' });
        return;
      }
      const settings = await writeSettings(nextSettings);
      await appendAuditEvent({ category: body.audit?.category || 'settings', eventType: body.audit?.eventType || 'settings_updated', actorUsername: session?.username || 'admin', actorRole: session?.role || 'admin', target: body.audit?.target || 'global_settings', status: 'success', source: 'server', details: body.audit?.details || {} });
      res.status(200).json({ settings });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({
      error: 'Settings store request failed.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
