'use strict';

const DEFAULT_RISK_DOMAIN_ID = 'cyber-information-security';

function getRiskDomainLibrary() {
  return Array.isArray(AppState?.riskDomainLibrary) ? AppState.riskDomainLibrary : [];
}

function getRiskTaxonomyLibrary() {
  return Array.isArray(AppState?.riskTaxonomyLibrary) ? AppState.riskTaxonomyLibrary : [];
}

function getRiskSourceLibrary() {
  return Array.isArray(AppState?.riskSourceLibrary) ? AppState.riskSourceLibrary : [];
}

function getRiskDomainById(domainId) {
  const library = getRiskDomainLibrary();
  return library.find(domain => domain.id === domainId) || library[0] || null;
}

function getSelectedRiskDomain(draft = AppState?.draft) {
  const domainId = String(draft?.riskDomainId || DEFAULT_RISK_DOMAIN_ID).trim();
  return getRiskDomainById(domainId);
}

function getDomainTaxonomyEntries(domainId) {
  return getRiskTaxonomyLibrary().filter(entry => entry.domainId === domainId);
}

function getDomainSourceEntries(domainId) {
  return getRiskSourceLibrary().filter(entry => Array.isArray(entry.domainIds) && entry.domainIds.includes(domainId));
}

function getRiskDomainCoverage(domainId) {
  const taxonomyEntries = getDomainTaxonomyEntries(domainId);
  const sourceEntries = getDomainSourceEntries(domainId);
  const canonicalEvents = taxonomyEntries.reduce((sum, entry) => sum + Number(entry.eventCount || 0), 0);
  return {
    families: taxonomyEntries.length,
    canonicalEvents,
    sources: sourceEntries.length
  };
}

function applyRiskDomainSelection(domainId, { save = true } = {}) {
  ensureDraftShape();
  const domain = getRiskDomainById(domainId);
  if (!domain) return null;
  AppState.draft.riskDomainId = domain.id;
  AppState.draft.riskDomainLabel = domain.label;
  AppState.draft.riskDomainShortLabel = domain.shortLabel || domain.label;
  AppState.draft.domainConfig = {
    id: domain.id,
    label: domain.label,
    shortLabel: domain.shortLabel || domain.label,
    assessmentPrompt: domain.assessmentPrompt || '',
    benchmarkLens: domain.primaryBenchmarkLens || '',
    keyImpactLabels: Array.isArray(domain.keyImpactLabels) ? domain.keyImpactLabels.slice() : [],
    defaultTaxonomyFamilyIds: Array.isArray(domain.defaultTaxonomyFamilyIds) ? domain.defaultTaxonomyFamilyIds.slice() : []
  };
  if (save) saveDraft();
  return domain;
}

function startNewAssessmentFlow() {
  resetDraft();
  Router.navigate('/assess/select-domain');
}

function startNewAssessmentFromDomain(domainId) {
  resetDraft();
  const domain = applyRiskDomainSelection(domainId, { save: false });
  saveDraft();
  Router.navigate('/wizard/1');
  return domain;
}

function ensureRiskDomainSelection() {
  ensureDraftShape();
  if (String(AppState.draft?.riskDomainId || '').trim()) return true;
  Router.navigate('/assess/select-domain');
  return false;
}

function renderRiskDomainSelection() {
  if (!requireAuth()) return;
  if (AuthService.isAdminAuthenticated()) {
    Router.navigate(getDefaultRouteForCurrentUser());
    return;
  }

  ensureDraftShape();
  const user = AppState.currentUser || AuthService.getCurrentUser();
  const domains = getRiskDomainLibrary().slice().sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
  const selectedDomain = getSelectedRiskDomain(AppState.draft);
  const totalFamilies = getRiskTaxonomyLibrary().length;
  const totalEvents = getRiskTaxonomyLibrary().reduce((sum, entry) => sum + Number(entry.eventCount || 0), 0);
  const totalSources = getRiskSourceLibrary().length;

  setPage(`
    <main class="page">
      <div class="container container--wide">
        <section class="card card--elevated dashboard-hero">
          <div class="dashboard-hero-grid">
            <div class="dashboard-hero-main">
              <div class="landing-badge">Risk Domain Selection</div>
              <h2 style="margin-top:var(--sp-4)">Choose the risk you want to analyse.</h2>
              <p style="margin-top:10px;color:rgba(255,255,255,.78);max-width:760px">The platform is being rebuilt around a shared risk taxonomy, benchmark library, and AI evidence layer. Start by choosing the domain so the guided assessment can adapt its language, risk register context, and benchmark grounding.</p>
              <div class="citation-chips" style="margin-top:var(--sp-5)">
                <span class="badge badge--neutral">${totalFamilies} taxonomy families</span>
                <span class="badge badge--neutral">${totalEvents} canonical risk events</span>
                <span class="badge badge--neutral">${totalSources} benchmark and survey sources</span>
              </div>
            </div>
            <div class="card dashboard-hero-side">
              <div class="context-panel-title">Current workspace</div>
              <div class="context-panel-copy" style="margin-top:8px">${escapeHtml(user?.displayName || 'Current user')} can start a new analysis from any supported risk domain.</div>
              <div class="form-help" style="margin-top:10px;color:rgba(255,255,255,.68)">Selected domain: ${escapeHtml(selectedDomain?.label || 'Not selected yet')}</div>
              <div class="form-help" style="margin-top:8px;color:rgba(255,255,255,.68)">The next step uses domain-aware prompts, benchmark lenses, and starter taxonomy families.</div>
            </div>
          </div>
        </section>

        <section class="admin-overview-grid dashboard-at-a-glance" style="margin-top:var(--sp-8)">
          ${UI.dashboardOverviewCard({
            label: 'Supported domains',
            value: domains.length,
            foot: 'Broad enough for enterprise-wide usage, while still grounded in a shared model.'
          })}
          ${UI.dashboardOverviewCard({
            label: 'Seed benchmark library',
            value: totalSources,
            foot: 'Local, regional, and global sources tagged for future retrieval and AI grounding.'
          })}
          ${UI.dashboardOverviewCard({
            label: 'Starter risk intelligence',
            value: totalEvents,
            foot: 'Canonical events attached to domain families so the register can scale without free-text sprawl.'
          })}
        </section>

        <section style="margin-top:var(--sp-8)">
          <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:var(--sp-5)">
            ${domains.map(domain => {
              const coverage = getRiskDomainCoverage(domain.id);
              const keyImpacts = Array.isArray(domain.keyImpactLabels) ? domain.keyImpactLabels.slice(0, 4) : [];
              return `<button type="button" class="card card--elevated risk-domain-card" data-domain-id="${escapeHtml(domain.id)}" style="text-align:left;display:flex;flex-direction:column;gap:var(--sp-4);padding:var(--sp-6)">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-4)">
                  <div>
                    <div class="landing-badge">${escapeHtml(domain.shortLabel || domain.label)}</div>
                    <h3 style="margin-top:var(--sp-3);font-size:1.2rem">${escapeHtml(domain.label)}</h3>
                  </div>
                  <span class="badge badge--gold">${escapeHtml(domain.primaryBenchmarkLens || 'Mixed lens')}</span>
                </div>
                <p class="context-panel-copy">${escapeHtml(domain.description || '')}</p>
                <div class="citation-chips">
                  <span class="badge badge--neutral">${coverage.families} families</span>
                  <span class="badge badge--neutral">${coverage.canonicalEvents} event patterns</span>
                  <span class="badge badge--neutral">${coverage.sources} sources</span>
                </div>
                <div class="context-panel-foot">${escapeHtml(domain.assessmentPrompt || '')}</div>
                <div class="citation-chips">${keyImpacts.map(label => `<span class="badge badge--neutral">${escapeHtml(label)}</span>`).join('')}</div>
                <div style="margin-top:auto;color:var(--color-primary-400);font-weight:600">Start guided assessment →</div>
              </button>`;
            }).join('')}
          </div>
        </section>
      </div>
    </main>`);

  document.querySelectorAll('.risk-domain-card').forEach(card => {
    card.addEventListener('click', () => {
      const domainId = card.dataset.domainId;
      const domain = startNewAssessmentFromDomain(domainId);
      if (domain) {
        UI.toast(`Started a new ${domain.label} assessment.`, 'success');
      }
    });
  });
}

Object.assign(window, {
  DEFAULT_RISK_DOMAIN_ID,
  getRiskDomainLibrary,
  getRiskTaxonomyLibrary,
  getRiskSourceLibrary,
  getRiskDomainById,
  getSelectedRiskDomain,
  getDomainTaxonomyEntries,
  getDomainSourceEntries,
  getRiskDomainCoverage,
  applyRiskDomainSelection,
  startNewAssessmentFlow,
  startNewAssessmentFromDomain,
  ensureRiskDomainSelection,
  renderRiskDomainSelection
});
