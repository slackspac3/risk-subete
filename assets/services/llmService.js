/**
 * llmService.js — LLM service (Core42 Compass + local stub)
 *
 * Compass API (proxied through Vercel by default):
 *   POST https://risk-calculator-eight.vercel.app/api/compass
 *   Authorization: Bearer <COMPASS_API_KEY>
 *
 * Do not hard-code real keys in this file.
 * Set them at runtime only for local testing, or call Compass through a secure proxy.
 */

const LLMService = (() => {

  function resolveCompassApiUrl() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (origin && origin.includes('vercel.app')) return `${origin}/api/compass`;
    return 'https://risk-calculator-eight.vercel.app/api/compass';
  }

  const DEFAULT_COMPASS_API_URL = resolveCompassApiUrl();
  const DEFAULT_COMPASS_MODEL = 'gpt-5.1';
  let _compassApiUrl = DEFAULT_COMPASS_API_URL;
  let _compassModel = DEFAULT_COMPASS_MODEL;
  let _compassApiKey = '';

  function setCompassAPIKey(key) {
    _compassApiKey = key || '';
  }

  function setCompassConfig({ apiKey, apiUrl, model } = {}) {
    if (typeof apiKey === 'string') _compassApiKey = apiKey;
    if (typeof apiUrl === 'string' && apiUrl.trim()) _compassApiUrl = apiUrl.trim();
    if (typeof model === 'string' && model.trim()) _compassModel = model.trim();
  }

  function clearCompassConfig() {
    _compassApiUrl = DEFAULT_COMPASS_API_URL;
    _compassModel = DEFAULT_COMPASS_MODEL;
    _compassApiKey = '';
  }

  function _getCompanyContextUrl() {
    if (_isDirectCompassUrl(_compassApiUrl)) return '';
    try {
      const url = new URL(_compassApiUrl);
      if (url.pathname.endsWith('/api/compass')) {
        url.pathname = url.pathname.replace(/\/api\/compass$/, '/api/company-context');
        return url.toString();
      }
      return new URL('/api/company-context', _compassApiUrl).toString();
    } catch {
      return '';
    }
  }

  // Backwards-compatible alias for older setup instructions.
  function setOpenAIKey(key) {
    setCompassAPIKey(key);
  }

  function _normaliseLLMError(error) {
    const msg = String(error?.message || error || '');
    if (msg === 'Failed to fetch' || /NetworkError/i.test(msg)) {
      return new Error('Compass preflight/CORS blocked. The browser could not complete the cross-origin request to api.core42.ai.');
    }
    if (/LLM API error 400/i.test(msg)) {
      return new Error(msg);
    }
    if (/LLM API error 401|LLM API error 403/i.test(msg)) {
      return new Error('Compass rejected the request. Check the API key, permissions, and model access.');
    }
    return error instanceof Error ? error : new Error(msg);
  }

  function _isDirectCompassUrl(url) {
    try {
      return new URL(url).hostname === 'api.core42.ai';
    } catch {
      return false;
    }
  }

  function _extractRiskCandidates(text) {
    const source = String(text || '').toLowerCase();
    const catalog = [
      { title: 'Ransomware disruption of critical services', category: 'Cyber', regulations: ['UAE PDPL', 'UAE NESA IAS'] },
      { title: 'Cloud misconfiguration exposing sensitive data', category: 'Cloud', regulations: ['UAE PDPL', 'ISO 27001'] },
      { title: 'Third-party compromise through supplier access', category: 'Third Party', regulations: ['UAE Cybersecurity Council Guidance'] },
      { title: 'Export control or sanctions compliance breach', category: 'Regulatory', regulations: ['BIS Export Controls', 'OFAC Sanctions'] },
      { title: 'Insider misuse of privileged access', category: 'Insider Threat', regulations: ['UAE PDPL'] },
      { title: 'Fraud or payment manipulation event', category: 'Financial Crime', regulations: ['UAE AML/CFT'] },
      { title: 'Technology outage affecting core business services', category: 'Operational Resilience', regulations: ['UAE NESA IAS'] }
    ];
    const hits = catalog.filter(item =>
      (source.includes('ransom') && item.title.toLowerCase().includes('ransom'))
      || (source.includes('cloud') && item.title.toLowerCase().includes('cloud'))
      || ((source.includes('supplier') || source.includes('vendor') || source.includes('third')) && item.title.toLowerCase().includes('third-party'))
      || ((source.includes('export') || source.includes('sanction') || source.includes('bis')) && item.title.toLowerCase().includes('export control'))
      || ((source.includes('insider') || source.includes('privileged')) && item.title.toLowerCase().includes('insider'))
      || ((source.includes('fraud') || source.includes('payment') || source.includes('invoice')) && item.title.toLowerCase().includes('fraud'))
      || ((source.includes('outage') || source.includes('availability') || source.includes('disruption')) && item.title.toLowerCase().includes('outage'))
      || ((source.includes('breach') || source.includes('data')) && item.title.toLowerCase().includes('sensitive data'))
    );
    return hits.length ? hits : [{ title: 'Material technology and cyber risk requiring structured assessment', category: 'General', regulations: [] }];
  }

  // ─── Real API call (when keys are available) ─────────────
  async function _callLLM(systemPrompt, userPrompt, options = {}) {
    const directCompass = _isDirectCompassUrl(_compassApiUrl);
    if (directCompass && !_compassApiKey) return null; // fall through to stub

    const timeoutMs = Number(options.timeoutMs || 30000);
    const maxCompletionTokens = Number(options.maxCompletionTokens || 1200);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId = null;

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (_compassApiKey) {
        headers.Authorization = `Bearer ${_compassApiKey}`;
      }
      const fetchPromise = (async () => {
        const res = await fetch(_compassApiUrl, {
          method: 'POST',
          headers,
          signal: controller?.signal,
          body: JSON.stringify({
            model: _compassModel,
            max_completion_tokens: maxCompletionTokens,
            temperature: 0.3,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt }
            ]
          })
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`LLM API error ${res.status}: ${errText}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
      })();
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          try { controller?.abort(); } catch {}
          reject(new Error('AI assist timed out. Try again, shorten the prompt, or check the model configuration.'));
        }, timeoutMs);
      });
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      const message = String(error?.message || error || '');
      if (error?.name === 'AbortError' || /timed out/i.test(message)) {
        throw new Error('AI assist timed out. Try again, shorten the prompt, or check the model configuration.');
      }
      throw _normaliseLLMError(error);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // ─── Stub generator ──────────────────────────────────────
  function _normaliseSentenceKey(sentence = '') {
    return String(sentence || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _dedupeSentences(text = '') {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const sentences = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    return sentences.filter((sentence) => {
      const key = _normaliseSentenceKey(sentence);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join(' ').trim();
  }

  function _titleCaseWord(word = '') {
    const value = String(word || '').trim();
    if (!value) return '';
    if (/^[A-Z0-9&/+.-]+$/.test(value)) return value;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  function _toDisplayLabel(value = '') {
    return String(value || '')
      .split(/[\s_-]+/)
      .map(_titleCaseWord)
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  function _joinList(items = []) {
    const values = Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean)));
    if (!values.length) return '';
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
  }


  function _truncateText(value = '', maxChars = 600) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
  }

  function _compactHistory(history = [], limit = 4) {
    return (Array.isArray(history) ? history : [])
      .slice(-limit)
      .map((entry) => ({
        role: entry?.role === 'assistant' ? 'assistant' : 'user',
        text: _truncateText(entry?.text || '', 280)
      }));
  }


  function _buildUploadedDocumentBlock(input = {}) {
    const uploadedText = _truncateText(input.uploadedText || '', 1400);
    if (!uploadedText) return 'Uploaded supporting documents\n(none)';
    const label = String(input.uploadedDocumentName || 'source material').trim() || 'source material';
    return `Uploaded supporting documents (${label}):\n${uploadedText}`;
  }

  function _stripScenarioLeadIns(value = '') {
    let text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    text = text
      .replace(/^in [^.]+?,\s*[^.]+? faces a material [^.]+? scenario in which\s*/i, '')
      .replace(/^in [^.]+?,\s*[^.]+? faces a material risk scenario in which\s*/i, '')
      .replace(/^a risk scenario is being assessed where\s*/i, '')
      .replace(/^the scenario is that\s*/i, '')
      .replace(/^scenario:\s*/i, '')
      .replace(/^risk statement:\s*/i, '')
      .trim();
    return text.replace(/^[,:;\-\s]+/, '').trim();
  }

  function _ensureSentence(text = '') {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '';
    return /[.!?]$/.test(value) ? value : `${value}.`;
  }

  function _buildScenarioLead({ geography = '', businessUnit = '', asset = '', cause = '', impact = '', scenarioLabel = 'risk scenario' } = {}) {
    const place = geography ? `Across ${geography}` : 'Across the selected operating footprint';
    const org = businessUnit || 'the business unit';
    const focus = asset ? `${scenarioLabel} affecting ${asset}` : scenarioLabel;
    const causeText = cause ? `The most credible initial path is ${cause.toLowerCase()}` : '';
    const impactText = impact ? `The likely business effect is ${impact.toLowerCase()}` : '';
    return _ensureSentence([`${place}, ${org} could face a material ${focus}`.replace(/\s+/g, ' ').trim(), causeText, impactText].filter(Boolean).join(' '));
  }

  function _isGenericRiskTitle(title = '') {
    const value = _normaliseSentenceKey(title);
    return [
      'material technology and cyber risk requiring structured assessment',
      'technology outage affecting core business services',
      'general cyber threat',
      'material cyber risk',
      'cyber incident',
      'material operational risk'
    ].includes(value);
  }

  function _classifyEvidenceSource(source = {}) {
    const title = String(source.title || source.note || '').toLowerCase();
    const excerpt = String(source.excerpt || source.description || '').toLowerCase();
    const url = String(source.url || source.link || '').toLowerCase();
    const combined = `${title} ${excerpt} ${url}`;
    if (/uploaded|internal|register|assessment|workshop|interview|evidence/.test(combined)) return 'internal';
    if (/company website|official|newsroom|leadership|governance|privacy|responsible ai|trust|about/.test(combined)) return 'official';
    if (/regulat|policy|guidance|government|ministry|authority|law|pdpl|gdpr|ofac|bis|cybersecurity council/.test(combined)) return 'regulatory';
    if (/local uae|gcc|regional|thenationalnews|gulfnews|khaleejtimes|zawya|arabianbusiness|gulfbusiness/.test(combined)) return 'regional';
    if (/bloomberg|reuters|financial times|ft.com|wsj|cnbc|forbes|techcrunch|semafor/.test(combined)) return 'global';
    return 'external';
  }

  function _buildEvidenceMeta(options = {}) {
    const citations = Array.isArray(options.citations) ? options.citations : [];
    const counts = { official: 0, regulatory: 0, regional: 0, global: 0, internal: 0, external: 0 };
    citations.forEach((item) => {
      const kind = _classifyEvidenceSource(item);
      counts[kind] = (counts[kind] || 0) + 1;
    });
    const hasBuContext = Boolean(options.businessUnit?.contextSummary || options.businessUnit?.notes || options.businessUnit?.aiGuidance || options.businessUnit?.criticalServices?.length || options.adminSettings?.businessUnitContext || options.adminSettings?.departmentContext);
    const hasOrgContext = Boolean(options.organisationContext || options.businessUnit?.companyStructureContext || options.adminSettings?.companyContextProfile || options.adminSettings?.companyStructureContext || options.adminSettings?.inheritedContextSummary);
    const hasUserContext = Boolean(options.userProfile || options.businessUnit?.userProfileSummary || options.adminSettings?.userProfileSummary || options.adminSettings?.personalContextSummary);
    const hasUploadedText = Boolean(String(options.uploadedText || '').trim());
    const hasRegisterText = Boolean(String(options.registerText || '').trim());
    const hasGeography = Boolean(String(options.geography || options.businessUnit?.geography || options.adminSettings?.geography || '').trim());
    const hasRegulations = Boolean((options.businessUnit?.regulatoryTags || options.applicableRegulations || options.adminSettings?.applicableRegulations || []).length);

    let score = 0;
    score += hasBuContext ? 2 : 0;
    score += hasOrgContext ? 2 : 0;
    score += hasUserContext ? 1 : 0;
    score += hasUploadedText ? 2 : 0;
    score += hasRegisterText ? 2 : 0;
    score += hasGeography ? 1 : 0;
    score += hasRegulations ? 1 : 0;
    score += Math.min(2, counts.official);
    score += Math.min(2, counts.regulatory);
    score += Math.min(1, counts.regional + counts.global + counts.external);

    const missingInformation = [];
    if (!hasBuContext) missingInformation.push('BU or function context is still thin.');
    if (!hasGeography) missingInformation.push('Geographic scope is not well defined.');
    if (!hasRegulations) missingInformation.push('Relevant regulatory references are limited or missing.');
    if (!hasUploadedText && !hasRegisterText && counts.internal === 0) missingInformation.push('No internal documents or uploaded evidence were provided.');
    if ((counts.official + counts.regulatory + counts.regional + counts.global + counts.external) === 0) missingInformation.push('No external citations were available to ground the output.');

    const confidenceLabel = score >= 9 ? 'High confidence' : score >= 5 ? 'Moderate confidence' : 'Low confidence';
    const evidenceQuality = score >= 9 ? 'Strong evidence base' : score >= 5 ? 'Useful but incomplete evidence base' : 'Thin evidence base';
    const evidenceParts = [];
    if (hasBuContext) evidenceParts.push('BU/function context');
    if (hasOrgContext) evidenceParts.push('organisation context');
    if (hasUserContext) evidenceParts.push('user-role context');
    if (hasUploadedText) evidenceParts.push('uploaded source material');
    if (hasRegisterText) evidenceParts.push('risk register content');
    if (counts.official) evidenceParts.push(`${counts.official} official/company sources`);
    if (counts.regulatory) evidenceParts.push(`${counts.regulatory} regulatory or policy sources`);
    if (counts.regional) evidenceParts.push(`${counts.regional} regional news sources`);
    if (counts.global || counts.external) evidenceParts.push(`${counts.global + counts.external} wider external sources`);

    const summary = evidenceParts.length
      ? `Evidence used: ${_joinList(evidenceParts)}.`
      : 'Evidence used: limited contextual inputs only.';

    const promptLines = [
      `Evidence quality: ${evidenceQuality}.`,
      `Confidence: ${confidenceLabel}.`,
      `Available evidence: ${summary}`
    ];
    if (missingInformation.length) {
      promptLines.push(`Missing or weak evidence: ${_joinList(missingInformation.slice(0, 4))}`);
    }

    return {
      score,
      confidenceLabel,
      evidenceQuality,
      summary,
      missingInformation: missingInformation.slice(0, 4),
      promptBlock: promptLines.join('\n')
    };
  }


  function _buildCitationPromptBlock(citations = [], limit = 8) {
    const items = (Array.isArray(citations) ? citations : [])
      .map((item) => {
        const kind = _classifyEvidenceSource(item);
        const labelMap = {
          official: 'Official/company source',
          regulatory: 'Regulatory/policy source',
          regional: 'Regional news source',
          global: 'Global news source',
          internal: 'Internal source',
          external: 'External source'
        };
        const title = String(item?.title || item?.note || 'Untitled source').trim();
        const excerpt = _truncateText(item?.excerpt || item?.description || item?.note || '', 220);
        const url = String(item?.url || item?.link || '').trim();
        return `- ${labelMap[kind] || 'Source'}: ${title}${excerpt ? ` | ${excerpt}` : ''}${url ? ` | ${url}` : ''}`;
      })
      .filter(Boolean)
      .slice(0, limit);
    return items.length ? items.join('\n') : '(no external citations available)';
  }


  function _buildContextPromptBlock(settings = {}, businessUnit = null) {
    const parts = [
      settings?.businessUnitContext ? `Live business-unit context:
${settings.businessUnitContext}` : '',
      settings?.departmentContext ? `Live function context:
${settings.departmentContext}` : '',
      settings?.inheritedContextSummary ? `Inherited organisation context:
${settings.inheritedContextSummary}` : '',
      settings?.personalContextSummary ? `User-specific working context:
${settings.personalContextSummary}` : '',
      businessUnit?.selectedDepartmentContext ? `Selected department context:
${businessUnit.selectedDepartmentContext}` : ''
    ].filter(Boolean);
    return parts.length ? parts.join('\n\n') : '(no additional live BU/function/user context provided)';
  }

  function _withEvidenceMeta(result = {}, evidenceMeta = null) {
    const meta = evidenceMeta || {};
    const normalised = {
      ...result,
      confidenceLabel: String(result.confidenceLabel || meta.confidenceLabel || 'Moderate confidence'),
      evidenceQuality: String(result.evidenceQuality || meta.evidenceQuality || 'Useful but incomplete evidence base'),
      evidenceSummary: String(result.evidenceSummary || meta.summary || 'Evidence used: limited contextual inputs only.'),
      missingInformation: Array.isArray(result.missingInformation)
        ? result.missingInformation.filter(Boolean).slice(0, 4)
        : (Array.isArray(meta.missingInformation) ? meta.missingInformation.filter(Boolean).slice(0, 4) : []),
      workflowGuidance: Array.isArray(result.workflowGuidance) ? result.workflowGuidance.filter(Boolean) : [],
      citations: Array.isArray(result.citations) ? result.citations.filter(Boolean) : []
    };
    return normalised;
  }

  function _classifyScenario(narrative = '') {
    const n = String(narrative || '').toLowerCase();
    const isRansomware = n.includes('ransomware') || n.includes('encrypt') || n.includes('ransom');
    const isIdentity = n.includes('azure ad') || n.includes('active directory') || n.includes('entra') || n.includes('identity') || n.includes('sso') || n.includes('directory service');
    const isPhishing = !isIdentity && (n.includes('phish') || n.includes('bec') || n.includes('email compromise') || n.includes('spoof'));
    const isDataBreach = n.includes('breach') || n.includes('data theft') || n.includes('exfil') || n.includes('data exposure');
    const isThirdParty = n.includes('supplier') || n.includes('vendor') || n.includes('third-party') || n.includes('third party') || n.includes('outsourc');
    const isInsider = n.includes('insider') || n.includes('employee misuse') || n.includes('malicious insider') || n.includes('privilege abuse');
    const isCloud = !isIdentity && (n.includes('cloud') || n.includes('misconfigur') || n.includes('s3') || n.includes('bucket') || n.includes('storage exposure') || n.includes('public exposure') || n.includes('azure'));

    if (isRansomware) {
      return {
        key: 'ransomware',
        scenarioType: 'Ransomware / Extortion Attack',
        threatCommunity: 'Organised cybercriminal groups (ransomware-as-a-service)',
        attackType: 'Ransomware deployment via initial access broker',
        effect: 'Encryption of critical data and systems; service unavailability; potential data leak for double-extortion',
        tef: { min: 0.3, likely: 1.5, max: 5 },
        tc: { min: 0.55, likely: 0.72, max: 0.9 }
      };
    }
    if (isIdentity) {
      return {
        key: 'identity',
        scenarioType: 'Identity Platform Compromise',
        threatCommunity: 'Credential theft and account-takeover specialists',
        attackType: 'Credential theft, token hijack, or federated identity abuse',
        effect: 'Compromise of core identity services leading to account takeover, privilege abuse, mailbox compromise, and disruption across federated business systems',
        tef: { min: 1, likely: 4, max: 14 },
        tc: { min: 0.45, likely: 0.68, max: 0.86 }
      };
    }
    if (isDataBreach) {
      return {
        key: 'data-breach',
        scenarioType: 'Data Breach / Unauthorised Data Disclosure',
        threatCommunity: 'External threat actors (mixed motivation)',
        attackType: 'Data exfiltration after credential compromise',
        effect: 'Unauthorised access to and exfiltration of sensitive or regulated data',
        tef: { min: 0.5, likely: 2, max: 8 },
        tc: { min: 0.5, likely: 0.68, max: 0.88 }
      };
    }
    if (isCloud) {
      return {
        key: 'cloud',
        scenarioType: 'Cloud Misconfiguration / Exposure',
        threatCommunity: 'External threat actors (mixed motivation)',
        attackType: 'Exploitation of cloud misconfiguration',
        effect: 'Loss of confidentiality, integrity, or availability through exposed or weakly controlled cloud services',
        tef: { min: 1, likely: 4, max: 15 },
        tc: { min: 0.35, likely: 0.55, max: 0.78 }
      };
    }
    if (isThirdParty) {
      return {
        key: 'third-party',
        scenarioType: 'Third-Party / Supply Chain Disruption',
        threatCommunity: 'External counterparties or attacker-enabled supplier failures',
        attackType: 'Third-party service, access, or dependency failure',
        effect: 'Operational disruption, inherited control weakness, or data exposure through critical supplier relationships',
        tef: { min: 0.4, likely: 1.8, max: 6 },
        tc: { min: 0.4, likely: 0.6, max: 0.8 }
      };
    }
    if (isPhishing) {
      return {
        key: 'phishing',
        scenarioType: 'Phishing / Business Email Compromise (BEC)',
        threatCommunity: 'Opportunistic threat actors / BEC specialists',
        attackType: 'Spear-phishing / adversary-in-the-middle phishing kit',
        effect: 'Compromise of user accounts, email trust channels, and payment or approval workflows',
        tef: { min: 3, likely: 10, max: 35 },
        tc: { min: 0.35, likely: 0.55, max: 0.78 }
      };
    }
    if (isInsider) {
      return {
        key: 'insider',
        scenarioType: 'Insider Misuse / Privileged Abuse',
        threatCommunity: 'Malicious or negligent insider',
        attackType: 'Insider data theft / sabotage',
        effect: 'Compromise of confidentiality, integrity, or service continuity by a trusted user or administrator',
        tef: { min: 0.3, likely: 1.2, max: 4 },
        tc: { min: 0.4, likely: 0.6, max: 0.82 }
      };
    }
    return {
      key: 'general',
      scenarioType: 'General Cyber Threat',
      threatCommunity: 'External threat actors (mixed motivation)',
      attackType: 'Multi-vector cyber attack',
      effect: 'Loss of confidentiality, integrity, or availability of critical assets',
      tef: { min: 0.5, likely: 2, max: 8 },
      tc: { min: 0.45, likely: 0.62, max: 0.82 }
    };
  }

  function _cleanUserFacingText(value = '', { maxSentences = 0, stripTrailingPeriod = false } = {}) {
    let text = _dedupeSentences(String(value || '').replace(/\s+/g, ' ').trim());
    if (!text) return '';

    text = text
      .replace(/candidate risk identified from (?:the )?(?:intake text|uploaded register|register analysis)[^.]*\.?/gi, '')
      .replace(/a risk scenario is being assessed where\s*/gi, '')
      .replace(/this scenario should be assessed for\s*/gi, 'Focus on ')
      .replace(/current urgency is assessed as\s*/gi, 'Urgency is ')
      .replace(/the main asset, service, or team affected is\s*/gi, 'The scenario affects ')
      .replace(/the likely trigger or threat driver is\s*/gi, 'The likely trigger is ')
      .replace(/the expected business, operational, or regulatory impact is\s*/gi, 'The likely impact is ')
      .replace(/given the stated urgency,?\s*/gi, '')
      .replace(/in practice, this can drive\s*/gi, 'This could lead to ')
      .replace(/a likely progression is\s*/gi, 'The most likely progression is ')
      .replace(/material-control scenario/gi, 'material scenario')
      .replace(/\s+\./g, '.')
      .replace(/\.\./g, '.')
      .replace(/\s+,/g, ',')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (maxSentences > 0) {
      text = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, maxSentences).join(' ').trim();
    }
    if (stripTrailingPeriod) {
      text = text.replace(/[.]+$/g, '').trim();
    }
    return text;
  }

  function _normaliseGuidance(items = []) {
    return Array.from(new Set((Array.isArray(items) ? items : [])
      .map((item) => _cleanUserFacingText(item, { maxSentences: 1, stripTrailingPeriod: true }))
      .filter(Boolean)))
      .slice(0, 5);
  }

  function _normaliseInputRationale(value = {}) {
    return {
      tef: _cleanUserFacingText(value?.tef || '', { maxSentences: 2 }),
      vulnerability: _cleanUserFacingText(value?.vulnerability || '', { maxSentences: 2 }),
      lossComponents: _cleanUserFacingText(value?.lossComponents || '', { maxSentences: 2 })
    };
  }

  function _normaliseBenchmarkBasis(value = '') {
    return _cleanUserFacingText(value, { maxSentences: 3 });
  }

  function _normaliseRiskCards(risks = []) {
    const cleaned = (Array.isArray(risks) ? risks : []).map((risk) => ({
      ...risk,
      title: _cleanUserFacingText(risk.title || '', { maxSentences: 1, stripTrailingPeriod: true }),
      category: _toDisplayLabel(_cleanUserFacingText(risk.category || 'Cyber', { maxSentences: 1, stripTrailingPeriod: true }) || 'Cyber') || 'Cyber',
      description: _cleanUserFacingText(risk.description || '', { maxSentences: 2 }),
      impact: _cleanUserFacingText(risk.impact || '', { maxSentences: 1 }),
      why: _cleanUserFacingText(risk.why || '', { maxSentences: 2 }),
      regulations: Array.from(new Set((risk.regulations || []).map(String).filter(Boolean))).slice(0, 5)
    })).filter((risk) => risk.title);

    const hasSpecific = cleaned.some((risk) => !_isGenericRiskTitle(risk.title));
    const seen = new Set();
    return cleaned.filter((risk) => {
      if (hasSpecific && _isGenericRiskTitle(risk.title)) return false;
      const key = _normaliseSentenceKey(risk.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function _generateStub(narrative, buContext, citations) {
    const classification = _classifyScenario(narrative);

    let scenarioType = classification.scenarioType;
    let tef = { ...classification.tef };
    let cs = { min: 0.5, likely: 0.68, max: 0.85 };
    let tc = { ...classification.tc };
    let recommendations = [];

    if (classification.key === 'ransomware') {
      recommendations = [
        { title: 'Immutable Offline Backups', why: 'Ransomware relies on destroying recovery options. Offline backups with verified restore tests eliminate the primary leverage attackers hold.', impact: 'Reduces recovery time from 18+ days to <5 days; eliminates ransom leverage.' },
        { title: 'MFA on All Privileged Accounts', why: 'Ransomware actors consistently abuse compromised credentials. Phishing-resistant MFA prevents privileged expansion after initial access.', impact: 'Estimated 80% reduction in successful credential-based lateral movement.' },
        { title: 'Endpoint Detection & Response (EDR)', why: 'Behavioural EDR detects ransomware staging before encryption begins.', impact: 'Average dwell time reduction from days to under 24 hours with mature EDR.' },
        { title: 'Network Segmentation', why: 'Segmentation limits blast radius and prevents a single compromise from taking out multiple business services.', impact: 'Can reduce impacted systems by 60–80% in a ransomware event.' }
      ];
    } else if (classification.key === 'data-breach') {
      recommendations = [
        { title: 'Data Loss Prevention (DLP)', why: 'Exfiltration control is a primary lever in data breach scenarios.', impact: 'Reduces exfiltration window and narrows breach scope.' },
        { title: 'Data Classification Enforcement', why: 'Classification improves handling controls and reduces accidental exposure.', impact: 'Directly reduces the scale of data-at-risk and notification burden.' },
        { title: 'Zero Trust Access Controls', why: 'Least-privilege access reduces the attacker path to sensitive data stores.', impact: 'Lowers breach scope and slows attacker progression.' },
        { title: 'Breach Notification Runbook', why: 'Prepared regulatory and legal response reduces late-notification and escalation risk.', impact: 'Cuts legal friction and response delay after confirmed exposure.' }
      ];
    } else if (classification.key === 'identity') {
      recommendations = [
        { title: 'Phishing-Resistant MFA for Privileged Identities', why: 'Identity compromise commonly begins with credential or token theft. Strong MFA materially reduces that entry path.', impact: 'Significantly lowers the chance of privileged account takeover.' },
        { title: 'Conditional Access and Anomalous Sign-In Tuning', why: 'Identity-led incidents are contained faster when risk-based access controls and sign-in detections are tuned well.', impact: 'Improves early detection and reduces attacker dwell time.' },
        { title: 'Privileged Identity Management', why: 'Just-in-time admin access reduces standing privilege exposure inside the identity tier.', impact: 'Limits blast radius from a compromised administrator account.' },
        { title: 'Mailbox and Identity Recovery Runbook', why: 'Identity incidents often spill into email compromise, fraud, and user lockout.', impact: 'Reduces disruption time and downstream financial loss.' }
      ];
    } else if (classification.key === 'cloud') {
      recommendations = [
        { title: 'Cloud Security Posture Management (CSPM)', why: 'Misconfigurations remain a leading driver of cloud exposure events.', impact: 'Reduces misconfiguration dwell time from weeks to hours.' },
        { title: 'Infrastructure as Code Security Scanning', why: 'Pre-deployment controls prevent repeat configuration drift.', impact: 'Prevents a large share of common cloud misconfigurations.' },
        { title: 'Privileged Access Management for Cloud Consoles', why: 'Over-permissive console access is a catastrophic single point of failure.', impact: 'Limits blast radius of compromised cloud credentials.' },
        { title: 'Real-Time Alerting on Public Exposure', why: 'Publicly exposed services are often discovered and abused quickly.', impact: 'Reduces exploitation windows materially.' }
      ];
    } else if (classification.key === 'phishing') {
      recommendations = [
        { title: 'Phishing-Resistant MFA', why: 'Phishing and session hijack campaigns increasingly bypass weak MFA patterns.', impact: 'Near-elimination of credential takeover from basic phishing paths.' },
        { title: 'Advanced Email Security Controls', why: 'Reducing malicious messages reaching users remains one of the strongest volume controls.', impact: 'Substantially lowers phishing exposure at inbox level.' },
        { title: 'BEC Payment Verification Controls', why: 'Out-of-band verification and approval hardening reduce direct fraud loss.', impact: 'Eliminates the main financial loss path in many BEC cases.' },
        { title: 'Security Awareness and Simulation Programme', why: 'Human detection remains an important last line of defence.', impact: 'Reduces click-through and improves early reporting.' }
      ];
    } else {
      recommendations = [
        { title: 'Risk-Based Vulnerability Management', why: 'Exploitability-led prioritisation reduces the most likely technical entry paths.', impact: 'Addresses a major driver of severe incidents.' },
        { title: 'Zero Trust Architecture', why: 'Reducing implicit trust limits lateral movement and blast radius.', impact: 'Can materially reduce breach scope and recovery effort.' },
        { title: 'Third-Party Security Assessment Programme', why: 'Supplier and dependency risks often amplify core scenarios.', impact: 'Improves identification of inherited exposure.' },
        { title: 'Security Operations Maturity', why: 'Faster detection and response remains one of the strongest levers on loss magnitude.', impact: 'Reduces dwell time and downstream business loss.' }
      ];
    }

    // Add BU context to defaults if available, but tolerate partial or older settings payloads.
    if (buContext && buContext.defaultAssumptions) {
      const da = buContext.defaultAssumptions || {};
      if (da.TEF?.min != null && da.TEF?.likely != null && da.TEF?.max != null) {
        tef = { min: da.TEF.min, likely: da.TEF.likely, max: da.TEF.max };
      }
      if (da.controlStrength?.min != null && da.controlStrength?.likely != null && da.controlStrength?.max != null) {
        cs = { min: da.controlStrength.min, likely: da.controlStrength.likely, max: da.controlStrength.max };
      }
      if (da.threatCapability?.min != null && da.threatCapability?.likely != null && da.threatCapability?.max != null) {
        tc = { min: da.threatCapability.min, likely: da.threatCapability.likely, max: da.threatCapability.max };
      }
    }

    return {
      scenarioTitle: scenarioType,
      structuredScenario: {
        assetService: buContext?.criticalServices?.[0] || 'Core application platform',
        threatCommunity: classification.threatCommunity,
        attackType: classification.attackType,
        effect: classification.effect
      },
      workflowGuidance: [
        'Confirm that the selected risks and narrative describe one coherent assessment scope.',
        'Review the suggested FAIR ranges against internal incident history, control evidence, and business criticality before accepting them.',
        'Validate any benchmark-based assumptions against FAIR logic, NIST CSF style control expectations, and your organisation-specific operating context.'
      ],
      benchmarkBasis: 'The suggested values are intended as FAIR-style starting points. They prioritise relevant GCC and UAE cyber, privacy, and operational resilience context where credible local comparators are available, and otherwise fall back to mature global incident, control, and loss patterns that should be validated by the user.',
      inputRationale: {
        tef: 'Threat event frequency is anchored to the scenario type and then aligned to the business unit default assumptions where available.',
        vulnerability: 'Threat capability and control strength are balanced to reflect the expected attacker sophistication against the current control environment.',
        lossComponents: 'Loss components reflect the most material direct, operational, regulatory, third-party, and reputational consequences for the selected scenario.'
      },
      suggestedInputs: {
        TEF: tef,
        controlStrength: cs,
        threatCapability: tc,
        lossComponents: buContext?.defaultAssumptions ? {
          incidentResponse:    buContext.defaultAssumptions.incidentResponse,
          businessInterruption: buContext.defaultAssumptions.businessInterruption,
          dataBreachRemediation: buContext.defaultAssumptions.dataBreachRemediation,
          regulatoryLegal:      buContext.defaultAssumptions.regulatoryLegal,
          thirdPartyLiability:  buContext.defaultAssumptions.thirdPartyLiability,
          reputationContract:   buContext.defaultAssumptions.reputationContract
        } : {
          incidentResponse:    { min: 50000, likely: 180000, max: 600000 },
          businessInterruption: { min: 100000, likely: 450000, max: 2500000 },
          dataBreachRemediation: { min: 30000, likely: 120000, max: 500000 },
          regulatoryLegal:      { min: 0, likely: 80000, max: 800000 },
          thirdPartyLiability:  { min: 0, likely: 50000, max: 400000 },
          reputationContract:   { min: 50000, likely: 200000, max: 1200000 }
        }
      },
      recommendations: recommendations.slice(0, 6),
      citations
    };
  }

  function _cleanScenarioSeed(statement = '') {
    const raw = String(statement || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const sentences = raw.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const filtered = sentences.filter((sentence) => {
      const key = sentence.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      if (/^in .*faces a material .*scenario in which/i.test(sentence)) return false;
      if (/^this scenario should be assessed/i.test(sentence)) return false;
      if (/^a likely progression is/i.test(sentence)) return false;
      if (/^in practice, this can drive/i.test(sentence)) return false;
      if (/^given the stated urgency/i.test(sentence)) return false;
      if (/^current urgency is assessed as /i.test(sentence)) return false;
      return true;
    });
    const cleaned = filtered.join(' ').trim();
    return cleaned || raw;
  }


  function _buildEnhancedNarrative(input = {}, modelNarrative = '') {
    const modelText = _cleanUserFacingText(_stripScenarioLeadIns(modelNarrative || ''), { maxSentences: 6 });
    const expanded = _buildScenarioExpansion({
      ...input,
      riskStatement: modelText || input.riskStatement || ''
    }).scenarioExpansion;
    if (!modelText) return expanded;
    const merged = _dedupeSentences([expanded, modelText].filter(Boolean).join(' '));
    return _cleanUserFacingText(merged, { maxSentences: 6 });
  }

  function _buildScenarioExpansion(input = {}) {
    const statement = _stripScenarioLeadIns(_cleanScenarioSeed(input.riskStatement));
    const businessUnit = String(input.businessUnit?.name || 'the business unit').trim();
    const geography = _joinList(String(input.geography || '').split(',').map((item) => item.trim()).filter(Boolean)) || 'the selected geography';
    const asset = _cleanUserFacingText(String(input.guidedInput?.asset || '').trim(), { maxSentences: 1, stripTrailingPeriod: true });
    const cause = _cleanUserFacingText(String(input.guidedInput?.cause || '').trim(), { maxSentences: 1, stripTrailingPeriod: true });
    const impact = _cleanUserFacingText(String(input.guidedInput?.impact || '').trim(), { maxSentences: 1, stripTrailingPeriod: true });
    const urgency = String(input.guidedInput?.urgency || 'medium').trim().toLowerCase();
    const lower = [statement, asset, cause, impact].join(' ').toLowerCase();

    let scenarioExpansion = _ensureSentence(statement) || _buildScenarioLead({ geography, businessUnit });
    let summary = `AI expanded the scenario into a clearer risk narrative for ${businessUnit}.`;
    let riskTitles = _extractRiskCandidates([statement, cause, impact].join('\n'));

    if (/azure ad|active directory|identity|entra|sso|email/i.test(lower)) {
      scenarioExpansion = [
        _buildScenarioLead({
          geography,
          businessUnit,
          asset: asset || 'the identity platform',
          cause: cause || 'targeted credential theft or session hijack',
          impact: impact || 'operational disruption, fraud, and regulatory exposure',
          scenarioLabel: 'identity compromise'
        }),
        'The most likely progression is account takeover, privileged escalation, and unauthorised access to email, collaboration tools, cloud administration, and other federated business services.',
        ['high', 'critical'].includes(urgency)
          ? 'This should be treated as an active material scenario requiring rapid containment, privileged-account review, and assessment of downstream operational and financial exposure.'
          : 'This should be assessed as a gateway scenario that can trigger fraud, service disruption, data exposure, and regulatory consequences across connected services.'
      ].join(' ');
      summary = 'AI expanded the scenario beyond the initial identity failure to include likely knock-on effects such as mailbox compromise, privileged abuse, service disruption, fraud, and data exposure.';
      riskTitles = [
        { title: 'Privileged account takeover through identity platform compromise', category: 'Identity & Access', description: 'Compromised Azure AD or Entra credentials could let an attacker take over privileged identities and move into federated services or administrative workflows.', regulations: ['UAE PDPL', 'UK GDPR', 'SEC cyber disclosure rules'] },
        { title: 'Business email compromise enabled by mailbox access', category: 'Financial Crime', description: 'Once identity controls are bypassed, mailbox access can support payment fraud, executive impersonation, and manipulation of approvals or supplier instructions.', regulations: ['UAE AML/CFT'] },
        { title: 'Administrative lockout or unauthorised tenant changes', category: 'Operational Resilience', description: 'An attacker with elevated access could change authentication settings, conditional access, or directory controls, disrupting normal user access and response operations.', regulations: ['UAE Cybersecurity Council Guidance'] },
        { title: 'Sensitive data exposure across mailboxes and connected cloud services', category: 'Data Protection', description: 'The same compromise could expose regulated or commercially sensitive information stored in mail, identity-linked applications, and collaboration platforms.', regulations: ['UAE PDPL', 'GDPR'] }
      ];
    } else if (/ransom|encrypt/i.test(lower)) {
      scenarioExpansion = [
        _buildScenarioLead({ geography, businessUnit, asset: asset || 'critical business services', cause: cause || 'initial access followed by ransomware deployment', impact: impact || 'service downtime and recovery cost', scenarioLabel: 'ransomware-driven disruption' }),
        'The most likely progression is attacker access, lateral movement, abuse of privileged access, encryption or destructive action against critical systems, and secondary extortion through data theft or public pressure.',
        'This should be assessed for downtime, operational backlog, emergency response cost, stakeholder disruption, and regulatory consequences where sensitive or regulated services are involved.'
      ].join(' ');
    } else if (/supplier|vendor|third-party/i.test(lower)) {
      scenarioExpansion = [
        _buildScenarioLead({ geography, businessUnit, asset: asset || 'a critical supplier-dependent service', cause: cause || 'third-party failure or compromise', impact: impact || 'operational disruption and commercial exposure', scenarioLabel: 'third-party disruption' }),
        'The most likely progression is service dependency failure, inherited control weakness, or privileged supplier access creating operational, data, and contractual consequences across connected processes.',
        'This should be assessed for immediate disruption as well as follow-on regulatory, commercial, and assurance impacts.'
      ].join(' ');
    } else if (/cloud|misconfig|storage|bucket/i.test(lower)) {
      scenarioExpansion = [
        _buildScenarioLead({ geography, businessUnit, asset: asset || 'the exposed cloud service', cause: cause || 'cloud misconfiguration or weak access control', impact: impact || 'data exposure and operational recovery effort', scenarioLabel: 'cloud exposure' }),
        'The most likely progression is unauthorised discovery, data exposure or exfiltration, misuse of cloud services, persistence through compromised credentials or automation, and delayed detection caused by fragmented ownership.',
        'This should be assessed for confidentiality impact, operational recovery effort, regulatory response, and reputational consequences.'
      ].join(' ');
    } else if (statement) {
      scenarioExpansion = [
        _buildScenarioLead({ geography, businessUnit, asset, cause, impact, scenarioLabel: 'risk scenario' }),
        _ensureSentence(statement)
      ].join(' ');
    }

    return {
      scenarioExpansion: _dedupeSentences(scenarioExpansion),
      summary: _cleanUserFacingText(summary, { maxSentences: 2 }),
      riskTitles
    };
  }

  function _generateRiskBuilderStub(input) {
    const riskStatement = input.riskStatement || '';
    const registerText = input.registerText || '';
    const joined = [riskStatement, registerText].filter(Boolean).join('\n');
    const scenarioExpansion = _buildScenarioExpansion(input);
    const risks = scenarioExpansion.riskTitles.map((risk, idx) => ({
      id: `stub-risk-${idx + 1}`,
      title: risk.title,
      category: risk.category,
      description: risk.description || `Candidate risk identified from the intake text${input.businessUnit?.name ? ` for ${input.businessUnit.name}` : ''}.`,
      source: registerText ? 'ai+register' : 'ai',
      regulations: Array.from(new Set([...(risk.regulations || []), ...(input.applicableRegulations || [])])).slice(0, 4)
    }));
    const workflowGuidance = registerText
      ? [
          'Review the extracted risks and keep every material risk that could change exposure, regulation, or business impact.',
          'Use linked mode only when one event could reasonably trigger several of the selected risks in the same chain.',
          'On the next step, use AI assist to turn the selected scope into FAIR ranges with benchmark-backed reasoning.'
        ]
      : [
          'Confirm the scenario wording in plain English before moving on.',
          'Use AI assist on the next step to convert the narrative into FAIR ranges and benchmark-backed reasoning.',
          'Challenge any number that does not fit the business context or known incident history.'
        ];
    return {
      enhancedStatement: riskStatement ? scenarioExpansion.scenarioExpansion : '',
      summary: registerText ? `AI identified ${risks.length} candidate risk${risks.length > 1 ? 's' : ''} from the uploaded material and expanded the scenario into a more realistic assessment narrative.` : scenarioExpansion.summary,
      linkAnalysis: risks.length > 1
        ? 'Several selected risks appear capable of cascading together. Treat them as linked if one event could trigger operational, regulatory, or third-party consequences in the same chain.'
        : 'A single primary risk driver was identified from the intake.',
      risks,
      regulations: Array.from(new Set([...(input.applicableRegulations || []), ...risks.flatMap(r => r.regulations || [])])),
      workflowGuidance,
      benchmarkBasis: 'Prefer GCC and UAE benchmark references for regulatory exposure, downtime, and cyber response assumptions. Where those are unavailable, use the best available global benchmark and explain the fallback clearly.',
      citations: input.citations || []
    };
  }

  /**
   * Main method: generate scenario and FAIR inputs
   * [LLM-INTEGRATION] Replace stub body with real API call + JSON parsing
   */
  async function generateScenarioAndInputs(narrative, buContext, retrievedDocs) {
    const classification = _classifyScenario(narrative);
    if (_isDirectCompassUrl(_compassApiUrl) && !_compassApiKey) {
      await new Promise(r => setTimeout(r, 2200 + Math.random() * 800));
    }

    // Try real API first
    if (_compassApiKey || !_isDirectCompassUrl(_compassApiUrl)) {
      try {
        const systemPrompt = `You are a senior cyber risk analyst specialising in FAIR methodology. 
Given a risk scenario narrative and business context, provide structured FAIR inputs and recommendations.
Prefer GCC and UAE benchmark references where relevant. If those are unavailable for a specific assumption, use the best available global benchmark and explain the fallback logic. Keep the output aligned to FAIR reasoning and consistent with broadly recognised risk management expectations such as clear threat, vulnerability, and loss logic.
Respond ONLY with valid JSON matching this exact schema:
{
  "scenarioTitle": "string",
  "structuredScenario": { "assetService": "string", "threatCommunity": "string", "attackType": "string", "effect": "string" },
  "workflowGuidance": ["string"],
  "benchmarkBasis": "string",
  "inputRationale": {
    "tef": "string",
    "vulnerability": "string",
    "lossComponents": "string"
  },
  "suggestedInputs": {
    "TEF": { "min": number, "likely": number, "max": number },
    "controlStrength": { "min": number, "likely": number, "max": number },
    "threatCapability": { "min": number, "likely": number, "max": number },
    "lossComponents": {
      "incidentResponse": { "min": number, "likely": number, "max": number },
      "businessInterruption": { "min": number, "likely": number, "max": number },
      "dataBreachRemediation": { "min": number, "likely": number, "max": number },
      "regulatoryLegal": { "min": number, "likely": number, "max": number },
      "thirdPartyLiability": { "min": number, "likely": number, "max": number },
      "reputationContract": { "min": number, "likely": number, "max": number }
    }
  },
  "recommendations": [{ "title": "string", "why": "string", "impact": "string" }]
}`;
        const evidenceMeta = _buildEvidenceMeta({ citations: retrievedDocs, businessUnit: buContext, geography: buContext?.geography, applicableRegulations: buContext?.regulatoryTags || [], userProfile: buContext?.userProfileSummary, organisationContext: buContext?.companyStructureContext });
        const userPrompt = `BU: ${buContext?.name || 'Unknown'}
Data types: ${(buContext?.dataTypes || []).join(', ')}
Regulatory tags: ${(buContext?.regulatoryTags || []).join(', ')}
Critical services: ${(buContext?.criticalServices || []).join(', ')}
Geography: ${buContext?.geography || 'Unknown'}
BU context summary: ${buContext?.contextSummary || buContext?.notes || '(none)'}
BU-specific AI guidance: ${buContext?.aiGuidance || '(none)'}
Benchmark strategy: ${buContext?.benchmarkStrategy || 'Prefer GCC and UAE references, then fall back to best global data with clear explanation.'}
Company context profile: ${buContext?.companyContextProfile || '(none)'}
User profile context:
${buContext?.userProfileSummary || '(none)'}
Organisation structure context:
${buContext?.companyStructureContext || '(none)'}
Live scoped context:
${_buildContextPromptBlock(buContext, buContext)}
Scenario taxonomy hint:
${classification.scenarioType} | ${classification.attackType} | ${classification.effect}

Risk narrative: ${narrative}

Relevant citations:
${_buildCitationPromptBlock(retrievedDocs)}

Evidence quality context:
${evidenceMeta.promptBlock}`;

        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
          const fallback = _generateStub(narrative, buContext, retrievedDocs);
          const parsedInputs = parsed?.suggestedInputs || {};
          const fallbackInputs = fallback.suggestedInputs || {};
          const parsedLoss = parsedInputs.lossComponents || {};
          const fallbackLoss = fallbackInputs.lossComponents || {};
          const ensureRange = (value, fallbackRange) => ({
            min: value?.min ?? fallbackRange?.min ?? 0,
            likely: value?.likely ?? fallbackRange?.likely ?? 0,
            max: value?.max ?? fallbackRange?.max ?? 0,
          });
          const cleanedTitle = String(parsed.scenarioTitle || '').trim();
          const keepFallbackClassification = classification.key === 'identity' && /cloud|misconfig/i.test(cleanedTitle);
          return _withEvidenceMeta({
            ...fallback,
            ...parsed,
            scenarioTitle: _cleanUserFacingText(keepFallbackClassification ? fallback.scenarioTitle : (cleanedTitle || fallback.scenarioTitle), { maxSentences: 1, stripTrailingPeriod: true }),
            structuredScenario: (() => {
              const mergedStructured = {
                ...fallback.structuredScenario,
                ...(keepFallbackClassification ? {} : (parsed.structuredScenario || {}))
              };
              return {
                assetService: _cleanUserFacingText(mergedStructured.assetService || '', { maxSentences: 1, stripTrailingPeriod: true }),
                threatCommunity: _cleanUserFacingText(mergedStructured.threatCommunity || '', { maxSentences: 1, stripTrailingPeriod: true }),
                attackType: _cleanUserFacingText(mergedStructured.attackType || '', { maxSentences: 1, stripTrailingPeriod: true }),
                effect: _cleanUserFacingText(mergedStructured.effect || '', { maxSentences: 2 })
              };
            })(),
            workflowGuidance: _normaliseGuidance(parsed.workflowGuidance?.length ? parsed.workflowGuidance : fallback.workflowGuidance),
            benchmarkBasis: _normaliseBenchmarkBasis(parsed.benchmarkBasis || fallback.benchmarkBasis || ''),
            inputRationale: _normaliseInputRationale({
              ...fallback.inputRationale,
              ...(parsed.inputRationale || {})
            }),
            suggestedInputs: {
              ...fallbackInputs,
              ...parsedInputs,
              TEF: ensureRange(parsedInputs.TEF, fallbackInputs.TEF),
              controlStrength: ensureRange(parsedInputs.controlStrength, fallbackInputs.controlStrength),
              threatCapability: ensureRange(parsedInputs.threatCapability, fallbackInputs.threatCapability),
              lossComponents: {
                ...fallbackLoss,
                ...parsedLoss,
                incidentResponse: ensureRange(parsedLoss.incidentResponse, fallbackLoss.incidentResponse),
                businessInterruption: ensureRange(parsedLoss.businessInterruption, fallbackLoss.businessInterruption),
                dataBreachRemediation: ensureRange(parsedLoss.dataBreachRemediation, fallbackLoss.dataBreachRemediation),
                regulatoryLegal: ensureRange(parsedLoss.regulatoryLegal, fallbackLoss.regulatoryLegal),
                thirdPartyLiability: ensureRange(parsedLoss.thirdPartyLiability, fallbackLoss.thirdPartyLiability),
                reputationContract: ensureRange(parsedLoss.reputationContract, fallbackLoss.reputationContract),
              }
            },
            recommendations: _normaliseRiskCards((parsed.recommendations || fallback.recommendations || []).map((rec) => ({ title: rec.title, category: 'Recommendation', description: rec.why, regulations: [], impact: rec.impact }))).map((rec) => ({ title: rec.title, why: rec.description, impact: rec.impact || '' })),
            citations: retrievedDocs
          }, evidenceMeta);
        }
      } catch (e) {
        console.warn('LLM API call failed, falling back to stub:', e.message);
      }
    }

    // Fall back to stub
    return _withEvidenceMeta(_generateStub(narrative, buContext, retrievedDocs), _buildEvidenceMeta({ citations: retrievedDocs, businessUnit: buContext, geography: buContext?.geography, applicableRegulations: buContext?.regulatoryTags || [], userProfile: buContext?.userProfileSummary, organisationContext: buContext?.companyStructureContext }));
  }

  async function enhanceRiskContext(input) {
    if (_isDirectCompassUrl(_compassApiUrl) && !_compassApiKey) {
      await new Promise(r => setTimeout(r, 1400 + Math.random() * 600));
    }
    if (_compassApiKey || !_isDirectCompassUrl(_compassApiUrl)) {
      try {
        const systemPrompt = `You are a senior enterprise risk analyst. Given a risk statement, optional risk register text, business context, and regulations, expand the scenario realistically using likely attack paths, common knock-on effects, business consequences, and known industry patterns. Do not merely paraphrase the input. If the scenario concerns identity compromise, explain likely downstream effects such as email compromise, privileged misuse, tenant or admin abuse, fraud, service disruption, and data exposure where relevant. Return JSON only with this schema:
{
  "enhancedStatement": "string",
  "summary": "string",
  "linkAnalysis": "string",
  "workflowGuidance": ["string"],
  "benchmarkBasis": "string",
  "risks": [
    { "title": "string", "category": "string", "description": "string", "regulations": ["string"] }
  ],
  "regulations": ["string"]
}`;
        const evidenceMeta = _buildEvidenceMeta({ citations: input.citations || [], businessUnit: input.businessUnit, geography: input.geography, applicableRegulations: input.applicableRegulations, uploadedText: input.registerText, registerText: input.registerText, userProfile: input.adminSettings?.userProfileSummary, organisationContext: input.adminSettings?.companyStructureContext, adminSettings: input.adminSettings });
        const userPrompt = `Business unit: ${input.businessUnit?.name || 'Unknown'}
Geography: ${input.geography || 'Unknown'}
BU context summary: ${input.businessUnit?.contextSummary || input.businessUnit?.notes || '(none)'}
BU-specific AI guidance: ${input.businessUnit?.aiGuidance || '(none)'}
Applicable regulations: ${(input.applicableRegulations || []).join(', ')}
Guided intake: ${JSON.stringify(input.guidedInput || {})}
AI guidance: ${input.adminSettings?.aiInstructions || ''}
Benchmark strategy: ${input.adminSettings?.benchmarkStrategy || ''}
Admin context summary: ${input.adminSettings?.adminContextSummary || ''}
Company context profile: ${input.adminSettings?.companyContextProfile || ''}
User profile context:
${input.adminSettings?.userProfileSummary || '(none)'}
Organisation structure context:
${input.adminSettings?.companyStructureContext || '(none)'}
Live scoped context:
${_buildContextPromptBlock(input.adminSettings, input.businessUnit)}
Register metadata: ${input.registerMeta ? JSON.stringify(input.registerMeta) : '(none)'}

Risk statement:
${input.riskStatement || '(none)'}

Risk register text:
${input.registerText || '(none)'}

Retrieved citations:
${_buildCitationPromptBlock(input.citations || [])}

Instructions:
- make the enhancedStatement read like a realistic scenario narrative, not a polished restatement
- explain the most likely progression of the event and the common secondary effects
- include business and operational consequences, not just the technical failure
- reflect the stated urgency where provided
- if the scenario involves identity, directory, SSO, or Azure AD/Entra compromise, include plausible knock-on effects such as mailbox compromise, privileged misuse, tenant changes, service disruption, fraud, and data exposure where relevant
- produce concise but concrete candidate risks that a user can choose from
- classify the scenario using credible cyber risk taxonomy; do not label identity-control compromise as cloud misconfiguration unless the core failure is genuinely cloud exposure

Evidence quality context:
${evidenceMeta.promptBlock}`;
        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
          return _withEvidenceMeta({
            ...parsed,
            enhancedStatement: _buildEnhancedNarrative(input, parsed.enhancedStatement),
            summary: _cleanUserFacingText(parsed.summary || '', { maxSentences: 3 }),
            linkAnalysis: _cleanUserFacingText(parsed.linkAnalysis || '', { maxSentences: 3 }),
            workflowGuidance: _normaliseGuidance(parsed.workflowGuidance),
            benchmarkBasis: _normaliseBenchmarkBasis(parsed.benchmarkBasis || 'Use FAIR-aligned assumptions, test them against control evidence, and prefer local regulatory or operational comparators where credible before falling back to mature global incident patterns.'),
            risks: _normaliseRiskCards(parsed.risks),
            regulations: Array.from(new Set((parsed.regulations || []).map(String).filter(Boolean))),
            citations: input.citations || []
          }, evidenceMeta);
        }
      } catch (e) {
        console.warn('enhanceRiskContext fallback:', e.message);
      }
    }
    return _withEvidenceMeta(_generateRiskBuilderStub(input), _buildEvidenceMeta({ citations: input.citations || [], businessUnit: input.businessUnit, geography: input.geography, applicableRegulations: input.applicableRegulations, uploadedText: input.registerText, registerText: input.registerText, userProfile: input.adminSettings?.userProfileSummary, organisationContext: input.adminSettings?.companyStructureContext, adminSettings: input.adminSettings }));
  }

  async function analyseRiskRegister(input) {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
    const lines = String(input.registerText || '')
      .split(/\r?\n|;/)
      .map(line => line.trim())
      .filter(line => line.length > 10)
      .slice(0, 20);
    const evidenceMeta = _buildEvidenceMeta({
      citations: input.citations || [],
      businessUnit: input.businessUnit,
      geography: input.geography,
      applicableRegulations: input.applicableRegulations,
      uploadedText: input.registerText,
      registerText: input.registerText,
      userProfile: input.adminSettings?.userProfileSummary,
      organisationContext: input.adminSettings?.companyStructureContext,
      adminSettings: input.adminSettings
    });
    if (_compassApiKey || !_isDirectCompassUrl(_compassApiUrl)) {
      try {
        const systemPrompt = `You are a senior enterprise risk analyst. You will receive a risk register that may contain multiple sheets, multiple columns, and contextual metadata. Return JSON only with this schema:
{
  "summary": "string",
  "linkAnalysis": "string",
  "workflowGuidance": ["string"],
  "benchmarkBasis": "string",
  "risks": [
    { "title": "string", "category": "string", "description": "string", "regulations": ["string"] }
  ]
}`;
        const userPrompt = `Business unit: ${input.businessUnit?.name || 'Unknown'}
Geography: ${input.geography || 'Unknown'}
BU context summary: ${input.businessUnit?.contextSummary || input.businessUnit?.notes || '(none)'}
BU-specific AI guidance: ${input.businessUnit?.aiGuidance || '(none)'}
Applicable regulations: ${(input.applicableRegulations || []).join(', ')}
Register metadata: ${input.registerMeta ? JSON.stringify(input.registerMeta) : '(none)'}
Benchmark strategy: ${input.adminSettings?.benchmarkStrategy || 'Prefer GCC and UAE references where possible, then use best global data with clear explanation.'}
Admin context summary: ${input.adminSettings?.adminContextSummary || ''}
Company context profile: ${input.adminSettings?.companyContextProfile || ''}
User profile context:
${input.adminSettings?.userProfileSummary || '(none)'}
Organisation structure context:
${input.adminSettings?.companyStructureContext || '(none)'}
Live scoped context:
${_buildContextPromptBlock(input.adminSettings, input.businessUnit)}

Risk register content:
${input.registerText || '(none)'}

Instructions:
- use the whole workbook context, including sheet names and column headers
- deduplicate overlapping risks
- produce concise risk titles suitable for selection cards
- preserve important contextual detail in the descriptions
- extract up to 15 material risks if the register supports them
- include workflow guidance that tells a non-risk practitioner what to do after extraction

Evidence quality context:
${evidenceMeta.promptBlock}`;
        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
          return _withEvidenceMeta({
            summary: _cleanUserFacingText(parsed.summary || '', { maxSentences: 3 }),
            linkAnalysis: _cleanUserFacingText(parsed.linkAnalysis || '', { maxSentences: 3 }),
            workflowGuidance: _normaliseGuidance(parsed.workflowGuidance),
            benchmarkBasis: _normaliseBenchmarkBasis(parsed.benchmarkBasis || ''),
            risks: _normaliseRiskCards(parsed.risks).map((risk, idx) => ({
              id: risk.id || `register-risk-${idx + 1}`,
              title: risk.title,
              category: risk.category || 'Register',
              description: risk.description || 'Imported from the uploaded register for review.',
              source: risk.source || 'register',
              regulations: risk.regulations || []
            }))
          }, evidenceMeta);
        }
      } catch (e) {
        console.warn('analyseRiskRegister fallback:', e.message);
      }
    }
    const stub = _generateRiskBuilderStub({ ...input, riskStatement: lines.slice(0, 4).join('. ') });
    if (lines.length) {
      stub.risks = lines.slice(0, 15).map((line, idx) => ({
        id: `register-risk-${idx + 1}`,
        title: line.replace(/^[-*]\s*/, ''),
        category: 'Register',
        description: 'Imported from uploaded risk register.',
        source: 'register',
        regulations: stub.regulations.slice(0, 3)
      }));
      stub.summary = `Analysed ${lines.length} register entr${lines.length === 1 ? 'y' : 'ies'} and extracted ${stub.risks.length} candidate risks.`;
      stub.workflowGuidance = [
        'Keep the risks that materially change loss, disruption, regulation, or third-party exposure.',
        'Use linked mode when the selected risks could arise from the same underlying event or control failure.',
        'Ask AI assist to translate the selected scope into FAIR inputs with GCC-first benchmark logic.'
      ];
    }
    return _withEvidenceMeta(stub, evidenceMeta);
  }

  async function buildCompanyContext(websiteUrl) {
    const endpoint = _getCompanyContextUrl();
    if (!endpoint) {
      throw new Error('Company context building requires a hosted proxy URL, not direct browser-to-Compass mode.');
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ websiteUrl })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw _normaliseLLMError(new Error(`LLM API error ${res.status}: ${errText}`));
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(data.error);
    }
    return data;
  }


  function _buildEntityContextStub(input = {}) {
    const entityName = String(input.entity?.name || 'This entity').trim();
    const entityType = String(input.entity?.type || 'business unit').trim();
    const departmentRelationshipType = String(input.entity?.departmentRelationshipType || '').trim();
    const parentName = String(input.parentEntity?.name || 'the parent business unit').trim();
    const parentProfile = String(input.parentLayer?.contextSummary || input.parentEntity?.profile || '').trim();
    const remit = String(input.entity?.profile || input.entity?.departmentHint || '').trim();
    const geography = String(input.adminSettings?.geography || input.parentLayer?.geography || '').trim();
    const regulations = Array.from(new Set([
      ...(input.parentLayer?.applicableRegulations || []),
      ...(input.adminSettings?.applicableRegulations || [])
    ].map(String).filter(Boolean)));
    const relationshipText = departmentRelationshipType ? `${departmentRelationshipType.toLowerCase()} function within ${parentName}` : `${entityType.toLowerCase()} within ${parentName}`;
    const shortParentContext = parentProfile.split(/(?<=[.!?])\s+/).slice(0, 1).join(' ').trim();
    const remitSource = remit || `supporting ${parentName} through ${entityName.toLowerCase()} responsibilities`;
    const isDepartment = String(input.entity?.type || '').toLowerCase() === 'department / function';
    return {
      geography,
      contextSummary: isDepartment
        ? `${entityName} is an ${relationshipText}. It is responsible for ${remitSource}. Keep the summary focused on the team's core remit, dependencies, decision rights, and control responsibilities in support of ${parentName}${shortParentContext ? `, which currently operates in this context: ${shortParentContext}` : ''}.`
        : `${entityName} sits within ${parentName}. Capture the core remit, dependencies, operating model, and control responsibilities relevant to this entity${shortParentContext ? `, drawing on this parent context: ${shortParentContext}` : ''}.`,
      riskAppetiteStatement: `Keep ${entityName} aligned to ${parentName}'s risk appetite, but escalate issues that could materially disrupt critical services, weaken control assurance, or create regulatory exposure for the wider business unit.`,
      applicableRegulations: regulations,
      aiInstructions: isDepartment
        ? `Tailor outputs for ${entityName} as a ${relationshipText}. Keep summaries brief, functional, and role-specific. Do not restate the full group profile. Focus on actual responsibilities, dependencies, controls, and key interfaces with ${parentName}.`
        : `Tailor outputs for ${entityName} within ${parentName}. Avoid generic filler and emphasise operational responsibilities, dependencies, and control ownership.`,
      benchmarkStrategy: String(input.parentLayer?.benchmarkStrategy || input.adminSettings?.benchmarkStrategy || '').trim()
    };
  }

  async function buildEntityContext(input = {}) {
    const stub = _buildEntityContextStub(input);
    const isDepartment = String(input.entity?.type || '').toLowerCase() === 'department / function';
    if (_isDirectCompassUrl(_compassApiUrl) && !_compassApiKey) {
      return stub;
    }
    try {
      const systemPrompt = `You are a senior enterprise risk and operating-context analyst. Return JSON only with this schema:
{
  "geography": "string",
  "contextSummary": "string",
  "riskAppetiteStatement": "string",
  "applicableRegulations": ["string"],
  "aiInstructions": "string",
  "benchmarkStrategy": "string"
}`;
      const evidenceMeta = _buildEvidenceMeta({ citations: [], businessUnit: input.parentEntity, geography: input.adminSettings?.geography || input.parentLayer?.geography, applicableRegulations: input.parentLayer?.applicableRegulations || input.adminSettings?.applicableRegulations, organisationContext: input.parentLayer?.contextSummary || input.parentEntity?.profile, adminSettings: input.adminSettings, uploadedText: input.uploadedText });
      const userPrompt = `Build retained context for this organisation node.

Entity:
${JSON.stringify(input.entity || {}, null, 2)}

Parent entity:
${JSON.stringify(input.parentEntity || {}, null, 2)}

Existing layer:
${JSON.stringify(input.existingLayer || {}, null, 2)}

Parent layer:
${JSON.stringify(input.parentLayer || {}, null, 2)}

Global admin settings:
${JSON.stringify({
        geography: input.adminSettings?.geography || '',
        applicableRegulations: input.adminSettings?.applicableRegulations || [],
        aiInstructions: input.adminSettings?.aiInstructions || '',
        benchmarkStrategy: input.adminSettings?.benchmarkStrategy || '',
        riskAppetiteStatement: input.adminSettings?.riskAppetiteStatement || ''
      }, null, 2)}

${_buildUploadedDocumentBlock(input)}

Instructions:
- derive the context from the entity metadata, any existing remit text, and the parent business unit context
- if the entity is a department or function, inherit business-unit context and specialise it for the function
- for departments and functions, keep the context summary to 2-4 sentences max
- do not restate the full parent or group profile; only carry forward what is directly relevant to the function remit
- avoid generic corporate language and avoid inventing unsupported facts
- keep the context practical for future risk assessments and AI assistance
- include relevant regulations only when supported by the inherited context or the admin baseline

Evidence quality context:
${evidenceMeta.promptBlock}`;
      const raw = await _callLLM(systemPrompt, userPrompt, { maxCompletionTokens: 700, timeoutMs: 15000 });
      if (!raw) return _withEvidenceMeta(stub, evidenceMeta);
      const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
      return _withEvidenceMeta({
        geography: String(parsed.geography || stub.geography || '').trim(),
        contextSummary: _cleanUserFacingText(parsed.contextSummary || stub.contextSummary || '', { maxSentences: isDepartment ? 4 : 5 }),
        riskAppetiteStatement: _cleanUserFacingText(parsed.riskAppetiteStatement || stub.riskAppetiteStatement || '', { maxSentences: 2 }),
        applicableRegulations: Array.isArray(parsed.applicableRegulations) ? parsed.applicableRegulations.map(String).filter(Boolean) : stub.applicableRegulations,
        aiInstructions: _cleanUserFacingText(parsed.aiInstructions || stub.aiInstructions || '', { maxSentences: 3 }),
        benchmarkStrategy: _cleanUserFacingText(parsed.benchmarkStrategy || stub.benchmarkStrategy || '', { maxSentences: 2 })
      }, evidenceMeta);
    } catch (error) {
      console.warn('buildEntityContext fallback:', error.message);
      return _withEvidenceMeta(stub, _buildEvidenceMeta({ uploadedText: input.uploadedText || '', businessUnit: input.parentEntity, geography: input.adminSettings?.geography || input.parentLayer?.geography, applicableRegulations: input.parentLayer?.applicableRegulations || input.adminSettings?.applicableRegulations, organisationContext: input.parentLayer?.contextSummary || input.parentEntity?.profile, adminSettings: input.adminSettings }));
    }
  }

  function _buildUserPreferenceAssistStub(input = {}) {
    const role = String(input.userProfile?.jobTitle || 'team member').trim();
    const businessUnit = String(input.userProfile?.businessUnit || 'the business unit').trim();
    const department = String(input.userProfile?.department || 'the current function').trim();
    const uploadedContext = String(input.uploadedText || '').trim();
    const sourceHint = uploadedContext ? 'uploaded notes and source material' : 'the current profile and organisation context';
    return {
      workingContext: `${role} supporting ${department} in ${businessUnit}. Prioritise practical analysis tied to current responsibilities, dependencies, decision-making needs, and any regulated or business-critical services referenced in ${sourceHint}.`,
      preferredOutputs: `Give concise, decision-ready outputs for a ${role}. Lead with the main risk signal, explain why it matters to ${department}, and end with clear actions, owners, and escalation points where needed.`,
      aiInstructions: `Tailor outputs for a ${role} in ${department}, ${businessUnit}. Use the organisation context and any uploaded material, avoid generic filler, and keep recommendations practical, structured, and usable by the team.`,
      adminContextSummary: `Personal working context for ${role} in ${department}, ${businessUnit}. Focus on responsibilities, dependencies, stakeholder communication, and operational or regulatory impacts most relevant to this user.`
    };
  }

  async function refineEntityContext(input = {}) {
    const currentContext = {
      geography: String(input.currentContext?.geography || '').trim(),
      contextSummary: String(input.currentContext?.contextSummary || '').trim(),
      riskAppetiteStatement: String(input.currentContext?.riskAppetiteStatement || '').trim(),
      applicableRegulations: Array.isArray(input.currentContext?.applicableRegulations) ? input.currentContext.applicableRegulations.map(String).filter(Boolean) : [],
      aiInstructions: String(input.currentContext?.aiInstructions || '').trim(),
      benchmarkStrategy: String(input.currentContext?.benchmarkStrategy || '').trim()
    };
    const fallbackMessage = 'I refined the context using your latest instruction. Review the updated summary, appetite, regulations, and guidance before saving.';
    if (_isDirectCompassUrl(_compassApiUrl) && !_compassApiKey) {
      return {
        ...currentContext,
        responseMessage: fallbackMessage,
        confidenceLabel: 'Local fallback',
        evidenceQuality: 'No live model',
        evidenceSummary: 'A live AI model was not available, so the current context was kept as the working draft.',
        missingInformation: ['Connect a live AI model if you want iterative refinement from follow-up prompts.']
      };
    }
    try {
      const systemPrompt = `You are a senior enterprise risk and operating-context analyst. Refine an existing BU or function context based on user follow-up prompts. Return JSON only with this schema:
{
  "geography": "string",
  "contextSummary": "string",
  "riskAppetiteStatement": "string",
  "applicableRegulations": ["string"],
  "aiInstructions": "string",
  "benchmarkStrategy": "string",
  "responseMessage": "string"
}`;
      const evidenceMeta = _buildEvidenceMeta({
        citations: [],
        businessUnit: input.parentEntity,
        geography: currentContext.geography || input.adminSettings?.geography || input.parentLayer?.geography,
        applicableRegulations: currentContext.applicableRegulations.length ? currentContext.applicableRegulations : (input.parentLayer?.applicableRegulations || input.adminSettings?.applicableRegulations),
        organisationContext: currentContext.contextSummary || input.parentLayer?.contextSummary || input.parentEntity?.profile,
        adminSettings: input.adminSettings,
        uploadedText: input.uploadedText
      });
      const userPrompt = `Refine the retained context for this organisation node based on the latest user instruction.

Entity:
${JSON.stringify(input.entity || {}, null, 2)}

Parent entity:
${JSON.stringify(input.parentEntity || {}, null, 2)}

Current retained context:
${JSON.stringify(currentContext, null, 2)}

Parent layer:
${JSON.stringify(input.parentLayer || {}, null, 2)}

${_buildUploadedDocumentBlock(input)}

Recent conversation:
${JSON.stringify(_compactHistory(input.history, 3), null, 2)}

Latest user instruction:
${String(input.userPrompt || '').trim()}

Instructions:
- update the current retained context instead of restarting from scratch
- preserve good existing detail unless the latest instruction clearly changes it
- keep the context practical for future risk assessments and AI assistance
- for departments and functions, keep the context summary concise at 2-4 sentences
- avoid generic filler and avoid inventing unsupported facts
- explain what changed in responseMessage in plain language

Evidence quality context:
${evidenceMeta.promptBlock}`;
      const raw = await _callLLM(systemPrompt, userPrompt, { maxCompletionTokens: 700, timeoutMs: 12000 });
      if (!raw) {
        return _withEvidenceMeta({ ...currentContext, responseMessage: fallbackMessage }, evidenceMeta);
      }
      const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
      const isDepartment = String(input.entity?.type || '').toLowerCase() === 'department / function';
      return _withEvidenceMeta({
        geography: String(parsed.geography || currentContext.geography || '').trim(),
        contextSummary: _cleanUserFacingText(parsed.contextSummary || currentContext.contextSummary || '', { maxSentences: isDepartment ? 4 : 5 }),
        riskAppetiteStatement: _cleanUserFacingText(parsed.riskAppetiteStatement || currentContext.riskAppetiteStatement || '', { maxSentences: 2 }),
        applicableRegulations: Array.isArray(parsed.applicableRegulations) ? parsed.applicableRegulations.map(String).filter(Boolean) : currentContext.applicableRegulations,
        aiInstructions: _cleanUserFacingText(parsed.aiInstructions || currentContext.aiInstructions || '', { maxSentences: 3 }),
        benchmarkStrategy: _cleanUserFacingText(parsed.benchmarkStrategy || currentContext.benchmarkStrategy || '', { maxSentences: 2 }),
        responseMessage: _cleanUserFacingText(parsed.responseMessage || fallbackMessage, { maxSentences: 3 })
      }, evidenceMeta);
    } catch (error) {
      console.warn('refineEntityContext fallback:', error.message);
      return _withEvidenceMeta({
        ...currentContext,
        responseMessage: fallbackMessage
      }, _buildEvidenceMeta({
        citations: [],
        businessUnit: input.parentEntity,
        geography: currentContext.geography || input.adminSettings?.geography || input.parentLayer?.geography,
        applicableRegulations: currentContext.applicableRegulations.length ? currentContext.applicableRegulations : (input.parentLayer?.applicableRegulations || input.adminSettings?.applicableRegulations),
        organisationContext: currentContext.contextSummary || input.parentLayer?.contextSummary || input.parentEntity?.profile,
        adminSettings: input.adminSettings,
        uploadedText: input.uploadedText
      }));
    }
  }

  async function refineCompanyContext(input = {}) {
    const currentSections = {
      companySummary: String(input.currentSections?.companySummary || '').trim(),
      businessModel: String(input.currentSections?.businessModel || '').trim(),
      operatingModel: String(input.currentSections?.operatingModel || '').trim(),
      publicCommitments: String(input.currentSections?.publicCommitments || '').trim(),
      keyRiskSignals: String(input.currentSections?.keyRiskSignals || '').trim(),
      obligations: String(input.currentSections?.obligations || '').trim(),
      sources: String(input.currentSections?.sources || '').trim()
    };
    const fallbackMessage = 'I refined the company context using your latest instruction. Review the updated sections before saving.';
    if (_isDirectCompassUrl(_compassApiUrl) && !_compassApiKey) {
      return {
        ...currentSections,
        responseMessage: fallbackMessage,
        confidenceLabel: 'Local fallback',
        evidenceQuality: 'No live model',
        evidenceSummary: 'A live AI model was not available, so the current company context was kept as the working draft.',
        missingInformation: ['Connect a live AI model if you want iterative refinement from follow-up prompts.'],
        regulatorySignals: input.currentRegulations || [],
        aiGuidance: input.currentAiGuidance || '',
        suggestedGeography: input.currentGeography || ''
      };
    }
    try {
      const systemPrompt = `You are a senior enterprise risk and company-context analyst. Refine an existing company context based on user follow-up prompts. Return JSON only with this schema:
{
  "companySummary": "string",
  "businessModel": "string",
  "operatingModel": "string",
  "publicCommitments": "string",
  "keyRiskSignals": "string",
  "obligations": "string",
  "sources": "string",
  "aiGuidance": "string",
  "suggestedGeography": "string",
  "regulatorySignals": ["string"],
  "responseMessage": "string"
}`;
      const evidenceMeta = _buildEvidenceMeta({
        citations: [],
        geography: input.currentGeography,
        applicableRegulations: input.currentRegulations,
        organisationContext: currentSections,
        adminSettings: { aiInstructions: input.currentAiGuidance || '' },
        uploadedText: input.uploadedText
      });
      const userPrompt = `Refine the current company context based on the latest instruction.

Website URL:
${String(input.websiteUrl || '').trim()}

Current context sections:
${JSON.stringify(currentSections, null, 2)}

Current AI guidance:
${String(input.currentAiGuidance || '').trim()}

Current geography:
${String(input.currentGeography || '').trim()}

Current regulation tags:
${JSON.stringify(Array.isArray(input.currentRegulations) ? input.currentRegulations : [], null, 2)}

${_buildUploadedDocumentBlock(input)}

Recent conversation:
${JSON.stringify(_compactHistory(input.history, 3), null, 2)}

Latest user instruction:
${String(input.userPrompt || '').trim()}

Instructions:
- refine the current sections instead of starting over
- preserve good existing detail unless the latest prompt clearly changes it
- keep the output grounded, specific, and useful for future risk assessments
- avoid generic filler and avoid inventing unsupported facts
- explain what changed in responseMessage in plain language

Evidence quality context:
${evidenceMeta.promptBlock}`;
      const raw = await _callLLM(systemPrompt, userPrompt, { maxCompletionTokens: 800, timeoutMs: 12000 });
      if (!raw) {
        return _withEvidenceMeta({
          ...currentSections,
          aiGuidance: String(input.currentAiGuidance || '').trim(),
          suggestedGeography: String(input.currentGeography || '').trim(),
          regulatorySignals: Array.isArray(input.currentRegulations) ? input.currentRegulations : [],
          responseMessage: fallbackMessage
        }, evidenceMeta);
      }
      const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
      return _withEvidenceMeta({
        companySummary: _cleanUserFacingText(parsed.companySummary || currentSections.companySummary || '', { maxSentences: 4 }),
        businessModel: _cleanUserFacingText(parsed.businessModel || currentSections.businessModel || '', { maxSentences: 4 }),
        operatingModel: _cleanUserFacingText(parsed.operatingModel || currentSections.operatingModel || '', { maxSentences: 4 }),
        publicCommitments: _cleanUserFacingText(parsed.publicCommitments || currentSections.publicCommitments || '', { maxSentences: 5 }),
        keyRiskSignals: _cleanUserFacingText(parsed.keyRiskSignals || currentSections.keyRiskSignals || '', { maxSentences: 5 }),
        obligations: _cleanUserFacingText(parsed.obligations || currentSections.obligations || '', { maxSentences: 5 }),
        sources: _cleanUserFacingText(parsed.sources || currentSections.sources || '', { maxSentences: 6 }),
        aiGuidance: _cleanUserFacingText(parsed.aiGuidance || input.currentAiGuidance || '', { maxSentences: 3 }),
        suggestedGeography: String(parsed.suggestedGeography || input.currentGeography || '').trim(),
        regulatorySignals: Array.isArray(parsed.regulatorySignals) ? parsed.regulatorySignals.map(String).filter(Boolean) : (Array.isArray(input.currentRegulations) ? input.currentRegulations : []),
        responseMessage: _cleanUserFacingText(parsed.responseMessage || fallbackMessage, { maxSentences: 3 })
      }, evidenceMeta);
    } catch (error) {
      console.warn('refineCompanyContext fallback:', error.message);
      return _withEvidenceMeta({
        ...currentSections,
        aiGuidance: String(input.currentAiGuidance || '').trim(),
        suggestedGeography: String(input.currentGeography || '').trim(),
        regulatorySignals: Array.isArray(input.currentRegulations) ? input.currentRegulations : [],
        responseMessage: fallbackMessage
      }, _buildEvidenceMeta({
        citations: [],
        geography: input.currentGeography,
        applicableRegulations: input.currentRegulations,
        organisationContext: currentSections,
        adminSettings: { aiInstructions: input.currentAiGuidance || '' },
        uploadedText: input.uploadedText
      }));
    }
  }

  async function buildUserPreferenceAssist(input = {}) {
    const stub = _buildUserPreferenceAssistStub(input);
    if (_isDirectCompassUrl(_compassApiUrl) && !_compassApiKey) return stub;
    try {
      const systemPrompt = `You are a senior enterprise risk assistant helping personalise a user's working context. Return JSON only with this schema:
{
  "workingContext": "string",
  "preferredOutputs": "string",
  "aiInstructions": "string",
  "adminContextSummary": "string"
}`;
      const evidenceMeta = _buildEvidenceMeta({ uploadedText: input.uploadedText, userProfile: input.userProfile, geography: input.organisationContext?.geography || input.currentSettings?.primaryGeography, applicableRegulations: input.currentSettings?.applicableRegulations, organisationContext: input.organisationContext, adminSettings: input.currentSettings, citations: [] });
      const userPrompt = `Create concise personalised settings for this user.

User profile:
${JSON.stringify(input.userProfile || {}, null, 2)}

Organisation selection:
${JSON.stringify(input.organisationContext || {}, null, 2)}

Existing personal settings:
${JSON.stringify(input.currentSettings || {}, null, 2)}

Uploaded source text:
${String(input.uploadedText || '').slice(0, 12000)}

Instructions:
- use uploaded text when provided, otherwise rely on the role and organisation context
- keep each field concise and practical
- make the output specific to the user's role, BU, and department
- do not restate generic company marketing language
- workingContext should explain the user's likely operating context in 2-4 sentences
- preferredOutputs should describe how answers should be formatted for this user
- aiInstructions should be a compact set of standing instructions for future AI responses
- adminContextSummary should be a short personal context summary suitable for defaults

Evidence quality context:
${evidenceMeta.promptBlock}`;
      const raw = await _callLLM(systemPrompt, userPrompt, { maxCompletionTokens: 700, timeoutMs: 15000 });
      if (!raw) return _withEvidenceMeta(stub, evidenceMeta);
      const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
      return _withEvidenceMeta({
        workingContext: _cleanUserFacingText(parsed.workingContext || stub.workingContext || '', { maxSentences: 4 }),
        preferredOutputs: _cleanUserFacingText(parsed.preferredOutputs || stub.preferredOutputs || '', { maxSentences: 3 }),
        aiInstructions: _cleanUserFacingText(parsed.aiInstructions || stub.aiInstructions || '', { maxSentences: 3 }),
        adminContextSummary: _cleanUserFacingText(parsed.adminContextSummary || stub.adminContextSummary || '', { maxSentences: 3 })
      }, evidenceMeta);
    } catch (error) {
      console.warn('buildUserPreferenceAssist fallback:', error.message);
      return _withEvidenceMeta(stub, _buildEvidenceMeta({ uploadedText: input.uploadedText, userProfile: input.userProfile, geography: input.organisationContext?.geography || input.currentSettings?.primaryGeography, applicableRegulations: input.currentSettings?.applicableRegulations, organisationContext: input.organisationContext, adminSettings: input.currentSettings, citations: [] }));
    }
  }


  function _buildTreatmentImprovementStub(input = {}) {
    const request = String(input.improvementRequest || '').toLowerCase();
    const baseline = input.baselineAssessment?.fairParams || input.baselineAssessment?.results?.inputs || {};
    const next = JSON.parse(JSON.stringify(baseline || {}));
    const notes = [];
    const adjust = (key, factor, floor = null, ceil = null) => {
      const current = Number(next[key]);
      if (!Number.isFinite(current)) return;
      let value = current * factor;
      if (floor != null) value = Math.max(floor, value);
      if (ceil != null) value = Math.min(ceil, value);
      next[key] = Number(value.toFixed(2));
    };

    if (/control|mfa|access|identity|monitor|detect|response/.test(request)) {
      adjust('controlStrMin', 1.12, 0, 0.99);
      adjust('controlStrLikely', 1.15, 0, 0.99);
      adjust('controlStrMax', 1.1, 0, 0.995);
      adjust('vulnMin', 0.9, 0.01, 1);
      adjust('vulnLikely', 0.85, 0.01, 1);
      adjust('vulnMax', 0.82, 0.01, 1);
      notes.push('Control strength has been lifted to reflect stronger preventive and detective controls.');
    }
    if (/less exposure|lower exposure|reduc|contain|segmentation|hardening/.test(request)) {
      adjust('threatCapMin', 0.95, 0, 1);
      adjust('threatCapLikely', 0.92, 0, 1);
      adjust('threatCapMax', 0.9, 0, 1);
      adjust('vulnMin', 0.88, 0.01, 1);
      adjust('vulnLikely', 0.82, 0.01, 1);
      adjust('vulnMax', 0.78, 0.01, 1);
      notes.push('Exposure has been reduced to reflect better containment and lower successful attack opportunity.');
    }
    if (/less financial|lower loss|cheaper|reduce cost|lower disruption|resilience|faster recovery/.test(request)) {
      ['biMin','biLikely','biMax'].forEach((key, idx) => adjust(key, [0.75,0.7,0.68][idx], 0, null));
      ['irMin','irLikely','irMax'].forEach((key, idx) => adjust(key, [0.9,0.88,0.86][idx], 0, null));
      ['rcMin','rcLikely','rcMax'].forEach((key, idx) => adjust(key, [0.92,0.88,0.85][idx], 0, null));
      notes.push('Financial and disruption losses have been reduced to reflect faster containment, better resilience, or lower downstream harm.');
    }
    if (/less frequent|lower frequency|rarer|harder to happen|prevent/.test(request)) {
      ['tefMin','tefLikely','tefMax'].forEach((key, idx) => adjust(key, [0.85,0.78,0.72][idx], 0.1, null));
      notes.push('Event frequency has been reduced to reflect lower likelihood under the improved future state.');
    }
    if (!notes.length) {
      adjust('controlStrLikely', 1.08, 0, 0.99);
      adjust('tefLikely', 0.9, 0.1, null);
      adjust('biLikely', 0.9, 0, null);
      notes.push('The future-state case assumes moderately stronger controls, lower event success, and better operational containment.');
    }
    return {
      summary: 'The future-state case adjusts the baseline to reflect the improvement described by the user.',
      changesSummary: notes.join(' '),
      workflowGuidance: [
        'Review the adjusted values and make sure they reflect a credible future state rather than an ideal one.',
        'Focus on the one or two assumptions that would realistically improve first, then rerun the model.',
        'Use the comparison view to judge whether the improvement meaningfully changes tolerance position.'
      ],
      benchmarkBasis: 'The adjusted values represent a future-state comparison case. They should reflect plausible control or resilience improvements, not best-case assumptions.',
      inputRationale: {
        tef: 'Frequency was reduced only where the requested improvement would plausibly lower how often the scenario succeeds.',
        vulnerability: 'Exposure was reduced where stronger controls, better identity protection, or tighter containment were implied by the request.',
        lossComponents: 'Loss values were reduced where the request suggests faster recovery, lower disruption, or less downstream financial impact.'
      },
      suggestedInputs: {
        TEF: { min: next.tefMin, likely: next.tefLikely, max: next.tefMax },
        controlStrength: { min: next.controlStrMin, likely: next.controlStrLikely, max: next.controlStrMax },
        threatCapability: { min: next.threatCapMin, likely: next.threatCapLikely, max: next.threatCapMax },
        lossComponents: {
          incidentResponse: { min: next.irMin, likely: next.irLikely, max: next.irMax },
          businessInterruption: { min: next.biMin, likely: next.biLikely, max: next.biMax },
          dataBreachRemediation: { min: next.dbMin, likely: next.dbLikely, max: next.dbMax },
          regulatoryLegal: { min: next.rlMin, likely: next.rlLikely, max: next.rlMax },
          thirdPartyLiability: { min: next.tpMin, likely: next.tpLikely, max: next.tpMax },
          reputationContract: { min: next.rcMin, likely: next.rcLikely, max: next.rcMax }
        }
      },
      citations: input.citations || []
    };
  }

  async function suggestTreatmentImprovement(input = {}) {
    const stub = _buildTreatmentImprovementStub(input);
    await new Promise(r => setTimeout(r, 900 + Math.random() * 400));
    if (_compassApiKey || !_isDirectCompassUrl(_compassApiUrl)) {
      try {
        const systemPrompt = `You are a senior FAIR analyst helping a user model an improved future state. Return JSON only with this schema:
{
  "summary": "string",
  "changesSummary": "string",
  "workflowGuidance": ["string"],
  "benchmarkBasis": "string",
  "inputRationale": {
    "tef": "string",
    "vulnerability": "string",
    "lossComponents": "string"
  },
  "suggestedInputs": {
    "TEF": { "min": number, "likely": number, "max": number },
    "controlStrength": { "min": number, "likely": number, "max": number },
    "threatCapability": { "min": number, "likely": number, "max": number },
    "lossComponents": {
      "incidentResponse": { "min": number, "likely": number, "max": number },
      "businessInterruption": { "min": number, "likely": number, "max": number },
      "dataBreachRemediation": { "min": number, "likely": number, "max": number },
      "regulatoryLegal": { "min": number, "likely": number, "max": number },
      "thirdPartyLiability": { "min": number, "likely": number, "max": number },
      "reputationContract": { "min": number, "likely": number, "max": number }
    }
  }
}`;
        const evidenceMeta = _buildEvidenceMeta({ citations: input.citations || [], businessUnit: input.businessUnit, geography: input.baselineAssessment?.geography || input.businessUnit?.geography, applicableRegulations: input.baselineAssessment?.applicableRegulations, organisationContext: input.baselineAssessment?.narrative, uploadedText: input.improvementRequest, adminSettings: input.adminSettings, userProfile: input.adminSettings?.userProfileSummary });
        const userPrompt = `Baseline scenario title: ${input.baselineAssessment?.scenarioTitle || 'Untitled scenario'}
Baseline narrative: ${input.baselineAssessment?.enhancedNarrative || input.baselineAssessment?.narrative || ''}
Business unit: ${input.businessUnit?.name || 'Unknown'}
Geography: ${input.baselineAssessment?.geography || input.businessUnit?.geography || 'Unknown'}
User improvement request: ${input.improvementRequest || '(none)'}
Current FAIR inputs:
${JSON.stringify(input.baselineAssessment?.fairParams || input.baselineAssessment?.results?.inputs || {}, null, 2)}
Relevant citations:
${_buildCitationPromptBlock(input.citations || [])}
Live scoped context:
${_buildContextPromptBlock(input.adminSettings, input.businessUnit)}
Instructions:
- treat this as a future-state comparison case, not a rewrite of the original scenario
- adjust only the FAIR inputs that are plausibly improved by the user's request
- keep changes credible and proportionate
- explain what you changed in plain language
- prefer stronger controls, lower event frequency, lower vulnerability, or lower loss only when justified by the user's request

Evidence quality context:
${evidenceMeta.promptBlock}`;
        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
          const ensureRange = (value, fallbackRange) => ({
            min: value?.min ?? fallbackRange?.min ?? 0,
            likely: value?.likely ?? fallbackRange?.likely ?? 0,
            max: value?.max ?? fallbackRange?.max ?? 0,
          });
          return _withEvidenceMeta({
            summary: _cleanUserFacingText(parsed.summary || stub.summary || '', { maxSentences: 2 }),
            changesSummary: _cleanUserFacingText(parsed.changesSummary || stub.changesSummary || '', { maxSentences: 3 }),
            workflowGuidance: _normaliseGuidance(parsed.workflowGuidance?.length ? parsed.workflowGuidance : stub.workflowGuidance),
            benchmarkBasis: _normaliseBenchmarkBasis(parsed.benchmarkBasis || stub.benchmarkBasis || ''),
            inputRationale: _normaliseInputRationale({ ...stub.inputRationale, ...(parsed.inputRationale || {}) }),
            suggestedInputs: {
              TEF: ensureRange(parsed?.suggestedInputs?.TEF, stub.suggestedInputs.TEF),
              controlStrength: ensureRange(parsed?.suggestedInputs?.controlStrength, stub.suggestedInputs.controlStrength),
              threatCapability: ensureRange(parsed?.suggestedInputs?.threatCapability, stub.suggestedInputs.threatCapability),
              lossComponents: {
                incidentResponse: ensureRange(parsed?.suggestedInputs?.lossComponents?.incidentResponse, stub.suggestedInputs.lossComponents.incidentResponse),
                businessInterruption: ensureRange(parsed?.suggestedInputs?.lossComponents?.businessInterruption, stub.suggestedInputs.lossComponents.businessInterruption),
                dataBreachRemediation: ensureRange(parsed?.suggestedInputs?.lossComponents?.dataBreachRemediation, stub.suggestedInputs.lossComponents.dataBreachRemediation),
                regulatoryLegal: ensureRange(parsed?.suggestedInputs?.lossComponents?.regulatoryLegal, stub.suggestedInputs.lossComponents.regulatoryLegal),
                thirdPartyLiability: ensureRange(parsed?.suggestedInputs?.lossComponents?.thirdPartyLiability, stub.suggestedInputs.lossComponents.thirdPartyLiability),
                reputationContract: ensureRange(parsed?.suggestedInputs?.lossComponents?.reputationContract, stub.suggestedInputs.lossComponents.reputationContract)
              }
            },
            citations: input.citations || []
          }, evidenceMeta);
        }
      } catch (error) {
        console.warn('suggestTreatmentImprovement fallback:', error.message);
      }
    }
    return _withEvidenceMeta(stub, _buildEvidenceMeta({ citations: input.citations || [], businessUnit: input.businessUnit, geography: input.baselineAssessment?.geography || input.businessUnit?.geography, applicableRegulations: input.baselineAssessment?.applicableRegulations, organisationContext: input.baselineAssessment?.narrative, uploadedText: input.improvementRequest, adminSettings: input.adminSettings, userProfile: input.adminSettings?.userProfileSummary }));
  }

  function _buildAssessmentChallengeStub(input = {}) {
    const confidence = input.confidence || {};
    const assumptions = Array.isArray(input.assumptions) ? input.assumptions : [];
    const drivers = input.drivers || { upward: [], stabilisers: [] };
    const weakestAssumptions = assumptions.slice(0, 3).map(item => `${item.category}: ${item.text}`);
    const committeeQuestions = [];
    if (drivers.upward?.[0]) committeeQuestions.push(`What evidence supports the conclusion that ${drivers.upward[0].charAt(0).toLowerCase()}${drivers.upward[0].slice(1)}`);
    if (confidence.label === 'Low confidence') committeeQuestions.push('Which ranges are still too uncertain for strong decision-making and why are they still broad?');
    if ((input.missingInformation || []).length) committeeQuestions.push(`What missing evidence would change the assessment most: ${(input.missingInformation || []).slice(0, 2).join(' and ')}?`);
    if (!committeeQuestions.length) committeeQuestions.push('Which one or two assumptions would most change the tolerance position if they proved wrong?');
    const evidenceToGather = [];
    if ((input.missingInformation || []).length) evidenceToGather.push(...input.missingInformation.slice(0, 3));
    if (!evidenceToGather.length) {
      evidenceToGather.push('Internal incident history or loss data for similar scenarios.');
      evidenceToGather.push('Control evidence showing how consistently the key controls operate in practice.');
      evidenceToGather.push('Finance or operational data to validate the biggest cost assumptions.');
    }
    const challengeLevel = confidence.label === 'Low confidence' ? 'High challenge needed' : confidence.label === 'High confidence' ? 'Moderate challenge still warranted' : 'Targeted challenge recommended';
    return {
      summary: confidence.label === 'Low confidence'
        ? 'The assessment is directionally useful, but a risk committee should challenge the broadest assumptions before relying on it for strong decisions.'
        : 'The assessment is decision-useful, but a risk committee should still test the assumptions that are driving the result most.' ,
      challengeLevel,
      weakestAssumptions,
      committeeQuestions,
      evidenceToGather,
      reviewerGuidance: [
        'Focus first on the assumptions most likely to move the tolerance position.',
        'Challenge whether the cost and frequency assumptions are supported by internal evidence rather than only judgement.',
        'Confirm that the selected regulatory and business scope still matches the scenario being discussed.'
      ]
    };
  }

  async function challengeAssessment(input = {}) {
    const stub = _buildAssessmentChallengeStub(input);
    await new Promise(r => setTimeout(r, 700 + Math.random() * 300));
    const evidenceMeta = _buildEvidenceMeta({
      citations: input.citations || [],
      businessUnit: input.businessUnit,
      geography: input.geography,
      applicableRegulations: input.applicableRegulations,
      organisationContext: input.narrative,
      uploadedText: (Array.isArray(input.assumptions) ? input.assumptions.map(item => item.text).join('\n') : ''),
      adminSettings: input.adminSettings,
      userProfile: input.adminSettings?.userProfileSummary
    });
    if (_compassApiKey || !_isDirectCompassUrl(_compassApiUrl)) {
      try {
        const systemPrompt = `You are a senior risk committee reviewer. Return JSON only with this schema:
{
  "summary": "string",
  "challengeLevel": "string",
  "weakestAssumptions": ["string"],
  "committeeQuestions": ["string"],
  "evidenceToGather": ["string"],
  "reviewerGuidance": ["string"]
}`;
        const userPrompt = `Assessment title: ${input.scenarioTitle || 'Untitled assessment'}
Business unit: ${input.businessUnit?.name || input.businessUnitName || 'Unknown'}
Geography: ${input.geography || 'Unknown'}
Scenario narrative: ${input.narrative || ''}
Confidence summary: ${input.confidence?.summary || ''}
Confidence label: ${input.confidence?.label || ''}
Main upward drivers:
${(input.drivers?.upward || []).map(item => `- ${item}`).join('\n')}
Main stabilisers:
${(input.drivers?.stabilisers || []).map(item => `- ${item}`).join('\n')}
Assumptions:
${(input.assumptions || []).map(item => `- ${item.category}: ${item.text}`).join('\n')}
Missing information:
${(input.missingInformation || []).map(item => `- ${item}`).join('\n')}
Relevant citations:
${_buildCitationPromptBlock(input.citations || [])}
Live scoped context:
${_buildContextPromptBlock(input.adminSettings, input.businessUnit)}
Instructions:
- act like a risk committee or challenge session reviewer
- do not restate the full scenario
- identify the assumptions most worth challenging
- propose the questions a committee would ask
- suggest the evidence that would most improve confidence
- keep the tone practical, concise, and decision-oriented

Evidence quality context:
${evidenceMeta.promptBlock}`;
        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
          return _withEvidenceMeta({
            summary: _cleanUserFacingText(parsed.summary || stub.summary || '', { maxSentences: 3 }),
            challengeLevel: _cleanUserFacingText(parsed.challengeLevel || stub.challengeLevel || '', { maxSentences: 1 }),
            weakestAssumptions: (Array.isArray(parsed.weakestAssumptions) ? parsed.weakestAssumptions : stub.weakestAssumptions).slice(0, 4).map(item => _cleanUserFacingText(item || '', { maxSentences: 1 })),
            committeeQuestions: (Array.isArray(parsed.committeeQuestions) ? parsed.committeeQuestions : stub.committeeQuestions).slice(0, 4).map(item => _cleanUserFacingText(item || '', { maxSentences: 1 })),
            evidenceToGather: (Array.isArray(parsed.evidenceToGather) ? parsed.evidenceToGather : stub.evidenceToGather).slice(0, 4).map(item => _cleanUserFacingText(item || '', { maxSentences: 1 })),
            reviewerGuidance: _normaliseGuidance(Array.isArray(parsed.reviewerGuidance) && parsed.reviewerGuidance.length ? parsed.reviewerGuidance : stub.reviewerGuidance)
          }, evidenceMeta);
        }
      } catch (error) {
        console.warn('challengeAssessment fallback:', error.message);
      }
    }
    return _withEvidenceMeta(stub, evidenceMeta);
  }


  function buildLocalEntityContextRefinement(input = {}) {
    const current = {
      geography: String(input.currentContext?.geography || '').trim(),
      contextSummary: String(input.currentContext?.contextSummary || '').trim(),
      riskAppetiteStatement: String(input.currentContext?.riskAppetiteStatement || '').trim(),
      applicableRegulations: Array.isArray(input.currentContext?.applicableRegulations) ? input.currentContext.applicableRegulations.map(String).filter(Boolean) : [],
      aiInstructions: String(input.currentContext?.aiInstructions || '').trim(),
      benchmarkStrategy: String(input.currentContext?.benchmarkStrategy || '').trim()
    };
    const prompt = _cleanUserFacingText(input.userPrompt || '', { maxSentences: 2 });
    const uploadedHint = String(input.uploadedText || '').trim() ? 'Uploaded policy and procedure material was considered in the fallback refinement.' : '';
    const summaryBits = [current.contextSummary, prompt ? `Refinement focus: ${prompt}` : '', uploadedHint].filter(Boolean);
    return _withEvidenceMeta({
      ...current,
      contextSummary: _cleanUserFacingText(summaryBits.join(' '), { maxSentences: String(input.entity?.type || '').toLowerCase() === 'department / function' ? 4 : 5 }),
      responseMessage: _cleanUserFacingText(`I applied a faster local refinement${prompt ? ` focused on ${prompt.toLowerCase()}` : ''}. Review the updated context and adjust anything that still needs more precision.`, { maxSentences: 2 })
    }, _buildEvidenceMeta({
      citations: [],
      businessUnit: input.parentEntity,
      geography: current.geography || input.adminSettings?.geography || input.parentLayer?.geography,
      applicableRegulations: current.applicableRegulations,
      organisationContext: current.contextSummary || input.parentLayer?.contextSummary || input.parentEntity?.profile,
      adminSettings: input.adminSettings,
      uploadedText: input.uploadedText
    }));
  }

  function buildLocalCompanyContextRefinement(input = {}) {
    const currentSections = {
      companySummary: String(input.currentSections?.companySummary || '').trim(),
      businessModel: String(input.currentSections?.businessModel || '').trim(),
      operatingModel: String(input.currentSections?.operatingModel || '').trim(),
      publicCommitments: String(input.currentSections?.publicCommitments || '').trim(),
      keyRiskSignals: String(input.currentSections?.keyRiskSignals || '').trim(),
      obligations: String(input.currentSections?.obligations || '').trim(),
      sources: String(input.currentSections?.sources || '').trim()
    };
    const prompt = _cleanUserFacingText(input.userPrompt || '', { maxSentences: 2 });
    const uploadedHint = String(input.uploadedText || '').trim() ? 'Uploaded strategy, policy, or procedure material was folded into this fallback refinement.' : '';
    return _withEvidenceMeta({
      ...currentSections,
      aiGuidance: String(input.currentAiGuidance || '').trim(),
      suggestedGeography: String(input.currentGeography || '').trim(),
      regulatorySignals: Array.isArray(input.currentRegulations) ? input.currentRegulations : [],
      companySummary: _cleanUserFacingText([currentSections.companySummary, prompt ? `Refinement focus: ${prompt}` : '', uploadedHint].filter(Boolean).join(' '), { maxSentences: 4 }),
      responseMessage: _cleanUserFacingText(`I applied a faster local refinement${prompt ? ` focused on ${prompt.toLowerCase()}` : ''}. Review the updated company context and tighten any remaining sections manually if needed.`, { maxSentences: 2 })
    }, _buildEvidenceMeta({
      citations: [],
      geography: input.currentGeography,
      applicableRegulations: input.currentRegulations,
      organisationContext: currentSections,
      adminSettings: { aiInstructions: input.currentAiGuidance || '' },
      uploadedText: input.uploadedText
    }));
  }

  async function testCompassConnection() {
    if (_isDirectCompassUrl(_compassApiUrl) && !_compassApiKey) {
      throw new Error('No Compass API key configured for this session.');
    }
    const raw = await _callLLM(
      'You are a connectivity check. Reply with valid JSON only.',
      'Return exactly this JSON and nothing else: {"status":"ok","provider":"core42","message":"connection successful"}'
    );
    if (!raw) {
      throw new Error('Compass returned an empty response.');
    }
    try {
      return JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
    } catch {
      return { status: 'ok', provider: 'core42', message: 'Connection succeeded, but the response was not strict JSON.' };
    }
  }

  return {
    generateScenarioAndInputs,
    enhanceRiskContext,
    analyseRiskRegister,
    buildCompanyContext,
    refineCompanyContext,
    buildLocalCompanyContextRefinement,
    buildEntityContext,
    refineEntityContext,
    buildLocalEntityContextRefinement,
    buildUserPreferenceAssist,
    suggestTreatmentImprovement,
    challengeAssessment,
    testCompassConnection,
    setCompassAPIKey,
    setCompassConfig,
    clearCompassConfig,
    setOpenAIKey
  };
})();
