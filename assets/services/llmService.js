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
  async function _callLLM(systemPrompt, userPrompt) {
    const directCompass = _isDirectCompassUrl(_compassApiUrl);
    if (directCompass && !_compassApiKey) return null; // fall through to stub

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (_compassApiKey) {
        headers.Authorization = `Bearer ${_compassApiKey}`;
      }
      const res = await fetch(_compassApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: _compassModel,
          max_completion_tokens: 1200,
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
    } catch (error) {
      throw _normaliseLLMError(error);
    }
  }

  // ─── Stub generator ──────────────────────────────────────
  function _generateStub(narrative, buContext, citations) {
    const n = (narrative || '').toLowerCase();

    // Detect scenario type from narrative keywords
    const isRansomware = n.includes('ransomware') || n.includes('encrypt') || n.includes('ransom');
    const isDataBreach = n.includes('breach') || n.includes('data theft') || n.includes('exfil');
    const isPhishing   = n.includes('phish') || n.includes('bec') || n.includes('email');
    const isCloud      = n.includes('cloud') || n.includes('misconfigur') || n.includes('s3') || n.includes('azure');
    const isInsider    = n.includes('insider') || n.includes('employee') || n.includes('privilege');

    let scenarioType = 'General Cyber Threat';
    let tef   = { min: 0.5, likely: 2, max: 8 };
    let cs    = { min: 0.5, likely: 0.68, max: 0.85 };
    let tc    = { min: 0.45, likely: 0.62, max: 0.82 };
    let recommendations = [];

    if (isRansomware) {
      scenarioType = 'Ransomware / Extortion Attack';
      tef  = { min: 0.3, likely: 1.5, max: 5 };
      tc   = { min: 0.55, likely: 0.72, max: 0.90 };
      recommendations = [
        { title: 'Immutable Offline Backups', why: 'Ransomware relies on destroying recovery options. Offline backups with verified restore tests eliminate the primary leverage attackers hold.', impact: 'Reduces recovery time from 18+ days to <5 days; eliminates ransom leverage.' },
        { title: 'MFA on All Privileged Accounts', why: 'Ransomware actors consistently abuse compromised credentials. Phishing-resistant MFA (hardware keys/FIDO2) prevents lateral movement.', impact: 'Estimated 80% reduction in successful credential-based lateral movement.' },
        { title: 'Endpoint Detection & Response (EDR)', why: 'Behavioural EDR detects ransomware staging (large-scale file enumeration, shadow copy deletion) before encryption begins.', impact: 'Average dwell time reduction from 9 days to <24 hours with mature EDR.' },
        { title: 'Network Segmentation', why: 'Flat networks allow ransomware to spread across all BUs. Segmentation limits blast radius to the initially compromised zone.', impact: 'Can reduce impacted systems by 60–80% in a ransomware event.' },
        { title: 'Tabletop Exercise — Ransomware Scenario', why: 'Decision latency under pressure is a primary cost driver. Regular exercises reduce average decision time and improve coordination.', impact: 'Typically reduces response costs by 15–25% through preparedness.' },
        { title: 'Cyber Insurance Review', why: 'Ransomware claims have driven changes in policy terms. Ensure policy covers extortion, business interruption, and regulatory notification costs.', impact: 'Risk transfer; coverage gap identification before an event is critical.' }
      ];
    } else if (isDataBreach) {
      scenarioType = 'Data Breach / Unauthorised Data Disclosure';
      tc   = { min: 0.50, likely: 0.68, max: 0.88 };
      recommendations = [
        { title: 'Data Loss Prevention (DLP)', why: 'Exfiltration of Restricted data is the primary breach vector. DLP on email, cloud uploads, and USB prevents unauthorised egress.', impact: 'Reduces exfiltration window from days to hours; blocks opportunistic theft.' },
        { title: 'Data Classification Enforcement', why: 'Without clear classification, users handle Restricted data with insufficient controls. Automated classification reduces human error.', impact: 'Directly reduces scope of breach; limits regulatory notification obligations.' },
        { title: 'Zero Trust Network Access (ZTNA)', why: 'Lateral movement to data stores post-compromise is the typical path. ZTNA enforces least-privilege access per session.', impact: 'Limits attacker reach to one data zone; reduces breach scope by ~70%.' },
        { title: 'Encryption at Rest for All Restricted Data', why: 'Encryption renders stolen data unreadable, potentially exempting the organisation from breach notification requirements.', impact: 'May eliminate regulatory notification obligation; reduces reputational impact.' },
        { title: 'Breach Notification Runbook', why: 'UAE, GDPR, and PCI notification windows are tight (24–72 hours). A pre-tested runbook reduces costly delays and regulator friction.', impact: 'Avoids late-notification fines; reduces legal costs by 20–30%.' }
      ];
    } else if (isCloud) {
      scenarioType = 'Cloud Misconfiguration / Exposure';
      tef = { min: 1, likely: 4, max: 15 };
      tc  = { min: 0.35, likely: 0.55, max: 0.78 };
      recommendations = [
        { title: 'Cloud Security Posture Management (CSPM)', why: 'Misconfigurations are the leading cause of cloud breaches. CSPM provides continuous visibility and automated remediation.', impact: 'Reduces misconfiguration dwell time from weeks to hours.' },
        { title: 'Infrastructure as Code (IaC) Security Scanning', why: 'Misconfigurations introduced at deployment cannot be caught post-hoc. Pre-deployment scanning prevents the issue.', impact: 'Shift-left approach; prevents ~40% of common cloud misconfigs.' },
        { title: 'Privileged Access Management for Cloud Consoles', why: 'Cloud console access with overly permissive roles is a catastrophic single point of failure.', impact: 'Limits blast radius of compromised credentials to specific workloads.' },
        { title: 'Real-time Alert on Public Exposure', why: 'Storage buckets and compute instances exposed publicly are often exploited within minutes of exposure.', impact: 'Reduces exploitation window from days to <30 minutes.' }
      ];
    } else if (isPhishing) {
      scenarioType = 'Phishing / Business Email Compromise (BEC)';
      tef = { min: 3, likely: 10, max: 35 };
      tc  = { min: 0.35, likely: 0.55, max: 0.78 };
      recommendations = [
        { title: 'Phishing-Resistant MFA (FIDO2)', why: 'Traditional MFA is increasingly bypassed via adversary-in-the-middle toolkits. FIDO2/passkeys are not susceptible to real-time phishing.', impact: 'Near-elimination of credential-based account takeover from phishing.' },
        { title: 'Email Security Gateway Enhancement', why: 'Advanced AI-based email filtering significantly reduces volume of phishing reaching users.', impact: 'Reduces phishing volume reaching inboxes by 85–95%.' },
        { title: 'BEC / Wire Fraud Controls', why: 'BEC attacks focus on large financial transfers. Dual-approval workflows and out-of-band verification prevent fraudulent payments.', impact: 'Eliminates primary BEC financial loss vector.' },
        { title: 'Security Awareness Training', why: 'Human detection remains a last line of defence. Regular, realistic simulations improve detection rates significantly.', impact: 'Typical 60–70% reduction in click rate after 12 months of training.' }
      ];
    } else {
      recommendations = [
        { title: 'Risk-Based Vulnerability Management', why: 'Unpatched critical vulnerabilities are the leading breach enabler. Prioritising by exploitability and asset criticality maximises ROI.', impact: 'Addresses the cause of ~45% of significant incidents.' },
        { title: 'Zero Trust Architecture', why: 'Implicit trust in networks and applications enables lateral movement. Zero trust limits blast radius of any compromise.', impact: 'Industry average: 50–60% reduction in breach scope under zero trust.' },
        { title: 'Third-Party Security Assessment Programme', why: 'Supply chain attacks are a growing vector. Structured assessments identify high-risk suppliers before incidents occur.', impact: 'Early identification reduces third-party incident frequency and costs.' },
        { title: 'Security Operations Maturity', why: 'Faster detection and response is the primary lever for reducing loss magnitude. Every hour of dwell time increases costs exponentially.', impact: 'Reducing MTTD by 50% typically reduces breach cost by 25–35%.' },
        { title: 'Cyber Insurance Alignment', why: 'Risk transfer through cyber insurance is a valid financial control. Ensuring coverage terms match your actual risk profile is critical.', impact: 'Transfers tail risk; reduces P90 exposure by the coverage amount.' }
      ];
    }

    // Add BU context to defaults if available
    if (buContext && buContext.defaultAssumptions) {
      const da = buContext.defaultAssumptions;
      tef = { min: da.TEF.min,     likely: da.TEF.likely,     max: da.TEF.max };
      cs  = { min: da.controlStrength.min, likely: da.controlStrength.likely, max: da.controlStrength.max };
      tc  = { min: da.threatCapability.min, likely: da.threatCapability.likely, max: da.threatCapability.max };
    }

    return {
      scenarioTitle: scenarioType,
      structuredScenario: {
        assetService: buContext?.criticalServices?.[0] || 'Core application platform',
        threatCommunity: isRansomware ? 'Organised cybercriminal groups (ransomware-as-a-service)' :
          isPhishing ? 'Opportunistic threat actors / BEC specialists' :
          isInsider  ? 'Malicious or negligent insider' :
          'External threat actors (mixed motivation)',
        attackType: isRansomware ? 'Ransomware deployment via initial access broker' :
          isDataBreach ? 'Data exfiltration after credential compromise' :
          isPhishing   ? 'Spear-phishing / adversary-in-the-middle phishing kit' :
          isCloud      ? 'Exploitation of cloud misconfiguration' :
          isInsider    ? 'Insider data theft / sabotage' :
          'Multi-vector cyber attack',
        effect: isRansomware ? 'Encryption of critical data and systems; service unavailability; potential data leak for double-extortion' :
          isDataBreach ? 'Unauthorised access to and exfiltration of sensitive/regulated data' :
          'Loss of confidentiality, integrity, or availability of critical assets'
      },
      workflowGuidance: [
        'Confirm that the selected risks and narrative describe one coherent assessment scope.',
        'Review the suggested FAIR ranges against any internal incident history, loss data, or control evidence you already have.',
        'Prefer GCC and UAE assumptions where available, and document any global fallback used for the scenario.'
      ],
      benchmarkBasis: 'The suggested values prioritise GCC and UAE cyber and operational resilience benchmarks where they are likely to exist. Where a local reference is thin, the ranges fall back to mature global cyber loss patterns and should be validated by the user.',
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

  function _buildScenarioExpansion(input = {}) {
    const statement = String(input.riskStatement || '').trim();
    const businessUnit = String(input.businessUnit?.name || 'the business unit').trim();
    const geography = String(input.geography || 'the selected geography').trim();
    const asset = String(input.guidedInput?.asset || '').trim();
    const cause = String(input.guidedInput?.cause || '').trim();
    const impact = String(input.guidedInput?.impact || '').trim();
    const urgency = String(input.guidedInput?.urgency || 'medium').trim().toLowerCase();
    const lower = [statement, asset, cause, impact].join(' ').toLowerCase();

    let scenarioExpansion = statement;
    let summary = `AI identified candidate risks and expanded the scenario into a more realistic assessment narrative for ${businessUnit}.`;
    let riskTitles = _extractRiskCandidates([statement, cause, impact].join('\n'));

    if (/azure ad|active directory|identity|entra|sso|email/i.test(lower)) {
      scenarioExpansion = `In ${geography}, ${businessUnit} faces a material identity-compromise scenario in which ${statement.charAt(0).toLowerCase() + statement.slice(1)}. A likely progression is targeted credential theft or session hijack against ${asset || 'the central identity platform'}, followed by account takeover, privileged escalation, and unauthorised access to email, collaboration tools, cloud administration, and other federated business services. In practice, this can drive downstream business email compromise, internal fraud, disruptive administrative changes, loss of access for legitimate users, and regulatory or contractual exposure where sensitive data, critical operations, or cross-border services are affected. ${['high', 'critical'].includes(urgency) ? 'Given the stated urgency, this should be treated as an active material-control scenario requiring immediate containment, privileged-account review, and assessment of downstream operational and financial exposure.' : 'This should be assessed not only as an isolated identity event, but as a gateway scenario with knock-on operational, financial, third-party, and regulatory effects.'}`;
      summary = `AI expanded the scenario beyond the initial identity-control failure to include the common knock-on effects seen in real identity compromise events: account takeover, email compromise, privileged abuse, downstream service disruption, fraud, and regulatory exposure.`;
      riskTitles = [
        { title: 'Privileged account takeover through identity platform compromise', category: 'Identity & Access', description: 'Compromised Azure AD or Entra credentials could let an attacker take over privileged identities and move into federated services or administrative workflows.', regulations: ['UAE PDPL', 'UK GDPR', 'SEC cyber disclosure rules'] },
        { title: 'Business email compromise enabled by mailbox access', category: 'Financial Crime', description: 'Once identity controls are bypassed, mailbox access can support payment fraud, executive impersonation, and manipulation of approvals or supplier instructions.', regulations: ['UAE AML/CFT'] },
        { title: 'Administrative lockout or unauthorised tenant changes', category: 'Operational Resilience', description: 'An attacker with elevated access could change authentication settings, conditional access, or directory controls, disrupting normal user access and response operations.', regulations: ['UAE Cybersecurity Council Guidance'] },
        { title: 'Sensitive data exposure across mailboxes and connected cloud services', category: 'Data Protection', description: 'The same compromise could expose regulated or commercially sensitive information stored in mail, identity-linked applications, and collaboration platforms.', regulations: ['UAE PDPL', 'GDPR'] }
      ];
    } else if (/ransom|encrypt/i.test(lower)) {
      scenarioExpansion = `In ${geography}, ${businessUnit} faces a ransomware-driven disruption scenario in which ${statement.charAt(0).toLowerCase() + statement.slice(1)}. A realistic progression is initial access, lateral movement, abuse of privileged access, encryption or destructive action against critical systems, and secondary pressure through data theft or extortion. The scenario should therefore be assessed for downtime, operational backlog, emergency response cost, customer or stakeholder disruption, and regulatory consequences where sensitive or regulated services are impacted.`;
    } else if (/supplier|vendor|third-party/i.test(lower)) {
      scenarioExpansion = `In ${geography}, ${businessUnit} faces a third-party driven risk scenario in which ${statement.charAt(0).toLowerCase() + statement.slice(1)}. The realistic concern is not only the initial supplier-side failure, but the downstream effect on privileged access, data exchange, service dependency, contractual commitments, and concentration risk across connected business processes. This should be assessed for both immediate operational disruption and follow-on regulatory, commercial, and assurance impacts.`;
    } else if (/cloud|misconfig|storage|bucket/i.test(lower)) {
      scenarioExpansion = `In ${geography}, ${businessUnit} faces a cloud exposure scenario in which ${statement.charAt(0).toLowerCase() + statement.slice(1)}. A realistic progression includes unauthorised discovery, data exposure or exfiltration, service mis-use, persistence through compromised credentials or automation, and delayed detection due to fragmented cloud ownership. This should be assessed for confidentiality impact, operational recovery effort, regulatory response, and reputational consequences where customer or business-critical data is involved.`;
    }

    return {
      scenarioExpansion,
      summary,
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
    // Simulate LLM latency
    await new Promise(r => setTimeout(r, 2200 + Math.random() * 800));

    // Try real API first
    if (_compassApiKey || !_isDirectCompassUrl(_compassApiUrl)) {
      try {
        const systemPrompt = `You are a senior cyber risk analyst specialising in FAIR methodology. 
Given a risk scenario narrative and business context, provide structured FAIR inputs and recommendations.
Prefer GCC and UAE benchmark references where relevant. If those are unavailable for a specific assumption, use the best available global benchmark and explain the fallback logic.
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

Risk narrative: ${narrative}

Relevant citations:
${retrievedDocs.map(d => `- ${d.title}: ${d.excerpt}`).join('\
')}`;

        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
          return { ...parsed, citations: retrievedDocs };
        }
      } catch (e) {
        console.warn('LLM API call failed, falling back to stub:', e.message);
      }
    }

    // Fall back to stub
    return _generateStub(narrative, buContext, retrievedDocs);
  }

  async function enhanceRiskContext(input) {
    await new Promise(r => setTimeout(r, 1400 + Math.random() * 600));
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
Register metadata: ${input.registerMeta ? JSON.stringify(input.registerMeta) : '(none)'}

Risk statement:
${input.riskStatement || '(none)'}

Risk register text:
${input.registerText || '(none)'}

Retrieved citations:
${(input.citations || []).map(c => `- ${c.title}: ${c.excerpt}`).join('\n')}

Instructions:
- make the enhancedStatement read like a realistic scenario narrative, not a polished restatement
- explain the most likely progression of the event and the common secondary effects
- include business and operational consequences, not just the technical failure
- reflect the stated urgency where provided
- if the scenario involves identity, directory, SSO, or Azure AD/Entra compromise, include plausible knock-on effects such as mailbox compromise, privileged misuse, tenant changes, service disruption, fraud, and data exposure where relevant
- produce concise but concrete candidate risks that a user can choose from`;
        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
          return { ...parsed, citations: input.citations || [] };
        }
      } catch (e) {
        console.warn('enhanceRiskContext fallback:', e.message);
      }
    }
    return _generateRiskBuilderStub(input);
  }

  async function analyseRiskRegister(input) {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
    const lines = String(input.registerText || '')
      .split(/\r?\n|;/)
      .map(line => line.trim())
      .filter(line => line.length > 10)
      .slice(0, 20);
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

Risk register content:
${input.registerText || '(none)'}

Instructions:
- use the whole workbook context, including sheet names and column headers
- deduplicate overlapping risks
- produce concise risk titles suitable for selection cards
- preserve important contextual detail in the descriptions
- extract up to 15 material risks if the register supports them
- include workflow guidance that tells a non-risk practitioner what to do after extraction`;
        const raw = await _callLLM(systemPrompt, userPrompt);
        if (raw) {
          return JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
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
    return stub;
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

Instructions:
- derive the context from the entity metadata, any existing remit text, and the parent business unit context
- if the entity is a department or function, inherit business-unit context and specialise it for the function
- for departments and functions, keep the context summary to 2-4 sentences max
- do not restate the full parent or group profile; only carry forward what is directly relevant to the function remit
- avoid generic corporate language and avoid inventing unsupported facts
- keep the context practical for future risk assessments and AI assistance
- include relevant regulations only when supported by the inherited context or the admin baseline`;
      const raw = await _callLLM(systemPrompt, userPrompt);
      if (!raw) return stub;
      const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
      return {
        geography: String(parsed.geography || stub.geography || '').trim(),
        contextSummary: String(parsed.contextSummary || stub.contextSummary || '').trim(),
        riskAppetiteStatement: String(parsed.riskAppetiteStatement || stub.riskAppetiteStatement || '').trim(),
        applicableRegulations: Array.isArray(parsed.applicableRegulations) ? parsed.applicableRegulations.map(String).filter(Boolean) : stub.applicableRegulations,
        aiInstructions: String(parsed.aiInstructions || stub.aiInstructions || '').trim(),
        benchmarkStrategy: String(parsed.benchmarkStrategy || stub.benchmarkStrategy || '').trim()
      };
    } catch (error) {
      console.warn('buildEntityContext fallback:', error.message);
      return stub;
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
- adminContextSummary should be a short personal context summary suitable for defaults`;
      const raw = await _callLLM(systemPrompt, userPrompt);
      if (!raw) return stub;
      const parsed = JSON.parse(String(raw).replace(/```json\n?|```/g, '').trim());
      return {
        workingContext: String(parsed.workingContext || stub.workingContext || '').trim(),
        preferredOutputs: String(parsed.preferredOutputs || stub.preferredOutputs || '').trim(),
        aiInstructions: String(parsed.aiInstructions || stub.aiInstructions || '').trim(),
        adminContextSummary: String(parsed.adminContextSummary || stub.adminContextSummary || '').trim()
      };
    } catch (error) {
      console.warn('buildUserPreferenceAssist fallback:', error.message);
      return stub;
    }
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
    buildEntityContext,
    buildUserPreferenceAssist,
    testCompassConnection,
    setCompassAPIKey,
    setCompassConfig,
    clearCompassConfig,
    setOpenAIKey
  };
})();
