/**
 * app.js — Main application entry point
 * G42 Tech & Cyber Risk Quantifier PoC
 */

'use strict';

const TOLERANCE_THRESHOLD = 5_000_000;
const DEFAULT_FX_RATE = 3.6725;
const DEFAULT_ADMIN_SETTINGS = {
  geography: 'United Arab Emirates',
  companyWebsiteUrl: '',
  companyContextProfile: '',
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

const AppState = {
  currency: 'USD',
  fxRate: DEFAULT_FX_RATE,
  mode: 'basic',
  draft: {},
  buList: [],
  docList: []
};

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

function getAssessments() {
  try { return JSON.parse(localStorage.getItem('rq_assessments') || '[]'); } catch { return []; }
}
function saveAssessment(a) {
  const list = getAssessments();
  const idx = list.findIndex(x => x.id === a.id);
  if (idx > -1) list[idx] = a; else list.unshift(a);
  localStorage.setItem('rq_assessments', JSON.stringify(list));
}
function getAssessmentById(id) {
  return getAssessments().find(a => a.id === id) || null;
}

function getLearningStore() {
  try {
    return JSON.parse(localStorage.getItem('rq_learning_store') || '{"templates":{}}');
  } catch {
    return { templates: {} };
  }
}

function saveLearningStore(store) {
  localStorage.setItem('rq_learning_store', JSON.stringify(store));
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
  try { sessionStorage.setItem('rq_draft', JSON.stringify(AppState.draft)); } catch {}
}
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem('rq_draft') || 'null');
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
    selectedRisks: [],
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
    geography: AppState.draft.geography || DEFAULT_ADMIN_SETTINGS.geography,
    selectedRisks: Array.isArray(AppState.draft.selectedRisks) ? AppState.draft.selectedRisks : [],
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
  try {
    const ov = JSON.parse(localStorage.getItem('rq_bu_override') || 'null');
    return ov || AppState.buList;
  } catch { return AppState.buList; }
}
function saveBUList(list) {
  localStorage.setItem('rq_bu_override', JSON.stringify(list));
  AppState.buList = list;
  RAGService.init(getDocList(), list);
}
function getDocList() {
  try {
    const ov = JSON.parse(localStorage.getItem('rq_doc_override') || 'null');
    return ov || AppState.docList;
  } catch { return AppState.docList; }
}
function saveDocList(list) {
  localStorage.setItem('rq_doc_override', JSON.stringify(list));
  AppState.docList = list;
  RAGService.init(list, getBUList());
}

function getAdminSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('rq_admin_settings') || 'null') || {};
    return {
      ...DEFAULT_ADMIN_SETTINGS,
      ...saved,
      applicableRegulations: Array.isArray(saved.applicableRegulations) ? saved.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations]
    };
  } catch {
    return { ...DEFAULT_ADMIN_SETTINGS, applicableRegulations: [...DEFAULT_ADMIN_SETTINGS.applicableRegulations] };
  }
}

function saveAdminSettings(settings) {
  const merged = {
    ...DEFAULT_ADMIN_SETTINGS,
    ...settings,
    applicableRegulations: Array.isArray(settings.applicableRegulations) ? settings.applicableRegulations : [...DEFAULT_ADMIN_SETTINGS.applicableRegulations]
  };
  localStorage.setItem('rq_admin_settings', JSON.stringify(merged));
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

function getSessionLLMConfig() {
  try {
    return JSON.parse(sessionStorage.getItem('rq_llm_session') || 'null') || {};
  } catch {
    return {};
  }
}

function saveSessionLLMConfig(config) {
  sessionStorage.setItem('rq_llm_session', JSON.stringify(config));
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

function getSelectedRisks() {
  return (AppState.draft.selectedRisks || []).filter(Boolean);
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

function deriveApplicableRegulations(bu, selectedRisks = []) {
  const settings = getAdminSettings();
  const tags = [
    ...settings.applicableRegulations,
    ...(AppState.draft.applicableRegulations || []),
    ...(bu?.regulatoryTags || []),
    ...selectedRisks.flatMap(r => r.regulations || [])
  ].filter(Boolean);
  return Array.from(new Set(tags));
}

function buildScenarioNarrative() {
  const selected = getSelectedRisks();
  const titles = selected.map(r => r.title);
  const intro = AppState.draft.enhancedNarrative || AppState.draft.narrative || '';
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
  const urgency = String(guidedInput.urgency || 'medium').trim();
  const parts = [];
  if (event) parts.push(`A risk scenario is being assessed where ${event.charAt(0).toLowerCase() + event.slice(1)}.`);
  if (asset) parts.push(`The main asset, service, or team affected is ${asset}.`);
  if (cause) parts.push(`The likely trigger or threat driver is ${cause}.`);
  if (impact) parts.push(`The expected business, operational, or regulatory impact is ${impact}.`);
  if (urgency) parts.push(`Current urgency is assessed as ${urgency}.`);
  return parts.join(' ');
}

// ─── APP BAR ──────────────────────────────────────────────────
function renderAppBar() {
  const bar = document.getElementById('app-bar');
  bar.innerHTML = `
    <div class="bar-inner">
      <a href="#/" class="bar-logo">Risk <span>Intelligence</span> Platform</a>
      <nav class="flex items-center gap-3">
        <a href="#/" class="bar-nav-link">Home</a>
      </nav>
      <div class="bar-spacer"></div>
      <a href="#/admin" class="bar-nav-link bar-nav-link--admin">Admin</a>
      <div class="currency-toggle" role="group" aria-label="Currency">
        <button id="cur-usd" class="${AppState.currency==='USD'?'active':''}">USD</button>
        <button id="cur-aed" class="${AppState.currency==='AED'?'active':''}">AED</button>
      </div>
      <span class="bar-poc-tag">PoC</span>
    </div>`;
  document.getElementById('cur-usd').addEventListener('click', () => { AppState.currency='USD'; renderAppBar(); Router.resolve(); });
  document.getElementById('cur-aed').addEventListener('click', () => { AppState.currency='AED'; renderAppBar(); Router.resolve(); });
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
      localStorage.removeItem('rq_assessments');
      Router.resolve();
    }
  });

  document.querySelectorAll('.assessment-item').forEach(el => {
    const open = () => Router.navigate('/results/' + el.dataset.id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
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
  const settings = getAdminSettings();
  const buList = getBUList();
  const selectedRisks = getSelectedRisks();
  const regs = draft.applicableRegulations?.length ? draft.applicableRegulations : settings.applicableRegulations;

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
                <label class="form-label" for="wizard-geo">Geography</label>
                <input class="form-input" id="wizard-geo" value="${draft.geography || settings.geography}" placeholder="e.g. United Arab Emirates">
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
            <div class="grid-2 mt-4">
              <div class="form-group">
                <label class="form-label" for="risk-register-file">Risk Register Upload</label>
                <input class="form-input" id="risk-register-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls">
                <div class="form-help">${draft.uploadedRegisterName ? `Current file: ${draft.uploadedRegisterName}${draft.registerMeta?.sheetCount ? ` · ${draft.registerMeta.sheetCount} sheet(s)` : ''}` : 'Upload TXT, CSV, TSV, JSON, Markdown, or Excel. Word and PDF still need conversion before upload.'}</div>
              </div>
              <div class="form-group">
                <label class="form-label" for="manual-risk-add">Add Risk Manually</label>
                <div class="inline-action-row">
                  <input class="form-input" id="manual-risk-add" type="text" placeholder="e.g. Export control screening failure">
                  <button class="btn btn--secondary" id="btn-add-manual-risk" type="button">Add</button>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3 mt-5" style="flex-wrap:wrap">
              <button class="btn btn--primary" id="btn-intake-assist">🤖 Enhance &amp; Extract Risks</button>
              <button class="btn btn--secondary" id="btn-register-analyse">📄 Analyse Uploaded Register</button>
            </div>
            <p class="form-help mt-3">Uses runtime AI if a key has been set with <code>LLMService.setOpenAIKey(...)</code>. Otherwise the local extraction stub is used.</p>
          </div>

          <div id="intake-output">
            ${draft.intakeSummary ? `<div class="card card--glow anim-fade-in"><div class="context-panel-title">AI Intake Summary</div><p class="context-panel-copy">${draft.intakeSummary}</p>${draft.linkAnalysis ? `<div class="context-panel-foot">${draft.linkAnalysis}</div>` : ''}</div>` : ''}
          </div>

          <div class="card anim-fade-in anim-delay-2">
            <div class="flex items-center justify-between mb-4" style="flex-wrap:wrap;gap:var(--sp-3)">
              <div>
                <div class="context-panel-title">Selected Risks</div>
                <p class="context-panel-copy">Pick one or more risks to assess in a single pass.</p>
              </div>
              <label class="toggle-row">
                <span class="toggle-label">Treat as linked scenario</span>
                <label class="toggle"><input type="checkbox" id="linked-risks-toggle" ${draft.linkedRisks ? 'checked' : ''}><div class="toggle-track"></div></label>
              </label>
            </div>
            <div id="selected-risks-wrap">
              ${renderSelectedRiskCards(selectedRisks, regs)}
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
    AppState.draft.applicableRegulations = deriveApplicableRegulations(bu, getSelectedRisks());
    saveDraft();
    renderWizard1();
  });
  document.getElementById('wizard-geo').addEventListener('input', function() {
    AppState.draft.geography = this.value.trim();
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
  });
  document.getElementById('btn-build-guided-narrative').addEventListener('click', () => {
    const composed = composeGuidedNarrative(AppState.draft.guidedInput);
    if (!composed) {
      UI.toast('Answer at least one guided question first.', 'warning');
      return;
    }
    AppState.draft.narrative = composed;
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
    AppState.draft.selectedRisks = mergeRisks(getSelectedRisks(), [{ title: value, category: 'Manual', source: 'manual' }]);
    input.value = '';
    saveDraft();
    renderWizard1();
  });
  document.getElementById('risk-register-file').addEventListener('change', handleRegisterUpload);
  document.getElementById('btn-intake-assist').addEventListener('click', runIntakeAssist);
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
        document.getElementById('intake-risk-statement').value = composed;
      }
    }
    if (!AppState.draft.narrative.trim() && !selected.length) { UI.toast('Please complete the guided questions, enter a risk statement, or select at least one risk.', 'warning'); return; }
    AppState.draft.geography = document.getElementById('wizard-geo').value.trim() || settings.geography;
    AppState.draft.narrative = AppState.draft.narrative.trim();
    AppState.draft.enhancedNarrative = AppState.draft.enhancedNarrative || AppState.draft.narrative;
    AppState.draft.applicableRegulations = deriveApplicableRegulations(buList.find(b => b.id === buId), selected);
    if (!AppState.draft.scenarioTitle) {
      AppState.draft.scenarioTitle = selected.length === 1 ? selected[0].title : `${selected.length || 1}-risk scenario for ${AppState.draft.buName}`;
    }
    saveDraft();
    Router.navigate('/wizard/2');
  });

  bindRiskCardActions();
}

function renderSelectedRiskCards(selectedRisks, regulations) {
  const cleanedRisks = selectedRisks.filter(risk => !isNoiseRiskText(risk.title) && risk.title !== '-');
  if (!cleanedRisks.length) {
    return `<div class="empty-state">No risks selected yet. Use AI extraction, upload a register, or add risks manually.</div>`;
  }
  const linkedRecommendations = getLinkedRiskRecommendations(cleanedRisks);
  return `${linkedRecommendations.length ? `<div class="card mb-4" style="background:var(--bg-elevated)"><div class="context-panel-title">Suggested linked-risk groupings</div><div style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-3)">${linkedRecommendations.map(group => `<div><div style="font-size:.78rem;font-weight:600;color:var(--text-primary)">${group.label}</div><div class="context-panel-copy" style="margin-top:4px">${group.risks.join(', ')}</div></div>`).join('')}</div><div class="context-panel-foot">${AppState.draft.linkAnalysis || 'Treat these as linked where one control or event could trigger the others in the same scenario.'}</div></div>` : ''}
  <div class="risk-selection-grid">
    ${cleanedRisks.map(risk => `
      <div class="risk-pick-card">
        <div class="risk-pick-head">
          <div>
            <div class="risk-pick-title">${risk.title}</div>
            <div class="risk-pick-meta">${risk.category}${risk.source ? ` · ${risk.source}` : ''}</div>
          </div>
          <button class="btn btn--ghost btn--sm btn-remove-risk" data-risk-id="${risk.id}" type="button">Remove</button>
        </div>
        ${risk.description ? `<p class="risk-pick-desc">${risk.description}</p>` : ''}
        <div class="citation-chips">
          ${Array.from(new Set([...(risk.regulations || []), ...regulations.slice(0, 2)])).slice(0, 4).map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

function bindRiskCardActions() {
  document.querySelectorAll('.btn-remove-risk').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.draft.selectedRisks = getSelectedRisks().filter(r => r.id !== btn.dataset.riskId);
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
  const output = document.getElementById('intake-output');
  const bu = getBUList().find(b => b.id === (document.getElementById('wizard-bu')?.value || AppState.draft.buId));
  if (!narrative && !AppState.draft.registerFindings) {
    UI.toast('Add a risk statement or upload a risk register first.', 'warning');
    return;
  }
  output.innerHTML = `<div class="card">${UI.skeletonBlock(18)}<div class="mt-3">${UI.skeletonBlock(14, 4)}</div><div class="mt-3">${UI.skeletonBlock(90, 10)}</div></div>`;
  try {
    const citations = await RAGService.retrieveRelevantDocs(bu?.id, narrative || AppState.draft.registerFindings, 5);
    const result = await LLMService.enhanceRiskContext({
      riskStatement: narrative,
      registerText: AppState.draft.registerFindings,
      registerMeta: AppState.draft.registerMeta,
      businessUnit: bu,
      geography: document.getElementById('wizard-geo')?.value.trim() || AppState.draft.geography,
      applicableRegulations: deriveApplicableRegulations(bu, getSelectedRisks()),
      citations,
      adminSettings: getAdminSettings()
    });
    AppState.draft.llmAssisted = true;
    AppState.draft.enhancedNarrative = result.enhancedStatement || narrative;
    AppState.draft.narrative = AppState.draft.narrative || narrative;
    AppState.draft.intakeSummary = result.summary || '';
    AppState.draft.linkAnalysis = result.linkAnalysis || '';
    AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : AppState.draft.workflowGuidance;
    AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis;
    AppState.draft.selectedRisks = mergeRisks(getSelectedRisks(), result.risks || guessRisksFromText(narrative + '\n' + AppState.draft.registerFindings));
    AppState.draft.applicableRegulations = Array.from(new Set([...(AppState.draft.applicableRegulations || []), ...(result.regulations || [])]));
    AppState.draft.citations = result.citations || citations;
    if (!AppState.draft.scenarioTitle && getSelectedRisks()[0]) AppState.draft.scenarioTitle = getSelectedRisks()[0].title;
    saveDraft();
    renderWizard1();
    UI.toast('AI intake completed.', 'success');
  } catch (e1) {
    output.innerHTML = `<div class="banner banner--danger"><span class="banner-icon">⚠</span><span class="banner-text">AI intake error: ${e1.message}</span></div>`;
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
      geography: AppState.draft.geography,
      applicableRegulations: AppState.draft.applicableRegulations || [],
      adminSettings: getAdminSettings()
    });
    const parsedFallback = parseRegisterText(AppState.draft.registerFindings).map(title => ({ title, source: 'register' }));
    const extractedRisks = result.risks || parsedFallback;
    if (!extractedRisks.length) {
      UI.toast('No usable risk lines were found in that file. Try a cleaner TXT/CSV export or paste the risks directly.', 'warning', 7000);
      return;
    }
    AppState.draft.selectedRisks = mergeRisks(getSelectedRisks(), extractedRisks);
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
          ${draft.llmAssisted && draft.citations?.length ? renderCitationBlock(draft.citations) : ''}
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
  const btn = document.getElementById('btn-llm-assist');
  const btnText = document.getElementById('llm-btn-text');
  const output = document.getElementById('llm-output-area');
  btn.disabled = true; btn.classList.add('loading');
  btnText.textContent = '⏳ Retrieving docs and generating inputs…';
  output.innerHTML = `<div class="card mt-4">${UI.skeletonBlock(20)}<div style="margin-top:12px">${UI.skeletonBlock(14,4)}</div><div style="margin-top:8px">${UI.skeletonBlock(14,4)}</div></div>`;
  try {
    const bu = getBUList().find(b => b.id === AppState.draft.buId);
    const scenarioText = [narrative, buildScenarioNarrative()].filter(Boolean).join('\n\n');
    const citations = await RAGService.retrieveRelevantDocs(AppState.draft.buId, scenarioText);
    const result = await LLMService.generateScenarioAndInputs(scenarioText, {
      ...bu,
      regulatoryTags: deriveApplicableRegulations(bu, getSelectedRisks()),
      geography: AppState.draft.geography,
      benchmarkStrategy: getAdminSettings().benchmarkStrategy,
      companyContextProfile: getAdminSettings().companyContextProfile
    }, citations);
    AppState.draft.scenarioTitle = result.scenarioTitle;
    AppState.draft.structuredScenario = result.structuredScenario;
    AppState.draft.llmAssisted = true;
    AppState.draft.enhancedNarrative = narrative;
    AppState.draft.citations = result.citations || citations;
    AppState.draft.recommendations = result.recommendations || [];
    AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : AppState.draft.workflowGuidance;
    AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis;
    AppState.draft.inputRationale = result.inputRationale || AppState.draft.inputRationale;
    const s = result.suggestedInputs;
    if (s) {
      const lc = s.lossComponents;
      AppState.draft.fairParams = {
        ...AppState.draft.fairParams,
        tefMin: s.TEF.min, tefLikely: s.TEF.likely, tefMax: s.TEF.max,
        controlStrMin: s.controlStrength.min, controlStrLikely: s.controlStrength.likely, controlStrMax: s.controlStrength.max,
        threatCapMin: s.threatCapability.min, threatCapLikely: s.threatCapability.likely, threatCapMax: s.threatCapability.max,
        irMin: lc?.incidentResponse?.min, irLikely: lc?.incidentResponse?.likely, irMax: lc?.incidentResponse?.max,
        biMin: lc?.businessInterruption?.min, biLikely: lc?.businessInterruption?.likely, biMax: lc?.businessInterruption?.max,
        dbMin: lc?.dataBreachRemediation?.min, dbLikely: lc?.dataBreachRemediation?.likely, dbMax: lc?.dataBreachRemediation?.max,
        rlMin: lc?.regulatoryLegal?.min, rlLikely: lc?.regulatoryLegal?.likely, rlMax: lc?.regulatoryLegal?.max,
        tpMin: lc?.thirdPartyLiability?.min, tpLikely: lc?.thirdPartyLiability?.likely, tpMax: lc?.thirdPartyLiability?.max,
        rcMin: lc?.reputationContract?.min, rcLikely: lc?.reputationContract?.likely, rcMax: lc?.reputationContract?.max,
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
  if (!citations?.length) return '';
  return `<div class="card mt-4 anim-fade-in">
    <div class="context-panel-title">📚 Citations — Internal Documents</div>
    <div class="citation-chips">
      ${citations.map(c=>`<button class="citation-chip" data-doc-id="${c.docId}"><span class="citation-chip-icon">📄</span>${c.title}</button>`).join('')}
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
                <div><p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">If it happens, how large could that extra impact be in ${sym}?</p>${tripleInput('secMag','Secondary magnitude', v('secMagMin',100000), v('secMagLikely',500000), v('secMagMax',2000000), { minLabel: 'Low cost', likelyLabel: 'Expected cost', maxLabel: 'High cost' })}</div>
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
  return `<div class="range-group">
    <div class="form-group"><div class="range-col-label">${minLabel}</div><input class="form-input fair-input" id="${prefix}-min" data-key="${prefix}Min" type="number" step="any" value="${min}" aria-label="${label} min"></div>
    <div class="form-group"><div class="range-col-label" style="color:var(--color-primary-300)">${likelyLabel}</div><input class="form-input fair-input" id="${prefix}-likely" data-key="${prefix}Likely" type="number" step="any" value="${likely}" aria-label="${label} likely"></div>
    <div class="form-group"><div class="range-col-label">${maxLabel}</div><input class="form-input fair-input" id="${prefix}-max" data-key="${prefix}Max" type="number" step="any" value="${max}" aria-label="${label} max"></div>
  </div>`;
}

function lossRow(prefix, label, min, likely, max, tooltip) {
  return `<div>
    <div style="font-size:.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:6px">${label}<span data-tooltip="${tooltip}" style="cursor:help;color:var(--color-accent-300);font-size:.72rem">ⓘ</span></div>
    ${tripleInput(prefix, label, min, likely, max, { minLabel: 'Low cost', likelyLabel: 'Expected cost', maxLabel: 'Severe cost' })}
  </div>`;
}

function collectFairParams() {
  const p = AppState.draft.fairParams;
  document.querySelectorAll('.fair-input').forEach(input => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) p[input.dataset.key] = val;
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
    results.portfolioMeta = scenario;
    results.selectedRiskCount = scenario.riskCount;
    results.applicableRegulations = [...(AppState.draft.applicableRegulations || [])];
    results.warningThreshold = warningThreshold;
    results.annualReviewThreshold = annualReviewThreshold;
    results.nearTolerance = results.lm.p90 >= warningThreshold && results.lm.p90 < toleranceThreshold;
    results.annualReviewTriggered = results.ale.p90 >= annualReviewThreshold;
    if (!AppState.draft.id) AppState.draft.id = 'a_' + Date.now();
    const assessment = { ...AppState.draft, results, completedAt: Date.now() };
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
  // Check for shared payload in URL first
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
  const statusClass = r.toleranceBreached ? 'above' : r.nearTolerance ? 'warning' : 'within';
  const statusIcon = r.toleranceBreached ? '🔴' : r.nearTolerance ? '🟠' : '🟢';
  const statusTitle = r.toleranceBreached ? 'Above Tolerance Threshold' : r.nearTolerance ? 'Approaching Tolerance Threshold' : 'Within Tolerance Threshold';
  const statusDetail = r.toleranceBreached
    ? `Per-event P90: <strong>${fmtCurrency(r.lm.p90)}</strong> > threshold: <strong>${fmtCurrency(r.threshold)}</strong>`
    : r.nearTolerance
      ? `Per-event P90: <strong>${fmtCurrency(r.lm.p90)}</strong> is above warning trigger <strong>${fmtCurrency(r.warningThreshold)}</strong> but below tolerance <strong>${fmtCurrency(r.threshold)}</strong>`
      : `Per-event P90: <strong>${fmtCurrency(r.lm.p90)}</strong> is below the warning trigger <strong>${fmtCurrency(r.warningThreshold)}</strong>`;
  const executiveHeadline = r.toleranceBreached
    ? `This scenario is currently above the organisation's risk tolerance and should be escalated.`
    : r.nearTolerance
      ? `This scenario is close to the organisation's risk tolerance and should be actively managed.`
      : `This scenario is currently within tolerance, but should still be monitored and treated.`;
  const executiveAction = r.toleranceBreached
    ? 'Immediate leadership review recommended, with treatment decisions and ownership confirmed.'
    : r.nearTolerance
      ? 'Management review recommended to reduce exposure before it moves above tolerance.'
      : 'Routine monitoring is appropriate unless conditions, controls, or external threats materially change.';
  const executiveAnnualView = r.annualReviewTriggered
    ? `Annual exposure is also material at ${fmtCurrency(r.ale.p90)} on a P90 basis, which is above the annual review trigger.`
    : `Annual exposure is ${fmtCurrency(r.ale.p90)} on a P90 basis, which is below the annual review trigger.`;
  const scenarioScopeSummary = r.portfolioMeta?.linked
    ? `${r.selectedRiskCount || assessment.selectedRisks?.length || 1} linked risks are being treated as one connected scenario.`
    : `${r.selectedRiskCount || assessment.selectedRisks?.length || 1} risks are being assessed together without linked uplift.`;
  setPage(`
    <main class="page">
      <div class="container container--wide" style="padding:var(--sp-8) var(--sp-6)">
        ${sharedBanner}
        <div class="flex items-center justify-between mb-6 anim-fade-in">
          <div>
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:4px">Assessment Results</div>
            <h2 style="font-size:var(--text-2xl)">${assessment.scenarioTitle||'Risk Assessment'}</h2>
            <div style="font-size:var(--text-sm);color:var(--text-muted);margin-top:4px">${assessment.buName||'—'} · ${assessment.geography||'—'} · ${new Date(assessment.completedAt||Date.now()).toLocaleDateString('en-AE',{year:'numeric',month:'long',day:'numeric'})}</div>
          </div>
          <div class="flex items-center gap-3">
            <button class="btn btn--secondary btn--sm" id="btn-share-results">Share</button>
            <button class="btn btn--secondary btn--sm" id="btn-export-json">↓ JSON</button>
            <button class="btn btn--secondary btn--sm" id="btn-export-pptx">↓ PPTX Spec</button>
            <button class="btn btn--primary btn--sm" id="btn-export-pdf">↓ PDF Report</button>
          </div>
        </div>

        <div class="tolerance-banner ${statusClass} mb-6 anim-fade-in">
          <span class="tolerance-icon">${statusIcon}</span>
          <div>
            <div class="tolerance-title">${statusTitle}</div>
            <div class="tolerance-detail">${statusDetail} &nbsp;·&nbsp; Exceedance: <strong>${(r.toleranceDetail.lmExceedProb*100).toFixed(1)}%</strong></div>
          </div>
        </div>

        <div class="grid-2 mb-6 anim-fade-in">
          <div class="card card--elevated">
            <div class="context-panel-title">Executive Summary</div>
            <p class="context-panel-copy">${executiveHeadline}</p>
            <div style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-4)">
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Expected per-event exposure</div>
                <div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);margin-top:6px">${fmtCurrency(r.lm.mean)}</div>
              </div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Severe but plausible per-event exposure</div>
                <div style="font-size:var(--text-xl);font-weight:700;color:${r.toleranceBreached ? 'var(--color-danger-400)' : 'var(--text-primary)'};margin-top:6px">${fmtCurrency(r.lm.p90)}</div>
              </div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Expected annual exposure</div>
                <div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);margin-top:6px">${fmtCurrency(r.ale.mean)}</div>
              </div>
            </div>
          </div>
          <div class="card card--elevated">
            <div class="context-panel-title">What Leaders Should Know</div>
            <div style="display:flex;flex-direction:column;gap:var(--sp-4);margin-top:var(--sp-3)">
              <div>
                <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Recommended action</div>
                <div class="context-panel-copy" style="margin-top:6px">${executiveAction}</div>
              </div>
              <div>
                <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Annual view</div>
                <div class="context-panel-copy" style="margin-top:6px">${executiveAnnualView}</div>
              </div>
              <div>
                <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Scenario scope</div>
                <div class="context-panel-copy" style="margin-top:6px">${scenarioScopeSummary}</div>
              </div>
              <div>
                <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Escalation guidance</div>
                <div class="context-panel-copy" style="margin-top:6px">${getAdminSettings().escalationGuidance}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid-3 mb-6 anim-fade-in">
          <div class="metric-card"><div class="metric-label">Warning Trigger</div><div class="metric-value warning">${fmtCurrency(r.warningThreshold || getWarningThreshold())}</div><div class="metric-sub">Amber review trigger for P90 per-event loss</div></div>
          <div class="metric-card"><div class="metric-label">Tolerance Threshold</div><div class="metric-value ${r.toleranceBreached?'danger':''}">${fmtCurrency(r.threshold)}</div><div class="metric-sub">Red escalation trigger for P90 per-event loss</div></div>
          <div class="metric-card"><div class="metric-label">Annual Review Trigger</div><div class="metric-value">${fmtCurrency(r.annualReviewThreshold || getAnnualReviewThreshold())}</div><div class="metric-sub">${r.annualReviewTriggered ? 'Triggered by current ALE P90' : 'Not triggered by current ALE P90'}</div></div>
        </div>

        ${(assessment.selectedRisks?.length || r.selectedRiskCount) ? `
        <div class="card mb-6 anim-fade-in">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:var(--sp-3)">
            <div>
              <div class="context-panel-title">Scenario Scope</div>
              <div class="context-panel-copy">${r.portfolioMeta?.linked ? 'Linked risk scenario uplift applied.' : 'Combined multi-risk scenario.'}</div>
            </div>
            <div class="badge badge--neutral">${r.selectedRiskCount || assessment.selectedRisks?.length || 1} risk${(r.selectedRiskCount || assessment.selectedRisks?.length || 1) > 1 ? 's' : ''}</div>
          </div>
          ${assessment.selectedRisks?.length ? `<div class="citation-chips mt-4">${assessment.selectedRisks.map(risk => `<span class="badge badge--gold">${risk.title}</span>`).join('')}</div>` : ''}
          ${assessment.applicableRegulations?.length ? `<div class="citation-chips mt-4">${assessment.applicableRegulations.map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('')}</div>` : ''}
        </div>` : ''}

        ${(assessment.workflowGuidance?.length || assessment.benchmarkBasis || assessment.inputRationale) ? `
        <div class="grid-2 mb-6 anim-fade-in">
          ${renderWorkflowGuidanceBlock(assessment.workflowGuidance || [], 'How AI guided this assessment')}
          ${renderBenchmarkRationaleBlock(assessment.benchmarkBasis, assessment.inputRationale)}
        </div>` : ''}

        <div class="mb-6">
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:var(--sp-3)">Per-Event Financial Exposure</div>
          <div class="grid-3 anim-fade-in">
            <div class="metric-card"><div class="metric-label">Typical event cost</div><div class="metric-value">${fmtCurrency(r.lm.p50)}</div><div class="metric-sub">A midpoint view of what one event may cost</div></div>
            <div class="metric-card"><div class="metric-label">Severe but plausible event cost</div><div class="metric-value ${r.toleranceBreached?'danger':''}">${fmtCurrency(r.lm.p90)}</div><div class="metric-sub">Used for the tolerance check</div></div>
            <div class="metric-card"><div class="metric-label">Expected event cost</div><div class="metric-value">${fmtCurrency(r.lm.mean)}</div><div class="metric-sub">Average loss per event across all simulations</div></div>
          </div>
        </div>
        <div class="mb-8">
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:var(--sp-3)">Annual Financial Exposure</div>
          <div class="grid-3 anim-fade-in anim-delay-1">
            <div class="metric-card"><div class="metric-label">Typical annual exposure</div><div class="metric-value">${fmtCurrency(r.ale.p50)}</div><div class="metric-sub">A midpoint annual view</div></div>
            <div class="metric-card"><div class="metric-label">Severe annual exposure</div><div class="metric-value warning">${fmtCurrency(r.ale.p90)}</div><div class="metric-sub">Useful for annual planning and oversight</div></div>
            <div class="metric-card"><div class="metric-label">Expected annual exposure</div><div class="metric-value">${fmtCurrency(r.ale.mean)}</div><div class="metric-sub">Average annual loss across all simulations</div></div>
          </div>
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

        ${assessment.structuredScenario?`
        <div class="card mb-6 anim-fade-in">
          <h3 style="font-size:var(--text-base);margin-bottom:var(--sp-4)">Scenario Details</h3>
          <div class="grid-2">
            ${Object.entries({
              'Asset / Service': assessment.structuredScenario.assetService,
              'Threat Community': assessment.structuredScenario.threatCommunity,
              'Attack Type': assessment.structuredScenario.attackType,
              'Effect': assessment.structuredScenario.effect
            }).map(([k,v])=>`<div style="background:var(--bg-elevated);padding:var(--sp-3) var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">${k}</div><div style="font-size:.85rem;color:var(--text-secondary);margin-top:4px">${v||'—'}</div></div>`).join('')}
          </div>
        </div>`:''}

        ${assessment.citations?.length?renderCitationBlock(assessment.citations):''}

        ${assessment.recommendations?.length?`
        <div class="mb-8 anim-fade-in">
          <h3 style="font-size:var(--text-xl);margin-bottom:var(--sp-5)">Recommended Risk Treatments</h3>
          <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
            ${assessment.recommendations.map((rec,i)=>`
              <div class="rec-card">
                <div class="flex items-start gap-4">
                  <div class="rec-number">${i+1}</div>
                  <div style="flex:1">
                    <div class="rec-title">${rec.title}</div>
                    <div class="rec-why">${rec.why}</div>
                    <div class="rec-impact">↑ ${rec.impact}</div>
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>`:''}

        <div class="flex items-center gap-4 mt-8 pt-6" style="border-top:1px solid var(--border-subtle)">
          <a href="#/" class="btn btn--ghost">← Home</a>
          <button class="btn btn--secondary" id="btn-new-assess">New Assessment</button>
          <div class="bar-spacer"></div>
          <span style="font-size:.72rem;color:var(--text-muted)">ID: ${assessment.id} · ${r.iterations.toLocaleString()} iterations</span>
        </div>
      </div>
    </main>`);

  requestAnimationFrame(() => {
    const hc = document.getElementById('chart-hist');
    const lc = document.getElementById('chart-lec');
    if (hc) UI.drawHistogram(hc, r.histogram, r.threshold, AppState.currency, AppState.fxRate);
    if (lc) UI.drawLEC(lc, r.lec, r.threshold, AppState.currency, AppState.fxRate);
    attachCitationHandlers();
  });
  document.getElementById('btn-share-results').addEventListener('click', () => ShareService.copyShareLink(assessment));
  document.getElementById('btn-export-json').addEventListener('click', () => { ExportService.exportJSON(assessment); UI.toast('JSON exported.','success'); });
  document.getElementById('btn-export-pdf').addEventListener('click', () => ExportService.exportPDF(assessment, AppState.currency, AppState.fxRate));
  document.getElementById('btn-export-pptx').addEventListener('click', () => { ExportService.exportPPTXSpec(assessment, AppState.currency, AppState.fxRate); UI.toast('PPTX spec exported as JSON. See README.','info',5000); });
  document.getElementById('btn-new-assess').addEventListener('click', () => { resetDraft(); Router.navigate('/wizard/1'); });
}

// ─── ADMIN ────────────────────────────────────────────────────
function renderAdminLogin() {
  setPage(`
    <main class="page">
      <div class="container container--narrow" style="padding:var(--sp-16) var(--sp-6);max-width:440px">
        <div class="banner banner--poc mb-6"><span class="banner-icon">⚠</span><span class="banner-text"><strong>PoC Security:</strong> Shared password only. Replace with Microsoft Entra ID before production. [ENTRA-INTEGRATION]</span></div>
        <div class="card card--elevated">
          <h2 style="margin-bottom:var(--sp-6)">Admin Login</h2>
          <div class="form-group mb-4">
            <label class="form-label" for="admin-pass">Password</label>
            <input class="form-input" id="admin-pass" type="password" placeholder="Enter admin password" autocomplete="current-password">
            <span class="form-error hidden" id="admin-err">⚠ Incorrect password</span>
          </div>
          <button class="btn btn--primary w-full" id="btn-admin-login" style="justify-content:center">Sign In</button>
          <div style="margin-top:var(--sp-4);text-align:center"><a href="#/" class="btn btn--ghost btn--sm">← Back</a></div>
        </div>
      </div>
    </main>`);

  const login = () => {
    const pw = document.getElementById('admin-pass').value;
    const result = AuthService.adminLogin(pw);
    if (result.success) { UI.toast('Logged in.','success'); Router.navigate('/admin/bu'); }
    else {
      document.getElementById('admin-err').classList.remove('hidden');
      document.getElementById('admin-pass').classList.add('error');
    }
  };
  document.getElementById('btn-admin-login').addEventListener('click', login);
  document.getElementById('admin-pass').addEventListener('keydown', e => { if (e.key==='Enter') login(); });
}

function requireAdmin() {
  if (!AuthService.isAdminAuthenticated()) { Router.navigate('/admin'); return false; }
  return true;
}

function adminLayout(active, content) {
  return `<div style="display:flex;min-height:calc(100vh - 60px)">
    <nav class="admin-sidebar">
      <div style="font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:var(--sp-3)">Admin</div>
      <a href="#/admin/settings" class="admin-nav-link ${active==='settings'?'active':''}">⚙️ Settings</a>
      <a href="#/admin/bu" class="admin-nav-link ${active==='bu'?'active':''}">🏢 Business Units</a>
      <a href="#/admin/docs" class="admin-nav-link ${active==='docs'?'active':''}">📚 Internal Docs</a>
      <div style="flex:1"></div>
      <div style="border-top:1px solid var(--border-subtle);padding-top:var(--sp-3)">
        <div class="banner banner--poc" style="font-size:.7rem;padding:8px 10px">⚠ PoC — replace with Entra ID</div>
        <button class="btn btn--ghost btn--sm" id="btn-admin-logout" style="margin-top:8px;width:100%;justify-content:center">Sign Out</button>
      </div>
    </nav>
    <div style="flex:1;padding:var(--sp-8);overflow-y:auto">${content}</div>
  </div>`;
}

function renderAdminSettings() {
  if (!requireAdmin()) return;
  const settings = getAdminSettings();
  const sessionLLM = getSessionLLMConfig();
  const directCompass = !sessionLLM.apiUrl || sessionLLM.apiUrl.includes('api.core42.ai');
  const buCount = getBUList().length;
  const docCount = getDocList().length;
  setPage(adminLayout('settings', `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2>Platform Settings</h2>
        <p style="margin-top:6px">${settings.adminContextSummary}</p>
      </div>
      <button class="btn btn--secondary" id="btn-reset-settings">Reset Defaults</button>
    </div>
    <div class="admin-overview-grid mb-6">
      <div class="admin-overview-card">
        <div class="admin-overview-label">Business Units</div>
        <div class="admin-overview-value">${buCount}</div>
        <div class="admin-overview-foot">Editable in the Business Units section</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">Internal Documents</div>
        <div class="admin-overview-value">${docCount}</div>
        <div class="admin-overview-foot">Used for citations and AI context</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">Tolerance Threshold</div>
        <div class="admin-overview-value">${fmtCurrency(settings.toleranceThresholdUsd)}</div>
        <div class="admin-overview-foot">Per-event P90 red trigger</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">AI Route</div>
        <div class="admin-overview-value" style="font-size:var(--text-base)">${directCompass ? 'Direct / Browser Session' : 'Proxy / Hosted'}</div>
        <div class="admin-overview-foot">${sessionLLM.apiUrl || 'No session endpoint saved yet'}</div>
      </div>
    </div>
    <div class="card card--elevated">
      <div class="admin-section-head">
        <div>
          <h3>Risk Governance</h3>
          <p>Set the platform-level triggers used to flag scenarios and guide escalation.</p>
        </div>
      </div>
      <div class="grid-3">
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
      <div class="admin-section-head mt-5">
        <div>
          <h3>Default Context</h3>
          <p>These values pre-populate the AI-assisted risk builder for new and in-progress assessments.</p>
        </div>
      </div>
      <div class="grid-2">
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
      <div class="card mt-5" style="padding:var(--sp-5);background:var(--bg-elevated)">
        <div class="context-panel-title">AI Company Context Builder</div>
        <p class="context-panel-copy">Enter a company website and let the hosted AI builder gather public context from the site to shape the business profile, likely regulations, and AI guidance. This is based on public web material only.</p>
        <div class="grid-2 mt-4">
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
        <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
          <button class="btn btn--secondary" id="btn-build-company-context">Build from Website</button>
          <span class="form-help">The result can be reviewed and edited before you save settings.</span>
        </div>
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
        <a class="btn btn--secondary" href="#/admin/bu">Manage Business Units</a>
        <a class="btn btn--secondary" href="#/admin/docs">Manage Documents</a>
      </div>
      <div class="card mt-5" style="padding:var(--sp-5);background:var(--bg-elevated)">
        <div class="context-panel-title">Compass Session Access</div>
        <p class="context-panel-copy">${directCompass ? 'Use direct Compass access for temporary testing only. For production, prefer a hosted proxy URL such as the Vercel endpoint.' : 'A hosted proxy URL is configured. Leave the browser key blank and test through the proxy.'}</p>
        <div class="grid-2 mt-4">
          <div class="form-group">
            <label class="form-label" for="admin-compass-url">Compass URL</label>
            <input class="form-input" id="admin-compass-url" value="${sessionLLM.apiUrl || 'https://api.core42.ai/v1/chat/completions'}">
            <span class="form-help">Use <code>https://risk-calculator-eight.vercel.app/api/compass</code> for the hosted proxy path.</span>
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
          <span class="form-help">This does not persist across browser sessions.</span>
        </div>
      </div>
      <div class="flex items-center gap-3 mt-5">
        <button class="btn btn--primary" id="btn-save-settings">Save Settings</button>
        <span class="form-help">Applies to new and in-progress assessments immediately.</span>
      </div>
    </div>`));

  document.getElementById('btn-admin-logout').addEventListener('click', () => { AuthService.adminLogout(); Router.navigate('/admin'); });
  const regsInput = UI.tagInput('ti-admin-regulations', settings.applicableRegulations);
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const warningThresholdUsd = Math.max(0, parseFloat(document.getElementById('admin-warning-threshold').value) || DEFAULT_ADMIN_SETTINGS.warningThresholdUsd);
    const toleranceThresholdUsd = Math.max(0, parseFloat(document.getElementById('admin-tolerance-threshold').value) || TOLERANCE_THRESHOLD);
    const annualReviewThresholdUsd = Math.max(0, parseFloat(document.getElementById('admin-annual-threshold').value) || DEFAULT_ADMIN_SETTINGS.annualReviewThresholdUsd);
    if (warningThresholdUsd > toleranceThresholdUsd) {
      UI.toast('Warning trigger must be less than or equal to the tolerance threshold.', 'warning');
      return;
    }
    if (annualReviewThresholdUsd < toleranceThresholdUsd) {
      UI.toast('Annual review trigger should be greater than or equal to the tolerance threshold.', 'warning');
      return;
    }
    saveAdminSettings({
      geography: document.getElementById('admin-geo').value.trim() || DEFAULT_ADMIN_SETTINGS.geography,
      companyWebsiteUrl: document.getElementById('admin-company-url').value.trim(),
      companyContextProfile: document.getElementById('admin-company-profile').value.trim(),
      defaultLinkMode: document.getElementById('admin-link-mode').value === 'yes',
      toleranceThresholdUsd,
      warningThresholdUsd,
      annualReviewThresholdUsd,
      riskAppetiteStatement: document.getElementById('admin-appetite').value.trim() || DEFAULT_ADMIN_SETTINGS.riskAppetiteStatement,
      applicableRegulations: regsInput.getTags(),
      aiInstructions: document.getElementById('admin-ai-instructions').value.trim(),
      benchmarkStrategy: document.getElementById('admin-benchmark-strategy').value.trim() || DEFAULT_ADMIN_SETTINGS.benchmarkStrategy,
      adminContextSummary: document.getElementById('admin-context-summary').value.trim() || DEFAULT_ADMIN_SETTINGS.adminContextSummary,
      escalationGuidance: document.getElementById('admin-escalation-guidance').value.trim() || DEFAULT_ADMIN_SETTINGS.escalationGuidance
    });
    if (!AppState.draft.geography) AppState.draft.geography = getAdminSettings().geography;
    saveDraft();
    UI.toast('Settings saved.', 'success');
  });
  document.getElementById('btn-build-company-context').addEventListener('click', async () => {
    const btn = document.getElementById('btn-build-company-context');
    const websiteUrl = document.getElementById('admin-company-url').value.trim();
    if (!websiteUrl) {
      UI.toast('Enter a company website URL first.', 'warning');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Building context…';
    try {
      const result = await LLMService.buildCompanyContext(websiteUrl);
      const profileText = [
        result.companySummary,
        result.businessProfile,
        result.riskSignals?.length ? `Key public risk signals: ${result.riskSignals.join('; ')}` : '',
        result.sources?.length ? `Sources reviewed: ${result.sources.map(source => source.url).join(', ')}` : ''
      ].filter(Boolean).join('\n\n');
      document.getElementById('admin-company-profile').value = profileText;
      if (!document.getElementById('admin-context-summary').value.trim()) {
        document.getElementById('admin-context-summary').value = result.companySummary || '';
      }
      if (result.aiGuidance) {
        document.getElementById('admin-ai-instructions').value = result.aiGuidance;
      }
      if (result.suggestedGeography && !document.getElementById('admin-geo').value.trim()) {
        document.getElementById('admin-geo').value = result.suggestedGeography;
      }
      if (Array.isArray(result.regulatorySignals) && result.regulatorySignals.length) {
        regsInput.setTags(Array.from(new Set([...regsInput.getTags(), ...result.regulatorySignals])));
      }
      UI.toast('Company context built from the public website.', 'success', 5000);
    } catch (error) {
      UI.toast('Company context build failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Build from Website';
    }
  });
  document.getElementById('btn-save-session-llm').addEventListener('click', () => {
    const config = {
      apiUrl: document.getElementById('admin-compass-url').value.trim() || 'https://api.core42.ai/v1/chat/completions',
      model: document.getElementById('admin-compass-model').value.trim() || 'gpt-5.1',
      apiKey: document.getElementById('admin-compass-key').value.trim()
    };
    saveSessionLLMConfig(config);
    LLMService.setCompassConfig(config);
    UI.toast(config.apiKey ? 'Compass session key loaded for this session.' : 'Compass proxy/session settings loaded for this session.', 'success');
  });
  document.getElementById('btn-test-session-llm').addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-session-llm');
    const config = {
      apiUrl: document.getElementById('admin-compass-url').value.trim() || 'https://api.core42.ai/v1/chat/completions',
      model: document.getElementById('admin-compass-model').value.trim() || 'gpt-5.1',
      apiKey: document.getElementById('admin-compass-key').value.trim()
    };
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
    sessionStorage.removeItem('rq_llm_session');
    LLMService.clearCompassConfig();
    renderAdminSettings();
    UI.toast('Compass session key cleared.', 'success');
  });
  document.getElementById('btn-reset-settings').addEventListener('click', async () => {
    if (await UI.confirm('Reset platform settings to defaults?')) {
      localStorage.removeItem('rq_admin_settings');
      UI.toast('Settings reset.', 'success');
      renderAdminSettings();
    }
  });
}

function renderAdminBU() {
  if (!requireAdmin()) return;
  const buList = getBUList();
  setPage(adminLayout('bu', `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2>Business Units</h2>
        <p style="margin-top:6px">Maintain the business context used by the risk builder and FAIR defaults. Keep services, systems, and regulatory tags current so AI suggestions stay relevant.</p>
      </div>
      <div class="flex gap-3">
        <button class="btn btn--ghost btn--sm" id="btn-reset-bu">Reset Defaults</button>
        <button class="btn btn--primary" id="btn-add-bu">+ Add BU</button>
      </div>
    </div>
    <div class="admin-overview-grid mb-6">
      <div class="admin-overview-card">
        <div class="admin-overview-label">Total BUs</div>
        <div class="admin-overview-value">${buList.length}</div>
        <div class="admin-overview-foot">Used to pre-fill the first step of the assessment</div>
      </div>
      <div class="admin-overview-card">
        <div class="admin-overview-label">Average Regulatory Tags</div>
        <div class="admin-overview-value">${buList.length ? (buList.reduce((sum, bu) => sum + (bu.regulatoryTags?.length || 0), 0) / buList.length).toFixed(1) : '0.0'}</div>
        <div class="admin-overview-foot">Signals how much context each BU carries</div>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Critical Services</th><th>Regulatory</th><th>Actions</th></tr></thead>
        <tbody>${buList.map(bu=>`<tr>
          <td><strong style="color:var(--text-primary)">${bu.name}</strong><br><span style="font-size:.68rem;color:var(--text-muted)">${bu.id}</span></td>
          <td style="font-size:.8rem">${bu.criticalServices.slice(0,2).join(', ')}${bu.criticalServices.length>2?'…':''}</td>
          <td>${bu.regulatoryTags.map(t=>`<span class="badge badge--gold" style="font-size:.6rem;margin:2px">${t}</span>`).join('')}</td>
          <td><button class="btn btn--ghost btn--sm" data-id="${bu.id}" id="edit-bu-${bu.id}">Edit</button> <button class="btn btn--ghost btn--sm" data-id="${bu.id}" id="del-bu-${bu.id}" style="color:var(--color-danger-400)">Delete</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`));

  document.getElementById('btn-admin-logout').addEventListener('click', () => { AuthService.adminLogout(); Router.navigate('/admin'); });
  document.getElementById('btn-reset-bu').addEventListener('click', async () => {
    if (await UI.confirm('Reset BU data to defaults?')) {
      localStorage.removeItem('rq_bu_override');
      AppState.buList = await loadJSON('./data/bu.json');
      RAGService.init(getDocList(), AppState.buList);
      Router.resolve(); UI.toast('Reset to defaults.','success');
    }
  });
  document.getElementById('btn-add-bu').addEventListener('click', () => openBUEditor(null));
  buList.forEach(bu => {
    document.getElementById('edit-bu-'+bu.id)?.addEventListener('click', () => openBUEditor(bu));
    document.getElementById('del-bu-'+bu.id)?.addEventListener('click', async () => {
      if (await UI.confirm(`Delete "${bu.name}"?`)) {
        saveBUList(getBUList().filter(b=>b.id!==bu.id));
        Router.resolve(); UI.toast('Deleted.','success');
      }
    });
  });
}

function openBUEditor(bu) {
  const isNew = !bu;
  let ti = {};
  const m = UI.modal({
    title: isNew ? 'Add Business Unit' : `Edit: ${bu.name}`,
    body: `<form id="bu-form"><div class="grid-2" style="gap:12px">
      <div class="form-group"><label class="form-label">ID</label><input class="form-input" id="bu-id" value="${bu?.id||''}" placeholder="bu-example" ${!isNew?'readonly':''}></div>
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="bu-name" value="${bu?.name||''}"></div>
    </div>
    <div class="form-group mt-4"><label class="form-label">Critical Services</label><div class="tag-input-wrap" id="ti-services"></div></div>
    <div class="form-group mt-4"><label class="form-label">Key Systems</label><div class="tag-input-wrap" id="ti-systems"></div></div>
    <div class="form-group mt-4"><label class="form-label">Data Types</label><div class="tag-input-wrap" id="ti-datatypes"></div></div>
    <div class="form-group mt-4"><label class="form-label">Regulatory Tags</label><div class="tag-input-wrap" id="ti-regtags"></div></div>
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
  document.getElementById('bu-cancel').addEventListener('click', () => m.close());
  document.getElementById('bu-save').addEventListener('click', () => {
    const id = document.getElementById('bu-id').value.trim();
    const name = document.getElementById('bu-name').value.trim();
    if (!id||!name) { UI.toast('ID and Name required.','warning'); return; }
    const updated = { id, name, criticalServices: ti.services.getTags(), keySystems: ti.systems.getTags(), dataTypes: ti.datatypes.getTags(), regulatoryTags: ti.regtags.getTags(), notes: document.getElementById('bu-notes').value, defaultAssumptions: bu?.defaultAssumptions||{}, docIds: bu?.docIds||[] };
    const list = getBUList();
    const idx = list.findIndex(b=>b.id===id);
    if (idx>-1) list[idx]=updated; else list.push(updated);
    saveBUList(list); m.close(); Router.resolve();
    UI.toast(`BU "${name}" ${isNew?'added':'updated'}.`,'success');
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

  document.getElementById('btn-admin-logout').addEventListener('click', () => { AuthService.adminLogout(); Router.navigate('/admin'); });
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
    AppState.buList  = await loadJSON('./data/bu.json');
    AppState.docList = await loadJSON('./data/docs.json');
  } catch(e) {
    console.error('Failed to load JSON data:', e);
    AppState.buList = []; AppState.docList = [];
  }
  RAGService.init(getDocList(), getBUList());
  loadDraft();
  if (!AppState.draft.id) resetDraft();
  ensureDraftShape();
  if (!AppState.draft.applicableRegulations?.length) {
    AppState.draft.applicableRegulations = [...getAdminSettings().applicableRegulations];
  }
  const sessionLLM = getSessionLLMConfig();
  if (sessionLLM.apiKey) {
    LLMService.setCompassConfig(sessionLLM);
  }

  renderAppBar();

  Router
    .on('/', renderLanding)
    .on('/wizard/1', renderWizard1)
    .on('/wizard/2', renderWizard2)
    .on('/wizard/3', renderWizard3)
    .on('/wizard/4', renderWizard4)
    .on('/results/:id', params => renderResults(params.id))
    .on('/admin', renderAdminLogin)
    .on('/admin/settings', renderAdminSettings)
    .on('/admin/bu', renderAdminBU)
    .on('/admin/docs', renderAdminDocs)
    .notFound(() => { setPage(`<div class="container" style="padding:var(--sp-12)"><h2>Page Not Found</h2><a href="#/" class="btn btn--primary" style="margin-top:var(--sp-4)">← Home</a></div>`); });

  Router.init();
}

document.addEventListener('DOMContentLoaded', init);
