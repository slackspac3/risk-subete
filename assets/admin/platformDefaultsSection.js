const AdminPlatformDefaultsSection = (() => {
  function renderScopedDefaultsSummary(targetBu, settings) {
    if (!targetBu) {
      return '<div class="form-help">Choose a mapped business unit or entity to define defaults and governance for that scope.</div>';
    }
    const linkedEntity = targetBu.orgEntityId ? getEntityById(settings.companyStructure || [], targetBu.orgEntityId) : null;
    const rows = [
      ['Scope target', targetBu.name],
      ['Linked entity', linkedEntity ? `${linkedEntity.name} (${linkedEntity.type})` : 'No linked entity'],
      ['Geography override', targetBu.geography || 'Inherit platform default'],
      ['Linked-risk default', typeof targetBu.defaultLinkMode === 'boolean' ? (targetBu.defaultLinkMode ? 'Enabled' : 'Disabled') : 'Inherit platform default'],
      ['Warning trigger', targetBu.warningThresholdUsd ? `USD ${formatGroupedNumber(targetBu.warningThresholdUsd)}` : 'Inherit platform default'],
      ['Tolerance threshold', targetBu.toleranceThresholdUsd ? `USD ${formatGroupedNumber(targetBu.toleranceThresholdUsd)}` : 'Inherit platform default'],
      ['Annual review trigger', targetBu.annualReviewThresholdUsd ? `USD ${formatGroupedNumber(targetBu.annualReviewThresholdUsd)}` : 'Inherit platform default'],
      ['Regulations', Array.isArray(targetBu.regulatoryTags) && targetBu.regulatoryTags.length ? targetBu.regulatoryTags.join(', ') : 'Inherit platform defaults plus entity context'],
      ['AI guidance', targetBu.aiGuidance || 'Inherit platform default'],
      ['Benchmark strategy', targetBu.benchmarkStrategy || 'Inherit platform default'],
      ['Risk appetite', targetBu.riskAppetiteStatement || 'Inherit platform default'],
      ['Escalation guidance', targetBu.escalationGuidance || 'Inherit platform default']
    ];
    return `<div class="card" style="padding:var(--sp-4);background:var(--bg-canvas)">
      <div class="context-panel-title">Scoped Defaults Summary</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px">
        ${rows.map(([label, value]) => `<div><div class="form-help" style="margin:0 0 4px 0">${label}</div><div style="color:var(--text-primary);line-height:1.5">${escapeHtml(value)}</div></div>`).join('')}
      </div>
    </div>`;
  }

  function renderSection({ settings }) {
    const buList = getBUList();
    const firstScopedId = buList[0]?.id || '';
    return renderSettingsSection({
      title: 'Platform Defaults And Governance',
      scope: 'admin-settings',
      description: 'Set the global fallback first, then choose a business unit or linked entity below if you want scoped defaults and governance for that slice of the organisation.',
      meta: `${settings.geography} default geography`,
      body: `<div class="card" style="padding:var(--sp-4);background:var(--bg-canvas);margin-bottom:var(--sp-4)">
        <div class="context-panel-title">1. Platform-Wide Defaults</div>
        <div class="form-help" style="margin-top:6px">These apply everywhere unless a scoped BU or entity override is defined below.</div>
      </div>
      <div class="grid-3">
        <div class="form-group">
          <label class="form-label" for="admin-warning-threshold">Warning Trigger (USD)</label>
          <input class="form-input money-input" id="admin-warning-threshold" type="text" inputmode="numeric" value="${formatCurrencyInputValue(settings.warningThresholdUsd, 'USD')}">
          <span class="form-help">Amber signal when per-event P90 reaches this value.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-tolerance-threshold">Tolerance Threshold (USD)</label>
          <input class="form-input money-input" id="admin-tolerance-threshold" type="text" inputmode="numeric" value="${formatCurrencyInputValue(settings.toleranceThresholdUsd, 'USD')}">
          <span class="form-help">Red trigger when per-event P90 exceeds this value.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-annual-threshold">Annual Review Trigger (USD)</label>
          <input class="form-input money-input" id="admin-annual-threshold" type="text" inputmode="numeric" value="${formatCurrencyInputValue(settings.annualReviewThresholdUsd, 'USD')}">
          <span class="form-help">Used to flag high annual exposure in the results view.</span>
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-escalation-guidance">Escalation Guidance</label>
        <textarea class="form-textarea" id="admin-escalation-guidance" rows="3">${settings.escalationGuidance}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-appetite">Risk Appetite Statement</label>
        <textarea class="form-textarea" id="admin-appetite" rows="4">${settings.riskAppetiteStatement}</textarea>
      </div>
      <div class="grid-2 mt-4">
        <div class="form-group">
          <label class="form-label" for="admin-geo">Default Geography</label>
          <input class="form-input" id="admin-geo" value="${settings.geography}">
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-link-mode">Default Linked-Risk Mode</label>
          <select class="form-select" id="admin-link-mode">
            <option value="yes" ${settings.defaultLinkMode ? 'selected' : ''}>Enabled</option>
            <option value="no" ${!settings.defaultLinkMode ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-context-summary">Admin Context Summary</label>
        <textarea class="form-textarea" id="admin-context-summary" rows="2">${settings.adminContextSummary}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Applicable Regulations</label>
        <div class="tag-input-wrap" id="ti-admin-regulations"></div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label">Typical Departments</label>
        <div class="tag-input-wrap" id="ti-admin-typical-departments"></div>
        <span class="form-help">These appear as suggested department names when BU admins or global admin add a new function or department.</span>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-ai-instructions">AI Guidance</label>
        <textarea class="form-textarea" id="admin-ai-instructions" rows="3">${settings.aiInstructions}</textarea>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-benchmark-strategy">Benchmark Strategy</label>
        <textarea class="form-textarea" id="admin-benchmark-strategy" rows="3">${settings.benchmarkStrategy}</textarea>
        <span class="form-help">Explain whether the AI should prefer GCC or UAE references first, and how it should justify any global fallback.</span>
      </div>
      <div class="card mt-5" style="padding:var(--sp-5);background:var(--bg-elevated)">
        <div class="context-panel-title">2. Scoped Defaults For A BU Or Entity</div>
        <div class="form-help" style="margin-top:6px">Choose a business unit or linked entity here when you want defaults and governance that differ from the platform-wide values above.</div>
        <div class="grid-2 mt-4" style="gap:12px">
          <div class="form-group">
            <label class="form-label" for="admin-scoped-default-target">Choose BU / entity</label>
            <select class="form-select" id="admin-scoped-default-target">
              <option value="">Select a BU or linked entity</option>
              ${buList.map(bu => {
                const linkedEntity = bu.orgEntityId ? getEntityById(settings.companyStructure || [], bu.orgEntityId) : null;
                const label = linkedEntity ? `${bu.name} (${linkedEntity.name})` : bu.name;
                return `<option value="${bu.id}" ${bu.id === firstScopedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
            <button class="btn btn--secondary" id="btn-edit-scoped-defaults" type="button">Edit Scoped Defaults</button>
            <a class="btn btn--ghost" href="#/admin/bu">Open Org Customisation</a>
          </div>
        </div>
        <div id="admin-scoped-default-summary" class="mt-4">${renderScopedDefaultsSummary(buList[0] || null, settings)}</div>
      </div>
      <div class="admin-inline-actions mt-4">
        <a class="btn btn--secondary" href="#/admin/docs">Open Document Library</a>
      </div>`
    });
  }

  function bind({ settings }) {
    attachFormattedMoneyInputs();
    const regsHost = document.getElementById('ti-admin-regulations');
    const regsInput = regsHost ? UI.tagInput('ti-admin-regulations', settings.applicableRegulations) : null;
    const typicalDepartmentsHost = document.getElementById('ti-admin-typical-departments');
    const typicalDepartmentsInput = typicalDepartmentsHost ? UI.tagInput('ti-admin-typical-departments', getTypicalDepartments(settings)) : null;
    const targetEl = document.getElementById('admin-scoped-default-target');
    const summaryEl = document.getElementById('admin-scoped-default-summary');
    const updateSummary = () => {
      if (!summaryEl) return;
      const targetBu = getBUList().find(item => item.id === (targetEl?.value || '')) || null;
      summaryEl.innerHTML = renderScopedDefaultsSummary(targetBu, getAdminSettings());
    };
    targetEl?.addEventListener('change', updateSummary);
    document.getElementById('btn-edit-scoped-defaults')?.addEventListener('click', () => {
      const targetBu = getBUList().find(item => item.id === (targetEl?.value || '')) || null;
      if (!targetBu) {
        UI.toast('Choose a BU or linked entity first.', 'warning');
        return;
      }
      openBUEditor(targetBu);
    });
    return { regsInput, typicalDepartmentsInput, updateScopedSummary: updateSummary };
  }

  return { renderSection, bind };
})();
