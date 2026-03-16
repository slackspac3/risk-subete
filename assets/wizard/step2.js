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
          ${renderEvidenceQualityBlock(draft.confidenceLabel, draft.evidenceQuality, draft.evidenceSummary, draft.missingInformation, 'How strong the AI evidence is')}
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
          <button class="btn btn--primary" id="btn-next-2">Continue to Loss Estimation →</button>
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
    const aiContext = buildCurrentAIAssistContext({ buId: AppState.draft.buId });
    const scenarioText = buildScenarioNarrative(assistSeed);
    const citations = await RAGService.retrieveRelevantDocs(AppState.draft.buId, scenarioText);
    const result = await LLMService.generateScenarioAndInputs(scenarioText, {
      ...(aiContext.businessUnit || bu || {}),
      regulatoryTags: deriveApplicableRegulations(aiContext.businessUnit || bu, getSelectedRisks(), getScenarioGeographies()),
      geography: formatScenarioGeographies(getScenarioGeographies()),
      benchmarkStrategy: aiContext.adminSettings.benchmarkStrategy,
      companyContextProfile: aiContext.adminSettings.companyContextProfile,
      companyStructureContext: aiContext.adminSettings.companyStructureContext,
      userProfileSummary: aiContext.adminSettings.userProfileSummary,
      selectedDepartmentContext: aiContext.adminSettings.departmentContext
    }, citations);
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
    AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
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
    </div>${renderWorkflowGuidanceBlock(AppState.draft.workflowGuidance, 'What AI thinks you should do next')}${renderEvidenceQualityBlock(AppState.draft.confidenceLabel, AppState.draft.evidenceQuality, AppState.draft.evidenceSummary, AppState.draft.missingInformation, 'How grounded this AI draft is')}${renderBenchmarkRationaleBlock(AppState.draft.benchmarkBasis, AppState.draft.inputRationale)}${renderCitationBlock(AppState.draft.citations)}`;
    attachCitationHandlers();
  } catch(e) {
    output.innerHTML = `<div class="banner banner--danger mt-4"><span class="banner-icon">⚠</span><span class="banner-text">LLM Assist error: ${e.message}</span></div>`;
  }
  btn.disabled = false; btn.classList.remove('loading');
  btnText.innerHTML = '🤖 LLM Assist — Draft Scenario &amp; Suggest FAIR Inputs';
}
