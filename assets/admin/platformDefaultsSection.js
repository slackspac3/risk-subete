const AdminPlatformDefaultsSection = (() => {
  function renderSection({ settings }) {
    return renderSettingsSection({
      title: 'Platform Defaults And Governance',
      scope: 'admin-settings',
      description: 'These are fallback rules for the whole platform after the organisation tree and entity context are in place.',
      meta: `${settings.geography} default geography`,
      body: `<div class="grid-3">
        <div class="form-group">
          <label class="form-label" for="admin-warning-threshold">Warning Trigger (USD)</label>
          <input class="form-input" id="admin-warning-threshold" type="number" min="0" step="100000" value="${settings.warningThresholdUsd}">
          <span class="form-help">Amber signal when per-event P90 reaches this value.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-tolerance-threshold">Tolerance Threshold (USD)</label>
          <input class="form-input" id="admin-tolerance-threshold" type="number" min="0" step="100000" value="${settings.toleranceThresholdUsd}">
          <span class="form-help">Red trigger when per-event P90 exceeds this value.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-annual-threshold">Annual Review Trigger (USD)</label>
          <input class="form-input" id="admin-annual-threshold" type="number" min="0" step="100000" value="${settings.annualReviewThresholdUsd}">
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
      <div class="admin-inline-actions mt-4">
        <a class="btn btn--secondary" href="#/admin/bu">Open Org Customisation</a>
        <a class="btn btn--secondary" href="#/admin/docs">Open Document Library</a>
      </div>`
    });
  }

  function bind({ settings }) {
    const regsHost = document.getElementById('ti-admin-regulations');
    const regsInput = regsHost ? UI.tagInput('ti-admin-regulations', settings.applicableRegulations) : null;
    const typicalDepartmentsHost = document.getElementById('ti-admin-typical-departments');
    const typicalDepartmentsInput = typicalDepartmentsHost ? UI.tagInput('ti-admin-typical-departments', getTypicalDepartments(settings)) : null;
    return { regsInput, typicalDepartmentsInput };
  }

  return { renderSection, bind };
})();
