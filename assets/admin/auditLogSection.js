const AdminAuditLogSection = (() => {
  function renderSection({ auditCache }) {
    const auditSummary = auditCache.summary || {};
    const auditEntries = Array.isArray(auditCache.entries) ? auditCache.entries.slice(0, 25) : [];
    const runtimeEntries = Array.isArray(AppState.clientRuntimeErrors) ? AppState.clientRuntimeErrors.slice(0, 5) : [];
    return renderSettingsSection({
      title: 'Activity Log',
      scope: 'admin-settings',
      description: 'Recent platform activity for sign-in events, user changes, and shared settings updates.',
      meta: auditSummary.total ? `${auditSummary.total} recent events` : 'Recent activity only',
      body: `<div class="admin-overview-grid">
        <div class="admin-overview-card"><div class="admin-overview-label">Login Success</div><div class="admin-overview-value">${auditSummary.loginSuccessCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">Login Failure</div><div class="admin-overview-value">${auditSummary.loginFailureCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">Logout</div><div class="admin-overview-value">${auditSummary.logoutCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">Admin Actions</div><div class="admin-overview-value">${auditSummary.adminActionCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">BU Admin Actions</div><div class="admin-overview-value">${auditSummary.buAdminActionCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">User Actions</div><div class="admin-overview-value">${auditSummary.userActionCount || 0}</div></div>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-refresh-audit-log" type="button">${auditCache.loading ? 'Refreshing…' : 'Refresh Activity'}</button>
        <span class="form-help" id="audit-log-status">${auditCache.error || `Shows up to ${auditSummary.retainedCapacity || 200} recent events. Older activity rolls off automatically.`}</span>
      </div>
      ${UI.adminTableCard({
        title: 'Runtime health',
        description: 'Recent browser-side errors captured in this admin session only.',
        table: runtimeEntries.length ? `<table class="data-table">
          <thead><tr><th>Time</th><th>Kind</th><th>Message</th><th>Route</th><th>Source</th></tr></thead>
          <tbody>${runtimeEntries.map(entry => `<tr><td>${new Date(entry.ts).toLocaleString()}</td><td>${entry.kind}</td><td>${entry.message}</td><td>${entry.route || '—'}</td><td>${entry.source || '—'}</td></tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state">No client-side runtime errors have been captured in this admin session.</div>'
      })}
      ${UI.adminTableCard({
        title: 'Recent activity',
        description: 'Use this view to confirm sign-ins, user changes, and shared-setting updates.',
        table: `<table class="data-table">
          <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Activity</th><th>Target</th><th>Outcome</th><th>Details</th></tr></thead>
          <tbody>${auditEntries.length ? auditEntries.map(entry => `<tr><td>${new Date(entry.ts).toLocaleString()}</td><td>${entry.actorUsername || 'system'}</td><td>${entry.actorRole || 'system'}</td><td>${entry.eventType || 'event'}</td><td>${entry.target || '—'}</td><td>${entry.status || 'success'}</td><td>${formatAuditDetails(entry.details) || '—'}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">No activity has been loaded yet.</div></td></tr>'}</tbody>
        </table>`
      })}`
    });
  }

  function bind({ rerenderCurrentAdminSection }) {
    document.getElementById('btn-refresh-audit-log')?.addEventListener('click', async () => {
      try {
        await loadAuditLog();
        rerenderCurrentAdminSection();
      } catch (error) {
        UI.toast('Audit log could not be refreshed right now.', 'warning');
      }
    });
    if (!AppState.auditLogCache.loaded && !AppState.auditLogCache.loading) {
      loadAuditLog().then(() => {
        rerenderCurrentAdminSection();
      }).catch(() => {});
    }
  }

  return { renderSection, bind };
})();
