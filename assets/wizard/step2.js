function renderWizard2() {
  const draft = AppState.draft;
  const selectedRisks = getSelectedRisks();
  setPage(`
    <main class="page">
      <div class="wizard-layout container container--narrow">
        <div class="wizard-header">
          ${UI.renderStepper(2)}
          <h2 class="wizard-step-title">Refine the Scenario</h2>
          <p class="form-help" style="margin-top:8px">Use this step to turn the selected risk into one clear assessment scope. The AI assist should help draft the scenario and suggest starting FAIR inputs.</p>
          <p class="wizard-step-desc">Review the AI-built context, refine the narrative, and confirm how the selected risks should be quantified together.</p>
          <div class="form-help" data-draft-save-state style="margin-top:10px">Draft will save automatically</div>
        </div>
        <div class="wizard-body">
          ${UI.contextInfoGrid({
            title: 'What to do on this step',
            panels: [
              UI.contextInfoPanel({
                title: '1. Read the draft',
                copy: 'Check that the scenario describes the event, the affected asset, the likely cause, and the impact you care about.'
              }),
              UI.contextInfoPanel({
                title: '2. Improve if needed',
                copy: 'Edit the wording in plain English. You do not need formal risk language.'
              }),
              UI.contextInfoPanel({
                title: '3. Use AI assist if useful',
                copy: 'AI assist will structure the scenario and prepare FAIR inputs for the next step.'
              })
            ]
          })}
          ${renderScenarioAssistSummaryBlock({
            workflowGuidance: draft.workflowGuidance,
            confidenceLabel: draft.confidenceLabel,
            evidenceQuality: draft.evidenceQuality,
            evidenceSummary: draft.evidenceSummary,
            missingInformation: draft.missingInformation,
            benchmarkBasis: draft.benchmarkBasis,
            inputProvenance: draft.inputProvenance,
            citations: draft.citations
          })}
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
            <div class="form-help" id="wizard2-ai-status" style="text-align:center;margin-top:8px">Use AI assist only if you want a structured starting point. You can continue manually at any time.</div>
          </div>
          <div id="llm-output-area"></div>
        </div>
        <div class="wizard-footer">
          <button class="btn btn--ghost" id="btn-back-2">← Back</button>
          <button class="btn btn--primary" id="btn-next-2">Continue to Loss Estimation →</button>
        </div>
      </div>
    </main>`);

  document.getElementById('btn-back-2').addEventListener('click', () => { saveDraft(); Router.navigate('/wizard/1'); });
  document.getElementById('narrative').addEventListener('input', function() {
    AppState.draft.enhancedNarrative = this.value;
    if (!AppState.draft.narrative) AppState.draft.narrative = this.value;
    markDraftDirty();
    scheduleDraftAutosave();
  });
  document.getElementById('asset-service')?.addEventListener('input', function() {
    const next = { ...(AppState.draft.structuredScenario || {}) };
    next.assetService = this.value;
    AppState.draft.structuredScenario = next;
    markDraftDirty();
    scheduleDraftAutosave();
  });
  document.getElementById('threat-type')?.addEventListener('change', function() {
    const next = { ...(AppState.draft.structuredScenario || {}) };
    next.attackType = this.value;
    AppState.draft.structuredScenario = next;
    markDraftDirty();
    scheduleDraftAutosave();
  });
  document.getElementById('btn-llm-assist').addEventListener('click', runLLMAssist);
  updateWizardSaveState();
  document.getElementById('btn-next-2').addEventListener('click', () => {
    const n = document.getElementById('narrative').value.trim();
    if (!n) { UI.toast('Please enter a risk narrative.', 'warning'); return; }
    AppState.draft.enhancedNarrative = n;
    AppState.draft.narrative = AppState.draft.narrative || n;
    saveDraft(); Router.navigate('/wizard/3');
  });
  attachCitationHandlers();
}


function renderWizard2AiChangeSummary(result, previousNarrative) {
  const changed = [];
  if (result?.scenarioTitle) changed.push(`Gave the scenario a clearer working title: <strong>${escapeHtml(result.scenarioTitle)}</strong>.`);
  const structuredCount = ['threatCommunity', 'attackType', 'assetService'].filter(key => String(result?.structuredScenario?.[key] || '').trim()).length;
  if (structuredCount) changed.push(`Filled ${structuredCount} structured scenario field${structuredCount === 1 ? '' : 's'} to make the scope easier to quantify.`);
  const hasInputs = !!result?.suggestedInputs;
  if (hasInputs) changed.push('Pre-loaded the FAIR starting ranges for the next step so you can challenge them instead of entering everything from scratch.');
  const citationCount = Array.isArray(result?.citations) ? result.citations.length : 0;
  if (citationCount) changed.push(`Attached ${citationCount} supporting reference${citationCount === 1 ? '' : 's'} for grounding and challenge.`);
  const summaryItems = changed.length ? changed : ['Prepared a structured starting point without changing your saved scenario wording.'];
  const wordingNote = String(previousNarrative || '').trim()
    ? '<div class="form-help" style="margin-top:10px">Your own narrative remains editable below. Keep it, edit it, or rerun AI assist if the structure still feels off.</div>'
    : '';
  return `<div class="card card--elevated mt-4 anim-fade-in"><div class="context-panel-title">What AI changed</div><ol style="margin:12px 0 0 18px;display:flex;flex-direction:column;gap:8px">${summaryItems.map(item => `<li style="color:var(--text-secondary)">${item}</li>`).join('')}</ol>${wordingNote}</div>`;
}

async function runLLMAssist() {
  const narrative = document.getElementById('narrative').value.trim();
  if (!narrative) { UI.toast('Please enter a narrative first.', 'warning'); return; }
  const assistSeed = getScenarioAssistSeedNarrative(narrative);
  const btn = document.getElementById('btn-llm-assist');
  const btnText = document.getElementById('llm-btn-text');
  const output = document.getElementById('llm-output-area');
  const status = document.getElementById('wizard2-ai-status');
  const previousNarrative = AppState.draft.enhancedNarrative || AppState.draft.narrative || narrative;
  btn.disabled = true; btn.classList.add('loading');
  btnText.textContent = '⏳ Retrieving docs and generating inputs…';
  if (status) status.textContent = 'AI assist is building a structured draft and loading starting values for the next step.';
  output.innerHTML = `<div class="card mt-4">${UI.skeletonBlock(20)}<div style="margin-top:12px">${UI.skeletonBlock(14,4)}</div><div style="margin-top:8px">${UI.skeletonBlock(14,4)}</div></div>`;
  try {
    const bu = getBUList().find(b => b.id === AppState.draft.buId);
    const aiContext = buildCurrentAIAssistContext({ buId: AppState.draft.buId });
    const scenarioText = buildScenarioNarrative(assistSeed);
    const citations = await RAGService.retrieveRelevantDocs(AppState.draft.buId, scenarioText);
    const benchmarkCandidates = BenchmarkService.retrieveRelevantBenchmarks({
      query: scenarioText,
      geography: formatScenarioGeographies(getScenarioGeographies()),
      businessUnit: aiContext.businessUnit || bu || null,
      topK: 3
    });
    const result = await LLMService.generateScenarioAndInputs(scenarioText, {
      ...(aiContext.businessUnit || bu || {}),
      regulatoryTags: deriveApplicableRegulations(aiContext.businessUnit || bu, getSelectedRisks(), getScenarioGeographies()),
      geography: formatScenarioGeographies(getScenarioGeographies()),
      benchmarkStrategy: aiContext.adminSettings.benchmarkStrategy,
      companyContextProfile: aiContext.adminSettings.companyContextProfile,
      companyStructureContext: aiContext.adminSettings.companyStructureContext,
      userProfileSummary: aiContext.adminSettings.userProfileSummary,
      selectedDepartmentContext: aiContext.adminSettings.departmentContext
    }, citations, benchmarkCandidates);
    AppState.draft.scenarioTitle = result.scenarioTitle;
    AppState.draft.structuredScenario = result.structuredScenario;
    AppState.draft.llmAssisted = true;
    AppState.draft.enhancedNarrative = narrative;
    AppState.draft.citations = normaliseCitations(result.citations || citations);
    AppState.draft.recommendations = result.recommendations || [];
    AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : AppState.draft.workflowGuidance;
    AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis;
    AppState.draft.confidenceLabel = result.confidenceLabel || AppState.draft.confidenceLabel || '';
    AppState.draft.evidenceQuality = result.evidenceQuality || AppState.draft.evidenceQuality || '';
    AppState.draft.evidenceSummary = result.evidenceSummary || AppState.draft.evidenceSummary || '';
    AppState.draft.primaryGrounding = Array.isArray(result.primaryGrounding) ? result.primaryGrounding : (AppState.draft.primaryGrounding || []);
    AppState.draft.supportingReferences = Array.isArray(result.supportingReferences) ? result.supportingReferences : (AppState.draft.supportingReferences || []);
    AppState.draft.inferredAssumptions = Array.isArray(result.inferredAssumptions) ? result.inferredAssumptions : (AppState.draft.inferredAssumptions || []);
    AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
    AppState.draft.inputRationale = result.inputRationale || AppState.draft.inputRationale;
    AppState.draft.benchmarkReferences = Array.isArray(result.benchmarkReferences) ? result.benchmarkReferences : (AppState.draft.benchmarkReferences || []);
    AppState.draft.inputProvenance = Array.isArray(result.inputProvenance) ? result.inputProvenance : (AppState.draft.inputProvenance || []);
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
    output.innerHTML = `${renderWizard2AiChangeSummary(result, previousNarrative)}<div class="card card--glow mt-4 anim-fade-in">
      <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4)">
        <span style="font-size:24px">✅</span>
        <div>
          <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700;color:var(--text-primary)">${result.scenarioTitle}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">AI-structured · FAIR inputs pre-loaded to Step 3</div>
        </div>
      </div>
      ${result.structuredScenario?`<div class="grid-2"><div><div class="form-label" style="font-size:.7rem">Threat Community</div><p style="font-size:.85rem;margin-top:4px">${result.structuredScenario.threatCommunity}</p></div><div><div class="form-label" style="font-size:.7rem">Attack Vector</div><p style="font-size:.85rem;margin-top:4px">${result.structuredScenario.attackType}</p></div></div>`:''}
    </div>${renderScenarioAssistSummaryBlock({
      workflowGuidance: AppState.draft.workflowGuidance,
      confidenceLabel: AppState.draft.confidenceLabel,
      evidenceQuality: AppState.draft.evidenceQuality,
      evidenceSummary: AppState.draft.evidenceSummary,
      missingInformation: AppState.draft.missingInformation,
      benchmarkBasis: AppState.draft.benchmarkBasis,
      inputProvenance: AppState.draft.inputProvenance,
      citations: AppState.draft.citations
    })}<div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap"><button class="btn btn--primary" id="btn-wizard2-ai-continue" type="button">Continue to Loss Estimation</button><button class="btn btn--ghost" id="btn-wizard2-ai-retry" type="button">Run AI Assist Again</button></div><details class="card mt-4 anim-fade-in"><summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);font-size:.82rem;font-weight:600;color:var(--text-primary)"><span>Show benchmark and evidence detail</span><span class="badge badge--neutral">Optional</span></summary><div style="display:flex;flex-direction:column;gap:var(--sp-4);margin-top:var(--sp-4)">${renderBenchmarkRationaleBlock(AppState.draft.benchmarkBasis, AppState.draft.inputRationale, AppState.draft.benchmarkReferences)}${renderInputProvenanceBlock(AppState.draft.inputProvenance)}${renderCitationBlock(AppState.draft.citations)}${renderEvidenceQualityBlock(AppState.draft.confidenceLabel, AppState.draft.evidenceQuality, AppState.draft.evidenceSummary, AppState.draft.missingInformation, 'Detailed evidence view', { primaryGrounding: AppState.draft.primaryGrounding, supportingReferences: AppState.draft.supportingReferences, inferredAssumptions: AppState.draft.inferredAssumptions })}</div></details>`;
    if (status) status.textContent = 'AI draft ready. Review the changes below, then continue when you are comfortable with the scenario.';
    attachCitationHandlers();
    document.getElementById('btn-wizard2-ai-retry')?.addEventListener('click', runLLMAssist);
    document.getElementById('btn-wizard2-ai-continue')?.addEventListener('click', () => document.getElementById('btn-next-2')?.click());
  } catch(e) {
    if (status) status.textContent = 'AI assist is unavailable right now. You can continue manually with your own wording.';
    output.innerHTML = `<div class="banner banner--danger mt-4"><span class="banner-icon">⚠</span><span class="banner-text">LLM Assist is unavailable right now.</span></div><div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap"><button class="btn btn--secondary" id="btn-wizard2-ai-retry" type="button">Try again</button><button class="btn btn--ghost" id="btn-wizard2-continue-manual" type="button">Continue without AI</button></div>`;
    document.getElementById('btn-wizard2-ai-retry')?.addEventListener('click', runLLMAssist);
    document.getElementById('btn-wizard2-continue-manual')?.addEventListener('click', () => document.getElementById('btn-next-2')?.click());
  }
  btn.disabled = false; btn.classList.remove('loading');
  btnText.innerHTML = '🤖 LLM Assist — Draft Scenario &amp; Suggest FAIR Inputs';
}
