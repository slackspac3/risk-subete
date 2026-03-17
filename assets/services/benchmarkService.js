const BenchmarkService = (() => {
  let _benchmarks = [];

  function init(list) {
    _benchmarks = Array.isArray(list) ? list : [];
  }

  function _normalise(text) {
    return String(text || '').trim().toLowerCase();
  }

  function _detectScenarioType(query = '') {
    const q = _normalise(query);
    if (/gpu export|export control|export licence|export license|entity list|ear|bis|semiconductor equipment|china restrictions|sanctions breach/.test(q)) return 'export-control';
    if (/azure ad|entra|identity|credential|account takeover|sso|directory|mailbox compromise|session hijack/.test(q)) return 'identity';
    if (/ransom|encrypt|extortion/.test(q)) return 'ransomware';
    if (/cloud|storage bucket|misconfig|tenant|saas|public exposure/.test(q)) return 'cloud';
    if (/supplier|vendor|third party|third-party|supply chain|outsourcing/.test(q)) return 'third-party';
    if (/privacy|data breach|data exposure|pii|phi|privacy incident/.test(q)) return 'data-breach';
    return 'identity';
  }

  function _detectIndustry(businessUnit = {}, query = '') {
    const text = _normalise([
      businessUnit?.name,
      businessUnit?.contextSummary,
      businessUnit?.notes,
      ...(businessUnit?.criticalServices || []),
      ...(businessUnit?.dataTypes || []),
      query
    ].filter(Boolean).join(' '));
    if (/health|patient|hospital|clinical|medical|phi/.test(text)) return 'healthcare';
    if (/bank|finance|payment|treasury|trading|fintech/.test(text)) return 'financial services';
    if (/semiconductor|gpu|chip|chips|foundry|eda|wafer|fab|export control/.test(text)) return 'semiconductor';
    if (/manufacturing|plant|factory|ot|ics/.test(text)) return 'manufacturing';
    return 'cross-sector';
  }

  function _detectGeographyLabels(geography = '') {
    const raw = Array.isArray(geography) ? geography.join(',') : String(geography || '');
    const text = _normalise(raw);
    const labels = ['Global'];
    if (/united arab emirates|uae/.test(text)) labels.unshift('United Arab Emirates');
    if (/middle east/.test(text)) labels.unshift('Middle East');
    if (/gcc|gulf/.test(text) || /united arab emirates|uae|saudi|qatar|oman|kuwait|bahrain/.test(text)) labels.unshift('GCC');
    return Array.from(new Set(labels));
  }

  function _score(entry, scenarioType, industry, geographyLabels) {
    let score = 0;
    if (entry.scenarioType === scenarioType) score += 10;
    if ((entry.industries || []).includes(industry)) score += 5;
    if ((entry.industries || []).includes('cross-sector')) score += 2;
    const labels = geographyLabels || [];
    if (labels.some(label => (entry.geographies || []).includes(label))) score += 6;
    if ((entry.scope || '') === 'regional' && labels.some(label => label !== 'Global')) score += 3;
    if ((entry.scope || '') === 'global') score += 1;
    return score;
  }

  function _parseYear(lastUpdated = '') {
    const yearMatch = String(lastUpdated || '').match(/(20\d{2})/);
    return yearMatch ? Number(yearMatch[1]) : 0;
  }

  function _getCurrentYear() {
    return new Date().getFullYear();
  }

  function _humaniseSourceType(sourceType = '') {
    const value = _normalise(sourceType);
    if (value === 'official') return 'Official report';
    if (value === 'regulatory') return 'Regulatory source';
    if (value === 'industry') return 'Industry research';
    if (value === 'internal') return 'Internal source';
    if (value === 'regional') return 'Regional research';
    return value ? `${sourceType}` : 'Published source';
  }

  function retrieveRelevantBenchmarks({ query = '', geography = '', businessUnit = null, topK = 3 } = {}) {
    const scenarioType = _detectScenarioType(query);
    const industry = _detectIndustry(businessUnit || {}, query);
    const geographyLabels = _detectGeographyLabels(geography || businessUnit?.geography || '');
    return _benchmarks
      .map(entry => ({
        ...entry,
        score: _score(entry, scenarioType, industry, geographyLabels),
        scenarioMatch: scenarioType,
        industryMatch: industry,
        geographyMatch: geographyLabels.find(label => (entry.geographies || []).includes(label)) || 'Global'
      }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  function deriveSuggestedInputs(entries = []) {
    const top = Array.isArray(entries) ? entries[0] : null;
    if (!top?.suggestedInputs) return null;
    return JSON.parse(JSON.stringify(top.suggestedInputs));
  }

  function summariseBenchmarkBasis(entries = []) {
    if (!entries.length) return '';
    const primary = entries[0];
    const fallback = entries[1];
    const parts = [
      `${primary.scope === 'regional' ? 'Regional' : primary.scope === 'global' ? 'Global' : 'Industry'} benchmark logic was applied using ${primary.sourceTitle}.`
    ];
    if (fallback) parts.push(`A secondary ${fallback.scope} comparator from ${fallback.sourceTitle} was used as a fallback cross-check.`);
    return parts.join(' ');
  }

  function buildPromptBlock(entries = []) {
    if (!entries.length) return 'No structured numeric benchmark entries were matched for this scenario.';
    return entries.map((entry, idx) => {
      const inputs = entry.suggestedInputs || {};
      const loss = inputs.lossComponents || {};
      return [
        `${idx + 1}. ${entry.title}`,
        `Scope: ${entry.scope} | Geography match: ${entry.geographyMatch} | Industry match: ${entry.industryMatch}`,
        `Source: ${entry.sourceTitle}`,
        `TEF: ${inputs.TEF ? `${inputs.TEF.min}/${inputs.TEF.likely}/${inputs.TEF.max}` : 'n/a'}`,
        `Threat capability: ${inputs.threatCapability ? `${inputs.threatCapability.min}/${inputs.threatCapability.likely}/${inputs.threatCapability.max}` : 'n/a'}`,
        `Control strength: ${inputs.controlStrength ? `${inputs.controlStrength.min}/${inputs.controlStrength.likely}/${inputs.controlStrength.max}` : 'n/a'}`,
        `Business interruption: ${loss.businessInterruption ? `${loss.businessInterruption.min}/${loss.businessInterruption.likely}/${loss.businessInterruption.max}` : 'n/a'}`,
        `Regulatory and legal: ${loss.regulatoryLegal ? `${loss.regulatoryLegal.min}/${loss.regulatoryLegal.likely}/${loss.regulatoryLegal.max}` : 'n/a'}`,
        `Notes: ${entry.summary || ''}`
      ].join('\n');
    }).join('\n\n');
  }


  function _deriveFreshnessLabel(lastUpdated = '') {
    const year = _parseYear(lastUpdated);
    if (!year) return 'Date unknown';
    const currentYear = _getCurrentYear();
    const age = currentYear - year;
    if (age <= 1) return 'Recent source';
    if (age <= 3) return 'Established source';
    return 'Older source';
  }

  function _deriveConfidenceLabel(entry = {}) {
    if (entry.sourceType === 'regulatory') return 'High confidence';
    if (entry.sourceType === 'official' && (entry.scope === 'regional' || entry.scope === 'industry')) return 'High confidence';
    if (entry.sourceType === 'official') return 'Strong reference';
    if (entry.scope === 'regional' || entry.scope === 'industry') return 'Good fit';
    return 'Fallback reference';
  }

  function buildReferenceList(entries = []) {
    return (Array.isArray(entries) ? entries : []).map(entry => ({
      id: entry.id,
      title: entry.title,
      sourceTitle: entry.sourceTitle,
      sourceType: entry.sourceType,
      scope: entry.scope,
      geography: entry.geographyMatch || 'Global',
      url: entry.sourceUrl,
      summary: entry.summary || '',
      lastUpdated: entry.lastUpdated || '',
      sourceTypeLabel: _humaniseSourceType(entry.sourceType),
      freshnessLabel: _deriveFreshnessLabel(entry.lastUpdated),
      confidenceLabel: _deriveConfidenceLabel(entry)
    }));
  }

  function buildInputProvenance(entries = []) {
    const primary = Array.isArray(entries) && entries.length ? entries[0] : null;
    if (!primary) return [];
    const origin = primary.scope === 'regional' ? 'Regional benchmark' : primary.scope === 'global' ? 'Global benchmark' : primary.scope === 'industry' ? 'Industry benchmark' : 'Official benchmark';
    const reason = primary.summary || 'Starting values aligned to the closest structured benchmark profile for this scenario.';
    const sourceTitle = primary.sourceTitle || '';
    const lastUpdated = primary.lastUpdated || '';
    const sourceTypeLabel = _humaniseSourceType(primary.sourceType);
    const freshnessLabel = _deriveFreshnessLabel(lastUpdated);
    const confidenceLabel = _deriveConfidenceLabel(primary);
    return [
      { label: 'Event frequency', origin, scope: primary.scope, reason, sourceTitle, sourceTypeLabel, lastUpdated, freshnessLabel, confidenceLabel },
      { label: 'Threat capability and control strength', origin, scope: primary.scope, reason: 'Exposure starting points were aligned to the same benchmark profile before BU and user context were applied.', sourceTitle, sourceTypeLabel, lastUpdated, freshnessLabel, confidenceLabel },
      { label: 'Business disruption cost', origin, scope: primary.scope, reason: 'The business interruption range was seeded from the closest published benchmark profile for this scenario type.', sourceTitle, sourceTypeLabel, lastUpdated, freshnessLabel, confidenceLabel },
      { label: 'Regulatory and legal cost', origin, scope: primary.scope, reason: 'The regulatory and legal range was seeded from the same benchmark profile and is intended as a challengeable starting point.', sourceTitle, sourceTypeLabel, lastUpdated, freshnessLabel, confidenceLabel }
    ];
  }

  return {
    init,
    retrieveRelevantBenchmarks,
    deriveSuggestedInputs,
    summariseBenchmarkBasis,
    buildPromptBlock,
    buildReferenceList,
    buildInputProvenance
  };
})();
