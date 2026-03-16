function renderUserOnboarding(existingSettings = getUserSettings(), startStep = 0) {
  if (!requireAuth()) return;
  const globalSettings = getAdminSettings();
  const settings = getUserSettings();
  const companyStructure = Array.isArray(globalSettings.companyStructure) ? globalSettings.companyStructure : [];
  const companies = getCompanyEntities(companyStructure);
  const profile = normaliseUserProfile(existingSettings.userProfile || settings.userProfile);
  const draftSettings = {
    ...settings,
    ...existingSettings,
    userProfile: profile
  };
  let currentStep = Math.max(0, Math.min(4, Number(startStep) || 0));
  let onboardingAiSourceText = '';
  let onboardingAiSourceName = '';

  function saveProgress(markComplete = false) {
    saveUserSettings({
      ...draftSettings,
      onboardedAt: markComplete ? (draftSettings.onboardedAt || new Date().toISOString()) : draftSettings.onboardedAt || ''
    });
  }

  function renderStep() {
    const stepMeta = [
      {
        title: 'Let the platform know who you are',
        prompt: 'Start with your name and role so the platform can tailor guidance to your perspective.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-name">What should the platform call you?</label>
            <input class="form-input" id="onboard-name" value="${draftSettings.userProfile.fullName || AppState.currentUser?.displayName || ''}" placeholder="Your full name">
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-title">What is your role?</label>
            <input class="form-input" id="onboard-title" value="${draftSettings.userProfile.jobTitle || ''}" placeholder="e.g. Risk Manager, Technology Lead, Compliance Officer">
          </div>`
      },
      {
        title: 'Where do you sit in the organisation?',
        prompt: 'This helps the platform interpret scenarios using the right business context.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-bu">Business unit or entity</label>
            <select class="form-select" id="onboard-bu">
              <option value="">Choose your business unit</option>
              ${companies.map(entity => `<option value="${entity.id}" ${entity.id === draftSettings.userProfile.businessUnitEntityId ? 'selected' : ''}>${entity.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-department">Department or function</label>
            <select class="form-select" id="onboard-department"></select>
          </div>`
      },
      {
        title: 'What do you care about most?',
        prompt: 'Choose the themes that should influence how the platform frames analysis for you.',
        body: `
          <div class="grid-3" style="gap:12px">
            <div class="form-group">
              <label class="form-label" for="onboard-geo-primary">Primary geography</label>
              ${renderGeographySelect('onboard-geo-primary', draftSettings.geographyPrimary || draftSettings.geography || globalSettings.geography)}
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-geo-secondary">Secondary geography</label>
              ${renderGeographySelect('onboard-geo-secondary', draftSettings.geographySecondary || '', 'Optional', true)}
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-geo-tertiary">Tertiary geography</label>
              ${renderGeographySelect('onboard-geo-tertiary', draftSettings.geographyTertiary || '', 'Optional', true)}
            </div>
          </div>
          <div class="form-group mt-4">
            <label class="form-label">Focus areas</label>
            <div class="tag-input-wrap" id="ti-onboard-focus"></div>
            <div class="citation-chips" style="margin-top:10px">
              ${USER_FOCUS_OPTIONS.map(option => `<button type="button" class="chip onboard-focus-chip" data-focus="${option}">${option}</button>`).join('')}
            </div>
          </div>`
      },
      {
        title: 'What makes a useful answer for you?',
        prompt: 'Tell the platform how you want outputs to be framed.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-preferred-outputs">Preferred output style</label>
            <textarea class="form-textarea" id="onboard-preferred-outputs" rows="4" placeholder="e.g. Give me crisp executive summaries, clear risk drivers, and actions I can take with my team.">${draftSettings.userProfile.preferredOutputs || ''}</textarea>
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-working-context">Anything important about your working context?</label>
            <textarea class="form-textarea" id="onboard-working-context" rows="4" placeholder="e.g. I mostly support regulated services and need outputs that balance resilience, compliance, and board reporting.">${draftSettings.userProfile.workingContext || ''}</textarea>
          </div>
          <div class="card mt-4" style="padding:var(--sp-4);background:var(--bg-elevated)">
            <div class="context-panel-title">AI Assist</div>
            <div class="form-group mt-3">
              <label class="form-label" for="onboard-answer-notes">Notes for AI assist</label>
              <textarea class="form-textarea" id="onboard-answer-notes" rows="3" placeholder="Paste role notes, writing preferences, reporting expectations, board-facing requirements, or any other helpful context."></textarea>
            </div>
            <div class="form-group mt-3">
              <label class="form-label" for="onboard-answer-file">Upload source material</label>
              <input class="form-input" id="onboard-answer-file" type="file" accept=".txt,.csv,.json,.md,.tsv,.xlsx,.xls,.doc,.docx,.pdf">
              <div class="form-help" id="onboard-answer-file-help">Upload TXT, CSV, TSV, JSON, Markdown, Excel, DOC, DOCX, or PDF. The extracted text will be used only to draft this step.</div>
            </div>
            <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
              <button class="btn btn--secondary" id="btn-onboard-answer-ai" type="button">AI Assist This Step</button>
              <span class="form-help">Drafts your working context and preferred output style from your role, BU, and uploaded material.</span>
            </div>
          </div>`
      },
      {
        title: 'Seed your personal defaults',
        prompt: 'You can keep this light. The idea is to give your account a useful starting point, not to fill in a full admin form.',
        body: `
          <div class="form-group">
            <label class="form-label" for="onboard-company-url">Company website URL</label>
            <input class="form-input" id="onboard-company-url" value="${draftSettings.companyWebsiteUrl || ''}" placeholder="https://example.com">
            <span class="form-help">Optional now. You can build company context later from your settings screen.</span>
          </div>
          <div class="form-group mt-4">
            <label class="form-label" for="onboard-ai-guidance">Personal AI guidance</label>
            <textarea class="form-textarea" id="onboard-ai-guidance" rows="4" placeholder="e.g. Prefer plain-English recommendations, focus on operational resilience, and keep regional context explicit.">${draftSettings.aiInstructions || ''}</textarea>
          </div>`
      }
    ];

    const step = stepMeta[currentStep];
    setPage(`
      <main class="page">
        <div class="container container--narrow" style="padding:var(--sp-12) var(--sp-6);max-width:760px">
          <div class="card card--elevated" style="padding:var(--sp-8)">
            <div class="landing-badge">Personal Setup</div>
            <div style="margin-top:var(--sp-4);display:flex;align-items:center;justify-content:space-between;gap:var(--sp-4);flex-wrap:wrap">
              <div>
                <h2>${step.title}</h2>
                <p style="margin-top:8px;color:var(--text-muted)">${step.prompt}</p>
              </div>
              <div style="min-width:140px;text-align:right">
                <div style="font-size:.78rem;color:var(--text-muted)">Step ${currentStep + 1} of ${stepMeta.length}</div>
                <div style="height:8px;border-radius:999px;background:var(--bg-elevated);margin-top:8px;overflow:hidden">
                  <div style="height:100%;width:${((currentStep + 1) / stepMeta.length) * 100}%;background:var(--accent-gold)"></div>
                </div>
              </div>
            </div>

            <div class="card mt-6" style="padding:var(--sp-6);background:var(--bg-canvas)">
              ${step.body}
            </div>

            <div class="flex items-center justify-between mt-6" style="gap:var(--sp-4);flex-wrap:wrap">
              <button class="btn btn--ghost" id="btn-onboard-back" ${currentStep === 0 ? 'disabled' : ''}>Back</button>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                ${currentStep === stepMeta.length - 1
                  ? `<button class="btn btn--primary" id="btn-onboard-finish">Finish Setup</button>`
                  : `<button class="btn btn--primary" id="btn-onboard-next">Continue</button>`}
              </div>
            </div>
          </div>
        </div>
      </main>`);

    let focusInput = null;
    if (currentStep === 2) {
      focusInput = UI.tagInput('ti-onboard-focus', draftSettings.userProfile.focusAreas || []);
      document.querySelectorAll('.onboard-focus-chip').forEach(button => {
        button.addEventListener('click', () => {
          const next = Array.from(new Set([...(focusInput.getTags() || []), button.dataset.focus]));
          focusInput.setTags(next);
        });
      });
    }
    if (currentStep === 1) {
      const buEl = document.getElementById('onboard-bu');
      const deptEl = document.getElementById('onboard-department');
      const renderDepartmentOptions = () => {
        const departments = getDepartmentEntities(companyStructure, buEl.value);
        const selectedDepartmentId = draftSettings.userProfile.departmentEntityId;
        deptEl.innerHTML = departments.length
          ? departments.map(entity => `<option value="${entity.id}" ${entity.id === selectedDepartmentId ? 'selected' : ''}>${entity.name}</option>`).join('')
          : '<option value="">No functions configured yet</option>';
        deptEl.disabled = !departments.length;
      };
      buEl.addEventListener('change', () => {
        draftSettings.userProfile.businessUnitEntityId = buEl.value;
        draftSettings.userProfile.departmentEntityId = '';
        renderDepartmentOptions();
      });
      renderDepartmentOptions();
    }
    if (currentStep === 3) {
      async function loadOnboardingAiSource() {
        const notes = document.getElementById('onboard-answer-notes')?.value.trim() || '';
        const file = document.getElementById('onboard-answer-file')?.files?.[0];
        let uploadedText = '';
        if (file) {
          const parsed = await parseRegisterFile(file);
          uploadedText = parsed.text || '';
          onboardingAiSourceText = uploadedText;
          onboardingAiSourceName = file.name;
          const help = document.getElementById('onboard-answer-file-help');
          if (help) help.textContent = `Loaded ${file.name}. AI assist will use the extracted text for this setup step.`;
        }
        return [notes, uploadedText || onboardingAiSourceText].filter(Boolean).join('\n\n');
      }

      document.getElementById('btn-onboard-answer-ai')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-onboard-answer-ai');
        btn.disabled = true;
        btn.textContent = 'Drafting…';
        try {
          const sourceText = await loadOnboardingAiSource();
          const llmConfig = getSessionLLMConfig();
          LLMService.setCompassConfig({
            apiUrl: llmConfig.apiUrl || DEFAULT_COMPASS_PROXY_URL,
            model: llmConfig.model || 'gpt-5.1',
            apiKey: llmConfig.apiKey || ''
          });
          const businessEntity = getEntityById(companyStructure, draftSettings.userProfile.businessUnitEntityId || '');
          const departmentEntity = getEntityById(companyStructure, draftSettings.userProfile.departmentEntityId || '');
          const result = await LLMService.buildUserPreferenceAssist({
            userProfile: {
              fullName: draftSettings.userProfile.fullName || AppState.currentUser?.displayName || '',
              jobTitle: draftSettings.userProfile.jobTitle || '',
              businessUnit: businessEntity?.name || draftSettings.userProfile.businessUnit || '',
              department: departmentEntity?.name || draftSettings.userProfile.department || '',
              focusAreas: draftSettings.userProfile.focusAreas || [],
              preferredOutputs: document.getElementById('onboard-preferred-outputs').value.trim(),
              workingContext: document.getElementById('onboard-working-context').value.trim()
            },
            organisationContext: {
              businessUnitContext: businessEntity?.profile || getEntityLayerById(globalSettings, businessEntity?.id || '')?.contextSummary || '',
              departmentContext: departmentEntity?.profile || getEntityLayerById(globalSettings, departmentEntity?.id || '')?.contextSummary || '',
              companyStructureContext: buildOrganisationContextSummary(globalSettings),
              companyContextProfile: globalSettings.companyContextProfile || ''
            },
            currentSettings: {
              aiInstructions: draftSettings.aiInstructions || globalSettings.aiInstructions,
              adminContextSummary: draftSettings.adminContextSummary || globalSettings.adminContextSummary,
              userProfileSummary: buildUserProfileSummary(normaliseUserProfile(draftSettings.userProfile, AppState.currentUser))
            },
            uploadedText: sourceText
          });
          document.getElementById('onboard-working-context').value = result.workingContext || document.getElementById('onboard-working-context').value;
          document.getElementById('onboard-preferred-outputs').value = result.preferredOutputs || document.getElementById('onboard-preferred-outputs').value;
          UI.toast(`Drafted this step${onboardingAiSourceName ? ` using ${onboardingAiSourceName}` : ''}.`, 'success');
        } catch (error) {
          UI.toast('AI assist failed: ' + error.message, 'danger');
        } finally {
          btn.disabled = false;
          btn.textContent = 'AI Assist This Step';
        }
      });
    }

    function captureStepValues() {
      if (currentStep === 0) {
        draftSettings.userProfile.fullName = document.getElementById('onboard-name').value.trim() || AppState.currentUser?.displayName || '';
        draftSettings.userProfile.jobTitle = document.getElementById('onboard-title').value.trim();
      }
      if (currentStep === 1) {
        const businessUnitEntityId = document.getElementById('onboard-bu').value.trim();
        const departmentEntityId = document.getElementById('onboard-department').value.trim();
        const businessEntity = getEntityById(companyStructure, businessUnitEntityId);
        const departmentEntity = getEntityById(companyStructure, departmentEntityId);
        draftSettings.userProfile.businessUnitEntityId = businessUnitEntityId;
        draftSettings.userProfile.businessUnit = businessEntity?.name || '';
        draftSettings.userProfile.departmentEntityId = departmentEntityId;
        draftSettings.userProfile.department = departmentEntity?.name || '';
      }
      if (currentStep === 2) {
        draftSettings.geographyPrimary = document.getElementById('onboard-geo-primary').value.trim() || globalSettings.geography;
        draftSettings.geographySecondary = document.getElementById('onboard-geo-secondary').value.trim();
        draftSettings.geographyTertiary = document.getElementById('onboard-geo-tertiary').value.trim();
        draftSettings.geography = draftSettings.geographyPrimary;
        draftSettings.userProfile.focusAreas = focusInput?.getTags() || [];
      }
      if (currentStep === 3) {
        draftSettings.userProfile.preferredOutputs = document.getElementById('onboard-preferred-outputs').value.trim();
        draftSettings.userProfile.workingContext = document.getElementById('onboard-working-context').value.trim();
      }
      if (currentStep === 4) {
        draftSettings.companyWebsiteUrl = document.getElementById('onboard-company-url').value.trim();
        draftSettings.aiInstructions = document.getElementById('onboard-ai-guidance').value.trim() || globalSettings.aiInstructions;
      }
      draftSettings.userProfile = normaliseUserProfile(draftSettings.userProfile);
    }

    document.getElementById('btn-onboard-back')?.addEventListener('click', () => {
      captureStepValues();
      saveProgress(false);
      currentStep -= 1;
      renderStep();
    });

    document.getElementById('btn-onboard-next')?.addEventListener('click', () => {
      captureStepValues();
      saveProgress(false);
      currentStep += 1;
      renderStep();
    });

    document.getElementById('btn-onboard-finish')?.addEventListener('click', async () => {
      captureStepValues();
      saveUserSettings({
        ...draftSettings,
        onboardedAt: new Date().toISOString(),
        adminContextSummary: draftSettings.userProfile.workingContext || draftSettings.adminContextSummary || globalSettings.adminContextSummary
      });
      await AuthService.updateManagedAccount(AppState.currentUser?.username, {
        businessUnitEntityId: draftSettings.userProfile.businessUnitEntityId || '',
        departmentEntityId: draftSettings.userProfile.departmentEntityId || ''
      });
      if (!AppState.draft.geography) AppState.draft.geography = draftSettings.geography || globalSettings.geography;
      saveDraft();
      UI.toast('Personal setup complete.', 'success');
      Router.navigate('/dashboard');
    });
  }

  renderStep();
}
