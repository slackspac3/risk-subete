/**
 * exportService.js — Export service
 * 
 * Implements:
 *  - JSON export (always works)
 *  - Print-ready HTML report (browser Print → Save as PDF)
 *  - PPTX slide spec as JSON (replace with pptxgenjs for real PPTX)
 * 
 * [EXPORT-INTEGRATION] marks where to integrate real libraries:
 *  - jsPDF for PDF:     https://raw.githack.com/MrRio/jsPDF/master/docs/
 *  - pptxgenjs for PPTX: https://gitbrent.github.io/PptxGenJS/
 */

const ExportService = (() => {
  function _getCurrencyPrefix(currency) {
    return currency === 'AED' ? 'AED ' : '$';
  }

  function _formatCurrency(value, currency, fxRate) {
    const displayValue = Math.round(currency === 'AED' ? Number(value || 0) * fxRate : Number(value || 0));
    return `${_getCurrencyPrefix(currency)}${displayValue.toLocaleString(currency === 'AED' ? 'en-AE' : 'en-US')}`;
  }

  function _cleanExecutiveNarrativeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\.\./g, '.')
      .replace(/\bIn [^,]+(?:, [^,]+)*, [^,]+ faces a material [^.]+ scenario in which\s*/gi, '')
      .replace(/\bThe main asset, service, or team affected is\s*/gi, 'The scenario centres on ')
      .replace(/\bThe likely trigger or threat driver is\s*/gi, 'It is most likely triggered by ')
      .replace(/\bThe expected business, operational, or regulatory impact is\s*/gi, 'The main consequence is ')
      .replace(/\bGiven the stated urgency, this should be treated as\s*/gi, 'This should be treated as ')
      .replace(/\bA likely progression is\s*/gi, 'The most likely path is ')
      .trim();
  }

  function _buildExecutiveScenarioSummary(assessment) {
    const structured = assessment.structuredScenario || {};
    const entity = assessment.buName || 'the organisation';
    const geographies = assessment.geography || 'the selected geographies';
    const asset = structured.assetService || assessment.guidedInput?.asset || '';
    const attack = structured.attackType || assessment.guidedInput?.cause || '';
    const effect = structured.effect || assessment.guidedInput?.impact || '';
    const rawNarrative = _cleanExecutiveNarrativeText(assessment.enhancedNarrative || assessment.narrative || assessment.scenarioText || '');

    const openingParts = [];
    if (entity) openingParts.push(`${entity}`);
    openingParts.push('is assessing an identity and access scenario');
    if (asset) openingParts.push(`centred on ${asset}`);
    let opening = openingParts.join(' ');
    if (!opening.endsWith('.')) opening += '.';

    const sentencePool = [];
    if (attack) sentencePool.push(`The most likely trigger is ${String(attack).toLowerCase()}.`);
    if (effect) sentencePool.push(`The main business consequence is ${String(effect).replace(/\.$/, '').toLowerCase()}.`);
    if (rawNarrative) {
      const cleanedSentences = rawNarrative
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => !/^the main consequence is /i.test(s))
        .filter(s => !/^it is most likely triggered by /i.test(s))
        .filter(s => !/^the scenario centres on /i.test(s));
      sentencePool.push(...cleanedSentences);
    }

    const deduped = [];
    const seen = new Set();
    for (const sentence of sentencePool) {
      const normalised = sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!normalised || seen.has(normalised)) continue;
      seen.add(normalised);
      deduped.push(sentence.replace(/^([a-z])/, (_, c) => c.toUpperCase()));
      if (deduped.length >= 3) break;
    }

    const geographySentence = geographies ? `This assessment is being considered across ${geographies}.` : '';
    return [opening, ...deduped, geographySentence]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim();
  }


  function _buildExecutiveDecisionSupport(assessment, results, intelligence) {
    const confidence = intelligence?.confidence || null;
    const drivers = intelligence?.drivers || { upward: [], stabilisers: [] };
    const strongestUpward = drivers.upward?.[0] || '';
    const strongestStabiliser = drivers.stabilisers?.[0] || '';

    if (results.toleranceBreached) {
      return {
        decision: 'Escalate and reduce now',
        rationale: 'The scenario is already above tolerance on a severe single-event basis, so leadership should treat it as an active risk reduction decision rather than a monitoring case.',
        priority: strongestUpward || 'The severe-event loss estimate is above tolerance and needs direct treatment focus.',
        managementFocus: strongestStabiliser
          ? `Preserve the controls that are currently helping, but focus immediate action on the main upward driver. ${strongestStabiliser}`
          : 'Focus the next management discussion on the biggest upward driver and the fastest credible reduction lever.'
      };
    }
    if (results.nearTolerance || results.annualReviewTriggered) {
      return {
        decision: 'Actively reduce and review',
        rationale: 'The scenario is not yet above tolerance, but it is close enough to justify named actions, management review, and a clear reduction plan before exposure worsens.',
        priority: strongestUpward || 'The current estimate is being pushed up by one or two material assumptions that should be challenged and improved.',
        managementFocus: confidence?.label === 'Low confidence'
          ? 'Reduce the exposure, but also improve the evidence behind the estimate before relying on it for long-term decisions.'
          : (strongestStabiliser || 'Use the current control position as the baseline and test which action would move the result down fastest.')
      };
    }
    return {
      decision: 'Monitor and improve selectively',
      rationale: 'The scenario is currently within tolerance, so the priority is to preserve the stabilisers, watch for change, and improve the most material weak point before it becomes urgent.',
      priority: strongestUpward || 'Use this as a monitored scenario and challenge the assumptions that could move it upward fastest.',
      managementFocus: strongestStabiliser || 'Keep the strongest current control in place and refresh the assessment if the threat picture, geography, or business dependence changes.'
    };
  }

  // ─── JSON Export ─────────────────────────────────────────
  function exportJSON(assessment) {
    const blob = new Blob([JSON.stringify(assessment, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `G42_RiskAssessment_${assessment.id || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Print-Ready HTML Report ─────────────────────────────
  // [EXPORT-INTEGRATION] Replace with jsPDF + autoTable for true PDF
  function exportPDF(assessment, currency = 'USD', fxRate = 3.6725) {
    const r = assessment.results;
    const fmt = v => _formatCurrency(v, currency, fxRate);
    const d = new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' });
    const statusClass = r.toleranceBreached ? 'above' : r.nearTolerance ? 'warning' : 'within';
    const statusTitle = r.toleranceBreached ? 'Needs leadership action' : r.nearTolerance ? 'Needs management attention' : 'Within current tolerance';
    const executiveHeadline = r.toleranceBreached
      ? 'This scenario is above tolerance and needs leadership attention now.'
      : r.nearTolerance
        ? 'This scenario is close to tolerance and should be actively managed before it escalates.'
        : 'This scenario is within tolerance today, but should stay under active monitoring.';
    const executiveAction = r.toleranceBreached
      ? 'Escalate to the accountable executive, confirm an owner, and agree immediate treatment actions.'
      : r.nearTolerance
        ? 'Agree targeted reduction actions and management review before the scenario moves above tolerance.'
        : 'Maintain controls, monitor change signals, and revisit the scenario if threat, exposure, or scope changes.';
    const annualView = r.annualReviewTriggered
      ? `Annual exposure is material at ${fmt(r.ale.p90)} on a severe-but-plausible basis, so it also merits annual leadership review.`
      : `Annual exposure is ${fmt(r.ale.p90)} on a severe-but-plausible basis, which stays below the annual review trigger.`;
    const exceedancePct = ((r.toleranceDetail?.lmExceedProb || 0) * 100).toFixed(1);
    const completed = new Date(assessment.completedAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' });
    const narrative = _buildExecutiveScenarioSummary(assessment) || 'No scenario narrative available.';
    const risks = Array.isArray(assessment.selectedRisks) ? assessment.selectedRisks : [];
    const regulations = Array.isArray(assessment.applicableRegulations) ? assessment.applicableRegulations : [];
    const citations = Array.isArray(assessment.citations)
      ? Array.from(new Map(assessment.citations.map(c => [c.docId || c.title, c])).values())
      : [];
    const recommendations = Array.isArray(assessment.recommendations) ? assessment.recommendations : [];
    const technicalInputs = r.inputs || assessment.fairParams || {};
    const intelligence = assessment.assessmentIntelligence || null;
    const executiveDecision = _buildExecutiveDecisionSupport(assessment, r, intelligence);
    const confidence = intelligence?.confidence || null;
    const drivers = intelligence?.drivers || null;
    const assumptions = Array.isArray(intelligence?.assumptions) ? intelligence.assumptions : [];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Risk Quantifier — ${assessment.scenarioTitle || 'Assessment'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: 'DM Sans', sans-serif; color: #172033; background: #f5f7fb; }
  .page { max-width: 980px; margin: 0 auto; padding: 36px; }
  .sheet { background: #ffffff; border: 1px solid #d8e0ea; border-radius: 22px; padding: 34px; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08); }
  .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 28px; }
  .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #6c7892; margin-bottom: 6px; }
  h1, h2, h3 { font-family: 'Syne', sans-serif; margin: 0; color: #10203b; }
  h1 { font-size: 30px; line-height: 1.05; max-width: 14ch; }
  h2 { font-size: 18px; margin-bottom: 14px; }
  h3 { font-size: 15px; margin-bottom: 8px; }
  .meta { margin-top: 8px; color: #5b667d; font-size: 13px; }
  .tagline { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #7a859d; border: 1px solid #d8e0ea; border-radius: 999px; padding: 8px 12px; }
  .hero { display: grid; grid-template-columns: 1.7fr .9fr; gap: 24px; padding: 26px; border-radius: 20px; border: 1px solid #d8e0ea; background: #fbfcfe; }
  .hero.above { box-shadow: inset 0 0 0 1px rgba(220, 38, 38, 0.18); }
  .hero.warning { box-shadow: inset 0 0 0 1px rgba(217, 119, 6, 0.18); }
  .hero.within { box-shadow: inset 0 0 0 1px rgba(5, 150, 105, 0.18); }
  .hero-copy { font-size: 15px; line-height: 1.8; color: #475066; margin-top: 14px; }
  .badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
  .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 11px; font-size: 11px; font-weight: 700; border: 1px solid transparent; }
  .badge.neutral { background: #f3f5f9; border-color: #d8e0ea; color: #53607a; }
  .badge.danger { background: #fee2e2; border-color: #fecaca; color: #b91c1c; }
  .badge.warning { background: #fef3c7; border-color: #fcd34d; color: #b45309; }
  .badge.success { background: #d1fae5; border-color: #6ee7b7; color: #047857; }
  .signal { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  .signal-ring { width: 136px; height: 136px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at center, rgba(16, 24, 40, 0.03), transparent 70%); }
  .signal-ring.above { box-shadow: 0 0 0 16px rgba(220, 38, 38, 0.08), inset 0 0 0 1px rgba(220, 38, 38, 0.24); }
  .signal-ring.warning { box-shadow: 0 0 0 16px rgba(217, 119, 6, 0.08), inset 0 0 0 1px rgba(217, 119, 6, 0.24); }
  .signal-ring.within { box-shadow: 0 0 0 16px rgba(5, 150, 105, 0.08), inset 0 0 0 1px rgba(5, 150, 105, 0.24); }
  .signal-inner { width: 86px; height: 86px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #ffffff; font-size: 36px; }
  .signal-copy { font-size: 13px; color: #53607a; line-height: 1.6; max-width: 18ch; }
  .metric-grid, .decision-grid, .summary-grid, .appendix-grid { display: grid; gap: 16px; margin-top: 22px; }
  .metric-grid { grid-template-columns: repeat(3, 1fr); }
  .decision-grid, .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .appendix-grid { grid-template-columns: repeat(3, 1fr); }
  .card { background: #ffffff; border: 1px solid #d8e0ea; border-radius: 18px; padding: 18px 20px; }
  .metric-label, .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #7a859d; }
  .metric-value { font-family: 'Syne', sans-serif; font-size: 30px; line-height: 1; color: #10203b; margin-top: 10px; }
  .metric-value.warning { color: #b45309; }
  .metric-value.danger { color: #b91c1c; }
  .metric-copy, .body-copy { margin-top: 10px; font-size: 13px; line-height: 1.8; color: #4b5565; }
  .decision-row + .decision-row { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e6ebf2; }
  .threshold-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #e6ebf2; color: #4b5565; font-size: 13px; }
  .threshold-row:last-child { border-bottom: 0; }
  .threshold-row strong { font-family: 'Syne', sans-serif; font-size: 18px; color: #10203b; }
  .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .chip { display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px; background: #f3f5f9; border: 1px solid #d8e0ea; font-size: 11px; color: #53607a; }
  .chip.gold { background: rgba(180,138,70,0.1); border-color: rgba(180,138,70,0.24); color: #8a6a33; }
  .priority-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 14px; }
  .priority { border: 1px solid #d8e0ea; border-radius: 18px; padding: 16px; background: #fff; }
  .priority-no { width: 30px; height: 30px; border-radius: 50%; background: #eaf0f7; color: #2d4f77; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 700; margin-bottom: 12px; }
  .priority-title { font-family: 'Syne', sans-serif; font-size: 16px; color: #10203b; }
  .priority-copy { font-size: 13px; color: #4b5565; line-height: 1.7; margin-top: 8px; }
  .priority-impact { margin-top: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #047857; }
  .driver-block + .driver-block { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e6ebf2; }
  .driver-label, .assumption-label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #7a859d; }
  .assumptions-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 14px; }
  .assumption-card { border: 1px solid #d8e0ea; border-radius: 18px; padding: 16px; background: #fff; }
  .assumption-copy { font-size: 13px; line-height: 1.7; color: #4b5565; margin-top: 8px; }
  .section { margin-top: 30px; }
  .section-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
  .appendix { margin-top: 38px; padding-top: 26px; border-top: 2px solid #d8e0ea; }
  .small { font-size: 12px; color: #697487; }
  .footer { margin-top: 34px; padding-top: 16px; border-top: 1px solid #e6ebf2; font-size: 11px; line-height: 1.7; color: #7a859d; }
  @media print {
    body { background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 0; max-width: none; }
    .sheet { box-shadow: none; border: 0; border-radius: 0; padding: 18px; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="sheet">
      <div class="header">
        <div>
          <div class="eyebrow">Risk Quantifier report</div>
          <h1>${assessment.scenarioTitle || 'Risk Assessment'}</h1>
          <div class="meta">${assessment.buName || '—'} · ${assessment.geography || '—'} · ${completed}</div>
        </div>
        <div class="tagline">PoC report · executive version</div>
      </div>

      <div class="hero ${statusClass}">
        <div>
          <div class="eyebrow">Assessment outcome</div>
          <h2 style="font-size:32px;line-height:1.08;max-width:14ch">${executiveHeadline}</h2>
          <div class="hero-copy">${r.toleranceBreached
            ? `Per-event P90 ${fmt(r.lm.p90)} is above the tolerance threshold of ${fmt(r.threshold)}.`
            : r.nearTolerance
              ? `Per-event P90 ${fmt(r.lm.p90)} is above the warning trigger of ${fmt(r.warningThreshold)} but still below tolerance.`
              : `Per-event P90 ${fmt(r.lm.p90)} remains below the warning trigger of ${fmt(r.warningThreshold)}.`} ${annualView}</div>
          <div class="badge-row">
            <span class="badge ${r.toleranceBreached ? 'danger' : r.nearTolerance ? 'warning' : 'success'}">${statusTitle}</span>
            <span class="badge neutral">${assessment.buName || 'No business unit'}</span>
            <span class="badge neutral">${assessment.geography || 'No geography'}</span>
            <span class="badge neutral">${d}</span>
          </div>
        </div>
        <div class="signal">
          <div class="signal-ring ${statusClass}"><div class="signal-inner">${r.toleranceBreached ? '!' : r.nearTolerance ? '!' : '✓'}</div></div>
          <div class="signal-copy">${exceedancePct}% chance of breaching tolerance in the modelled distribution</div>
        </div>
      </div>

      <div class="metric-grid">
        <div class="card">
          <div class="metric-label">Potential impact from one serious event</div>
          <div class="metric-value ${r.toleranceBreached ? 'danger' : ''}">${fmt(r.lm.p90)}</div>
          <div class="metric-copy">Use this as the serious single-event view when discussing tolerance and escalation.</div>
        </div>
        <div class="card">
          <div class="metric-label">Most likely impact over a year</div>
          <div class="metric-value">${fmt(r.ale.mean)}</div>
          <div class="metric-copy">Use this as the most likely yearly view if conditions stay broadly the same.</div>
        </div>
        <div class="card">
          <div class="metric-label">High-stress impact over a year</div>
          <div class="metric-value warning">${fmt(r.ale.p90)}</div>
          <div class="metric-copy">Use this as the more severe yearly view for resilience, capital, and escalation discussions.</div>
        </div>
      </div>

      <div class="decision-grid">
        <div class="card">
          <div class="section-label">Recommended management decision</div>
          <div class="decision-row"><div class="section-label">Decision</div><div class="body-copy">${executiveDecision.decision}</div></div>
          <div class="decision-row"><div class="section-label">Why this is the right call now</div><div class="body-copy">${executiveDecision.rationale}</div></div>
          <div class="decision-row"><div class="section-label">What should happen now</div><div class="body-copy">${executiveAction}</div></div>
          <div class="decision-row"><div class="section-label">Main priority</div><div class="body-copy">${executiveDecision.priority}</div></div>
          <div class="decision-row"><div class="section-label">Management focus area</div><div class="body-copy">${executiveDecision.managementFocus}</div></div>
        </div>
        <div class="card">
          <div class="section-label">Threshold position</div>
          <div class="threshold-row"><span>Warning trigger</span><strong>${fmt(r.warningThreshold || r.threshold)}</strong></div>
          <div class="threshold-row"><span>Tolerance threshold</span><strong>${fmt(r.threshold)}</strong></div>
          <div class="threshold-row"><span>Annual review trigger</span><strong>${fmt(r.annualReviewThreshold || r.ale.p90)}</strong></div>
          <div class="decision-row"><div class="section-label">Why this matters now</div><div class="body-copy">${r.portfolioMeta?.linked ? `${r.selectedRiskCount || risks.length || 1} linked risks are being treated as one connected scenario.` : `${r.selectedRiskCount || risks.length || 1} risks are being assessed together without linked uplift.`}</div></div>
          <div class="decision-row"><div class="section-label">Escalation guidance</div><div class="body-copy">${(typeof getEffectiveSettings === 'function' ? getEffectiveSettings().escalationGuidance : '') || 'Escalate when the scenario is above tolerance, close to tolerance, or materially affects regulated services.'}</div></div>
          <div class="body-copy">The report leads with the decision first and the supporting detail after it.</div>
        </div>
      </div>

      <div class="summary-grid">
        <div class="card">
          <div class="section-label">What this scenario means in practice</div>
          <div class="body-copy">${narrative}</div>
        </div>
        <div class="card">
          <div class="section-label">Scenario scope</div>
          <div class="chip-row">${risks.length ? risks.map(risk => `<span class="chip gold">${risk.title}</span>`).join('') : '<span class="chip">No linked risks selected</span>'}</div>
          ${regulations.length ? `<div class="chip-row">${regulations.map(tag => `<span class="chip">${tag}</span>`).join('')}</div>` : ''}
        </div>
      </div>

      ${confidence ? `
      <div class="decision-grid">
        <div class="card">
          <div class="section-label">How confident to be in this assessment</div>
          <div class="badge-row" style="margin-top:12px">
            <span class="badge ${confidence.label === 'High confidence' ? 'success' : confidence.label === 'Low confidence' ? 'danger' : 'warning'}">${confidence.label}</span>
            <span class="badge neutral">${confidence.score}/100</span>
          </div>
          <div class="body-copy">${confidence.summary}</div>
          ${confidence.reasons?.length ? `<div class="driver-block"><div class="driver-label">Why it scored this way</div><div class="body-copy">${confidence.reasons.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
          ${confidence.improvements?.length ? `<div class="driver-block"><div class="driver-label">What would improve confidence</div><div class="body-copy">${confidence.improvements.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
        </div>
        <div class="card">
          <div class="section-label">What is pushing the result up or down</div>
          ${drivers?.upward?.length ? `<div class="driver-block"><div class="driver-label">Main upward drivers</div><div class="body-copy">${drivers.upward.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
          ${drivers?.stabilisers?.length ? `<div class="driver-block"><div class="driver-label">Main stabilisers</div><div class="body-copy">${drivers.stabilisers.map(item => `• ${item}`).join('<br>')}</div></div>` : ''}
        </div>
      </div>` : ''}

      ${assumptions.length ? `
      <div class="section">
        <div class="section-header">
          <h2>Key assumptions to keep in mind</h2>
          <div class="small">Core modelling assumptions captured for review</div>
        </div>
        <div class="assumptions-grid">
          ${assumptions.map(item => `<div class="assumption-card"><div class="assumption-label">${item.category}</div><div class="assumption-copy">${item.text}</div></div>`).join('')}
        </div>
      </div>` : ''}

      ${recommendations.length ? `
      <div class="section">
        <div class="section-header">
          <h2>Priority actions</h2>
          <div class="small">Top treatments to reduce exposure</div>
        </div>
        <div class="priority-grid">
          ${recommendations.slice(0, 3).map((rec, idx) => `
            <div class="priority">
              <div class="priority-no">${idx + 1}</div>
              <div class="priority-title">${rec.title}</div>
              <div class="priority-copy">${rec.why}</div>
              <div class="priority-impact">${rec.impact}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="appendix">
        <div class="section-header">
          <h2>Technical appendix</h2>
          <div class="small">For analysts, validators, and audit trail</div>
        </div>

        <div class="appendix-grid">
          <div class="card">
            <div class="section-label">Typical event cost</div>
            <div class="metric-value" style="font-size:24px">${fmt(r.lm.p50)}</div>
            <div class="metric-copy">Midpoint single-event view.</div>
          </div>
          <div class="card">
            <div class="section-label">Expected event cost</div>
            <div class="metric-value" style="font-size:24px">${fmt(r.lm.mean)}</div>
            <div class="metric-copy">Average single-event loss.</div>
          </div>
          <div class="card">
            <div class="section-label">Severe annual exposure</div>
            <div class="metric-value warning" style="font-size:24px">${fmt(r.ale.p90)}</div>
            <div class="metric-copy">Annual severe-but-plausible view.</div>
          </div>
        </div>

        ${assessment.structuredScenario ? `
        <div class="section">
          <h3>Scenario details</h3>
          <div class="summary-grid">
            <div class="card"><div class="section-label">Asset / Service</div><div class="body-copy">${assessment.structuredScenario.assetService || '—'}</div></div>
            <div class="card"><div class="section-label">Threat community</div><div class="body-copy">${assessment.structuredScenario.threatCommunity || '—'}</div></div>
            <div class="card"><div class="section-label">Attack type</div><div class="body-copy">${assessment.structuredScenario.attackType || '—'}</div></div>
            <div class="card"><div class="section-label">Effect</div><div class="body-copy">${assessment.structuredScenario.effect || '—'}</div></div>
          </div>
        </div>` : ''}

        <div class="section">
          <h3>Simulation context</h3>
          <div class="summary-grid">
            <div class="card"><div class="section-label">TEF</div><div class="body-copy">${technicalInputs.tefMin ?? '—'} – ${technicalInputs.tefLikely ?? '—'} – ${technicalInputs.tefMax ?? '—'} events/year</div></div>
            <div class="card"><div class="section-label">Threat capability</div><div class="body-copy">${technicalInputs.threatCapMin ?? '—'} – ${technicalInputs.threatCapLikely ?? '—'} – ${technicalInputs.threatCapMax ?? '—'}</div></div>
            <div class="card"><div class="section-label">Control strength</div><div class="body-copy">${technicalInputs.controlStrMin ?? '—'} – ${technicalInputs.controlStrLikely ?? '—'} – ${technicalInputs.controlStrMax ?? '—'}</div></div>
            <div class="card"><div class="section-label">Iterations</div><div class="body-copy">${r.iterations.toLocaleString()}</div></div>
            <div class="card"><div class="section-label">Distribution</div><div class="body-copy">${r.distType || assessment.fairParams?.distType || 'triangular'}</div></div>
            <div class="card"><div class="section-label">Tolerance threshold</div><div class="body-copy">${fmt(r.threshold)}</div></div>
          </div>
        </div>

        ${citations.length ? `
        <div class="section">
          <h3>Internal citations</h3>
          <div class="chip-row">${citations.map(c => `<span class="chip">${c.title}</span>`).join('')}</div>
        </div>` : ''}
      </div>

      <div class="footer">
        Generated by Risk Quantifier PoC on ${d}. This report is intended for demonstration and structured discussion only. FAIR inputs and management conclusions should be validated through expert review before use in formal decision-making.
      </div>
    </div>
  </div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `Risk_Report_${assessment.id || Date.now()}.html`;
      a.click();
    }
    URL.revokeObjectURL(url);
  }


  // ─── PPTX Slide Spec (JSON) ───────────────────────────────
  // [EXPORT-INTEGRATION] Feed this into pptxgenjs to produce real PPTX
  // npm: pptxgenjs; CDN: https://cdn.jsdelivr.net/npm/pptxgenjs/dist/pptxgen.bundle.js
  function exportPPTXSpec(assessment, currency = 'USD', fxRate = 3.6725) {
    const r = assessment.results;
    const fmt = v => _formatCurrency(v, currency, fxRate);

    const slideSpec = {
      _note: 'Feed this JSON into pptxgenjs to generate a real PPTX. See README for integration instructions.',
      title: `G42 Cyber Risk Assessment: ${assessment.scenarioTitle || 'Assessment'}`,
      slides: [
        {
          slideIndex: 1,
          type: 'cover',
          title: assessment.scenarioTitle || 'Risk Assessment',
          subtitle: `Business Unit: ${assessment.buName || '—'}`,
          date: new Date().toLocaleDateString('en-AE'),
          footer: 'G42 Tech & Cyber Risk Quantifier | PoC'
        },
        {
          slideIndex: 2,
          type: 'executive_summary',
          title: 'Executive Summary',
          tolerance: r.toleranceBreached ? 'ABOVE TOLERANCE' : 'WITHIN TOLERANCE',
          toleranceColor: r.toleranceBreached ? '#dc2626' : '#059669',
          keyStats: [
            { label: 'Per-Event P90', value: fmt(r.lm.p90) },
            { label: 'Annual P90', value: fmt(r.ale.p90) },
            { label: 'Tolerance Threshold', value: fmt(r.threshold) },
            { label: 'Breach Probability', value: (r.toleranceDetail.lmExceedProb * 100).toFixed(1) + '%' }
          ]
        },
        {
          slideIndex: 3,
          type: 'loss_metrics',
          title: 'Loss Estimates — Monte Carlo Results',
          lmStats: r.lm,
          aleStats: r.ale,
          iterations: r.iterations,
          currency
        },
        {
          slideIndex: 4,
          type: 'scenario_details',
          title: 'Scenario Details',
          scenario: assessment.structuredScenario || {},
          narrative: (assessment.narrative || '').substring(0, 400)
        },
        {
          slideIndex: 5,
          type: 'recommendations',
          title: 'Recommended Risk Treatments',
          recommendations: (assessment.recommendations || []).slice(0, 4).map((r, i) => ({
            number: i + 1,
            title: r.title,
            impact: r.impact
          }))
        },
        {
          slideIndex: 6,
          type: 'disclaimer',
          title: 'Important Notes',
          points: [
            'This assessment uses Monte Carlo simulation of FAIR methodology inputs.',
            'Input ranges should be validated through expert elicitation for production decisions.',
            'Loss estimates are probabilistic, not deterministic.',
            `Assessment ID: ${assessment.id} | Generated: ${new Date().toLocaleDateString('en-AE')}`,
            'This is a Proof of Concept tool. Replace shared password auth with Entra ID before production use.'
          ]
        }
      ]
    };

    const blob = new Blob([JSON.stringify(slideSpec, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `G42_PPTX_Spec_${assessment.id || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return slideSpec;
  }

  return { exportJSON, exportPDF, exportPPTXSpec };
})();
