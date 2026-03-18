function renderExecutiveThresholdTracks(model) {
  const renderCard = item => `
    <div class="results-track-card">
      <div class="results-track-head">
        <div>
          <div class="results-driver-label">${item.title}</div>
          <div class="results-comparison-foot">Current view: ${fmtCurrency(item.current)}</div>
        </div>
        <span class="badge badge--${item.statusTone}">${item.status}</span>
      </div>
      <div class="results-threshold-track">
        <div class="results-threshold-fill results-threshold-fill--${item.statusTone}" style="width:${ReportPresentation.clampNumber(item.ratio)}%"></div>
      </div>
      <div class="results-threshold-track-foot">
        <span>Benchmark: <strong>${fmtCurrency(item.benchmark)}</strong></span>
        ${item.secondaryBenchmark ? `<span>Warning: <strong>${fmtCurrency(item.secondaryBenchmark)}</strong></span>` : ''}
      </div>
      <div class="results-comparison-foot" style="margin-top:var(--sp-3)">${item.summary}</div>
    </div>`;
  return UI.resultsVisualCard({
    title: 'Against governance limits',
    wide: true,
    body: `<div class="results-track-grid">${renderCard(model.single)}${renderCard(model.annual)}</div>`
  });
}

function renderExecutiveImpactMix(mix) {
  if (!mix.length) return UI.resultsVisualCard({
    title: 'What is driving the cost',
    body: '<div class="results-comparison-foot">No meaningful loss-component mix is available for this scenario yet.</div>'
  });
  return UI.resultsVisualCard({
    title: 'What is driving the cost',
    body: `<div class="results-impact-mix">${mix.map(item => `<div class="results-impact-mix-row"><div class="results-impact-mix-head"><span>${item.label}</span><strong>${fmtCurrency(item.value)}</strong></div><div class="results-impact-mix-bar"><span style="width:${item.width}%"></span></div></div>`).join('')}</div>`
  });
}

function renderExecutiveSignalCard(results) {
  const breach = ReportPresentation.clampNumber((Number(results?.toleranceDetail?.lmExceedProb || 0) * 100), 0, 100);
  const annualStress = ReportPresentation.clampNumber(((Number(results?.ale?.p90 || 0) / Math.max(Number(results?.annualReviewThreshold || getAnnualReviewThreshold() || 1), 1)) * 100), 0, 180);
  return UI.resultsVisualCard({
    title: 'Risk signal at a glance',
    body: `<div class="results-signal-stack">
      <div class="results-signal-metric">
        <div class="results-driver-label">Tolerance breach likelihood</div>
        <div class="results-signal-bar"><span style="width:${breach}%"></span></div>
        <div class="results-comparison-foot">${breach.toFixed(1)}% chance of breaching tolerance in the model</div>
      </div>
      <div class="results-signal-metric">
        <div class="results-driver-label">Annual stress versus review trigger</div>
        <div class="results-signal-bar warning"><span style="width:${Math.min(annualStress, 100)}%"></span></div>
        <div class="results-comparison-foot">${annualStress >= 100 ? 'At or above' : 'Below'} the annual review trigger</div>
      </div>
    </div>`
  });
}

function renderExecutiveBrief(statusTitle, executiveDecision, executiveAction, executiveAnnualView) {
  const nextStep = executiveAction || executiveDecision?.priority || 'Confirm the next management step for this scenario.';
  return `<div class="results-executive-brief">
    ${UI.resultsBriefCard({
      label: 'Current position',
      value: statusTitle,
      copy: executiveAnnualView
    })}
    ${UI.resultsBriefCard({
      label: 'Management posture',
      value: executiveDecision?.decision || 'Review',
      copy: executiveDecision?.rationale || ''
    })}
    ${UI.resultsBriefCard({
      label: 'Immediate next step',
      value: 'Act now',
      copy: nextStep
    })}
  </div>`;
}

function buildAssessmentComparison(currentAssessment, baselineAssessment) {
  if (!currentAssessment?.results || !baselineAssessment?.results) return null;

  const current = currentAssessment.results;
  const baseline = baselineAssessment.results;
  const severeEvent = formatComparisonDelta(current.lm?.p90, baseline.lm?.p90);
  const annualExposure = formatComparisonDelta(current.ale?.mean, baseline.ale?.mean);
  const severeAnnual = formatComparisonDelta(current.ale?.p90, baseline.ale?.p90);
  const currentStatus = current.toleranceBreached ? 'Above tolerance' : current.nearTolerance ? 'Close to tolerance' : 'Within tolerance';
  const baselineStatus = baseline.toleranceBreached ? 'Above tolerance' : baseline.nearTolerance ? 'Close to tolerance' : 'Within tolerance';
  const statusShift = currentStatus === baselineStatus
    ? `Tolerance status is unchanged at ${currentStatus.toLowerCase()}.`
    : `Tolerance status moved from ${baselineStatus.toLowerCase()} to ${currentStatus.toLowerCase()}.`;

  const currentInputs = current.inputs || currentAssessment.fairParams || {};
  const baselineInputs = baseline.inputs || baselineAssessment.fairParams || {};
  const levers = [
    {
      key: 'control',
      magnitude: Math.abs(Number(currentInputs.controlStrLikely || 0) - Number(baselineInputs.controlStrLikely || 0)),
      message: Number(currentInputs.controlStrLikely || 0) > Number(baselineInputs.controlStrLikely || 0)
        ? 'Stronger controls appear to be one of the main reasons the treated case improved.'
        : 'Weaker control strength appears to be one of the main reasons this case worsened.'
    },
    {
      key: 'frequency',
      magnitude: Math.abs(Number(currentInputs.tefLikely || 0) - Number(baselineInputs.tefLikely || 0)),
      message: Number(currentInputs.tefLikely || 0) < Number(baselineInputs.tefLikely || 0)
        ? 'A lower event frequency assumption is materially helping the treated case.'
        : 'A higher event frequency assumption is materially pushing this case upward.'
    },
    {
      key: 'business-interruption',
      magnitude: Math.abs(Number(currentInputs.biLikely || 0) - Number(baselineInputs.biLikely || 0)),
      message: Number(currentInputs.biLikely || 0) < Number(baselineInputs.biLikely || 0)
        ? 'Lower business interruption cost is one of the clearest improvements in the treated case.'
        : 'Higher business interruption cost is one of the clearest reasons this case is worse.'
    }
  ].sort((a, b) => b.magnitude - a.magnitude);

  return {
    baselineTitle: baselineAssessment.scenarioTitle || 'Selected baseline',
    baselineDate: new Date(baselineAssessment.completedAt || baselineAssessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' }),
    severeEvent,
    annualExposure,
    severeAnnual,
    currentStatus,
    baselineStatus,
    statusShift,
    keyDriver: levers[0]?.magnitude > 0 ? levers[0].message : 'The two cases are directionally similar, so no single input change stands out as the dominant driver.',
    summary: severeEvent.direction === 'up'
      ? 'This scenario is currently running hotter than the selected baseline on the severe single-event view.'
      : severeEvent.direction === 'down'
        ? 'This scenario is currently less severe than the selected baseline on the severe single-event view.'
        : 'This scenario is broadly aligned with the selected baseline on the severe single-event view.'
  };
}

function applyTreatmentPrompt(promptId) {
  const p = AppState.draft.fairParams || (AppState.draft.fairParams = {});
  const multiply = (key, factor, floor = 0, ceil = null) => {
    const current = Number(p[key] || 0);
    let next = current * factor;
    if (floor != null) next = Math.max(floor, next);
    if (ceil != null) next = Math.min(ceil, next);
    p[key] = Number(next.toFixed(2));
  };

  if (promptId === 'control-strength') {
    multiply('controlStrMin', 1.15, 0, 0.99);
    multiply('controlStrLikely', 1.15, 0, 0.99);
    multiply('controlStrMax', 1.12, 0, 0.995);
    multiply('vulnMin', 0.9, 0.01, 1);
    multiply('vulnLikely', 0.85, 0.01, 1);
    multiply('vulnMax', 0.8, 0.01, 1);
  } else if (promptId === 'frequency') {
    multiply('tefMin', 0.8, 0.1, null);
    multiply('tefLikely', 0.75, 0.1, null);
    multiply('tefMax', 0.7, 0.1, null);
  } else if (promptId === 'business-interruption') {
    multiply('biMin', 0.7, 0, null);
    multiply('biLikely', 0.65, 0, null);
    multiply('biMax', 0.6, 0, null);
    multiply('irMin', 0.9, 0, null);
    multiply('irLikely', 0.9, 0, null);
    multiply('irMax', 0.9, 0, null);
  }
  saveDraft();
}

function createTreatmentDraftFromAssessment(assessment) {
  const clone = JSON.parse(JSON.stringify(assessment || {}));
  const originalTitle = clone.scenarioTitle || 'Untitled assessment';
  delete clone.results;
  delete clone.completedAt;
  delete clone.archivedAt;
  delete clone._shared;
  delete clone.assessmentIntelligence;
  AppState.draft = {
    ...clone,
    id: 'a_' + Date.now(),
    scenarioTitle: `${originalTitle} — Treatment case`,
    learningNote: `Cloned from ${originalTitle} so you can compare a stronger future-state view against the current baseline.`,
    comparisonBaselineId: assessment.id,
    treatmentImprovementRequest: '',
    results: null,
    completedAt: null
  };
  if (AppState.draft.fairParams && typeof AppState.draft.fairParams === 'object') {
    AppState.draft.fairParams = { ...AppState.draft.fairParams };
  }
  saveDraft();
}

function renderAssessmentComparisonBlock(comparisonOptions, activeComparisonId, comparison) {
  if (!comparisonOptions?.length) return '';
  return `<section class="results-section-stack">
    <div class="results-section-heading">Compare against another assessment</div>
    <div class="results-comparison-card">
      <div class="results-comparison-head">
        <div>
          <div class="results-driver-label">Current baseline</div>
          <div class="results-comparison-sub">Choose another saved assessment to understand what changed and how this scenario compares.</div>
        </div>
        <select class="form-select results-comparison-select" id="results-compare-select">
          <option value="">No comparison selected</option>
          ${comparisonOptions.map(option => `<option value="${option.id}" ${activeComparisonId === option.id ? 'selected' : ''}>${option.label}</option>`).join('')}
        </select>
      </div>
      ${comparison ? `
        <div class="results-comparison-banner">
          <strong>Comparing against:</strong> ${comparison.baselineTitle} · ${comparison.baselineDate}
        </div>
        <p class="results-summary-copy" style="margin-top:var(--sp-3)">${comparison.summary}</p>
        <div class="results-comparison-banner" style="margin-top:var(--sp-3)">${comparison.statusShift}</div>
        <div class="results-comparison-banner" style="margin-top:var(--sp-3)">${comparison.keyDriver}</div>
        <div class="results-comparison-grid">
          <div class="results-comparison-metric ${comparison.severeEvent.direction}">
            <div class="results-impact-label">Severe single event</div>
            <div class="results-comparison-value">${comparison.severeEvent.formatted}</div>
            <div class="results-comparison-foot">Current: ${comparison.currentStatus} · Baseline: ${comparison.baselineStatus}</div>
          </div>
          <div class="results-comparison-metric ${comparison.annualExposure.direction}">
            <div class="results-impact-label">Expected annual exposure</div>
            <div class="results-comparison-value">${comparison.annualExposure.formatted}</div>
            <div class="results-comparison-foot">Average-year comparison</div>
          </div>
          <div class="results-comparison-metric ${comparison.severeAnnual.direction}">
            <div class="results-impact-label">High-end annual exposure</div>
            <div class="results-comparison-value">${comparison.severeAnnual.formatted}</div>
            <div class="results-comparison-foot">Severe-year comparison</div>
          </div>
        </div>` : `
        <div class="results-comparison-empty">Choose a baseline assessment to compare event size, yearly exposure, and tolerance position.</div>`}
    </div>
  </section>`;
}

function renderAssessmentAssumptionsBlock(assumptions) {
  if (!assumptions?.length) return '';
  return `<section class="results-section-stack">
    <div class="results-section-heading">Key assumptions to keep in mind</div>
    <div class="results-assumptions-grid">
      ${assumptions.map(item => `<div class="results-assumption-card"><div class="results-assumption-label">${item.category}</div><div class="results-assumption-copy">${item.text}</div></div>`).join('')}
    </div>
  </section>`;
}

function validateFairParams() {
  const p = AppState.draft.fairParams;
  const checks = [['tef','Event frequency'],['ir','IR'],['bi','BI'],['db','DB'],['rl','RL'],['tp','TP'],['rc','RC']];
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
  const safeIterations = Math.min(100000, Math.max(1000, Number.parseInt(p.iterations, 10) || 10000));
  p.iterations = safeIterations;
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
            ${selectedRisks.length ? `<div class="mt-4"><div class="context-panel-title">Scenario Scope</div><div class="citation-chips">${selectedRisks.map(r => `<span class="badge badge--neutral">${r.title}</span>`).join('')}</div><div class="context-panel-foot">${multipliers.linked ? `${selectedRisks.length} linked risks selected. Uplift is being applied to event frequency and loss components.` : `${selectedRisks.length} risks selected. Combined scenario, no linked uplift.`}</div></div>` : ''}
          </div>
          <div class="card anim-fade-in anim-delay-1">
            <h3 style="font-size:var(--text-base);margin-bottom:var(--sp-4)">Key Parameters</h3>
            <div class="grid-3">
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Event frequency</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${p.tefMin}–${p.tefLikely}–${p.tefMax}</div><div style="font-size:.7rem;color:var(--text-muted)">events/year</div></div>
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
            <button class="btn btn--primary btn--lg" id="btn-run-sim" style="width:100%;justify-content:center">🚀 Run Monte Carlo Simulation (${safeIterations} iterations)</button>
          </div>
          <div id="sim-progress" class="hidden">
            <div class="card" style="text-align:center;padding:var(--sp-10)">
              <div style="font-size:48px;margin-bottom:var(--sp-4);animation:spin 1s linear infinite">⚙️</div>
              <div style="font-family:var(--font-display);font-size:var(--text-xl);margin-bottom:var(--sp-2)">Running Simulation…</div>
              <div style="font-size:var(--text-sm);color:var(--text-muted)">Computing ${safeIterations} Monte Carlo iterations…</div>
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
  const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));
  document.getElementById('run-area').classList.add('hidden');
  document.getElementById('sim-progress').classList.remove('hidden');
  await new Promise(r => setTimeout(r, 80));
  await new Promise(requestAnimationFrame);
  try {
    const p = AppState.draft.fairParams;
    const progressText = document.querySelector('#sim-progress .card div:last-child');
    p.iterations = Math.min(100000, Math.max(1000, Number.parseInt(p.iterations, 10) || 10000));
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
    const results = await Promise.race([
      RiskEngine.runAsync(ep, {
        yieldEvery: 500,
        onProgress: (ratio, completed, total) => {
          if (progressText) progressText.textContent = `Computing ${completed.toLocaleString()} of ${total.toLocaleString()} Monte Carlo iterations…`;
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Simulation timed out during computation.')), 20000))
    ]);
    if (progressText) progressText.textContent = 'Finalising the simulation results…';
    await yieldToUI();
    await new Promise(requestAnimationFrame);
    results.inputs = { ...ep };
    results.portfolioMeta = scenario;
    results.selectedRiskCount = scenario.riskCount;
    results.applicableRegulations = [...(AppState.draft.applicableRegulations || [])];
    results.warningThreshold = warningThreshold;
    results.annualReviewThreshold = annualReviewThreshold;
    results.nearTolerance = results.lm.p90 >= warningThreshold && results.lm.p90 < toleranceThreshold;
    results.annualReviewTriggered = results.ale.p90 >= annualReviewThreshold;
    const assessmentIntelligence = buildAssessmentIntelligence(AppState.draft, results, ep, scenario);
    await yieldToUI();
    if (!AppState.draft.id) AppState.draft.id = 'a_' + Date.now();
    const assessment = { ...AppState.draft, results, assessmentIntelligence, completedAt: Date.now() };
    if (progressText) progressText.textContent = 'Saving the assessment and opening results…';
    await yieldToUI();
    await new Promise(requestAnimationFrame);
    saveAssessment(assessment);
    recordLearningFromAssessment(assessment);
    saveDraft();
    Router.navigate('/results/' + AppState.draft.id);
  } catch(e) {
    document.getElementById('sim-progress').classList.add('hidden');
    document.getElementById('run-area').classList.remove('hidden');
    UI.toast(e?.message === 'Simulation timed out during computation.' ? 'The simulation took too long and was stopped. Reduce the iteration count and try again.' : 'The simulation could not be completed right now. Try again in a moment.', 'danger');
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
    setPage(`<div class="container" style="padding:var(--sp-12)"><h2>Assessment not found</h2><p style="margin-top:var(--sp-4);color:var(--text-muted)">ID "${id}" not found in local storage.</p><a href="#/dashboard" class="btn btn--primary" style="margin-top:var(--sp-6)">← Dashboard</a></div>`);
    return;
  }

  try {
  const sharedBanner = (isShared || assessment._shared) ? `
    <div class="banner banner--info mb-6" style="font-size:.82rem">
      <span class="banner-icon">🔗</span>
      <span class="banner-text"><strong>Shared view.</strong> This assessment was shared with you. <a href="#/" style="color:var(--color-accent-300)">Start your own →</a></span>
    </div>` : '';

  const currentUser = AuthService.getCurrentUser();
  const capability = (!isShared && currentUser && currentUser.role !== 'admin')
    ? getNonAdminCapabilityState(currentUser, getUserSettings(), getAdminSettings())
    : null;
  const roleMode = capability?.canManageBusinessUnit && capability?.canManageDepartment
    ? 'bu_and_function'
    : capability?.canManageBusinessUnit
      ? 'bu_admin'
      : capability?.canManageDepartment
        ? 'function_admin'
        : 'standard_user';
  const rolePresentation = {
    standard_user: {
      executiveHeadline: r => r.toleranceBreached
        ? 'This result needs attention now and should be reviewed with the person who owns the response.'
        : r.nearTolerance
          ? 'This result is close to tolerance and should be reviewed before it worsens.'
          : 'This result is within tolerance today, so the main task is to monitor and revisit it if conditions change.',
      executiveAction: r => r.toleranceBreached
        ? 'Review the result with your manager or risk owner and confirm the next response step.'
        : r.nearTolerance
          ? 'Check the main assumptions and agree the next improvement step with the owner of this area.'
          : 'Keep monitoring the scenario and update it when the threat, scope, or controls change.',
      annualView: r => r.annualReviewTriggered ? 'Annual review is worth scheduling.' : 'No annual review trigger is currently indicated.',
      executiveNoteTitle: 'What this means for you',
      executiveNote: 'Use the executive summary first. Open deeper detail only if you need to challenge the assumptions or explain the result to someone else.',
      technicalNoteTitle: 'How to use the technical view',
      technicalNote: 'Use this tab only when you need to understand the ranges, evidence, or model assumptions in more detail.',
      coreSummary: 'Show core numbers',
      aiSummary: 'Show how AI built this result'
    },
    function_admin: {
      executiveHeadline: r => r.toleranceBreached
        ? 'This function-level scenario is above tolerance and needs action from the function owner now.'
        : r.nearTolerance
          ? 'This function-level scenario is close to tolerance and should be actively managed.'
          : 'This function-level scenario is within tolerance, but the owned function context should stay current.',
      executiveAction: r => r.toleranceBreached
        ? 'Confirm the immediate function-level response, owner, and control actions for this scenario.'
        : r.nearTolerance
          ? 'Review the main drivers for your function and agree a targeted reduction action.'
          : 'Keep the function context and assumptions current so future assessments stay grounded.',
      annualView: r => r.annualReviewTriggered ? 'A function-level annual review is warranted.' : 'No annual function review trigger is currently indicated.',
      executiveNoteTitle: 'What this means for your function',
      executiveNote: 'Focus first on what this result means for the function or department you own, then open deeper detail only when you need to validate the assumptions.',
      technicalNoteTitle: 'Function review view',
      technicalNote: 'Use this tab to validate drivers, assumptions, and evidence that affect the function context you own.',
      coreSummary: 'Show core function outputs',
      aiSummary: 'Show AI reasoning for this function result'
    },
    bu_admin: {
      executiveHeadline: r => r.toleranceBreached
        ? 'This business-unit scenario is above tolerance and needs management action now.'
        : r.nearTolerance
          ? 'This business-unit scenario is close to tolerance and should be managed before it escalates.'
          : 'This business-unit scenario is within tolerance, but should stay under active review.',
      executiveAction: r => r.toleranceBreached
        ? 'Confirm the BU owner, escalation path, and immediate treatment actions for this scenario.'
        : r.nearTolerance
          ? 'Review the main drivers across the business unit and agree a targeted management response.'
          : 'Keep the BU context aligned and review again if conditions change materially.',
      annualView: r => r.annualReviewTriggered ? 'A business-unit annual review is warranted.' : 'No business-unit annual review trigger is currently indicated.',
      executiveNoteTitle: 'What this means for the business unit',
      executiveNote: 'Use this view to decide whether the business unit needs review, escalation, or updated context before more work starts.',
      technicalNoteTitle: 'Business unit review view',
      technicalNote: 'Use this tab for management review, challenge, and comparison across scenarios in the business unit.',
      coreSummary: 'Show core business-unit outputs',
      aiSummary: 'Show AI reasoning for this BU result'
    },
    bu_and_function: {
      executiveHeadline: r => r.toleranceBreached
        ? 'This scenario is above tolerance and needs both business-unit oversight and function-level action now.'
        : r.nearTolerance
          ? 'This scenario is close to tolerance and should be managed across the business unit and the owned function.'
          : 'This scenario is within tolerance, but both the BU and function context should stay aligned.',
      executiveAction: r => r.toleranceBreached
        ? 'Confirm the BU-level decision, then agree the immediate function-level response and control actions.'
        : r.nearTolerance
          ? 'Review the main drivers from both the BU and function perspective and agree the next action.'
          : 'Keep both the BU and function context current so new assessments stay aligned.',
      annualView: r => r.annualReviewTriggered ? 'A BU and function-level annual review is warranted.' : 'No annual review trigger is currently indicated for the BU or owned function.',
      executiveNoteTitle: 'What this means across your role',
      executiveNote: 'Use this view first for the BU-level decision, then check whether the owned function needs a more direct follow-up action.',
      technicalNoteTitle: 'Oversight and execution view',
      technicalNote: 'Use this tab when you need to challenge the assumptions from both the management and owned-function perspective.',
      coreSummary: 'Show core oversight outputs',
      aiSummary: 'Show AI reasoning and evidence'
    }
  }[roleMode];
  const rawResults = assessment.results || {};
  const r = {
    ...rawResults,
    lm: rawResults.lm || { mean: 0, p50: 0, p90: 0, p95: 0, min: 0, max: 0 },
    ale: rawResults.ale || { mean: 0, p50: 0, p90: 0, p95: 0, min: 0, max: 0 },
    toleranceDetail: rawResults.toleranceDetail || { lmExceedProb: 0, aleExceedProb: 0, lmP90: 0, aleP90: 0 },
    histogram: Array.isArray(rawResults.histogram) ? rawResults.histogram : [],
    lec: Array.isArray(rawResults.lec) ? rawResults.lec : [],
    warningThreshold: Number(rawResults.warningThreshold || getWarningThreshold() || 0),
    threshold: Number(rawResults.threshold || getToleranceThreshold() || 0),
    annualReviewThreshold: Number(rawResults.annualReviewThreshold || getAnnualReviewThreshold() || 0),
    iterations: Number(rawResults.iterations || assessment.fairParams?.iterations || 0)
  };
  const activeTab = String(AppState.resultsTab || 'executive');
  const statusClass = r.toleranceBreached ? 'above' : r.nearTolerance ? 'warning' : 'within';
  const statusIcon = r.toleranceBreached ? '🔴' : r.nearTolerance ? '🟠' : '🟢';
  const statusTitle = r.toleranceBreached ? 'Needs leadership action' : r.nearTolerance ? 'Needs management attention' : 'Within current tolerance';
  const statusDetail = r.toleranceBreached
    ? `Per-event P90 ${fmtCurrency(r.lm.p90)} is above the tolerance threshold of ${fmtCurrency(r.threshold)}.`
    : r.nearTolerance
      ? `Per-event P90 ${fmtCurrency(r.lm.p90)} is above the warning trigger of ${fmtCurrency(r.warningThreshold)} but still below tolerance.`
      : `Per-event P90 ${fmtCurrency(r.lm.p90)} remains below the warning trigger of ${fmtCurrency(r.warningThreshold)}.`;
  const executiveHeadline = rolePresentation.executiveHeadline(r);
  const executiveAction = rolePresentation.executiveAction(r);
  const executiveAnnualView = rolePresentation.annualView(r);
  const scenarioScopeSummary = r.portfolioMeta?.linked
    ? `${r.selectedRiskCount || assessment.selectedRisks?.length || 1} linked risks are being treated as one connected scenario.`
    : `${r.selectedRiskCount || assessment.selectedRisks?.length || 1} risks are being assessed together without linked uplift.`;
  const exceedancePct = ((r.toleranceDetail?.lmExceedProb || 0) * 100).toFixed(1);
  const completedLabel = new Date(assessment.completedAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' });
  const scenarioNarrative = ReportPresentation.buildExecutiveScenarioSummary(assessment) || 'No scenario narrative available.';
  const technicalInputs = r.inputs || assessment.fairParams || {};
  const workflowGuidance = Array.isArray(assessment.workflowGuidance) ? assessment.workflowGuidance : [];
  const recommendations = Array.isArray(assessment.recommendations) ? assessment.recommendations : [];
  const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
  const primaryGrounding = Array.isArray(assessment.primaryGrounding) ? assessment.primaryGrounding : [];
  const supportingReferences = Array.isArray(assessment.supportingReferences) ? assessment.supportingReferences : [];
  const inferredAssumptions = Array.isArray(assessment.inferredAssumptions) ? assessment.inferredAssumptions : [];
  const missingInformation = Array.isArray(assessment.missingInformation) ? assessment.missingInformation : [];
  const assessmentIntelligence = assessment.assessmentIntelligence || buildAssessmentIntelligence(assessment, r, technicalInputs, r.portfolioMeta || {});
  const assessmentChallenge = assessment.assessmentChallenge || null;
  const executiveDecision = ReportPresentation.buildExecutiveDecisionSupport(assessment, r, assessmentIntelligence);
  const thresholdModel = ReportPresentation.buildExecutiveThresholdModel(r, fmtCurrency);
  const impactMix = ReportPresentation.buildExecutiveImpactMix(technicalInputs);
  const comparisonOptions = getAssessments()
    .filter(item => !item?.archivedAt && item.id !== assessment.id && item.results)
    .sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime())
    .slice(0, 12)
    .map(item => ({
      id: item.id,
      label: `${item.scenarioTitle || 'Untitled assessment'} · ${item.buName || '—'} · ${new Date(item.completedAt || item.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}`
    }));
  const activeComparisonId = AppState.resultsComparisonId || assessment.comparisonBaselineId || '';
  const baselineAssessment = activeComparisonId ? getAssessmentById(activeComparisonId) : null;
  const comparison = baselineAssessment ? buildAssessmentComparison(assessment, baselineAssessment) : null;
  const recommendationCards = recommendations.length ? `
    <section class="results-section-stack">
      <div class="results-section-heading">Priority actions</div>
      <div class="results-recommendations-grid">
        ${recommendations.slice(0, 3).map((rec, idx) => `
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
          <p class="results-hero-copy">${statusDetail}</p>
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
          <div class="results-signal-label">${exceedancePct}% breach likelihood</div>
        </div>
      </div>

      ${renderExecutiveBrief(statusTitle, executiveDecision, executiveAction, executiveAnnualView)}

      <div class="results-summary-grid results-summary-grid--primary">
        <div class="results-summary-card results-summary-card--wide">
          <div class="results-section-heading">${rolePresentation.executiveNoteTitle}</div>
          <p class="results-summary-copy">${rolePresentation.executiveNote}</p>
        </div>
      </div>

      <div class="results-exec-metrics">
        <div class="results-impact-card">
          <div class="results-impact-label">Potential impact from one serious event</div>
          <div class="results-impact-value ${r.toleranceBreached ? 'danger' : ''}">${fmtCurrency(r.lm.p90)}</div>
          <div class="results-impact-copy">Severe single-event view</div>
        </div>
        <div class="results-impact-card">
          <div class="results-impact-label">Most likely impact over a year</div>
          <div class="results-impact-value">${fmtCurrency(r.ale.mean)}</div>
          <div class="results-impact-copy">Expected annual exposure</div>
        </div>
        <div class="results-impact-card">
          <div class="results-impact-label">High-stress impact over a year</div>
          <div class="results-impact-value warning">${fmtCurrency(r.ale.p90)}</div>
          <div class="results-impact-copy">Severe annual planning view</div>
        </div>
      </div>

      <div class="results-decision-grid">
        <div class="results-decision-card">
          <div class="results-section-heading">Recommended management decision</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);flex-wrap:wrap">
            <strong style="font-family:var(--font-display);font-size:var(--text-xl);color:var(--text-primary)">${executiveDecision.decision}</strong>
            <span class="badge ${r.toleranceBreached ? 'badge--danger' : r.nearTolerance ? 'badge--warning' : 'badge--success'}">${statusTitle}</span>
          </div>
          <div class="results-decision-points">
            <div class="results-decision-point">
              <span class="results-decision-label">Why now</span>
              <div class="results-decision-copy">${executiveDecision.rationale}</div>
            </div>
            <div class="results-decision-point">
              <span class="results-decision-label">What should happen now</span>
              <div class="results-decision-copy">${executiveAction}</div>
            </div>
            <div class="results-decision-point">
              <span class="results-decision-label">Main priority</span>
              <div class="results-decision-copy">${executiveDecision.priority}</div>
            </div>
          </div>
        </div>
        <div class="results-decision-card results-decision-card--compact">
          <div class="results-section-heading">Threshold position</div>
          <div class="results-threshold-stack">
            <div class="results-threshold-row"><span>Warning</span><strong>${fmtCurrency(r.warningThreshold || getWarningThreshold())}</strong></div>
            <div class="results-threshold-row"><span>Tolerance</span><strong>${fmtCurrency(r.threshold)}</strong></div>
            <div class="results-threshold-row"><span>Annual review</span><strong>${fmtCurrency(r.annualReviewThreshold || getAnnualReviewThreshold())}</strong></div>
          </div>
          <div class="results-decision-row">
            <span class="results-decision-label">Current position</span>
            <div class="results-decision-copy">${executiveAnnualView}</div>
          </div>
        </div>
      </div>

      ${recommendationCards}

      <div class="results-summary-grid results-summary-grid--primary">
        <div class="results-summary-card results-summary-card--wide">
          <div class="results-section-heading">What this scenario means in practice</div>
          <p class="results-summary-copy">${scenarioNarrative}</p>
        </div>
      </div>

      <details class="results-detail-disclosure">
        <summary>Show why the result looks this way</summary>
        <div class="results-detail-disclosure-copy">Use this when you need the supporting reasoning, threshold context, and benchmark signals behind the headline view.</div>
        <div class="results-disclosure-stack">
          ${renderExecutiveDriversSummary(assessmentIntelligence.drivers, assessment)}
          <div class="results-visual-grid">
            ${renderExecutiveThresholdTracks(thresholdModel)}
            ${renderExecutiveSignalCard(r)}
            ${renderExecutiveImpactMix(impactMix)}
          </div>
        </div>
      </details>
    </section>`;

  const technicalTab = `
    <section class="results-technical-view ${activeTab === 'technical' ? '' : 'hidden'}" id="results-tab-technical">
      <div class="results-summary-grid results-summary-grid--primary">
        <div class="results-summary-card results-summary-card--wide">
          <div class="results-section-heading">${rolePresentation.technicalNoteTitle}</div>
          <p class="results-summary-copy">${rolePresentation.technicalNote}</p>
        </div>
      </div>

      <div class="results-decision-grid mb-6 anim-fade-in">
        ${renderAssessmentConfidenceBlock(assessmentIntelligence.confidence)}
        ${renderAssessmentDriversBlock(assessmentIntelligence.drivers)}
      </div>

      <div class="card mb-6 anim-fade-in">
        <div class="flex items-center justify-between" style="gap:var(--sp-4);flex-wrap:wrap">
          <div>
            <h3 style="font-size:var(--text-base);margin:0">Challenge this assessment</h3>
            <div class="form-help" style="margin-top:6px">Ask AI to review the weakest assumptions, likely committee questions, and the evidence that would strengthen this result.</div>
          </div>
          <button class="btn btn--secondary btn--sm" id="btn-challenge-assessment" type="button">AI Challenge This Assessment</button>
        </div>
        <div id="assessment-challenge-status" class="form-help" style="margin-top:12px">${assessmentChallenge ? 'Latest challenge review saved with this assessment.' : 'No challenge review has been generated yet.'}</div>
      </div>

      ${assessmentChallenge ? renderAssessmentChallengeBlock(assessmentChallenge) : ''}

      <details class="results-detail-disclosure" open>
        <summary>${rolePresentation.coreSummary}</summary>
        <div class="results-detail-disclosure-copy">These are the main event and annual exposure outputs most teams review first.</div>
        <div class="results-disclosure-stack">
          <div class="grid-3 mb-6 anim-fade-in">
            <div class="metric-card"><div class="metric-label">Typical event cost</div><div class="metric-value">${fmtCurrency(r.lm.p50)}</div><div class="metric-sub">Midpoint single-event view</div></div>
            <div class="metric-card"><div class="metric-label">Severe event cost</div><div class="metric-value ${r.toleranceBreached ? 'danger' : ''}">${fmtCurrency(r.lm.p90)}</div><div class="metric-sub">Used for tolerance check</div></div>
            <div class="metric-card"><div class="metric-label">Expected event cost</div><div class="metric-value">${fmtCurrency(r.lm.mean)}</div><div class="metric-sub">Average single-event loss</div></div>
          </div>
          <div class="grid-3 anim-fade-in anim-delay-1">
            <div class="metric-card"><div class="metric-label">Typical annual exposure</div><div class="metric-value">${fmtCurrency(r.ale.p50)}</div><div class="metric-sub">Midpoint annual view</div></div>
            <div class="metric-card"><div class="metric-label">Severe annual exposure</div><div class="metric-value warning">${fmtCurrency(r.ale.p90)}</div><div class="metric-sub">Annual severe-but-plausible view</div></div>
            <div class="metric-card"><div class="metric-label">Expected annual exposure</div><div class="metric-value">${fmtCurrency(r.ale.mean)}</div><div class="metric-sub">Average annual loss</div></div>
          </div>
        </div>
      </details>

      ${(workflowGuidance.length || assessment.benchmarkBasis || assessment.inputRationale || assessment.evidenceSummary || assessment.confidenceLabel || assessment.inputProvenance?.length) ? `
      <details class="results-detail-disclosure">
        <summary>${rolePresentation.aiSummary}</summary>
        <div class="results-detail-disclosure-copy">Use this when you need to review how the AI formed the inputs and how grounded those inputs were.</div>
        <div class="results-disclosure-stack">
          <div class="grid-2 anim-fade-in">
            ${renderWorkflowGuidanceBlock(workflowGuidance, 'How AI guided this assessment')}
            ${renderBenchmarkRationaleBlock(assessment.benchmarkBasis, assessment.inputRationale, assessment.benchmarkReferences)}
            ${renderInputProvenanceBlock(assessment.inputProvenance)}
          </div>
          ${renderEvidenceQualityBlock(assessment.confidenceLabel, assessment.evidenceQuality, assessment.evidenceSummary, missingInformation, 'How grounded the AI inputs were', { primaryGrounding: primaryGrounding, supportingReferences: supportingReferences, inferredAssumptions: inferredAssumptions })}
        </div>
      </details>` : ''}

      ${renderAssessmentComparisonBlock(comparisonOptions, activeComparisonId, comparison)}

      <details class="results-detail-disclosure">
        <summary>Show scenario details, assumptions, and charts</summary>
        <div class="results-detail-disclosure-copy">Use this for deeper validation, peer review, or committee-level challenge.</div>
        <div class="results-disclosure-stack">
          ${renderAssessmentAssumptionsBlock(assessmentIntelligence.assumptions)}
          <div class="grid-2 anim-fade-in anim-delay-2">
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
          <div class="card anim-fade-in">
            <h3 style="font-size:var(--text-base);margin-bottom:var(--sp-4)">Scenario details</h3>
            <div class="grid-2">
              ${Object.entries({
                'Asset / Service': assessment.structuredScenario.assetService,
                'Threat Community': assessment.structuredScenario.threatCommunity,
                'Attack Type': assessment.structuredScenario.attackType,
                'Effect': assessment.structuredScenario.effect
              }).map(([k, v]) => `<div style="background:var(--bg-elevated);padding:var(--sp-3) var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">${k}</div><div style="font-size:.85rem;color:var(--text-secondary);margin-top:4px">${v || '—'}</div></div>`).join('')}
            </div>
          </div>` : ''}

          <div class="card anim-fade-in">
            <h3 style="font-size:var(--text-base);margin-bottom:var(--sp-4)">Simulation context</h3>
            <div class="grid-3">
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Event frequency</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${technicalInputs.tefMin ?? '—'}–${technicalInputs.tefLikely ?? '—'}–${technicalInputs.tefMax ?? '—'}</div><div style="font-size:.7rem;color:var(--text-muted)">events/year</div></div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Threat capability</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${technicalInputs.threatCapMin ?? '—'}–${technicalInputs.threatCapLikely ?? '—'}–${technicalInputs.threatCapMax ?? '—'}</div><div style="font-size:.7rem;color:var(--text-muted)">0–1 scale</div></div>
              <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted)">Control strength</div><div style="font-size:.9rem;font-weight:600;margin-top:4px">${technicalInputs.controlStrMin ?? '—'}–${technicalInputs.controlStrLikely ?? '—'}–${technicalInputs.controlStrMax ?? '—'}</div><div style="font-size:.7rem;color:var(--text-muted)">0–1 scale</div></div>
            </div>
            <div class="mt-4" style="font-size:.78rem;color:var(--text-muted)">Iterations: <strong>${r.iterations.toLocaleString()}</strong> · Distribution: <strong>${r.distType || assessment.fairParams?.distType || 'triangular'}</strong> · Threshold: <strong>${fmtCurrency(r.threshold)}</strong></div>
          </div>
        </div>
      </details>

      ${citations.length ? `<details class="results-detail-disclosure"><summary>Show references used</summary><div class="results-disclosure-stack">${renderCitationBlock(citations)}</div></details>` : ''}

      ${recommendations.length ? `
      <details class="results-detail-disclosure">
        <summary>Show all recommended risk treatments</summary>
        <div class="results-disclosure-stack">
          <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
            ${recommendations.map((rec, i) => `
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
        </div>
      </details>` : ''}
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
            <button class="btn btn--secondary btn--sm" id="btn-create-treatment-case">Compare a Better Outcome</button>
            <button class="btn btn--primary btn--sm" id="btn-export-pdf">↓ PDF Report</button>
            <details class="results-actions-disclosure">
              <summary class="btn btn--ghost btn--sm">More actions</summary>
              <div class="results-actions-disclosure-menu">
                <button class="btn btn--secondary btn--sm" id="btn-share-results">Share</button>
                <button class="btn btn--secondary btn--sm" id="btn-export-json">↓ JSON</button>
                <button class="btn btn--secondary btn--sm" id="btn-export-pptx">↓ PPTX Spec</button>
              </div>
            </details>
          </div>
        </div>

        <div class="results-tabbar mb-6">
          <button class="results-tab ${activeTab === 'executive' ? 'active' : ''}" data-results-tab="executive">Executive Summary</button>
          <button class="results-tab ${activeTab === 'technical' ? 'active' : ''}" data-results-tab="technical">Technical Detail</button>
        </div>

        <div class="${activeTab === 'executive' ? '' : 'hidden'}" id="results-tab-executive-wrap">${executiveTab}</div>
        ${technicalTab}

        <div class="flex items-center gap-4 mt-8 pt-6" style="border-top:1px solid var(--border-subtle)">
          <a href="#/dashboard" class="btn btn--ghost">← Dashboard</a>
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
  document.getElementById('btn-share-results')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Copying…';
    try {
      ShareService.copyShareLink(assessment);
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
      }, 600);
    }
  });
  document.getElementById('btn-export-json')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Exporting…';
    try {
      ExportService.exportJSON(assessment); UI.toast('JSON exported.','success');
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
      }, 600);
    }
  });
  document.getElementById('results-compare-select')?.addEventListener('change', (event) => {
    AppState.resultsComparisonId = event.target.value || '';
    renderResults(id, isShared || assessment._shared);
  });
  document.getElementById('btn-export-pdf').addEventListener('click', event => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing PDF…';
    try {
      ExportService.exportPDF(assessment, AppState.currency, AppState.fxRate);
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
      }, 800);
    }
  });
  const challengeButton = document.getElementById('btn-challenge-assessment');
  if (challengeButton) challengeButton.addEventListener('click', async () => {
    const status = document.getElementById('assessment-challenge-status');
    challengeButton.disabled = true;
    if (status) status.textContent = 'Reviewing the assessment challenge points...';
    try {
      const aiContext = buildCurrentAIAssistContext({ buId: assessment.buId });
      const result = await LLMService.challengeAssessment({
        scenarioTitle: assessment.scenarioTitle,
        narrative: assessment.enhancedNarrative || assessment.narrative || '',
        geography: assessment.geography,
        businessUnitName: assessment.buName,
        businessUnit: aiContext.businessUnit || getBusinessUnitById(assessment.buId),
        adminSettings: aiContext.adminSettings,
        confidence: assessmentIntelligence.confidence,
        drivers: assessmentIntelligence.drivers,
        assumptions: assessmentIntelligence.assumptions,
        missingInformation: missingInformation || [],
        applicableRegulations: assessment.applicableRegulations || [],
        citations: assessment.citations || []
      });
      const next = updateAssessmentRecord(assessment.id, current => ({ ...current, assessmentChallenge: { ...result, createdAt: Date.now(), confidenceLabel: assessment.confidenceLabel || '', evidenceQuality: assessment.evidenceQuality || '' } }));
      if (!next) throw new Error('Could not update the saved assessment.');
      UI.toast('Assessment challenge review updated.', 'success');
      renderResults(assessment.id, isShared || assessment._shared);
    } catch (error) {
      if (status) status.textContent = 'Challenge review could not be generated.';
      UI.toast('The challenge review is unavailable right now. Try again in a moment.', 'danger');
    } finally {
      challengeButton.disabled = false;
    }
  });
  document.getElementById('btn-export-pptx')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Exporting…';
    try {
      ExportService.exportPPTXSpec(assessment, AppState.currency, AppState.fxRate); UI.toast('PPTX spec exported as JSON. See README.','info',5000);
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
      }, 600);
    }
  });
  document.getElementById('btn-create-treatment-case').addEventListener('click', event => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing…';
    createTreatmentDraftFromAssessment(assessment);
    UI.toast('Improvement test created. Adjust the assumptions and rerun to compare against the original.', 'success');
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
      Router.navigate('/wizard/3');
    }, 200);
  });
  document.getElementById('btn-new-assess').addEventListener('click', () => { resetDraft(); Router.navigate('/wizard/1'); });
  } catch (error) {
    console.error('renderResults failed:', error);
    setPage(`
      <main class="page">
        <div class="container container--narrow" style="padding:var(--sp-12) var(--sp-6)">
          <div class="card">
            <h2 style="margin-bottom:var(--sp-3)">This result could not be opened cleanly</h2>
            <p style="color:var(--text-muted);margin-bottom:var(--sp-5)">The saved assessment data is missing something the results page expected. The assessment is still stored, but this view needed a safer fallback.${error?.message ? ' Error: ' + String(error.message) : ''}</p>
            <div class="flex items-center gap-3" style="flex-wrap:wrap">
              <a href="#/dashboard" class="btn btn--primary">Go to dashboard</a>
              <button class="btn btn--secondary" id="btn-results-retry" type="button">Try again</button>
            </div>
          </div>
        </div>
      </main>`);
    document.getElementById('btn-results-retry')?.addEventListener('click', () => renderResults(id, isShared));
  }
}

// ─── AUTH & SETTINGS ──────────────────────────────────────────
const ADMIN_SECTION_STORAGE_KEY = 'rq_admin_active_section';

function getPreferredAdminSection() {
  const value = String(localStorage.getItem(ADMIN_SECTION_STORAGE_KEY) || '').trim();
  return ['org', 'company', 'defaults', 'access', 'users', 'audit'].includes(value) ? value : 'org';
}

function setPreferredAdminSection(section) {
  const value = ['org', 'company', 'defaults', 'access', 'users', 'audit'].includes(section) ? section : 'org';
  localStorage.setItem(ADMIN_SECTION_STORAGE_KEY, value);
  return value;
}

function getDefaultRouteForCurrentUser() {
  const user = AuthService.getCurrentUser();
  return user?.role === 'admin' ? `/admin/settings/${getPreferredAdminSection()}` : '/dashboard';
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
  const capability = getNonAdminCapabilityState(currentUser, existingSettings, adminSettings);
  const canChooseDepartment = capability.canManageBusinessUnit && !capability.canManageDepartment;
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
            <h2 style="margin-top:var(--sp-4)">Confirm your organisation context</h2>
            <p style="margin-top:8px;color:var(--text-muted)">This confirms the business context used for this session. Admin-assigned scope stays fixed unless your ownership allows a department choice.</p>
            <div class="form-group mt-6">
              <label class="form-label" for="login-business-unit">Business unit / company</label>
              <select class="form-select" id="login-business-unit" disabled>
                ${companies.map(entity => `<option value="${entity.id}" ${entity.id === selectedBusinessId ? 'selected' : ''}>${entity.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group mt-4">
              <label class="form-label" for="login-department">Function / department</label>
              <select class="form-select" id="login-department" ${departmentOptions.length && canChooseDepartment ? '' : 'disabled'}>
                ${departmentOptions.length
                  ? departmentOptions.map(entity => `<option value="${entity.id}" ${entity.id === selectedDepartmentId ? 'selected' : ''}>${entity.name}${entity.ownerUsername === currentUser.username ? ' · your department' : ''}</option>`).join('')
                  : '<option value="">No functions configured yet</option>'}
              </select>
              <span class="form-help">${departmentOptions.length ? (canChooseDepartment ? 'Choose the function context you want to work within for this session.' : 'Your function context is fixed by your current assignment.') : 'No function has been configured beneath this business yet. Ask an admin or BU admin to add one before continuing.'}</span>
            </div>
            <div class="flex items-center justify-between mt-6" style="gap:var(--sp-4);flex-wrap:wrap">
              <button class="btn btn--ghost" id="btn-login-switch-account">Switch Account</button>
              <button class="btn btn--primary" id="btn-login-context-continue">Continue</button>
            </div>
          </div>
        </div>
      </main>`);

    document.getElementById('btn-login-switch-account').addEventListener('click', () => {
      performLogout({ renderLoginScreen: true });
    });
    document.getElementById('btn-login-context-continue').addEventListener('click', async () => {
      const businessUnitEntityId = selectedBusinessId;
      const departmentEntityId = canChooseDepartment ? document.getElementById('login-department').value : selectedDepartmentId;
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
      activateAuthenticatedState();
      Router.navigate('/dashboard');
    });
  }

  settings.userProfile.businessUnitEntityId = selectedBusinessId;
  renderSelectionStep();
}
