const fs = require('fs');
const path = require('path');
const { appendAuditEvent, verifySessionToken } = require('./_audit');

const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || '';
const RISK_CATALOG_STORE_KEY = process.env.RISK_CATALOG_STORE_KEY || 'risk_subete_catalog';

function getAllowedOrigin() {
  return process.env.ALLOWED_ORIGIN || 'https://slackspac3.github.io';
}

function getKvUrl() {
  return process.env.APPLE_CAT || process.env.FOO_URL_TEST || process.env.RC_USER_STORE_URL || process.env.USER_STORE_KV_URL || process.env.KV_REST_API_URL || '';
}

function getKvToken() {
  return process.env.BANANA_DOG || process.env.FOO_TOKEN_TEST || process.env.RC_USER_STORE_TOKEN || process.env.USER_STORE_KV_TOKEN || process.env.KV_REST_API_TOKEN || '';
}

function hasWritableKv() {
  return !!(getKvUrl() && getKvToken());
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

function parseRequestBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

function sendCors(res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin());
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-admin-secret,x-session-token');
  res.setHeader('Vary', 'Origin');
}

function requireAllowedOrigin(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = getAllowedOrigin();
  if (origin && origin !== allowedOrigin) {
    res.status(403).json({ error: 'Origin not allowed' });
    return false;
  }
  return true;
}

function isAdminRequest(req) {
  if (!!ADMIN_API_SECRET && req.headers['x-admin-secret'] === ADMIN_API_SECRET) return true;
  const session = verifySessionToken(req.headers['x-session-token']);
  return !!session && session.role === 'admin';
}

function getAdminActor(req) {
  const session = verifySessionToken(req.headers['x-session-token']);
  if (session?.username) {
    return { actorUsername: session.username, actorRole: session.role || 'admin' };
  }
  return { actorUsername: 'admin', actorRole: 'admin' };
}

function readSeedFile(filename) {
  const fullPath = path.join(process.cwd(), 'data', filename);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function loadSeedCatalog() {
  return normaliseCatalog({
    domains: readSeedFile('risk-domains.json'),
    taxonomy: readSeedFile('risk-taxonomy.json'),
    sources: readSeedFile('risk-sources.json')
  });
}

function normaliseStringArray(values) {
  return Array.isArray(values) ? values.map(value => String(value || '').trim()).filter(Boolean) : [];
}

function normaliseDomain(domain = {}) {
  return {
    id: String(domain.id || '').trim(),
    label: String(domain.label || '').trim(),
    shortLabel: String(domain.shortLabel || '').trim() || String(domain.label || '').trim(),
    sortOrder: Number(domain.sortOrder || 999),
    description: String(domain.description || '').trim(),
    assessmentPrompt: String(domain.assessmentPrompt || '').trim(),
    primaryBenchmarkLens: String(domain.primaryBenchmarkLens || '').trim(),
    keyImpactLabels: normaliseStringArray(domain.keyImpactLabels),
    defaultTaxonomyFamilyIds: normaliseStringArray(domain.defaultTaxonomyFamilyIds)
  };
}

function normaliseTaxonomyEntry(entry = {}) {
  return {
    id: String(entry.id || '').trim(),
    domainId: String(entry.domainId || '').trim(),
    familyLabel: String(entry.familyLabel || '').trim(),
    description: String(entry.description || '').trim(),
    eventCount: Number(entry.eventCount || 0),
    sampleEvents: normaliseStringArray(entry.sampleEvents)
  };
}

function normaliseSourceEntry(entry = {}) {
  return {
    id: String(entry.id || '').trim(),
    title: String(entry.title || '').trim(),
    sourceType: String(entry.sourceType || '').trim(),
    scope: String(entry.scope || '').trim(),
    regions: normaliseStringArray(entry.regions),
    domainIds: normaliseStringArray(entry.domainIds),
    coverage: normaliseStringArray(entry.coverage),
    qualityTier: String(entry.qualityTier || '').trim()
  };
}

function sortById(items = []) {
  return items.slice().sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')));
}

function normaliseCatalog(catalog = {}) {
  return {
    domains: sortById((Array.isArray(catalog.domains) ? catalog.domains : []).map(normaliseDomain).filter(item => item.id && item.label)),
    taxonomy: sortById((Array.isArray(catalog.taxonomy) ? catalog.taxonomy : []).map(normaliseTaxonomyEntry).filter(item => item.id && item.domainId && item.familyLabel)),
    sources: sortById((Array.isArray(catalog.sources) ? catalog.sources : []).map(normaliseSourceEntry).filter(item => item.id && item.title))
  };
}

async function readStoredCatalog() {
  const response = await runKvCommand(['GET', RISK_CATALOG_STORE_KEY]);
  const raw = response?.result;
  if (!raw) return null;
  try {
    return normaliseCatalog(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readCatalog() {
  const stored = await readStoredCatalog();
  return stored || loadSeedCatalog();
}

async function writeCatalog(catalog) {
  if (!hasWritableKv()) {
    throw new Error('Risk catalog store is not writable. Configure the shared store environment variables in Vercel.');
  }
  const next = normaliseCatalog(catalog);
  await runKvCommand(['SET', RISK_CATALOG_STORE_KEY, JSON.stringify(next)]);
  return next;
}

function upsertCollectionItem(items, item) {
  const next = items.slice();
  const index = next.findIndex(existing => existing.id === item.id);
  if (index >= 0) next[index] = item;
  else next.push(item);
  return sortById(next);
}

module.exports = async function handler(req, res) {
  sendCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (!requireAllowedOrigin(req, res)) return;

  const body = parseRequestBody(req);

  try {
    if (req.method === 'GET') {
      const catalog = await readCatalog();
      res.status(200).json({
        catalog,
        storage: {
          writable: hasWritableKv(),
          mode: hasWritableKv() ? 'shared-kv' : 'seed-fallback'
        }
      });
      return;
    }

    if (!isAdminRequest(req)) {
      res.status(403).json({ error: 'Admin authentication required.' });
      return;
    }

    if (req.method === 'PUT') {
      const catalog = await writeCatalog(body.catalog || {});
      await appendAuditEvent({
        ...getAdminActor(req),
        category: 'catalog_admin',
        eventType: 'risk_catalog_replaced',
        target: 'risk_catalog',
        status: 'success',
        source: 'server',
        details: {
          domains: catalog.domains.length,
          taxonomy: catalog.taxonomy.length,
          sources: catalog.sources.length
        }
      });
      res.status(200).json({ catalog });
      return;
    }

    if (req.method === 'PATCH') {
      const action = String(body.action || '').trim();
      const collection = String(body.collection || '').trim();
      const catalog = await readCatalog();
      if (!['domains', 'taxonomy', 'sources'].includes(collection)) {
        res.status(400).json({ error: 'Invalid collection.' });
        return;
      }

      if (action === 'delete-item') {
        const id = String(body.id || '').trim();
        if (!id) {
          res.status(400).json({ error: 'Item id is required.' });
          return;
        }
        catalog[collection] = catalog[collection].filter(item => item.id !== id);
      } else if (action === 'upsert-item') {
        const rawItem = body.item || {};
        let item = null;
        if (collection === 'domains') item = normaliseDomain(rawItem);
        if (collection === 'taxonomy') item = normaliseTaxonomyEntry(rawItem);
        if (collection === 'sources') item = normaliseSourceEntry(rawItem);
        if (!item?.id) {
          res.status(400).json({ error: 'Valid item payload is required.' });
          return;
        }
        catalog[collection] = upsertCollectionItem(catalog[collection], item);
      } else {
        res.status(400).json({ error: 'Unsupported patch action.' });
        return;
      }

      const next = await writeCatalog(catalog);
      await appendAuditEvent({
        ...getAdminActor(req),
        category: 'catalog_admin',
        eventType: action === 'delete-item' ? 'risk_catalog_item_deleted' : 'risk_catalog_item_upserted',
        target: `${collection}:${String(body.id || body.item?.id || '').trim()}`,
        status: 'success',
        source: 'server',
        details: { collection }
      });
      res.status(200).json({ catalog: next });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const response = { error: 'Risk catalog request failed.' };
    if (isAdminRequest(req)) {
      response.detail = error instanceof Error ? error.message : String(error);
    }
    res.status(500).json(response);
  }
};
