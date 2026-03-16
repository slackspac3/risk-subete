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
          <p class="form-help" style="margin-top:8px">Start with a short risk statement, then let AI sharpen it or extract risks from a register. Select only the risks you want to carry forward.</p>
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
          <button class="btn btn--primary" id="btn-next-1">Continue to Scenario Review →</button>
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
    return `<div class="empty-state">No risks have been selected yet. Start with AI enhancement, upload a register, or add risks manually to build your shortlist.</div>`;
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
  button.disabled = true;
  button.textContent = 'Enhancing…';
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
    AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
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
    AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
    saveDraft();
    renderWizard1();
    UI.toast('Risk register analysed.', 'success');
  } catch (e2) {
    UI.toast('Register analysis failed: ' + e2.message, 'danger');
  }
}
