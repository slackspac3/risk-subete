const AdminAuditLogSection = (() => {
  function renderSection({ auditCache }) {
    const auditSummary = auditCache.summary || {};
    const auditEntries = Array.isArray(auditCache.entries) ? auditCache.entries.slice(0, 25) : [];
    return renderSettingsSection({
      title: 'Audit Log',
      scope: 'admin-settings',
      description: 'Short-retention PoC audit trail for login activity, user management, and shared settings changes.',
      meta: auditSummary.total ? `${auditSummary.total} retained events` : 'Demo retention only',
      body: `<div class="admin-overview-grid">
        <div class="admin-overview-card"><div class="admin-overview-label">Login Success</div><div class="admin-overview-value">${auditSummary.loginSuccessCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">Login Failure</div><div class="admin-overview-value">${auditSummary.loginFailureCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">Logout</div><div class="admin-overview-value">${auditSummary.logoutCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">Admin Actions</div><div class="admin-overview-value">${auditSummary.adminActionCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">BU Admin Actions</div><div class="admin-overview-value">${auditSummary.buAdminActionCount || 0}</div></div>
        <div class="admin-overview-card"><div class="admin-overview-label">User Actions</div><div class="admin-overview-value">${auditSummary.userActionCount || 0}</div></div>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-refresh-audit-log" type="button">${auditCache.loading ? 'Refreshing…' : 'Refresh Audit Log'}</button>
        <span class="form-help" id="audit-log-status">${auditCache.error || `Retention is capped at ${auditSummary.retainedCapacity || 200} recent events and older entries are overwritten.`}</span>
      </div>
      <div class="table-wrap mt-4">
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Event</th><th>Target</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>${auditEntries.length ? auditEntries.map(entry => `<tr><td>${new Date(entry.ts).toLocaleString()}</td><td>${entry.actorUsername || 'system'}</td><td>${entry.actorRole || 'system'}</td><td>${entry.eventType || 'event'}</td><td>${entry.target || '—'}</td><td>${entry.status || 'success'}</td><td>${formatAuditDetails(entry.details) || '—'}</td></tr>`).join('') : '<tr><td colspan="7">No audit activity has been loaded yet.</td></tr>'}</tbody>
        </table>
      </div>`
    });
  }

  function bind({ rerenderCurrentAdminSection }) {
    document.getElementById('btn-refresh-audit-log')?.addEventListener('click', async () => {
      try {
        await loadAuditLog();
        rerenderCurrentAdminSection();
      } catch (error) {
        UI.toast(`Audit log refresh failed: ${error instanceof Error ? error.message : String(error)}`, 'warning');
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
