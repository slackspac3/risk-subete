function formatPlainCurrency(value, currency = 'USD') {
  const displayValue = Math.round(convertUsdToDisplayCurrency(value, currency));
  return `${getCurrencyPrefix(currency)}${displayValue.toLocaleString(currency === 'AED' ? 'en-AE' : 'en-US')}`;
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
    ? `AI is currently assuming this could happen between ${p.tefMin} and ${p.tefMax} times in a year, with ${p.tefLikely} as the most realistic planning case.`
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
    ? `These starting numbers were pre-filled from the scenario narrative, selected risks, ${bu?.name ? `${bu.name} context and defaults, ` : ''}linked internal citations, and structured benchmark profiles built from published research and official reports where relevant. They are starting assumptions, not final answers.`
    : `These are your working assumptions. If you have internal incident data, control evidence, or finance input, adjust the ranges to reflect that evidence.`;
  return { source, tef, exposure, loss };
}

function renderEstimateExplainerCard(draft, bu, isAdv, currency) {
  const explainer = buildEstimateExplainer(draft, bu, isAdv, currency);
  return `<div class="card card--elevated anim-fade-in">
    <div class="context-panel-title">What These AI Values Mean</div>
    <div style="display:flex;flex-direction:column;gap:var(--sp-4);margin-top:var(--sp-3)">
      ${UI.contextInfoPanel({
        title: 'Where the starting values came from',
        copy: explainer.source
      })}
      ${UI.contextInfoGrid({
        panels: [
          UI.contextInfoPanel({ title: 'Frequency', copy: explainer.tef }),
          UI.contextInfoPanel({ title: 'Exposure', copy: explainer.exposure }),
          UI.contextInfoPanel({ title: 'Cost', copy: explainer.loss })
        ]
      })}
      <div class="context-panel-foot">Read the three columns as: low case = quieter outcome, expected case = planning assumption, severe case = bad but still plausible outcome. You are not trying to predict one perfect number.</div>
    </div>
  </div>`;
}

function renderRangeCalibrationCard(currency) {
  return UI.contextInfoGrid({
    title: 'Quick calibration guide',
    className: 'card card--elevated anim-fade-in',
    gridStyle: 'margin-top:var(--sp-3)',
    panels: [
      UI.contextInfoPanel({ title: 'Event frequency examples', copy: '0.5 = about once every two years. 1 = about once a year. 4 = about quarterly. 12 = about monthly.' }),
      UI.contextInfoPanel({ title: 'How to think about low, expected, severe', copy: 'Low case = contained and quieter than normal. Expected case = the planning assumption you would defend in a meeting. Severe case = bad but still plausible, not an apocalypse number.' }),
      UI.contextInfoPanel({ title: 'Cost range examples', copy: `Low cost = handled with limited disruption. Expected cost = management attention and some external support likely. Severe cost = prolonged disruption, customer impact, and legal or regulatory escalation in ${currency}.` })
    ]
  });
}

function renderInlineEstimateExamples(currency) {
  return {
    frequency: `<div class="context-panel-foot" style="margin-top:12px">Examples: 0.5 = once every two years, 1 = once a year, 4 = quarterly, 12 = monthly.</div>`,
    cost: `<div class="context-panel-foot" style="margin-bottom:var(--sp-4)">Low = limited disruption. Expected = the planning case you would defend. Severe = major but still plausible disruption in ${currency}.</div>`
  };
}

function getEstimatePresetLibrary() {
  return {
    phishing: {
      label: 'Phishing / BEC example',
      summary: 'Higher frequency, moderate disruption, stronger focus on response and third-party loss.',
      values: {
        tefMin: 2, tefLikely: 6, tefMax: 18,
        threatCapMin: 0.4, threatCapLikely: 0.58, threatCapMax: 0.78,
        controlStrMin: 0.45, controlStrLikely: 0.62, controlStrMax: 0.8,
        irMin: 25000, irLikely: 90000, irMax: 280000,
        biMin: 30000, biLikely: 120000, biMax: 450000,
        dbMin: 10000, dbLikely: 40000, dbMax: 150000,
        rlMin: 0, rlLikely: 20000, rlMax: 150000,
        tpMin: 10000, tpLikely: 50000, tpMax: 250000,
        rcMin: 15000, rcLikely: 70000, rcMax: 250000
      }
    },
    ransomware: {
      label: 'Ransomware / outage example',
      summary: 'Lower frequency than phishing, but heavier business disruption and recovery effort.',
      values: {
        tefMin: 0.5, tefLikely: 1.5, tefMax: 4,
        threatCapMin: 0.55, threatCapLikely: 0.72, threatCapMax: 0.9,
        controlStrMin: 0.35, controlStrLikely: 0.55, controlStrMax: 0.75,
        irMin: 80000, irLikely: 250000, irMax: 900000,
        biMin: 150000, biLikely: 700000, biMax: 3500000,
        dbMin: 25000, dbLikely: 90000, dbMax: 300000,
        rlMin: 0, rlLikely: 50000, rlMax: 350000,
        tpMin: 0, tpLikely: 40000, tpMax: 250000,
        rcMin: 50000, rcLikely: 180000, rcMax: 950000
      }
    },
    dataBreach: {
      label: 'Data privacy / breach example',
      summary: 'Moderate frequency, stronger remediation and regulatory/legal cost pattern.',
      values: {
        tefMin: 0.3, tefLikely: 1, tefMax: 3,
        threatCapMin: 0.45, threatCapLikely: 0.65, threatCapMax: 0.82,
        controlStrMin: 0.4, controlStrLikely: 0.58, controlStrMax: 0.78,
        irMin: 50000, irLikely: 160000, irMax: 500000,
        biMin: 50000, biLikely: 220000, biMax: 900000,
        dbMin: 80000, dbLikely: 250000, dbMax: 1000000,
        rlMin: 20000, rlLikely: 120000, rlMax: 950000,
        tpMin: 10000, tpLikely: 50000, tpMax: 250000,
        rcMin: 40000, rcLikely: 160000, rcMax: 700000
      }
    }
  };
}

function recommendEstimatePreset(draft) {
  const text = [
    draft.scenarioTitle,
    draft.enhancedNarrative,
    draft.narrative,
    draft.structuredScenario?.attackType,
    draft.structuredScenario?.threatCommunity,
    ...(getSelectedRisks().map(r => r.title || ''))
  ].join(' ').toLowerCase();
  if (/(phish|bec|email compromise|business email|invoice fraud)/.test(text)) return 'phishing';
  if (/(ransom|encrypt|extortion|outage|business interruption|recovery)/.test(text)) return 'ransomware';
  if (/(privacy|breach|exfiltrat|data leak|personal data|pii|phi)/.test(text)) return 'dataBreach';
  return '';
}

function renderEstimateActionCard(draft, recommendedKey) {
  const recommendation = recommendedKey
    ? `Use <strong>${getEstimatePresetLibrary()[recommendedKey].label}</strong> only if it matches the scenario pattern. Otherwise keep the AI starting values and adjust only where you have evidence.`
    : 'Start with the AI values, then change only the inputs you can justify with business, control, incident, or finance evidence.';
  return `<div class="card card--elevated anim-fade-in estimate-next-card">
    <div class="context-panel-title">Recommended next action</div>
    <p class="context-panel-copy" style="margin-top:var(--sp-2)">${recommendation}</p>
  </div>`;
}

function renderEstimatePresetCard(draft) {
  const presets = getEstimatePresetLibrary();
  const recommendedKey = recommendEstimatePreset(draft);
  const buttons = Object.entries(presets).map(([key, preset]) => {
    const isRecommended = key === recommendedKey;
    const recommendedLabel = isRecommended ? ' <span class="badge badge--neutral" style="margin-left:6px">Recommended</span>' : '';
    const style = isRecommended ? ' style="border-color:var(--color-primary-400);background:rgba(77,163,255,.12);color:var(--text-primary)"' : '';
    return `<button type="button" class="chip estimate-preset-chip" data-estimate-preset="${key}" title="${preset.summary}"${style}>${preset.label}${recommendedLabel}</button>`;
  }).join('');
  const summary = recommendedKey
    ? `<div class="context-panel-foot" style="margin-top:12px">Best fit for this scenario: <strong>${presets[recommendedKey].label}</strong>. Use it only if the pattern looks close to your case.</div>`
    : '<div class="context-panel-foot" style="margin-top:12px">Pick a quick start only if one looks close to your scenario. Otherwise keep the AI values or enter your own evidence-based ranges.</div>';
  return `<div class="card card--elevated anim-fade-in">
    <div class="context-panel-title">Quick start examples</div>
    <p class="context-panel-copy" style="margin-top:var(--sp-2)">Use one of these only if you want a fast starting pattern. They do not replace the AI suggestions or your own evidence.</p>
    <div class="citation-chips" style="margin-top:12px">${buttons}</div>
    ${summary}
  </div>`;
}

function applyEstimatePreset(presetKey) {
  const preset = getEstimatePresetLibrary()[presetKey];
  if (!preset) return false;
  const fairParams = AppState.draft.fairParams || (AppState.draft.fairParams = {});
  Object.entries(preset.values).forEach(([key, value]) => {
    fairParams[key] = value;
  });
  return true;
}

function attachCitationHandlers() {
  document.querySelectorAll('.citation-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.dataset.docId;
      const docTitle = btn.dataset.docTitle || '';
      const docUrl = btn.dataset.docUrl || '';
      const doc = getDocList().find(d => d.id === docId)
        || AppState.draft.citations?.find(c => c.docId === docId)
        || getDocList().find(d => String(d.title || '').trim() === docTitle)
        || AppState.draft.citations?.find(c => String(c.title || '').trim() === docTitle)
        || getDocList().find(d => String(d.url || '').trim() === docUrl)
        || AppState.draft.citations?.find(c => String(c.url || '').trim() === docUrl);
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
  const sym = cur;
  const baselineAssessment = draft.comparisonBaselineId ? getAssessmentById(draft.comparisonBaselineId) : null;
  const inlineExamples = renderInlineEstimateExamples(sym);
  const recommendedPresetKey = recommendEstimatePreset(draft);

  const v = (key, def) => p[key] != null ? p[key] : def;

  setPage(`
    <main class="page">
      <div class="wizard-layout container container--narrow">
        <div class="wizard-header">
          ${UI.renderStepper(3)}
          <div class="flex items-center justify-between">
            <div>
              <h2 class="wizard-step-title">Estimate the Scenario in Plain Language</h2>
              <p class="form-help" style="margin-top:8px">Review the starting numbers, sense-check them against what you know, and adjust anything that feels too low, too high, or too uncertain.</p>
              <p class="wizard-step-desc">Answer a few practical questions about how often this could happen, how exposed you are, and what the impact could cost. ${draft.llmAssisted?'<span style="color:var(--color-success-400)">✓ Pre-loaded from AI assist</span>':''}</p>
              <div class="form-help" data-draft-save-state style="margin-top:10px">Draft will save automatically</div>
            </div>
            <div class="mode-toggle">
              <button class="${!isAdv?'active':''}" id="mode-basic">Basic</button>
              <button class="${isAdv?'active':''}" id="mode-advanced">Advanced</button>
            </div>
          </div>
        </div>
        <div class="wizard-body">
          ${draft.learningNote ? `<div class="card card--elevated anim-fade-in"><div class="context-panel-title">Template learning</div><p class="context-panel-copy">${draft.learningNote}</p></div>` : ''}
          ${baselineAssessment ? `<div class="card card--elevated anim-fade-in"><div class="context-panel-title">Current assessment baseline</div><p class="context-panel-copy">You are working from <strong>${baselineAssessment.scenarioTitle || 'the original assessment'}</strong>. Adjust the assumptions below to reflect a stronger control position or better resilience, then rerun to compare the new result against the current baseline.</p><div class="form-help" style="margin-top:10px">Baseline completed on ${new Date(baselineAssessment.completedAt || baselineAssessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })}.</div><div class="citation-chips" style="margin-top:12px"><button type="button" class="chip treatment-prompt-chip" data-treatment-prompt="control-strength">Try stronger controls</button><button type="button" class="chip treatment-prompt-chip" data-treatment-prompt="frequency">Try lower event frequency</button><button type="button" class="chip treatment-prompt-chip" data-treatment-prompt="business-interruption">Try lower disruption cost</button></div><div class="form-group" style="margin-top:16px"><label class="form-label" for="treatment-improvement-request">Describe the better outcome you want to test</label><textarea class="form-textarea" id="treatment-improvement-request" rows="3" placeholder="e.g. stronger identity controls, lower business disruption, less financial loss, better containment">${draft.treatmentImprovementRequest || ''}</textarea><span class="form-help">Describe the improvement in plain language and let AI adjust the copied baseline values before you simulate the new case.</span></div><div class="flex items-center gap-3" style="margin-top:12px;flex-wrap:wrap"><button class="btn btn--secondary" id="btn-treatment-ai-assist" type="button">AI Assist This Better Outcome</button><span class="form-help" id="treatment-improvement-status">These are quick starting points. You can still adjust every number manually before rerunning the analysis.</span></div></div>` : ''}
          ${draft.workflowGuidance?.length ? renderWorkflowGuidanceBlock(draft.workflowGuidance) : ''}
          ${renderEvidenceQualityBlock(draft.confidenceLabel, draft.evidenceQuality, draft.evidenceSummary, draft.missingInformation, 'AI Evidence Quality', { primaryGrounding: draft.primaryGrounding, supportingReferences: draft.supportingReferences, inferredAssumptions: draft.inferredAssumptions })}
          ${renderBenchmarkRationaleBlock(draft.benchmarkBasis, draft.inputRationale, draft.benchmarkReferences)}
          ${renderInputProvenanceBlock(draft.inputProvenance)}
          ${renderEstimateActionCard(draft, recommendedPresetKey)}
          ${renderEstimateExplainerCard(draft, bu, isAdv, cur)}
          <details class="wizard-disclosure card card--elevated anim-fade-in">
            <summary>Show quick guidance and example starting points</summary>
            <div class="wizard-disclosure-body">
              ${UI.contextInfoGrid({
                title: 'How to complete this step',
                className: 'card card--elevated wizard-nested-card',
                panels: [
                  UI.contextInfoPanel({ title: '1. Start with the AI values', copy: 'If the AI suggestions look broadly right, adjust only the values you have evidence for.' }),
                  UI.contextInfoPanel({ title: '2. Think in ranges, not exact numbers', copy: 'Use a low, expected, and severe case. You do not need one perfect number.' }),
                  UI.contextInfoPanel({ title: '3. Stay in Basic unless needed', copy: 'Advanced mode is for direct probability inputs, correlations, and simulation tuning.' })
                ]
              })}
              ${renderRangeCalibrationCard(sym)}
              ${renderEstimatePresetCard(draft)}
            </div>
          </details>

          ${UI.wizardInputSection({
            title: 'How often could this happen? <span data-tooltip="How many times per year this type of event could realistically occur." style="cursor:help;color:var(--color-accent-300);font-size:.8rem">ⓘ</span>',
            description: 'Enter the number of events you think could happen in a year. Use a cautious low case, your expected case, and a severe but plausible high case.',
            className: 'card anim-fade-in',
            body: `${inlineExamples.frequency}${tripleInput('tef','How often this could happen in a year', v('tefMin',da.TEF?.min||0.5), v('tefLikely',da.TEF?.likely||2), v('tefMax',da.TEF?.max||8), { minLabel: 'Low case', likelyLabel: 'Expected case', maxLabel: 'High case' })}`
          })}

          ${UI.wizardInputSection({
            title: 'How exposed are you if it happens? <span data-tooltip="This estimates how likely the event is to succeed given attacker capability and current controls." style="cursor:help;color:var(--color-accent-300);font-size:.8rem">ⓘ</span>',
            description: 'In Basic mode, answer this through attacker strength and control strength. In Advanced mode, you can enter vulnerability directly.',
            className: 'card anim-fade-in anim-delay-1',
            body: `${isAdv?`<div class="flex items-center gap-3 mb-4"><label class="toggle"><input type="checkbox" id="vuln-direct-toggle" ${p.vulnDirect?'checked':''}><div class="toggle-track"></div></label><span class="toggle-label">Enter exposure directly</span></div>
            <div id="vuln-direct-section" ${!p.vulnDirect?'class="hidden"':''}>
              <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">Use a value between 0 and 1, where 0 means very unlikely to succeed and 1 means almost certain to succeed.</p>
              ${tripleInput('vuln','Vulnerability', v('vulnMin',0.1), v('vulnLikely',0.35), v('vulnMax',0.7), { minLabel: 'Low success chance', likelyLabel: 'Expected success chance', maxLabel: 'High success chance' })}
            </div>`:''}
            <div id="vuln-derived-section" ${isAdv&&p.vulnDirect?'class="hidden"':''}>
              <div class="grid-2">
                <div class="wizard-subsection">
                  <p class="wizard-subsection-copy">How capable is the attacker or threat source? 0 means weak or opportunistic, 1 means very capable and well resourced.</p>
                  ${tripleInput('threatCap','Threat capability', v('threatCapMin',da.threatCapability?.min||0.45), v('threatCapLikely',da.threatCapability?.likely||0.62), v('threatCapMax',da.threatCapability?.max||0.82), { minLabel: 'Low capability', likelyLabel: 'Expected capability', maxLabel: 'High capability' })}
                </div>
                <div class="wizard-subsection">
                  <p class="wizard-subsection-copy">How strong are your current preventive and detective controls? 0 means weak, 1 means strong and consistently effective.</p>
                  ${tripleInput('controlStr','Control strength', v('controlStrMin',da.controlStrength?.min||0.5), v('controlStrLikely',da.controlStrength?.likely||0.68), v('controlStrMax',da.controlStrength?.max||0.85), { minLabel: 'Weak controls', likelyLabel: 'Expected control strength', maxLabel: 'Strong controls' })}
                </div>
              </div>
            </div>`
          })}

          ${UI.wizardInputSection({
            title: 'What could this cost if it happens?',
            description: `For each cost area, enter a low, expected, and severe per-event estimate in ${sym}. These values are added together in the simulation.`,
            className: 'card anim-fade-in anim-delay-2',
            body: `${inlineExamples.cost}<div class="wizard-cost-stack">
              <div class="wizard-cost-group">
                <div class="wizard-cost-group-label">Core costs</div>
                <div class="wizard-cost-group-copy">These are usually the biggest drivers and should be completed first.</div>
                <div style="display:flex;flex-direction:column;gap:var(--sp-5);margin-top:var(--sp-4)">
                  ${lossRow('ir','Response and recovery cost', v('irMin',da.incidentResponse?.min||50000), v('irLikely',da.incidentResponse?.likely||180000), v('irMax',da.incidentResponse?.max||600000), 'Containment, forensics, internal recovery effort, and external incident response support.')}
                  ${lossRow('bi','Business disruption cost', v('biMin',da.businessInterruption?.min||100000), v('biLikely',da.businessInterruption?.likely||450000), v('biMax',da.businessInterruption?.max||2500000), 'Lost revenue, delayed operations, and productivity impact while the issue is active.')}
                  ${lossRow('db','Data remediation cost', v('dbMin',da.dataBreachRemediation?.min||30000), v('dbLikely',da.dataBreachRemediation?.likely||120000), v('dbMax',da.dataBreachRemediation?.max||500000), 'Notification, monitoring, remediation, and cleanup when data is affected.')}
                </div>
              </div>
              <details class="wizard-disclosure">
                <summary>Show conditional cost areas</summary>
                <div class="wizard-disclosure-body">
                  <div class="wizard-cost-group">
                    <div class="wizard-cost-group-label">Conditional costs</div>
                    <div class="wizard-cost-group-copy">Only spend time here if these are realistic for your scenario.</div>
                    <div style="display:flex;flex-direction:column;gap:var(--sp-5);margin-top:var(--sp-4)">
                      ${lossRow('rl','Regulatory and legal cost', v('rlMin',da.regulatoryLegal?.min||0), v('rlLikely',da.regulatoryLegal?.likely||80000), v('rlMax',da.regulatoryLegal?.max||800000), 'Fines, legal support, regulatory response, and formal notices.')}
                      ${lossRow('tp','Third-party impact cost', v('tpMin',da.thirdPartyLiability?.min||0), v('tpLikely',da.thirdPartyLiability?.likely||50000), v('tpMax',da.thirdPartyLiability?.max||400000), 'Claims, service credits, or compensation for partners and customers.')}
                      ${lossRow('rc','Reputation and contract cost', v('rcMin',da.reputationContract?.min||50000), v('rcLikely',da.reputationContract?.likely||200000), v('rcMax',da.reputationContract?.max||1200000), 'Customer churn, commercial loss, and contract penalties after the event.')}
                    </div>
                  </div>
                </div>
              </details>
            </div>`
          })}

          <details class="wizard-disclosure card anim-fade-in anim-delay-3" ${p.secondaryEnabled ? 'open' : ''}>
            <summary>Extra downstream impact <span class="badge badge--neutral">Optional</span></summary>
            <div class="wizard-disclosure-body">
              <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:var(--sp-4)">Use this only if the main event could trigger another follow-on loss, such as a lawsuit, major partner claim, or wider business consequence.</p>
              <div class="flex items-center justify-between mb-4">
                <div class="form-help">Include a follow-on impact in the simulation</div>
                <label class="toggle"><input type="checkbox" id="secondary-toggle" ${p.secondaryEnabled?'checked':''}><div class="toggle-track"></div></label>
              </div>
              <div id="secondary-inputs" ${!p.secondaryEnabled?'class="hidden"':''}>
                <div class="grid-2">
                  <div class="wizard-subsection"><p class="wizard-subsection-copy">How likely is the follow-on impact? Use 0 to 1.</p>${tripleInput('secProb','Secondary probability', v('secProbMin',0.1), v('secProbLikely',0.3), v('secProbMax',0.7), { minLabel: 'Low chance', likelyLabel: 'Expected chance', maxLabel: 'High chance' })}</div>
                  <div class="wizard-subsection"><p class="wizard-subsection-copy">If it happens, how large could that extra impact be in ${sym}?</p>${tripleInput('secMag','Secondary magnitude', v('secMagMin',100000), v('secMagLikely',500000), v('secMagMax',2000000), { minLabel: 'Low cost', likelyLabel: 'Expected cost', maxLabel: 'High cost', money: true, inputType: 'text' })}</div>
                </div>
              </div>
            </div>
          </details>

          ${isAdv ? `<details class="wizard-disclosure card anim-fade-in">
            <summary>Advanced simulation settings</summary>
            <div class="wizard-disclosure-body">
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
            </div>
          </details>` : ''}

        </div>
        <div class="wizard-footer">
          <button class="btn btn--ghost" id="btn-back-3">← Back</button>
          <button class="btn btn--primary" id="btn-next-3">Continue to Results →</button>
        </div>
      </div>
    </main>`);

  document.getElementById('mode-basic')?.addEventListener('click', () => { AppState.mode='basic'; renderWizard3(); });
  document.getElementById('mode-advanced')?.addEventListener('click', () => { AppState.mode='advanced'; renderWizard3(); });
  updateWizardSaveState();
  document.getElementById('secondary-toggle').addEventListener('change', function() {
    document.getElementById('secondary-inputs').classList.toggle('hidden', !this.checked);
    AppState.draft.fairParams.secondaryEnabled = this.checked;
    markDraftDirty();
    scheduleDraftAutosave();
  });
  document.getElementById('vuln-direct-toggle')?.addEventListener('change', function() {
    document.getElementById('vuln-direct-section')?.classList.toggle('hidden', !this.checked);
    document.getElementById('vuln-derived-section')?.classList.toggle('hidden', this.checked);
    AppState.draft.fairParams.vulnDirect = this.checked;
    markDraftDirty();
    scheduleDraftAutosave();
  });
  attachFormattedMoneyInputs();
  document.querySelectorAll('.fair-input, #adv-dist, #adv-iter, #adv-seed, #corr-bi-ir, #corr-rl-rc, #treatment-improvement-request').forEach(input => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      collectFairParams();
      if (input.id === 'treatment-improvement-request') {
        AppState.draft.treatmentImprovementRequest = input.value;
      }
      markDraftDirty();
      scheduleDraftAutosave();
    });
  });
  function applySuggestedTreatmentInputs(suggestedInputs = {}) {
    const p = AppState.draft.fairParams || (AppState.draft.fairParams = {});
    const applyRange = (prefix, range) => {
      if (!range) return;
      if (Number.isFinite(Number(range.min))) p[`${prefix}Min`] = Number(range.min);
      if (Number.isFinite(Number(range.likely))) p[`${prefix}Likely`] = Number(range.likely);
      if (Number.isFinite(Number(range.max))) p[`${prefix}Max`] = Number(range.max);
    };
    applyRange('tef', suggestedInputs.TEF);
    applyRange('controlStr', suggestedInputs.controlStrength);
    applyRange('threatCap', suggestedInputs.threatCapability);
    applyRange('ir', suggestedInputs.lossComponents?.incidentResponse);
    applyRange('bi', suggestedInputs.lossComponents?.businessInterruption);
    applyRange('db', suggestedInputs.lossComponents?.dataBreachRemediation);
    applyRange('rl', suggestedInputs.lossComponents?.regulatoryLegal);
    applyRange('tp', suggestedInputs.lossComponents?.thirdPartyLiability);
    applyRange('rc', suggestedInputs.lossComponents?.reputationContract);
  }
  document.querySelectorAll('.treatment-prompt-chip').forEach(button => {
    button.addEventListener('click', () => {
      applyTreatmentPrompt(button.dataset.treatmentPrompt);
      renderWizard3();
      UI.toast('Treatment prompt applied. Review the numbers and rerun the scenario.', 'success');
    });
  });

  document.querySelectorAll('.estimate-preset-chip').forEach(button => {
    button.addEventListener('click', () => {
      if (!applyEstimatePreset(button.dataset.estimatePreset)) return;
      saveDraft();
      renderWizard3();
      UI.toast('Example preset applied. Review and adjust the numbers to fit your case.', 'success');
    });
  });
  document.getElementById('btn-treatment-ai-assist')?.addEventListener('click', async () => {
    const requestEl = document.getElementById('treatment-improvement-request');
    const statusEl = document.getElementById('treatment-improvement-status');
    const request = requestEl?.value.trim() || '';
    if (!baselineAssessment) return;
    if (!request) {
      UI.toast('Describe the better outcome you want to test first.', 'warning');
      return;
    }
    AppState.draft.treatmentImprovementRequest = request;
    if (statusEl) statusEl.textContent = 'Using AI to adjust the copied baseline values…';
    const btn = document.getElementById('btn-treatment-ai-assist');
    if (btn) { btn.disabled = true; btn.textContent = 'Adjusting…'; }
    try {
      const aiContext = buildCurrentAIAssistContext({ buId: draft.buId });
      const buContext = aiContext.businessUnit || getBUList().find(b => b.id === draft.buId) || bu || null;
      const citations = await RAGService.retrieveRelevantDocs(draft.buId, `${baselineAssessment.scenarioTitle || ''}
${request}`, 5);
      const result = await LLMService.suggestTreatmentImprovement({
        baselineAssessment,
        improvementRequest: request,
        businessUnit: buContext,
        adminSettings: aiContext.adminSettings,
        citations
      });
      applySuggestedTreatmentInputs(result.suggestedInputs || {});
      AppState.draft.workflowGuidance = Array.isArray(result.workflowGuidance) ? result.workflowGuidance : (AppState.draft.workflowGuidance || []);
      AppState.draft.benchmarkBasis = result.benchmarkBasis || AppState.draft.benchmarkBasis || '';
      AppState.draft.inputRationale = result.inputRationale || AppState.draft.inputRationale || null;
      AppState.draft.confidenceLabel = result.confidenceLabel || AppState.draft.confidenceLabel || '';
      AppState.draft.evidenceQuality = result.evidenceQuality || AppState.draft.evidenceQuality || '';
      AppState.draft.evidenceSummary = result.evidenceSummary || AppState.draft.evidenceSummary || '';
      AppState.draft.primaryGrounding = Array.isArray(result.primaryGrounding) ? result.primaryGrounding : (AppState.draft.primaryGrounding || []);
      AppState.draft.supportingReferences = Array.isArray(result.supportingReferences) ? result.supportingReferences : (AppState.draft.supportingReferences || []);
      AppState.draft.inferredAssumptions = Array.isArray(result.inferredAssumptions) ? result.inferredAssumptions : (AppState.draft.inferredAssumptions || []);
      AppState.draft.missingInformation = Array.isArray(result.missingInformation) ? result.missingInformation : (AppState.draft.missingInformation || []);
      AppState.draft.citations = normaliseCitations(result.citations || citations);
      AppState.draft.learningNote = result.changesSummary || result.summary || '';
      saveDraft();
      renderWizard3();
      UI.toast('The better-outcome case has been adjusted. Review the numbers before rerunning.', 'success');
    } catch (error) {
      if (statusEl) statusEl.textContent = 'AI assist failed. Keep your current values or try again in a moment.';
      UI.toast('AI assist failed. Try again in a moment.', 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'AI Assist This Better Outcome'; }
    }
  });
  document.getElementById('btn-back-3').addEventListener('click', () => { saveDraft(); Router.navigate('/wizard/2'); });
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
  const formatValue = value => labels.money ? formatCurrencyInputValue(value) : value;
  const currencyBadge = labels.money ? `<span class="range-col-currency">${getCurrencyPrefix()}</span>` : '';
  return `<div class="range-group">
    <div class="form-group"><div class="range-col-label">${minLabel}${currencyBadge}</div><input class="${inputClass}" id="${prefix}-min" data-key="${prefix}Min" data-money="${labels.money ? 'true' : 'false'}" type="${inputType}"${stepAttr} inputmode="${inputMode}" value="${formatValue(min)}" aria-label="${label} min"></div>
    <div class="form-group"><div class="range-col-label" style="color:var(--color-primary-300)">${likelyLabel}${currencyBadge}</div><input class="${inputClass}" id="${prefix}-likely" data-key="${prefix}Likely" data-money="${labels.money ? 'true' : 'false'}" type="${inputType}"${stepAttr} inputmode="${inputMode}" value="${formatValue(likely)}" aria-label="${label} likely"></div>
    <div class="form-group"><div class="range-col-label">${maxLabel}${currencyBadge}</div><input class="${inputClass}" id="${prefix}-max" data-key="${prefix}Max" data-money="${labels.money ? 'true' : 'false'}" type="${inputType}"${stepAttr} inputmode="${inputMode}" value="${formatValue(max)}" aria-label="${label} max"></div>
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
    const rawValue = parseFlexibleNumber(input.value);
    if (Number.isNaN(rawValue)) return;
    const val = input.dataset.money === 'true'
      ? convertDisplayCurrencyToUsd(rawValue)
      : rawValue;
    p[input.dataset.key] = val;
  });
  const dist = document.getElementById('adv-dist');
  const iter = document.getElementById('adv-iter');
  const seed = document.getElementById('adv-seed');
  const cbir = document.getElementById('corr-bi-ir');
  const crlr = document.getElementById('corr-rl-rc');
  if (dist) p.distType = dist.value;
  if (iter) {
    const parsedIterations = Number.parseInt(iter.value, 10) || 10000;
    const safeIterations = Math.min(100000, Math.max(1000, parsedIterations));
    p.iterations = safeIterations;
    if (String(safeIterations) !== String(iter.value)) iter.value = String(safeIterations);
  }
  if (seed) p.seed = seed.value ? parseInt(seed.value) : null;
  if (cbir) p.corrBiIr = parseFloat(cbir.value) || 0.3;
  if (crlr) p.corrRlRc = parseFloat(crlr.value) || 0.2;
  p.secondaryEnabled = document.getElementById('secondary-toggle')?.checked || false;
  p.distType = p.distType || 'triangular';
}
