
function buildLocalUserCompanyContextFallback(refineInput = {}) {
  const current = refineInput.currentSections || {};
  const prompt = String(refineInput.userPrompt || '').trim();
  const uploadedHint = String(refineInput.uploadedText || '').trim()
    ? 'Uploaded strategy or policy material was considered in this fallback refinement.'
    : '';
  return {
    ...current,
    companySummary: [String(current.companySummary || '').trim(), prompt ? `Refinement focus: ${prompt}` : '', uploadedHint]
      .filter(Boolean)
      .join(' ')
      .trim(),
    aiGuidance: String(refineInput.currentAiGuidance || '').trim(),
    suggestedGeography: String(refineInput.currentGeography || '').trim(),
    regulatorySignals: Array.isArray(refineInput.currentRegulations) ? refineInput.currentRegulations : [],
    responseMessage: prompt
      ? `I applied a local refinement focused on ${prompt.toLowerCase()}. Review the updated company context and tighten any remaining sections manually if needed.`
      : 'I applied a local refinement to keep the company context moving. Review the updated sections and tighten anything else manually if needed.'
  };
}

function renderUserPreferences(existingSettings = getUserSettings()) {
  if (!requireAuth()) return;
  if (AuthService.isAdminAuthenticated()) {
    Router.navigate(getDefaultRouteForCurrentUser());
    return;
  }
  const globalSettings = getAdminSettings();
  const settings = existingSettings;
  const profile = normaliseUserProfile(settings.userProfile);
  const companyStructure = Array.isArray(globalSettings.companyStructure) ? globalSettings.companyStructure : [];
  const companyOptions = getCompanyEntities(companyStructure);
  const selectedBusinessId = profile.businessUnitEntityId || resolveUserOrganisationSelection(AppState.currentUser, settings, globalSettings).businessUnitEntityId;
  const selectedBusinessEntity = getEntityById(companyStructure, selectedBusinessId);
  const selectedBusinessDepartments = getDepartmentEntities(companyStructure, selectedBusinessId);
  const businessOwner = (AppState.currentUser?.role === 'bu_admin' && selectedBusinessEntity?.id === AppState.currentUser?.businessUnitEntityId) || selectedBusinessEntity?.ownerUsername === AppState.currentUser?.username;
  const selectedDepartment = getEntityById(companyStructure, profile.departmentEntityId);
  const departmentOwner = selectedDepartment?.ownerUsername === AppState.currentUser?.username;
  const companyContextSections = settings.companyContextSections || buildCompanyContextSections({
    companySummary: settings.adminContextSummary || '',
    businessProfile: settings.companyContextProfile || ''
  });
  const userContextSection = renderSettingsSection({
    title: 'Profile And Role Context',
    description: 'Set who you are, where you sit, and how you want outputs framed.',
    open: true,
    meta: `${profile.jobTitle || 'Role not set'} · ${profile.businessUnit || 'No BU selected'}`,
    body: `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="user-full-name">Name</label>
          <input class="form-input" id="user-full-name" value="${profile.fullName || AppState.currentUser?.displayName || ''}">
        </div>
        <div class="form-group">
          <label class="form-label" for="user-job-title">Role</label>
          <input class="form-input" id="user-job-title" value="${profile.jobTitle || ''}" placeholder="e.g. Risk Manager">
        </div>
      </div>
      <div class="grid-2 mt-4">
        <div class="form-group">
          <label class="form-label" for="user-business-unit">Business unit or entity</label>
          <select class="form-select" id="user-business-unit">
            <option value="">Choose your business unit</option>
            ${companyOptions.map(entity => `<option value="${entity.id}" ${entity.id === selectedBusinessId ? 'selected' : ''}>${entity.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="user-department">Department or function</label>
          <select class="form-select" id="user-department"></select>
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Focus areas</label>
        <div class="tag-input-wrap" id="ti-user-focus-areas"></div>
        <div class="citation-chips" style="margin-top:10px">
          ${USER_FOCUS_OPTIONS.map(option => `<button type="button" class="chip user-focus-chip" data-focus="${option}">${option}</button>`).join('')}
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-working-context">Working context</label>
        <textarea class="form-textarea" id="user-working-context" rows="4">${profile.workingContext || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-preferred-outputs">Preferred output style</label>
        <textarea class="form-textarea" id="user-preferred-outputs" rows="4">${profile.preferredOutputs || ''}</textarea>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-user-role-ai">AI Assist Role Context</button>
        <span class="form-help">Use your role, BU, department, and uploaded source material to draft these fields.</span>
      </div>`
  });
  const aiWorkspaceSection = renderSettingsSection({
    title: 'AI Assist Workspace',
    scope: 'user-settings',
    description: 'Upload notes, role descriptions, team material, or planning documents, then use AI assist across your settings.',
    meta: 'Shared source',
    open: true,
    body: `
      <div class="form-group">
        <label class="form-label" for="user-ai-source-notes">Notes for AI assist</label>
        <textarea class="form-textarea" id="user-ai-source-notes" rows="4" placeholder="Paste role notes, remit details, team responsibilities, reporting expectations, or any other useful context."></textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-ai-source-file">Upload source material</label>
        <input class="form-input" id="user-ai-source-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls">
        <div class="form-help" id="user-ai-source-file-help">Upload TXT, CSV, TSV, JSON, Markdown, or Excel. The content will be used only to draft your personal settings.</div>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-user-defaults-ai">AI Assist Personal Defaults</button>
        <span class="form-help">Fills personal context summary and AI guidance from the same source material.</span>
      </div>`
  });
  const companyContextSection = renderSettingsSection({
    title: 'Personal Company Context',
    scope: 'user-settings',
    description: 'Optional overlay on top of the admin baseline for this account only.',
    meta: settings.companyWebsiteUrl ? 'Website linked' : 'Optional',
    body: `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="user-company-url">Company Website URL</label>
          <input class="form-input" id="user-company-url" value="${settings.companyWebsiteUrl || ''}" placeholder="https://example.com">
        </div>
        <div class="form-group">
          <label class="form-label" for="user-company-profile">Company Risk Context Profile</label>
          <textarea class="form-textarea" id="user-company-profile" rows="6">${settings.companyContextProfile || ''}</textarea>
        </div>
      </div>
      <details class="mt-4">
        <summary style="cursor:pointer;font-weight:600;color:var(--text-primary)">Edit detailed company brief</summary>
        <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-canvas)">
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-summary">Company Summary</label>
            <textarea class="form-textarea" id="user-company-section-summary" rows="3">${companyContextSections.companySummary || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-business-model">Business Model</label>
            <textarea class="form-textarea" id="user-company-section-business-model" rows="3">${companyContextSections.businessModel || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-operating-model">Operating Model</label>
            <textarea class="form-textarea" id="user-company-section-operating-model" rows="3">${companyContextSections.operatingModel || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-commitments">Public Commitments</label>
            <textarea class="form-textarea" id="user-company-section-commitments" rows="4">${companyContextSections.publicCommitments || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-risks">Key Risk Signals</label>
            <textarea class="form-textarea" id="user-company-section-risks" rows="4">${companyContextSections.keyRiskSignals || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-obligations">Obligations and Exposures</label>
            <textarea class="form-textarea" id="user-company-section-obligations" rows="4">${companyContextSections.obligations || ''}</textarea>
          </div>
          <div class="form-group mt-3">
            <label class="form-label" for="user-company-section-sources">Sources Reviewed</label>
            <textarea class="form-textarea" id="user-company-section-sources" rows="4">${companyContextSections.sources || ''}</textarea>
          </div>
        </div>
      </details>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-build-user-context">Build from Website</button>
        <span class="form-help">Builds a personal context draft for this account only.</span>
      </div>
      <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-elevated)">
        <div class="context-panel-title">Refine This Context With AI</div>
        <p class="form-help" style="margin-top:6px">Use follow-up prompts to reshape the company context until it reflects the framing you want for this account.</p>
        <div id="user-company-refinement-history" style="display:flex;flex-direction:column;gap:10px;margin-top:12px"></div>
        <div class="form-group mt-4">
          <label class="form-label" for="user-company-source-file">Upload supporting documents</label>
          <input class="form-input" id="user-company-source-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls,.doc,.docx,.pdf">
          <div class="form-help" id="user-company-source-help">Recommended: upload strategy, policy, procedure, or operating-model documents to ground the AI context.</div>
        </div>
        <div class="form-group mt-4">
          <label class="form-label" for="user-company-followup">Follow-up prompt</label>
          <textarea class="form-textarea" id="user-company-followup" rows="3" placeholder="Tell the AI what to change, emphasise, shorten, or make more specific."></textarea>
        </div>
        <div class="flex items-center gap-3 mt-3" style="flex-wrap:wrap">
          <button class="btn btn--secondary" id="btn-refine-user-context" type="button">Apply Follow-Up Now</button>
          <span class="form-help" id="user-company-refine-status">The fields above will be updated in place each time you refine the context.</span>
        </div>
      </div>`
  });
  const roleManagementSection = `${businessOwner ? renderSettingsSection({
    title: 'Business Unit Admin Controls',
    scope: 'user-settings',
    description: `You can add functions beneath ${selectedBusinessEntity?.name || profile.businessUnit} and maintain their retained context.`,
    meta: `${selectedBusinessDepartments.length} department${selectedBusinessDepartments.length === 1 ? '' : 's'}`,
    body: `
      <div class="flex items-center gap-3" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-user-add-department">Add Function / Department</button>
      </div>
      <div class="mt-4" style="display:flex;flex-direction:column;gap:12px">
        ${selectedBusinessDepartments.length ? selectedBusinessDepartments.map(department => `
          <div class="card" style="padding:var(--sp-4);background:var(--bg-canvas)">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <div class="context-panel-title">${department.name}</div>
                <div class="form-help">${department.ownerUsername ? `Owner: ${department.ownerUsername}` : 'Owner not assigned yet'}</div>
                <div class="form-help">${getEntityLayerById(globalSettings, department.id)?.contextSummary || department.profile || 'No saved function context yet'}</div>
              </div>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--ghost btn--sm btn-user-edit-department" data-department-id="${department.id}" type="button">Edit Department</button>
                <button class="btn btn--secondary btn--sm btn-user-edit-department-context" data-department-id="${department.id}" type="button">Manage Context</button>
              </div>
            </div>
          </div>`).join('') : '<div class="form-help">No functions have been added under this business unit yet.</div>'}
      </div>`
  }) : ''}
  ${departmentOwner ? renderSettingsSection({
    title: 'Department Context You Own',
    description: `You are the assigned owner for ${selectedDepartment?.name || profile.department}.`,
    meta: 'Department owner',
    body: `<div class="flex items-center gap-3" style="flex-wrap:wrap"><button class="btn btn--secondary" id="btn-manage-owned-department">Manage Department Context</button></div>`
  }) : ''}`;
  const defaultsSection = renderSettingsSection({
    title: 'Personal Defaults',
    description: 'These defaults shape new assessments for this account.',
    meta: settings.geography || globalSettings.geography,
    body: `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="user-geo-primary">Primary Geography</label>
          ${renderGeographySelect('user-geo-primary', settings.geographyPrimary || settings.geography || globalSettings.geography)}
        </div>
        <div class="form-group">
          <label class="form-label" for="user-link-mode">Default Linked-Risk Mode</label>
          <select class="form-select" id="user-link-mode">
            <option value="yes" ${settings.defaultLinkMode ? 'selected' : ''}>Enabled</option>
            <option value="no" ${!settings.defaultLinkMode ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
      </div>
      <div class="grid-2 mt-4">
        <div class="form-group">
          <label class="form-label" for="user-geo-secondary">Secondary Geography</label>
          ${renderGeographySelect('user-geo-secondary', settings.geographySecondary || '', 'Optional', true)}
        </div>
        <div class="form-group">
          <label class="form-label" for="user-geo-tertiary">Tertiary Geography</label>
          ${renderGeographySelect('user-geo-tertiary', settings.geographyTertiary || '', 'Optional', true)}
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-context-summary">Personal Context Summary</label>
        <textarea class="form-textarea" id="user-context-summary" rows="3">${settings.adminContextSummary || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-appetite">Risk Appetite Statement</label>
        <textarea class="form-textarea" id="user-appetite" rows="4">${settings.riskAppetiteStatement || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Applicable Regulations</label>
        <div class="tag-input-wrap" id="ti-user-regulations"></div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-ai-instructions">AI Guidance</label>
        <textarea class="form-textarea" id="user-ai-instructions" rows="3">${settings.aiInstructions || ''}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="user-benchmark-strategy">Benchmark Strategy</label>
        <textarea class="form-textarea" id="user-benchmark-strategy" rows="3">${settings.benchmarkStrategy || ''}</textarea>
      </div>`
  });
  setPage(`
    <main class="page">
      <div class="container container--narrow" style="padding:var(--sp-10) var(--sp-6);max-width:960px">
        <div class="settings-shell">
          <div class="settings-shell__header">
            <div>
              <h2>Personal Settings</h2>
              <p style="margin-top:6px;color:var(--text-muted)">These settings apply only to <strong>${AppState.currentUser?.displayName || 'your account'}</strong>. Global thresholds, organisation structure, BU customisation, and document library remain controlled by the global admin.</p>
            </div>
            <div class="flex items-center gap-3" style="flex-wrap:wrap">
              <button class="btn btn--ghost" id="btn-rerun-onboarding">Re-run Setup</button>
              <button class="btn btn--secondary" id="btn-reset-user-settings">Reset My Settings</button>
            </div>
          </div>

          <div class="admin-overview-grid mb-6">
            <div class="admin-overview-card">
              <div class="admin-overview-label">Role</div>
              <div class="admin-overview-value" style="font-size:1.1rem">${profile.jobTitle || 'Not set'}</div>
              <div class="admin-overview-foot">${profile.department || 'No department set'}${profile.businessUnit ? ` · ${profile.businessUnit}` : ''}</div>
            </div>
            <div class="admin-overview-card">
              <div class="admin-overview-label">Focus Areas</div>
              <div class="admin-overview-value" style="font-size:1.1rem">${profile.focusAreas?.length || 0}</div>
              <div class="admin-overview-foot">${profile.focusAreas?.length ? profile.focusAreas.join(', ') : 'No focus areas selected yet'}</div>
            </div>
            <div class="admin-overview-card">
              <div class="admin-overview-label">Personal Geography</div>
              <div class="admin-overview-value" style="font-size:1.1rem">${settings.geography || globalSettings.geography}</div>
              <div class="admin-overview-foot">Used as your default context in new assessments</div>
            </div>
          </div>

          <div class="settings-accordion">
            ${userContextSection}
            ${aiWorkspaceSection}
            ${companyContextSection}
            ${roleManagementSection}
            ${defaultsSection}
          </div>

          <div class="settings-shell__footer">
            <div class="flex items-center gap-3" style="flex-wrap:wrap">
              <button class="btn btn--primary" id="btn-save-user-settings">Save My Settings</button>
              <span class="form-help">These values will be used as your personal defaults in future assessments.</span>
            </div>
            <div class="banner banner--poc mt-6">
              <span class="banner-icon">ℹ</span>
              <span class="banner-text">Global admin context still applies underneath your personal overrides for organisation structure, BU definitions, document library, thresholds, and escalation logic.</span>
            </div>
          </div>
        </div>
      </div>
    </main>`);

  const regsInput = UI.tagInput('ti-user-regulations', settings.applicableRegulations);
  const focusInput = UI.tagInput('ti-user-focus-areas', profile.focusAreas || []);
  const profileEl = document.getElementById('user-company-profile');
  const websiteEl = document.getElementById('user-company-url');
  const businessUnitEl = document.getElementById('user-business-unit');
  const departmentEl = document.getElementById('user-department');
  const companyRefinementHistory = [];
  const companyRefinementHistoryEl = document.getElementById('user-company-refinement-history');
  const companyFollowupEl = document.getElementById('user-company-followup');
  const companyRefineStatusEl = document.getElementById('user-company-refine-status');
  let userAiSourceText = '';
  let userAiSourceName = '';

  function getCurrentUserCompanySections() {
    return {
      companySummary: document.getElementById('user-company-section-summary')?.value.trim() || '',
      businessModel: document.getElementById('user-company-section-business-model')?.value.trim() || '',
      operatingModel: document.getElementById('user-company-section-operating-model')?.value.trim() || '',
      publicCommitments: document.getElementById('user-company-section-commitments')?.value.trim() || '',
      keyRiskSignals: document.getElementById('user-company-section-risks')?.value.trim() || '',
      obligations: document.getElementById('user-company-section-obligations')?.value.trim() || '',
      sources: document.getElementById('user-company-section-sources')?.value.trim() || ''
    };
  }

  function applyUserCompanyContextResult(result) {
    const sections = buildCompanyContextSections(result);
    const profileText = serialiseCompanyContextSections(sections);
    profileEl.value = profileText;
    document.getElementById('user-company-section-summary').value = sections.companySummary || '';
    document.getElementById('user-company-section-business-model').value = sections.businessModel || '';
    document.getElementById('user-company-section-operating-model').value = sections.operatingModel || '';
    document.getElementById('user-company-section-commitments').value = sections.publicCommitments || '';
    document.getElementById('user-company-section-risks').value = sections.keyRiskSignals || '';
    document.getElementById('user-company-section-obligations').value = sections.obligations || '';
    document.getElementById('user-company-section-sources').value = sections.sources || '';
    if (!document.getElementById('user-context-summary').value.trim() && result.companySummary) {
      document.getElementById('user-context-summary').value = result.companySummary;
    }
    if (result.aiGuidance) {
      document.getElementById('user-ai-instructions').value = result.aiGuidance;
    }
    const userGeoPrimaryEl = document.getElementById('user-geo-primary');
    if (result.suggestedGeography && userGeoPrimaryEl && !userGeoPrimaryEl.value.trim()) {
      userGeoPrimaryEl.value = result.suggestedGeography;
    }
    if (Array.isArray(result.regulatorySignals) && result.regulatorySignals.length) {
      regsInput.setTags(Array.from(new Set([...(regsInput.getTags() || []), ...result.regulatorySignals])));
    }
  }

  function renderUserCompanyRefinementHistory() {
    if (!companyRefinementHistoryEl) return;
    if (!companyRefinementHistory.length) {
      companyRefinementHistoryEl.innerHTML = '<div class="form-help">No follow-up prompts yet. Build the first draft, then iterate here until the context feels right.</div>';
      return;
    }
    companyRefinementHistoryEl.innerHTML = companyRefinementHistory.map(entry => `
      <div class="card" style="padding:var(--sp-3);background:${entry.role === 'user' ? 'var(--bg-canvas)' : 'rgba(244,193,90,.08)'};border-color:${entry.role === 'user' ? 'var(--border-subtle)' : 'rgba(244,193,90,.18)'}">
        <div style="font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">${entry.role === 'user' ? 'Your prompt' : 'AI update'}</div>
        <div class="context-panel-copy" style="margin-top:6px">${entry.text}</div>
      </div>`).join('');
  }

  function renderUserDepartmentOptions() {
    const departments = getDepartmentEntities(companyStructure, businessUnitEl.value);
    const preferredDepartmentId = profile.departmentEntityId;
    const fallbackDepartmentId = departments.some(entity => entity.id === preferredDepartmentId) ? preferredDepartmentId : (departments[0]?.id || '');
    departmentEl.innerHTML = departments.length
      ? departments.map(entity => `<option value="${entity.id}" ${entity.id === fallbackDepartmentId ? 'selected' : ''}>${entity.name}</option>`).join('')
      : '<option value="">No functions configured yet</option>';
    departmentEl.disabled = !departments.length;
  }
  businessUnitEl.addEventListener('change', renderUserDepartmentOptions);
  renderUserDepartmentOptions();
  renderUserCompanyRefinementHistory();

  document.querySelectorAll('.user-focus-chip').forEach(button => {
    button.addEventListener('click', () => {
      const next = Array.from(new Set([...(focusInput.getTags() || []), button.dataset.focus]));
      focusInput.setTags(next);
    });
  });

  async function loadUserAiSource() {
    const notes = document.getElementById('user-ai-source-notes')?.value.trim() || '';
    const file = document.getElementById('user-ai-source-file')?.files?.[0];
    let uploadedText = '';
    if (file) {
      const parsed = await parseRegisterFile(file);
      if (looksLikeBinaryRegister(parsed.text) && !['xlsx', 'xls'].includes(getFileExtension(file.name))) {
        throw new Error('The uploaded file appears unreadable. Please use Excel, TXT, CSV, TSV, JSON, or Markdown.');
      }
      uploadedText = parsed.text;
      userAiSourceText = uploadedText;
      userAiSourceName = file.name;
      const help = document.getElementById('user-ai-source-file-help');
      if (help) help.textContent = `Loaded ${file.name}. AI assist will use this content for your personal settings.`;
    }
    return [notes, uploadedText || userAiSourceText].filter(Boolean).join('\n\n');  }

  function buildUserAssistInput(sourceText = '') {
    const businessEntity = getEntityById(companyStructure, businessUnitEl.value.trim());
    const departmentEntity = getEntityById(companyStructure, departmentEl.value.trim());
    return {
      userProfile: {
        fullName: document.getElementById('user-full-name').value.trim() || AppState.currentUser?.displayName || '',
        jobTitle: document.getElementById('user-job-title').value.trim(),
        businessUnit: businessEntity?.name || profile.businessUnit || '',
        department: departmentEntity?.name || profile.department || '',
        focusAreas: focusInput.getTags(),
        preferredOutputs: document.getElementById('user-preferred-outputs').value.trim(),
        workingContext: document.getElementById('user-working-context').value.trim()
      },
      organisationContext: {
        businessUnitContext: businessEntity?.profile || getEntityLayerById(globalSettings, businessEntity?.id || '')?.contextSummary || '',
        departmentContext: departmentEntity?.profile || getEntityLayerById(globalSettings, departmentEntity?.id || '')?.contextSummary || ''
      },
      currentSettings: {
        aiInstructions: document.getElementById('user-ai-instructions').value.trim(),
        adminContextSummary: document.getElementById('user-context-summary').value.trim()
      },
      uploadedText: sourceText
    };
  }

  function buildUserSettingsPayload() {
    const businessUnitEntityId = businessUnitEl.value.trim();
    const departmentEntityId = departmentEl.value.trim();
    const businessEntity = getEntityById(companyStructure, businessUnitEntityId);
    const departmentEntity = getEntityById(companyStructure, departmentEntityId);
    return {
      payload: {
        companyContextSections: {
          companySummary: document.getElementById('user-company-section-summary').value.trim(),
          businessModel: document.getElementById('user-company-section-business-model').value.trim(),
          operatingModel: document.getElementById('user-company-section-operating-model').value.trim(),
          publicCommitments: document.getElementById('user-company-section-commitments').value.trim(),
          keyRiskSignals: document.getElementById('user-company-section-risks').value.trim(),
          obligations: document.getElementById('user-company-section-obligations').value.trim(),
          sources: document.getElementById('user-company-section-sources').value.trim()
        },
        geographyPrimary: document.getElementById('user-geo-primary').value.trim() || globalSettings.geography,
        geographySecondary: document.getElementById('user-geo-secondary').value.trim(),
        geographyTertiary: document.getElementById('user-geo-tertiary').value.trim(),
        geography: document.getElementById('user-geo-primary').value.trim() || globalSettings.geography,
        companyWebsiteUrl: websiteEl.value.trim(),
        companyContextProfile: serialiseCompanyContextSections({
          companySummary: document.getElementById('user-company-section-summary').value.trim(),
          businessModel: document.getElementById('user-company-section-business-model').value.trim(),
          operatingModel: document.getElementById('user-company-section-operating-model').value.trim(),
          publicCommitments: document.getElementById('user-company-section-commitments').value.trim(),
          keyRiskSignals: document.getElementById('user-company-section-risks').value.trim(),
          obligations: document.getElementById('user-company-section-obligations').value.trim(),
          sources: document.getElementById('user-company-section-sources').value.trim()
        }),
        userProfile: {
          fullName: document.getElementById('user-full-name').value.trim() || AppState.currentUser?.displayName || '',
          jobTitle: document.getElementById('user-job-title').value.trim(),
          department: departmentEntity?.name || '',
          businessUnit: businessEntity?.name || '',
          departmentEntityId: departmentEntity?.id || '',
          businessUnitEntityId,
          focusAreas: focusInput.getTags(),
          preferredOutputs: document.getElementById('user-preferred-outputs').value.trim(),
          workingContext: document.getElementById('user-working-context').value.trim()
        },
        defaultLinkMode: document.getElementById('user-link-mode').value === 'yes',
        riskAppetiteStatement: document.getElementById('user-appetite').value.trim() || globalSettings.riskAppetiteStatement,
        applicableRegulations: regsInput.getTags(),
        aiInstructions: document.getElementById('user-ai-instructions').value.trim(),
        benchmarkStrategy: document.getElementById('user-benchmark-strategy').value.trim() || globalSettings.benchmarkStrategy,
        adminContextSummary: document.getElementById('user-context-summary').value.trim() || globalSettings.adminContextSummary
      },
      businessUnitEntityId,
      departmentEntityId: departmentEntity?.id || ''
    };
  }

  function persistUserSettings(showToast = false) {
    const { payload, businessUnitEntityId, departmentEntityId } = buildUserSettingsPayload();
    saveUserSettings(payload);
    AuthService.updateSessionContext({ businessUnitEntityId, departmentEntityId });
    if (!AppState.draft.geography) AppState.draft.geography = getEffectiveSettings().geography;
    saveDraft();
    if (showToast) UI.toast('Personal settings saved.', 'success');
  }

  const userSettingsRoot = document.querySelector('.settings-shell');
  bindAutosave(userSettingsRoot, () => persistUserSettings(false));

  document.getElementById('btn-save-user-settings').addEventListener('click', async () => {
    persistUserSettings(true);
    await logAuditEvent({ category: 'profile', eventType: 'personal_settings_saved', target: AuthService.getCurrentUser()?.username || '', status: 'success', source: 'client' });
  });

  document.getElementById('btn-user-add-department')?.addEventListener('click', () => {
    if (!selectedBusinessEntity) return;
    openOrgEntityEditor({
      structure: companyStructure,
      seed: {
        type: 'Department / function',
        parentId: selectedBusinessEntity.id
      },
      onSave: (node, modal) => {
        const nextSettings = getAdminSettings();
        const nextStructure = Array.isArray(nextSettings.companyStructure) ? [...nextSettings.companyStructure] : [];
        nextStructure.push(node);
        saveAdminSettings({
          ...nextSettings,
          companyStructure: nextStructure
        });
        modal.close();
        UI.toast(`${node.name} added beneath ${selectedBusinessEntity.name}.`, 'success');
        renderUserPreferences(getUserSettings());
      }
    });
  });

  document.querySelectorAll('.btn-user-edit-department').forEach(button => {
    button.addEventListener('click', () => {
      const department = getEntityById(companyStructure, button.dataset.departmentId || '');
      if (!department) return;
      openOrgEntityEditor({
        structure: companyStructure,
        existingNode: department,
        onSave: (node, modal) => {
          const nextSettings = getAdminSettings();
          const nextStructure = Array.isArray(nextSettings.companyStructure) ? [...nextSettings.companyStructure] : [];
          const index = nextStructure.findIndex(item => item.id === node.id);
          if (index > -1) nextStructure[index] = node;
          saveAdminSettings({
            ...nextSettings,
            companyStructure: nextStructure
          });
          modal.close();
          UI.toast(`${node.name} updated.`, 'success');
          renderUserPreferences(getUserSettings());
        }
      });
    });
  });

  document.querySelectorAll('.btn-user-edit-department-context').forEach(button => {
    button.addEventListener('click', () => {
      const department = getEntityById(companyStructure, button.dataset.departmentId || '');
      if (!department) return;
      openEntityContextLayerEditor({
        entity: department,
        settings: globalSettings,
        onSave: (nextLayer, modal) => {
          const nextSettings = getAdminSettings();
          const layers = Array.isArray(nextSettings.entityContextLayers) ? [...nextSettings.entityContextLayers] : [];
          const index = layers.findIndex(item => item.entityId === nextLayer.entityId);
          if (index > -1) layers[index] = nextLayer;
          else layers.push(nextLayer);
          saveAdminSettings({
            ...nextSettings,
            entityContextLayers: layers
          });
          modal.close();
          UI.toast(`Saved context for ${department.name}.`, 'success');
          renderUserPreferences(getUserSettings());
        }
      });
    });
  });

  document.getElementById('btn-manage-owned-department')?.addEventListener('click', () => {
    if (!selectedDepartment) return;
    openEntityContextLayerEditor({
      entity: selectedDepartment,
      onSave: (nextLayer, modal) => {
        const nextSettings = getAdminSettings();
        const layers = Array.isArray(nextSettings.entityContextLayers) ? [...nextSettings.entityContextLayers] : [];
        const index = layers.findIndex(item => item.entityId === nextLayer.entityId);
        if (index > -1) layers[index] = nextLayer;
        else layers.push(nextLayer);
        saveAdminSettings({
          ...nextSettings,
          entityContextLayers: layers
        });
        modal.close();
        UI.toast(`Saved context for ${selectedDepartment.name}.`, 'success');
        renderUserPreferences(getUserSettings());
      },
      readOnlyIdentity: true
    });
  });

  document.getElementById('btn-build-user-context').addEventListener('click', async () => {
    const btn = document.getElementById('btn-build-user-context');
    const websiteUrl = websiteEl.value.trim();
    const llmConfig = getSessionLLMConfig();
    if (!websiteUrl) {
      UI.toast('Enter a company website URL first.', 'warning');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Building context…';
    try {
      LLMService.setCompassConfig(llmConfig);
      const uploaded = await loadContextSupportSource('user-company-source-file', 'user-company-source-help');
      let result = await LLMService.buildCompanyContext(websiteUrl);
      applyUserCompanyContextResult(result);
      if (uploaded.text) {
        result = await LLMService.refineCompanyContext({
          websiteUrl,
          currentSections: getCurrentUserCompanySections(),
          currentAiGuidance: document.getElementById('user-ai-instructions').value.trim(),
          currentGeography: document.getElementById('user-geo-primary').value.trim(),
          currentRegulations: regsInput.getTags(),
          history: [],
          userPrompt: 'Incorporate the uploaded strategy, policy, procedure, and operating-model material into this company context draft while keeping it concise and grounded.',
          uploadedText: '',
          uploadedDocumentName: ''
        });
        applyUserCompanyContextResult(result);
      }
      companyRefinementHistory.push({ role: 'assistant', text: uploaded.text ? 'Initial company context draft created and refined using the uploaded source material. Use follow-up prompts below if you want to reshape it further.' : 'Initial company context draft created. Use follow-up prompts below if you want to reshape it further.' });
      renderUserCompanyRefinementHistory();
      if (companyRefineStatusEl) companyRefineStatusEl.textContent = 'Initial AI draft applied. Use the follow-up prompt box below to keep refining it.';
      UI.toast('Personal company context built from public sources.', 'success', 5000);
    } catch (error) {
      UI.toast('Company context build failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Build from Website';
    }
  });

  document.getElementById('btn-refine-user-context').addEventListener('click', () => {
    const prompt = companyFollowupEl.value.trim();
    const websiteUrl = websiteEl.value.trim();
    const llmConfig = getSessionLLMConfig();
    if (!websiteUrl) {
      UI.toast('Enter a company website URL first.', 'warning');
      return;
    }
    if (!prompt) {
      UI.toast('Enter a follow-up prompt first.', 'warning');
      return;
    }
    const btn = document.getElementById('btn-refine-user-context');
    btn.disabled = true;
    btn.textContent = 'Applying…';
    try {
      if (companyRefineStatusEl) companyRefineStatusEl.textContent = 'Applying your latest instruction to the company context…';
      companyRefinementHistory.push({ role: 'user', text: prompt });
      renderUserCompanyRefinementHistory();
      LLMService.setCompassConfig(llmConfig);
      const refineInput = {
        websiteUrl,
        currentSections: getCurrentUserCompanySections(),
        currentAiGuidance: document.getElementById('user-ai-instructions').value.trim(),
        currentGeography: document.getElementById('user-geo-primary').value.trim(),
        currentRegulations: regsInput.getTags(),
        history: companyRefinementHistory,
        userPrompt: prompt,
        uploadedText: '',
        uploadedDocumentName: ''
      };
      const result = buildLocalUserCompanyContextFallback(refineInput);
      applyUserCompanyContextResult(result);
      companyRefinementHistory.push({ role: 'assistant', text: result.responseMessage || 'I refined the company context based on your latest prompt.' });
      renderUserCompanyRefinementHistory();
      companyFollowupEl.value = '';
      if (companyRefineStatusEl) companyRefineStatusEl.textContent = 'Latest follow-up applied. Keep iterating until the context feels right.';
      UI.toast('Personal company context refined.', 'success', 5000);
    } catch (error) {
      UI.toast('Company context refinement failed: ' + error.message, 'danger', 6000);
      if (companyRefineStatusEl) companyRefineStatusEl.textContent = `Company context refinement failed: ${error.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Apply Follow-Up Now';
    }
  });

  document.getElementById('btn-user-role-ai').addEventListener('click', async () => {
    const btn = document.getElementById('btn-user-role-ai');
    btn.disabled = true;
    btn.textContent = 'Building…';
    try {
      const sourceText = await loadUserAiSource();
      const llmConfig = getSessionLLMConfig();
      LLMService.setCompassConfig({
        apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
        model: llmConfig.model || 'gpt-5.1',
        apiKey: llmConfig.apiKey || ''
      });
      const result = await LLMService.buildUserPreferenceAssist(buildUserAssistInput(sourceText));
      document.getElementById('user-working-context').value = result.workingContext || document.getElementById('user-working-context').value;
      document.getElementById('user-preferred-outputs').value = result.preferredOutputs || document.getElementById('user-preferred-outputs').value;
      if (result.aiInstructions && !document.getElementById('user-ai-instructions').value.trim()) {
        document.getElementById('user-ai-instructions').value = result.aiInstructions;
      }
      UI.toast('Role context and preferred output style drafted.', 'success', 5000);
    } catch (error) {
      UI.toast('AI assist failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI Assist Role Context';
    }
  });

  document.getElementById('btn-user-defaults-ai').addEventListener('click', async () => {
    const btn = document.getElementById('btn-user-defaults-ai');
    btn.disabled = true;
    btn.textContent = 'Building…';
    try {
      const sourceText = await loadUserAiSource();
      const llmConfig = getSessionLLMConfig();
      LLMService.setCompassConfig({
        apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
        model: llmConfig.model || 'gpt-5.1',
        apiKey: llmConfig.apiKey || ''
      });
      const result = await LLMService.buildUserPreferenceAssist(buildUserAssistInput(sourceText));
      document.getElementById('user-context-summary').value = result.adminContextSummary || document.getElementById('user-context-summary').value;
      document.getElementById('user-ai-instructions').value = result.aiInstructions || document.getElementById('user-ai-instructions').value;
      UI.toast('Personal defaults drafted from your source material.', 'success', 5000);
    } catch (error) {
      UI.toast('AI assist failed: ' + error.message, 'danger', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI Assist Personal Defaults';
    }
  });

  document.getElementById('btn-reset-user-settings').addEventListener('click', async () => {
    if (await UI.confirm('Reset your personal settings to the global admin defaults?')) {
      localStorage.removeItem(buildUserStorageKey(USER_SETTINGS_STORAGE_PREFIX));
      UI.toast('Your personal settings were reset.', 'success');
      renderUserOnboarding(getUserSettings(), 0);
    }
  });

  document.getElementById('btn-rerun-onboarding').addEventListener('click', () => {
    renderUserOnboarding(getUserSettings(), 0);
  });
}
