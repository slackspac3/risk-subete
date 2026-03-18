function _setStep1ButtonBusy(button, busyLabel, idleLabel) {
  if (!button) return () => {};
  const originalLabel = idleLabel || button.dataset.idleLabel || button.textContent || '';
  button.dataset.idleLabel = originalLabel;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = busyLabel;
  return () => {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = originalLabel;
  };
}

function getStep1RecommendedAction(draft, selectedRisks) {
  const selectedCount = Array.isArray(selectedRisks) ? selectedRisks.length : 0;
  if (!String(draft.narrative || '').trim() && !selectedCount) {
    return {
      title: 'Start with the guided questions',
      copy: 'Answer the simple prompts first. That is the fastest path for most users and gives AI better context to work with.'
    };
  }
  if (String(draft.narrative || '').trim() && !selectedCount) {
    return {
      title: 'Use AI or add the risks you want to assess',
      copy: 'Your scenario wording is in place. Next, either let AI suggest risks from it or add the risks you already know belong in scope.'
    };
  }
  return {
    title: 'Review the selected risks and continue',
    copy: `You already have ${selectedCount} risk${selectedCount === 1 ? '' : 's'} selected. Remove anything out of scope, then continue to scenario review.`
  };
}

function renderStep1StartCard(recommendation) {
  return `<div class="card card--elevated anim-fade-in">
    <div class="context-panel-title">Recommended starting path</div>
    <p class="context-panel-copy" style="margin-top:var(--sp-2)"><strong>${recommendation.title}</strong></p>
    <div class="context-grid" style="margin-top:var(--sp-4)">
      <div class="context-chip-panel">
        <div class="context-panel-title">1. Describe the scenario</div>
        <p class="context-panel-copy">Use the guided questions below unless you already have a clean risk statement.</p>
      </div>
      <div class="context-chip-panel">
        <div class="context-panel-title">2. Let AI structure it</div>
        <p class="context-panel-copy">Use AI only when you want help sharpening the wording or extracting candidate risks.</p>
      </div>
      <div class="context-chip-panel">
        <div class="context-panel-title">3. Carry forward only what matters</div>
        <p class="context-panel-copy">Select the risks that belong in this assessment and leave everything else out.</p>
      </div>
    </div>
    <div class="context-panel-foot" style="margin-top:var(--sp-4)">${recommendation.copy}</div>
  </div>`;
}

const STEP1_DRY_RUN_SCENARIOS = [
  {
    id: 'supplier-platform-outage',
    title: 'Supplier outage on a regulated platform',
    summary: 'Good first example for third-party and resilience risk.',
    bestFor: 'Third-party, resilience, and escalation walkthroughs',
    nextStep: 'Review the two starter risks, then continue to see how the platform refines and estimates a linked supplier scenario.',
    event: 'A critical supplier with privileged access is compromised and disrupts a regulated digital platform.',
    asset: 'Customer-facing regulated platform and supporting supplier connection',
    cause: 'Supplier compromise leading to operational disruption and delayed response',
    impact: 'Service outage, customer disruption, and regulatory scrutiny',
    urgency: 'high',
    geographies: ['United Arab Emirates'],
    risks: [
      { title: 'Third-party service disruption', category: 'Third-party', source: 'dry-run', description: 'Supplier dependency leads to a material service outage.' },
      { title: 'Regulatory reporting delay', category: 'Compliance', source: 'dry-run', description: 'Incident handling delays increase regulatory exposure.' }
    ]
  },
  {
    id: 'cloud-data-exposure',
    title: 'Cloud misconfiguration exposing sensitive data',
    summary: 'Useful for privacy, security, and legal-impact walkthroughs.',
    bestFor: 'Privacy, legal, and notification-impact walkthroughs',
    nextStep: 'Use this to see how data exposure turns into regulatory and loss-estimation inputs in the next steps.',
    event: 'A cloud storage configuration error exposes sensitive data to unauthorised parties.',
    asset: 'Cloud data store containing customer and operational records',
    cause: 'Misconfiguration and weak change control',
    impact: 'Data exposure, legal obligations, and customer trust impact',
    urgency: 'high',
    geographies: ['United Arab Emirates', 'European Union'],
    risks: [
      { title: 'Sensitive data exposure', category: 'Privacy', source: 'dry-run', description: 'Sensitive records become accessible outside intended controls.' },
      { title: 'Regulatory notification breach', category: 'Compliance', source: 'dry-run', description: 'Notification and remediation obligations increase quickly.' }
    ]
  },
  {
    id: 'ransomware-core-services',
    title: 'Ransomware disrupting core business services',
    summary: 'Helpful for business interruption and recovery modelling.',
    bestFor: 'Outage, recovery, and business interruption walkthroughs',
    nextStep: 'Continue after loading to see how the platform frames recovery cost and service-impact assumptions.',
    event: 'A ransomware event disrupts core business services and slows operational recovery.',
    asset: 'Core business systems, shared files, and service operations',
    cause: 'Phishing-led compromise and weak endpoint containment',
    impact: 'Business interruption, recovery cost, and customer service degradation',
    urgency: 'critical',
    geographies: ['United Arab Emirates'],
    risks: [
      { title: 'Critical service outage', category: 'Resilience', source: 'dry-run', description: 'Essential services are unavailable during containment and recovery.' },
      { title: 'Recovery cost escalation', category: 'Financial', source: 'dry-run', description: 'Recovery, response, and overtime costs rise quickly.' }
    ]
  }
];

function buildDryRunNarrative(example) {
  return composeGuidedNarrative({
    event: example.event,
    asset: example.asset,
    cause: example.cause,
    impact: example.impact,
    urgency: example.urgency
  });
}

function getLoadedDryRunScenario(draft = AppState.draft) {
  const loadedId = draft?.loadedDryRunId;
  return STEP1_DRY_RUN_SCENARIOS.find(example => example.id === loadedId) || null;
}

function clearLoadedDryRunFlag({ save = false } = {}) {
  if (!AppState.draft?.loadedDryRunId) return;
  delete AppState.draft.loadedDryRunId;
  if (save) saveDraft();
}

function resetStep1DryRunContent() {
  AppState.draft.guidedInput = { event: '', asset: '', cause: '', impact: '', urgency: 'medium' };
  AppState.draft.narrative = '';
  AppState.draft.sourceNarrative = '';
  AppState.draft.enhancedNarrative = '';
  AppState.draft.intakeSummary = '';
  AppState.draft.linkAnalysis = '';
  AppState.draft.scenarioTitle = '';
  AppState.draft.riskCandidates = [];
  AppState.draft.selectedRiskIds = [];
  AppState.draft.selectedRisks = [];
  clearLoadedDryRunFlag();
  saveDraft();
  renderWizard1();
  UI.toast('Dry-run example cleared. You can start a fresh assessment now.', 'success');
}

function renderLoadedDryRunBanner(example) {
  if (!example) return '';
  return `<div class="card card--elevated anim-fade-in" style="border-color:var(--accent-gold);background:linear-gradient(180deg, rgba(187,149,74,0.12), rgba(255,255,255,0.02))">
    <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:var(--sp-3)">
      <div>
        <div class="context-panel-title">Dry-run example loaded</div>
        <p class="context-panel-copy" style="margin-top:6px"><strong>${example.title}</strong> is active. ${example.nextStep}</p>
      </div>
      <button class="btn btn--ghost btn--sm" id="btn-clear-dry-run" type="button">Clear Example</button>
    </div>
    <div class="citation-chips" style="margin-top:var(--sp-4)">
      <span class="badge badge--gold">Dry run</span>
      <span class="badge badge--neutral">Best for: ${example.bestFor}</span>
      <span class="badge badge--neutral">${example.risks.length} starter risks</span>
    </div>
  </div>`;
}

function hasStep1Content() {
  const draft = AppState.draft || {};
  return !!(
    String(draft.narrative || draft.sourceNarrative || '').trim() ||
    String(draft.guidedInput?.event || '').trim() ||
    getRiskCandidates().length
  );
}

function applyDryRunScenario(example) {
  const settings = getEffectiveSettings();
  const nextNarrative = buildDryRunNarrative(example);
  AppState.draft.guidedInput = {
    event: example.event,
    asset: example.asset,
    cause: example.cause,
    impact: example.impact,
    urgency: example.urgency
  };
  AppState.draft.narrative = nextNarrative;
  AppState.draft.sourceNarrative = nextNarrative;
  AppState.draft.enhancedNarrative = '';
  AppState.draft.intakeSummary = '';
  AppState.draft.linkAnalysis = '';
  AppState.draft.geographies = normaliseScenarioGeographies(example.geographies, settings.geography);
  AppState.draft.geography = formatScenarioGeographies(AppState.draft.geographies, settings.geography);
  const seededRisks = mergeRisks([], example.risks.map(risk => ({ ...risk })));
  AppState.draft.riskCandidates = seededRisks;
  AppState.draft.selectedRiskIds = seededRisks.map(risk => risk.id);
  AppState.draft.selectedRisks = seededRisks.slice();
  AppState.draft.scenarioTitle = example.title;
  AppState.draft.loadedDryRunId = example.id;
  AppState.draft.applicableRegulations = deriveApplicableRegulations(
    getBUList().find(b => b.id === AppState.draft.buId),
    getSelectedRisks(),
    AppState.draft.geographies
  );
  saveDraft();
  renderWizard1();
  UI.toast(`Loaded dry-run example: ${example.title}.`, 'success');
}


function seedRisksFromScenarioDraft(narrative, { force = false } = {}) {
  const draftText = String(narrative || '').trim();
  if (!draftText) return 0;
  const existingCandidates = getRiskCandidates();
  const selectedRisks = getSelectedRisks();
  if (!force && (selectedRisks.length || existingCandidates.length)) return 0;
  const extractedRisks = guessRisksFromText(draftText)
    .filter(risk => !isNoiseRiskText(risk.title))
    .map(risk => ({
      ...risk,
      source: risk.source || 'scenario-draft',
      description: risk.description || 'Generated from the current scenario draft to give you a clear shortlist for the next step.'
    }));
  if (!extractedRisks.length) return 0;
  appendRiskCandidates(extractedRisks, { selectNew: true });
  if (!AppState.draft.scenarioTitle && getSelectedRisks()[0]) AppState.draft.scenarioTitle = getSelectedRisks()[0].title;
  return extractedRisks.length;
}

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
  const selectedRisks = syncRiskSelection(!Array.isArray(draft.selectedRiskIds));
  const riskCandidates = getRiskCandidates();
  const scenarioGeographies = getScenarioGeographies();
  const regs = deriveApplicableRegulations(buList.find(b => b.id === draft.buId), selectedRisks, scenarioGeographies);
  const recommendation = getStep1RecommendedAction(draft, selectedRisks);
  const activeDryRun = getLoadedDryRunScenario(draft);
  const hasScenarioDraft = !!String(draft.narrative || draft.sourceNarrative || '').trim();
  const hasImportedSource = !!String(draft.uploadedRegisterName || '').trim() || (riskCandidates || []).some(risk => risk.source === 'register' || risk.source === 'ai+register');

  setPage(`
    <main class="page">
      <div class="wizard-layout container container--narrow">
        <div class="wizard-header">
          ${UI.renderStepper(1)}
          <h2 class="wizard-step-title">AI-Assisted Risk &amp; Context Builder</h2>
          <p class="form-help" style="margin-top:8px">Describe the scenario, let AI help only where useful, then carry forward only the risks that belong in this assessment.</p>
          <p class="wizard-step-desc">Use the guided path first if you want the easiest route. Use the text or upload paths only when you already have source material.</p>
          <div class="form-help" data-draft-save-state style="margin-top:10px">Draft will save automatically</div>
        </div>
        <div class="wizard-body">
          ${renderStep1StartCard(recommendation)}
          ${renderLoadedDryRunBanner(activeDryRun)}
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
                <h3>Start Here: Guided Scenario Builder</h3>
                <p>Use this if you do not already have a finished risk statement. The platform will turn your answers into a structured starting point.</p>
              </div>
            </div>
            <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-elevated)">
              <div class="context-panel-title">Try a dry-run example</div>
              <p class="context-panel-copy">Use one of these examples to prefill the scenario and shortlist so new users can see how the full assessment flow works.</p>
              <div class="risk-selection-grid" style="margin-top:var(--sp-4)">
                ${STEP1_DRY_RUN_SCENARIOS.map(example => `<div class="risk-pick-card">
                  <div class="risk-pick-head" style="align-items:flex-start">
                    <div style="flex:1">
                      <div class="risk-pick-title">${example.title}</div>
                      <div class="form-help" style="margin-top:6px">${example.summary}</div>
                      <div class="form-help" style="margin-top:6px"><strong>Best for:</strong> ${example.bestFor}</div>
                    </div>
                    <button class="btn btn--ghost btn--sm btn-load-dry-run" data-dry-run-id="${example.id}" type="button">Load Example</button>
                  </div>
                  <div class="citation-chips" style="margin-top:var(--sp-3)">
                    ${(example.geographies || []).map(geo => `<span class="badge badge--neutral">${geo}</span>`).join('')}
                    <span class="badge badge--neutral">${example.risks.length} starter risks</span>
                  </div>
                </div>`).join('')}
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
              <button class="btn btn--primary" id="btn-build-guided-narrative" type="button">Build Scenario Draft</button>
              <span class="form-help">This creates a plain-English draft below. You can still edit it manually afterwards.</span>
            </div>
            <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-elevated)">
              <div class="context-panel-title">Generated Statement Preview</div>
              <p class="context-panel-copy" id="guided-preview">${composeGuidedNarrative(draft.guidedInput) || 'Complete the guided questions and click “Build Scenario Draft”.'}</p>
            </div>
          </div>

          <details class="wizard-disclosure anim-fade-in anim-delay-1" ${hasScenarioDraft ? 'open' : ''}>
            <summary>Use your own scenario draft instead <span class="badge badge--neutral">Optional</span></summary>
            <div class="wizard-disclosure-body">
              <div class="form-help">Open this only if you already know the scenario and want to write or paste it yourself instead of relying on the guided builder.</div>
              <div class="form-group">
                <label class="form-label" for="intake-risk-statement">Scenario Draft</label>
                <textarea class="form-textarea" id="intake-risk-statement" rows="6" placeholder="If you already know the scenario, describe it here in plain English. Include what could happen, what is affected, likely triggers, and the business or regulatory impact.">${draft.narrative || ''}</textarea>
              </div>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--secondary" id="btn-enhance-risk-statement" type="button">Use AI to Refine This Draft</button>
                <button class="btn btn--ghost" id="btn-generate-risks-from-draft" type="button">Generate Risks From This Draft</button>
                <span class="form-help">Use AI when you want drafting help. Use the generate button when you just want a shortlist to carry into the next step.</span>
              </div>
            </div>
          </details>

          <details class="wizard-disclosure anim-fade-in anim-delay-1" ${hasImportedSource ? 'open' : ''}>
            <summary>Import from a risk register or add risks manually <span class="badge badge--neutral">Advanced</span></summary>
            <div class="wizard-disclosure-body">
              <div class="form-help">Use this only when your source material already exists in a register, spreadsheet, or known risk list.</div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label" for="risk-register-file">Risk Register Upload</label>
                  <input class="form-input" id="risk-register-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls">
                  <div class="form-help">${draft.uploadedRegisterName ? `Current file: ${draft.uploadedRegisterName}${draft.registerMeta?.sheetCount ? ` · ${draft.registerMeta.sheetCount} sheet(s)` : ''}` : 'Upload TXT, CSV, TSV, JSON, Markdown, or Excel. Word and PDF still need conversion before upload.'}</div>
                  <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
                    <button class="btn btn--secondary" id="btn-register-analyse">Upload, Extract, Analyse &amp; Enhance Risks</button>
                    <span class="form-help">AI will turn the uploaded material into candidate risks you can review and trim down.</span>
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
              <p class="form-help">Uses runtime AI if a key has been set with <code>LLMService.setOpenAIKey(...)</code>. Otherwise the local extraction stub is used.</p>
            </div>
          </details>

          <div id="intake-output">
            ${draft.intakeSummary ? `<div class="card card--glow anim-fade-in"><div class="context-panel-title">AI Intake Summary</div><p class="context-panel-copy">${draft.intakeSummary}</p>${draft.linkAnalysis ? `<div class="context-panel-foot">${draft.linkAnalysis}</div>` : ''}</div>` : ''}
          </div>

          <div class="card anim-fade-in anim-delay-2">
            <div class="flex items-center justify-between mb-4" style="flex-wrap:wrap;gap:var(--sp-3)">
              <div>
                <div class="context-panel-title">Choose the risks for this assessment</div>
                <p class="context-panel-copy">Keep only risks that share the same event, scope, or business impact. Remove anything that is out of scope before continuing.</p>
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
          <a class="btn btn--ghost" href="#/dashboard">← Dashboard</a>
          <button class="btn btn--primary" id="btn-next-1">Continue with ${selectedRisks.length || 0} selected risk${selectedRisks.length === 1 ? '' : 's'} →</button>
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
  updateWizardSaveState();
  document.querySelectorAll('.wizard-geo-chip').forEach(button => {
    button.addEventListener('click', () => {
      const next = Array.from(new Set([...(wizardGeographyInput.getTags() || []), button.dataset.geo]));
      wizardGeographyInput.setTags(next);
    });
  });
  ['event', 'asset', 'cause', 'impact'].forEach(key => {
    document.getElementById(`guided-${key}`).addEventListener('input', function() {
      AppState.draft.guidedInput[key] = this.value;
      clearLoadedDryRunFlag();
      document.getElementById('guided-preview').textContent = composeGuidedNarrative(AppState.draft.guidedInput) || 'Complete the guided questions and click “Build Scenario Draft”.';
      markDraftDirty();
      scheduleDraftAutosave();
    });
  });
  document.getElementById('guided-urgency').addEventListener('change', function() {
    AppState.draft.guidedInput.urgency = this.value;
    clearLoadedDryRunFlag();
    document.getElementById('guided-preview').textContent = composeGuidedNarrative(AppState.draft.guidedInput) || 'Complete the guided questions and click “Build Scenario Draft”.';
    markDraftDirty();
    scheduleDraftAutosave();
  });
  document.getElementById('intake-risk-statement').addEventListener('input', function() {
    AppState.draft.narrative = this.value;
    AppState.draft.sourceNarrative = this.value;
    clearLoadedDryRunFlag();
    markDraftDirty();
    scheduleDraftAutosave();
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
    const seededCount = seedRisksFromScenarioDraft(composed, { force: !getRiskCandidates().length });
    saveDraft();
    renderWizard1();
    UI.toast(seededCount ? `Scenario draft created and ${seededCount} risk${seededCount === 1 ? '' : 's'} added to the shortlist.` : 'Scenario draft created from guided answers.', 'success');
  });
  document.querySelectorAll('.guided-prompt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.draft.guidedInput.event = btn.dataset.prompt;
      document.getElementById('guided-event').value = btn.dataset.prompt;
      document.getElementById('guided-preview').textContent = composeGuidedNarrative(AppState.draft.guidedInput);
      markDraftDirty();
      scheduleDraftAutosave();
      markDraftDirty();
      scheduleDraftAutosave();
    });
  });
  document.querySelectorAll('.btn-load-dry-run').forEach(button => {
    button.addEventListener('click', () => {
      const example = STEP1_DRY_RUN_SCENARIOS.find(entry => entry.id === button.dataset.dryRunId);
      if (!example) return;
      if (hasStep1Content() && !window.confirm('Load this dry-run example and replace the current step-1 scenario draft and shortlist?')) return;
      applyDryRunScenario(example);
    });
  });
  document.getElementById('btn-clear-dry-run')?.addEventListener('click', () => {
    resetStep1DryRunContent();
  });
  document.getElementById('linked-risks-toggle').addEventListener('change', function() {
    AppState.draft.linkedRisks = this.checked;
    saveDraft();
  });
  document.getElementById('btn-add-manual-risk').addEventListener('click', () => {
    const input = document.getElementById('manual-risk-add');
    const value = input.value.trim();
    if (!value) return;
    clearLoadedDryRunFlag();
    appendRiskCandidates([{ title: value, category: 'Manual', source: 'manual' }], { selectNew: true });
    AppState.draft.applicableRegulations = deriveApplicableRegulations(buList.find(b => b.id === AppState.draft.buId), getSelectedRisks(), getScenarioGeographies());
    input.value = '';
    saveDraft();
    renderWizard1();
  });
  document.getElementById('risk-register-file').addEventListener('change', handleRegisterUpload);
  document.getElementById('btn-enhance-risk-statement').addEventListener('click', enhanceNarrativeWithAI);
  document.getElementById('btn-generate-risks-from-draft')?.addEventListener('click', () => {
    const narrative = document.getElementById('intake-risk-statement')?.value.trim() || AppState.draft.narrative || '';
    if (!narrative) {
      UI.toast('Enter or build a scenario draft first.', 'warning');
      return;
    }
    const seededCount = seedRisksFromScenarioDraft(narrative, { force: true });
    AppState.draft.narrative = narrative;
    AppState.draft.sourceNarrative = AppState.draft.sourceNarrative || narrative;
    saveDraft();
    renderWizard1();
    UI.toast(seededCount ? `Added ${seededCount} risk${seededCount === 1 ? '' : 's'} from the scenario draft.` : 'No additional risks were generated from that draft.', seededCount ? 'success' : 'warning');
  });
  document.getElementById('btn-register-analyse').addEventListener('click', analyseUploadedRegister);
  document.getElementById('btn-next-1').addEventListener('click', () => {
    const buId = document.getElementById('wizard-bu').value;
    let narrative = document.getElementById('intake-risk-statement').value.trim();
    let selected = getSelectedRisks();
    if (!buId) { UI.toast('Please select a business unit.', 'warning'); return; }
    if (!narrative) {
      const composed = composeGuidedNarrative(AppState.draft.guidedInput);
      if (composed) {
        AppState.draft.narrative = composed;
        AppState.draft.sourceNarrative = composed;
        document.getElementById('intake-risk-statement').value = composed;
        narrative = composed;
      }
    }
    if (narrative && !selected.length && !getRiskCandidates().length) {
      seedRisksFromScenarioDraft(narrative, { force: true });
      selected = getSelectedRisks();
    }
    if (!String(AppState.draft.narrative || narrative || '').trim() && !selected.length) { UI.toast('Please complete the guided questions, enter a risk statement, or select at least one risk.', 'warning'); return; }
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

function normaliseAssessmentTokens(text) {
  return Array.from(new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2 && !['the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'your', 'have', 'will', 'risk'].includes(token))
  ));
}

function buildStep1AssessmentSignals(narrative) {
  const guidedInput = AppState.draft?.guidedInput || {};
  return {
    eventTokens: normaliseAssessmentTokens(guidedInput.event || narrative).slice(0, 14),
    assetTokens: normaliseAssessmentTokens(guidedInput.asset).slice(0, 10),
    causeTokens: normaliseAssessmentTokens(guidedInput.cause).slice(0, 10),
    impactTokens: normaliseAssessmentTokens(guidedInput.impact).slice(0, 10),
    narrativeTokens: normaliseAssessmentTokens([
      narrative,
      guidedInput.event,
      guidedInput.asset,
      guidedInput.cause,
      guidedInput.impact
    ].filter(Boolean).join(' ')).slice(0, 18)
  };
}

function getRiskAssessmentHaystack(risk) {
  return `${risk.title || ''} ${risk.description || ''} ${risk.category || ''}`.toLowerCase();
}

function countAssessmentMatches(tokens, haystack) {
  if (!Array.isArray(tokens) || !tokens.length) return 0;
  return tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
}

function scoreRiskForCurrentAssessment(risk, assessmentSignals, selectedIds) {
  let score = 0;
  const reasons = [];
  const haystack = getRiskAssessmentHaystack(risk);
  if (selectedIds.has(risk.id)) {
    score += 8;
    reasons.push('Already part of the current shortlist.');
  }
  if (risk.source === 'manual') {
    score += 3;
    reasons.push('Added directly for this assessment.');
  }
  if (risk.source === 'ai+register' || risk.source === 'register') {
    score += 2;
  }

  const eventMatches = countAssessmentMatches(assessmentSignals.eventTokens, haystack);
  const assetMatches = countAssessmentMatches(assessmentSignals.assetTokens, haystack);
  const causeMatches = countAssessmentMatches(assessmentSignals.causeTokens, haystack);
  const impactMatches = countAssessmentMatches(assessmentSignals.impactTokens, haystack);
  const narrativeMatches = countAssessmentMatches(assessmentSignals.narrativeTokens, haystack);

  if (assetMatches) {
    score += 4 + Math.min(assetMatches, 2);
    reasons.push('Matches the same affected asset or service.');
  }
  if (causeMatches) {
    score += 4 + Math.min(causeMatches, 2);
    reasons.push('Matches the same likely cause or attack path.');
  }
  if (impactMatches) {
    score += 3 + Math.min(impactMatches, 2);
    reasons.push('Matches the same business or regulatory impact.');
  }
  if (eventMatches) {
    score += 2 + Math.min(eventMatches, 2);
  }
  if (narrativeMatches >= 2) {
    score += 2;
    reasons.push('Shares the same event wording as the current scenario draft.');
  }

  const fit = selectedIds.has(risk.id)
    ? 'selected'
    : score >= 8
      ? 'strong'
      : score >= 4
        ? 'possible'
        : 'weak';
  return {
    score,
    fit,
    reasons: Array.from(new Set(reasons)).slice(0, 2)
  };
}

function explainRiskFit(match, selected) {
  if (selected) return 'Already included in this assessment.';
  if (match?.reasons?.length) return match.reasons.join(' ');
  if (match?.fit === 'strong') return 'Good fit because it closely matches the current scenario draft.';
  if (match?.fit === 'possible') return 'Possibly in scope, but review whether it shares the same event and business impact.';
  return 'Likely separate or lower-confidence. Include it only if it clearly belongs in the same assessment.';
}

function renderRiskSelectionSection(title, subtitle, risks, selectedIds, regulations, sectionClass = '') {
  if (!risks.length) return '';
  const sourceLabel = risk => risk.source === 'manual' ? 'Manual' : risk.source === 'dry-run' ? 'Example' : risk.source === 'register' || risk.source === 'ai+register' ? 'Upload' : 'AI generated';
  return `<div class="${sectionClass}" style="display:flex;flex-direction:column;gap:var(--sp-4)"><div><div class="context-panel-title">${title}</div><div class="context-panel-copy" style="margin-top:6px">${subtitle}</div></div><div class="risk-selection-grid">${risks.map(({ risk, match }) => `<div class="risk-pick-card"><div class="risk-pick-head" style="align-items:flex-start"><label style="display:flex;gap:12px;align-items:flex-start;flex:1;cursor:pointer"><input type="checkbox" class="risk-select-checkbox" data-risk-id="${risk.id}" ${selectedIds.has(risk.id) ? 'checked' : ''} style="margin-top:4px"><div><div class="risk-pick-title">${risk.title}</div><div class="risk-pick-badges"><span class="risk-pick-badge">${risk.category}</span><span class="risk-pick-badge risk-pick-badge--source">${sourceLabel(risk)}</span></div></div></label><button class="btn btn--ghost btn--sm btn-remove-risk" data-risk-id="${risk.id}" type="button">Remove</button></div>${risk.description ? `<p class="risk-pick-desc">${risk.description}</p>` : ''}<div class="form-help" style="margin-bottom:10px">${explainRiskFit(match, selectedIds.has(risk.id))}</div><div class="citation-chips">${(risk.regulations || []).length ? risk.regulations.slice(0, 4).map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('') : regulations.slice(0, 2).map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('')}</div></div>`).join('')}</div></div>`;
}

function renderSelectedRiskCards(riskCandidates, selectedRisks, regulations) {
  const cleanedRisks = (riskCandidates || []).filter(risk => !isNoiseRiskText(risk.title) && risk.title !== '-');
  const selectedIds = new Set((selectedRisks || []).map(risk => risk.id));
  if (!cleanedRisks.length) {
    const hasDraft = !!String(AppState.draft.enhancedNarrative || AppState.draft.narrative || AppState.draft.sourceNarrative || '').trim();
    return `<div class="empty-state"><div>No candidate risks yet. Start with the guided builder, refine a scenario draft with AI, or import a register to build your shortlist.</div>${hasDraft ? `<div style="margin-top:var(--sp-4)"><button class="btn btn--secondary" id="btn-generate-risks-empty-state" type="button">Generate Risks From Current Draft</button></div>` : ''}</div>`;
  }
  const linkedRecommendations = getLinkedRiskRecommendations(selectedRisks || []);
  const narrative = AppState.draft.enhancedNarrative || AppState.draft.narrative || AppState.draft.sourceNarrative || composeGuidedNarrative(AppState.draft.guidedInput) || '';
  const assessmentSignals = buildStep1AssessmentSignals(narrative);
  const ranked = cleanedRisks
    .map(risk => {
      const match = scoreRiskForCurrentAssessment(risk, assessmentSignals, selectedIds);
      return { risk, match, score: match.score };
    })
    .sort((a, b) => b.score - a.score || String(a.risk.title || '').localeCompare(String(b.risk.title || '')));
  const recommended = ranked.filter(item => selectedIds.has(item.risk.id) || item.match.fit === 'strong' || item.score >= 4);
  const extras = ranked.filter(item => !recommended.includes(item));
  const selectedCount = selectedRisks.length;
  const scopeHint = selectedCount > 4
    ? 'This looks broad. Remove risks that do not share the same event, scope, or business impact.'
    : selectedCount >= 1
      ? 'Good scope so far. Keep only the risks that clearly belong in one coherent assessment.'
      : 'Choose the risks that share the same event, scope, or business impact.';
  return `${linkedRecommendations.length ? `<div class="card mb-4" style="background:var(--bg-elevated)"><div class="context-panel-title">Suggested linked-risk groupings</div><div style="display:flex;flex-direction:column;gap:var(--sp-3);margin-top:var(--sp-3)">${linkedRecommendations.map(group => `<div><div style="font-size:.78rem;font-weight:600;color:var(--text-primary)">${group.label}</div><div class="context-panel-copy" style="margin-top:4px">${group.risks.join(', ')}</div></div>`).join('')}</div><div class="context-panel-foot">${AppState.draft.linkAnalysis || 'Treat these as linked where one control or event could trigger the others in the same scenario.'}</div></div>` : ''}
  <div class="flex items-center gap-3 mb-4" style="flex-wrap:wrap">
    <button class="btn btn--ghost btn--sm" id="btn-select-all-risks" type="button">Select All</button>
    <button class="btn btn--ghost btn--sm" id="btn-clear-all-risks" type="button">Clear All</button>
    <span class="badge badge--neutral">${selectedCount} selected</span>
    <span class="form-help">${scopeHint}</span>
  </div>
  ${renderRiskSelectionSection('Recommended for this assessment', 'These are the strongest candidates based on the current event, asset, cause, and impact you described.', recommended, selectedIds, regulations)}
  ${extras.length ? `<details class="wizard-disclosure"><summary>Show additional possible risks <span class="badge badge--neutral">${extras.length}</span></summary><div class="wizard-disclosure-body">${renderRiskSelectionSection('Available but likely out of scope', 'Keep these only if they clearly belong in the same event path or business outcome.', extras, selectedIds, regulations)}</div></details>` : ''}`;
}

function bindRiskCardActions() {
  document.getElementById('btn-generate-risks-empty-state')?.addEventListener('click', () => {
    const narrative = AppState.draft.enhancedNarrative || AppState.draft.narrative || AppState.draft.sourceNarrative || composeGuidedNarrative(AppState.draft.guidedInput) || '';
    const seededCount = seedRisksFromScenarioDraft(narrative, { force: true });
    saveDraft();
    renderWizard1();
    UI.toast(seededCount ? `Added ${seededCount} risk${seededCount === 1 ? '' : 's'} from the current draft.` : 'No additional risks were generated from that draft.', seededCount ? 'success' : 'warning');
  });
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
    const aiContext = buildCurrentAIAssistContext({ buId: bu?.id || AppState.draft.buId });
    const citations = await RAGService.retrieveRelevantDocs(bu?.id, assistSeed || AppState.draft.registerFindings, 5);
    const result = await LLMService.enhanceRiskContext({
      riskStatement: assistSeed || narrative,
      registerText: AppState.draft.registerFindings,
      registerMeta: AppState.draft.registerMeta,
      businessUnit: aiContext.businessUnit || bu,
      geography: formatScenarioGeographies(getScenarioGeographies()),
      applicableRegulations: deriveApplicableRegulations(aiContext.businessUnit || bu, getSelectedRisks(), getScenarioGeographies()),
      guidedInput: { ...AppState.draft.guidedInput },
      citations,
      adminSettings: aiContext.adminSettings
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
    AppState.draft.confidenceLabel = result.confidenceLabel || AppState.draft.confidenceLabel || '';
    AppState.draft.evidenceQuality = result.evidenceQuality || AppState.draft.evidenceQuality || '';
    AppState.draft.evidenceSummary = result.evidenceSummary || AppState.draft.evidenceSummary || '';
    AppState.draft.primaryGrounding = Array.isArray(result.primaryGrounding) ? result.primaryGrounding : (AppState.draft.primaryGrounding || []);
    AppState.draft.supportingReferences = Array.isArray(result.supportingReferences) ? result.supportingReferences : (AppState.draft.supportingReferences || []);
    AppState.draft.inferredAssumptions = Array.isArray(result.inferredAssumptions) ? result.inferredAssumptions : (AppState.draft.inferredAssumptions || []);
    AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
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
  const resetButton = _setStep1ButtonBusy(button, 'Enhancing…');
  output.innerHTML = `<div class="card">${UI.skeletonBlock(18)}<div class="mt-3">${UI.skeletonBlock(14, 4)}</div><div class="mt-3">${UI.skeletonBlock(90, 10)}</div></div>`;
  try {
    const aiContext = buildCurrentAIAssistContext({ buId: bu?.id || AppState.draft.buId });
    const citations = await RAGService.retrieveRelevantDocs(bu?.id, assistSeed || narrative, 5);
    const result = await LLMService.enhanceRiskContext({
      riskStatement: assistSeed || narrative,
      registerText: '',
      registerMeta: null,
      businessUnit: aiContext.businessUnit || bu,
      geography: formatScenarioGeographies(getScenarioGeographies()),
      applicableRegulations: deriveApplicableRegulations(aiContext.businessUnit || bu, getSelectedRisks(), getScenarioGeographies()),
      guidedInput: { ...AppState.draft.guidedInput },
      citations,
      adminSettings: aiContext.adminSettings
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
    AppState.draft.confidenceLabel = result.confidenceLabel || AppState.draft.confidenceLabel || '';
    AppState.draft.evidenceQuality = result.evidenceQuality || AppState.draft.evidenceQuality || '';
    AppState.draft.evidenceSummary = result.evidenceSummary || AppState.draft.evidenceSummary || '';
    AppState.draft.primaryGrounding = Array.isArray(result.primaryGrounding) ? result.primaryGrounding : (AppState.draft.primaryGrounding || []);
    AppState.draft.supportingReferences = Array.isArray(result.supportingReferences) ? result.supportingReferences : (AppState.draft.supportingReferences || []);
    AppState.draft.inferredAssumptions = Array.isArray(result.inferredAssumptions) ? result.inferredAssumptions : (AppState.draft.inferredAssumptions || []);
    AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
    AppState.draft.citations = normaliseCitations(result.citations || citations);
    appendRiskCandidates(result.risks || guessRisksFromText(nextNarrative), { selectNew: true });
    AppState.draft.applicableRegulations = Array.from(new Set([...(deriveApplicableRegulations(bu, getSelectedRisks(), getScenarioGeographies()) || []), ...(result.regulations || [])]));
    if (!AppState.draft.scenarioTitle && getSelectedRisks()[0]) AppState.draft.scenarioTitle = getSelectedRisks()[0].title;
    saveDraft();
    renderWizard1();
    UI.toast('Risk statement enhanced.', 'success');
  } catch (error) {
    output.innerHTML = `<div class="banner banner--danger"><span class="banner-icon">⚠</span><span class="banner-text">AI enhancement is unavailable right now. Try again in a moment.</span></div>`;
  } finally {
    resetButton();
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
  const button = document.getElementById('btn-register-analyse');
  const resetButton = _setStep1ButtonBusy(button, 'Uploading, extracting, and analysing…');
  try {
    const aiContext = buildCurrentAIAssistContext({ buId: bu?.id || AppState.draft.buId });
    const result = await LLMService.analyseRiskRegister({
      registerText: AppState.draft.registerFindings,
      registerMeta: AppState.draft.registerMeta,
      businessUnit: aiContext.businessUnit || bu,
      geography: formatScenarioGeographies(getScenarioGeographies()),
      applicableRegulations: AppState.draft.applicableRegulations || [],
      adminSettings: aiContext.adminSettings
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
    AppState.draft.confidenceLabel = result.confidenceLabel || AppState.draft.confidenceLabel || '';
    AppState.draft.evidenceQuality = result.evidenceQuality || AppState.draft.evidenceQuality || '';
    AppState.draft.evidenceSummary = result.evidenceSummary || AppState.draft.evidenceSummary || '';
    AppState.draft.primaryGrounding = Array.isArray(result.primaryGrounding) ? result.primaryGrounding : (AppState.draft.primaryGrounding || []);
    AppState.draft.supportingReferences = Array.isArray(result.supportingReferences) ? result.supportingReferences : (AppState.draft.supportingReferences || []);
    AppState.draft.inferredAssumptions = Array.isArray(result.inferredAssumptions) ? result.inferredAssumptions : (AppState.draft.inferredAssumptions || []);
    AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
    saveDraft();
    renderWizard1();
    UI.toast('Risk register analysed.', 'success');
  } catch (e2) {
    UI.toast('Register analysis failed: ' + e2.message, 'danger');
  } finally {
    resetButton();
  }
}
