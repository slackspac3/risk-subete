function renderUserDashboard() {
  if (!requireAuth()) return;
  if (AuthService.isAdminAuthenticated()) {
    Router.navigate(getDefaultRouteForCurrentUser());
    return;
  }

  const settings = getUserSettings();
  if (!settings.onboardedAt) {
    renderUserOnboarding(settings);
    return;
  }

  const user = AppState.currentUser || AuthService.getCurrentUser();
  const globalSettings = getAdminSettings();
  const profile = normaliseUserProfile(settings.userProfile, user);
  const capability = getNonAdminCapabilityState(user, settings, globalSettings);
  const allAssessments = getAssessments();
  const assessments = allAssessments
    .filter(a => !a?.archivedAt)
    .slice()
    .sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime());
  const archivedAssessments = allAssessments
    .filter(a => a?.archivedAt)
    .slice()
    .sort((a, b) => new Date(b.archivedAt || b.completedAt || b.createdAt || 0).getTime() - new Date(a.archivedAt || a.completedAt || a.createdAt || 0).getTime())
    .slice(0, 6);
  const recentAssessments = assessments.slice(0, 4);
  const latestAssessment = recentAssessments[0] || null;
  const learningStore = getLearningStore();
  const templateLoads = Object.values(learningStore.templates || {}).reduce((sum, item) => sum + Number(item.loads || 0), 0);
  const draftTitle = String(AppState.draft?.scenarioTitle || AppState.draft?.narrative || '').trim();
  const hasDraft = Boolean(draftTitle);
  const focusAreas = Array.isArray(profile.focusAreas) ? profile.focusAreas.filter(Boolean) : [];
  const assessmentsNeedingReview = assessments.filter(a => a?.results && (a.results.toleranceBreached || a.results.nearTolerance || a.results.annualReviewTriggered)).slice(0, 3);
  const openAssessmentRows = [
    ...(hasDraft ? [{
      id: 'draft',
      title: draftTitle || 'Untitled draft',
      status: 'Draft in progress',
      detail: 'Continue from where you left off and complete the next assessment step.',
      actionLabel: 'Resume Draft',
      action: 'draft'
    }] : []),
    ...assessmentsNeedingReview.map(a => ({
      id: a.id,
      title: a.scenarioTitle || 'Untitled assessment',
      status: a.results?.toleranceBreached ? 'Above tolerance' : a.results?.nearTolerance ? 'Needs management review' : 'Annual review triggered',
      detail: `${a.buName || profile.businessUnit || user?.businessUnit || 'Business unit not set'} · ${new Date(a.completedAt || a.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}`,
      actionLabel: 'Open Result',
      action: a.id
    }))
  ].slice(0, 4);
  const dashboardPriorities = [
    focusAreas.length
      ? `Your saved focus areas are ${focusAreas.slice(0, 3).join(', ')}${focusAreas.length > 3 ? ', and related topics.' : '.'}`
      : 'Add focus areas in Personal Settings so AI outputs reflect what matters most in your role.',
    latestAssessment
      ? `Your latest completed assessment is ${latestAssessment.scenarioTitle || 'an untitled scenario'} from ${new Date(latestAssessment.completedAt || latestAssessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })}.`
      : 'You have not completed a risk assessment yet. Start one to establish a baseline view for your area.',
    profile.workingContext
      ? 'Your working context is saved and will be reused automatically in AI-assisted steps.'
      : 'Your working context is still thin. Add a few lines in Personal Settings to improve the usefulness of generated outputs.'
  ];

  setPage(`
    <main class="page">
      <div class="container container--wide" style="padding:var(--sp-10) var(--sp-6)">
        <section class="card card--elevated" style="padding:var(--sp-8);background:linear-gradient(135deg, rgba(11,15,28,.98), rgba(18,27,49,.96));border-color:rgba(244,193,90,.18)">
          <div class="flex items-start justify-between" style="gap:var(--sp-6);flex-wrap:wrap">
            <div style="max-width:760px">
              <div class="landing-badge">Personal Dashboard</div>
              <h2 style="margin-top:var(--sp-4)">Welcome back, ${user?.displayName || 'there'}.</h2>
              <p style="margin-top:10px;color:rgba(255,255,255,.74);max-width:680px">This is your main working space. Use it to start a new risk assessment, keep track of what you have already analysed, and stay on top of the context that shapes your outputs.</p>
              <div class="flex items-center gap-3 mt-6" style="flex-wrap:wrap">
                <button class="btn btn--primary btn--lg" id="btn-dashboard-new-assessment">Start a New Risk Assessment</button>
                <button class="btn btn--secondary" id="btn-dashboard-open-settings">Review Personal Settings</button>
              </div>
            </div>
            <div class="card" style="min-width:280px;max-width:340px;padding:var(--sp-5);background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)">
              <div class="context-panel-title">Your saved context</div>
              <div class="context-panel-copy" style="margin-top:8px">${profile.jobTitle || 'Role not yet set'} · ${profile.businessUnit || user?.businessUnit || 'Business unit not yet set'}${profile.department || user?.department ? ` · ${profile.department || user?.department}` : ''}</div>
              <div class="form-help" style="margin-top:10px;color:rgba(255,255,255,.65)">Default geography: ${settings.geographyPrimary || settings.geography || globalSettings.geography}</div>
              <div class="form-help" style="margin-top:10px;color:rgba(255,255,255,.65)">Current role mode: ${capability.roleLabel}</div>
            </div>
          </div>
        </section>

        <section class="admin-overview-grid" style="margin-top:var(--sp-8)">
          <div class="admin-overview-card">
            <div class="admin-overview-label">Assessments Completed</div>
            <div class="admin-overview-value" style="font-size:1.2rem">${assessments.length}</div>
            <div class="admin-overview-foot">${latestAssessment ? `Latest: ${new Date(latestAssessment.completedAt || latestAssessment.createdAt || Date.now()).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No completed assessments yet'}</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Focus Areas</div>
            <div class="admin-overview-value" style="font-size:1.2rem">${focusAreas.length}</div>
            <div class="admin-overview-foot">${focusAreas.length ? focusAreas.join(', ') : 'Add your priorities in Personal Settings'}</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Templates Started</div>
            <div class="admin-overview-value" style="font-size:1.2rem">${templateLoads}</div>
            <div class="admin-overview-foot">${hasDraft ? 'You also have an assessment draft in progress' : 'No draft in progress right now'}</div>
          </div>
          <div class="admin-overview-card">
            <div class="admin-overview-label">Needs Review</div>
            <div class="admin-overview-value" style="font-size:1.2rem">${assessmentsNeedingReview.length}</div>
            <div class="admin-overview-foot">${assessmentsNeedingReview.length ? 'Scenarios near or above tolerance are ready for review.' : 'No high-priority reviews waiting right now.'}</div>
          </div>
        </section>

        <section style="margin-top:var(--sp-8)">
          ${renderNonAdminHowToGuide(capability)}
        </section>

        <section class="grid-2" style="margin-top:var(--sp-8);align-items:start">
          <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
                <div>
                  <div class="context-panel-title">Open work</div>
                  <div class="form-help">The next assessments or reviews most likely to need your attention.</div>
                </div>
                <span class="badge badge--neutral">${openAssessmentRows.length}</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
                ${openAssessmentRows.length ? openAssessmentRows.map(item => `
                  <div class="card dashboard-assessment-row" data-assessment-id="${item.action}" style="padding:var(--sp-4);background:var(--bg-elevated);text-align:left">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                      <div>
                        <div style="font-weight:600;color:var(--text-primary)">${item.title}</div>
                        <div class="form-help" style="margin-top:6px">${item.detail}</div>
                      </div>
                      <span class="badge ${/above tolerance/i.test(item.status) ? 'badge--danger' : /review/i.test(item.status) ? 'badge--warning' : 'badge--gold'}">${item.status}</span>
                    </div>
                    <div class="flex items-center gap-3" style="margin-top:10px;flex-wrap:wrap">
                      <button type="button" class="btn btn--ghost btn--sm dashboard-open-action" data-assessment-id="${item.action}">${item.actionLabel}</button>
                      ${item.action === 'draft' ? '<button type="button" class="btn btn--ghost btn--sm dashboard-archive-draft">Archive</button><button type="button" class="btn btn--ghost btn--sm dashboard-delete-draft">Delete</button>' : `<button type="button" class="btn btn--ghost btn--sm dashboard-archive-assessment" data-assessment-id="${item.action}">Archive</button><button type="button" class="btn btn--ghost btn--sm dashboard-delete-assessment" data-assessment-id="${item.action}">Delete</button>`}
                    </div>
                  </div>
                `).join('') : `<div class="form-help">You have nothing waiting for review right now. Start a new assessment when you are ready.</div>`}
              </div>
            </div>

            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
                <div>
                  <div class="context-panel-title">Recent assessments</div>
                  <div class="form-help">Your latest saved analysis outputs.</div>
                </div>
                <span class="badge badge--neutral">${recentAssessments.length}</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
                ${recentAssessments.length ? recentAssessments.map(assessment => `
                  <div class="card dashboard-assessment-row" data-assessment-id="${assessment.id}" style="padding:var(--sp-4);background:var(--bg-elevated);text-align:left">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                      <div>
                        <div style="font-weight:600;color:var(--text-primary)">${assessment.scenarioTitle || 'Untitled assessment'}</div>
                        <div class="form-help" style="margin-top:6px">${assessment.buName || profile.businessUnit || user?.businessUnit || 'Business unit not set'} · ${new Date(assessment.completedAt || assessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                      </div>
                      <span class="badge ${assessment.results?.toleranceBreached ? 'badge--danger' : assessment.results?.nearTolerance ? 'badge--warning' : 'badge--gold'}">${assessment.results?.toleranceBreached ? 'Above tolerance' : assessment.results?.nearTolerance ? 'Close to tolerance' : 'Open result'}</span>
                    </div>
                    <div class="flex items-center gap-3" style="margin-top:10px;flex-wrap:wrap">
                      <button type="button" class="btn btn--ghost btn--sm dashboard-open-action" data-assessment-id="${assessment.id}">Open Result</button>
                      <button type="button" class="btn btn--ghost btn--sm dashboard-archive-assessment" data-assessment-id="${assessment.id}">Archive</button>
                      <button type="button" class="btn btn--ghost btn--sm dashboard-delete-assessment" data-assessment-id="${assessment.id}">Delete</button>
                    </div>
                  </div>
                `).join('') : `<div class="form-help">No completed assessments yet. Finished assessments will appear here for quick review and comparison.</div>`}
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:var(--sp-5)">
            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
                <div>
                  <div class="context-panel-title">What to track next</div>
                  <div class="form-help">A concise working view of what deserves attention.</div>
                </div>
                <span class="badge badge--neutral">${dashboardPriorities.length} items</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
                ${dashboardPriorities.map((item, index) => `
                  <div style="display:flex;gap:12px;align-items:flex-start;background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                    <div style="width:28px;height:28px;border-radius:999px;background:rgba(244,193,90,.18);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:var(--accent-gold);flex-shrink:0">${index + 1}</div>
                    <div style="font-size:.9rem;line-height:1.6">${item}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="context-panel-title">Items needing review</div>
              <div class="form-help" style="margin-top:6px">Scenarios that are near tolerance, above tolerance, or ready for another management look.</div>
              <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
                ${assessmentsNeedingReview.length ? assessmentsNeedingReview.map(assessment => `
                  <div class="card dashboard-assessment-row" data-assessment-id="${assessment.id}" style="padding:var(--sp-4);background:var(--bg-elevated);text-align:left">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                      <div>
                        <div style="font-weight:600;color:var(--text-primary)">${assessment.scenarioTitle || 'Untitled assessment'}</div>
                        <div class="form-help" style="margin-top:6px">${assessment.buName || profile.businessUnit || user?.businessUnit || 'Business unit not set'} · ${new Date(assessment.completedAt || assessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                      </div>
                      <span class="badge ${assessment.results?.toleranceBreached ? 'badge--danger' : 'badge--warning'}">${assessment.results?.toleranceBreached ? 'Escalate' : 'Review'}</span>
                    </div>
                    <div class="flex items-center gap-3" style="margin-top:10px;flex-wrap:wrap">
                      <button type="button" class="btn btn--ghost btn--sm dashboard-open-action" data-assessment-id="${assessment.id}">Open Result</button>
                      <button type="button" class="btn btn--ghost btn--sm dashboard-archive-assessment" data-assessment-id="${assessment.id}">Archive</button>
                      <button type="button" class="btn btn--ghost btn--sm dashboard-delete-assessment" data-assessment-id="${assessment.id}">Delete</button>
                    </div>
                  </div>
                `).join('') : `<div class="form-help">Nothing currently stands out for urgent review.</div>`}
              </div>
            </div>

            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="context-panel-title">Current activity</div>
              <div style="display:grid;gap:12px;margin-top:var(--sp-5)">
                <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                  <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Setup status</div>
                  <div style="margin-top:6px;font-weight:600">Completed on ${new Date(settings.onboardedAt).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
                  <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Draft assessment</div>
                  <div style="margin-top:6px;font-weight:600">${draftTitle || 'No draft in progress'}</div>
                  <div class="form-help" style="margin-top:6px">${hasDraft ? 'Continue from where you left off or start a new analysis.' : 'Your next assessment will start with a fresh draft.'}</div>
                </div>
              </div>
              <div class="flex items-center gap-3 mt-5" style="flex-wrap:wrap">
                <button class="btn btn--secondary" id="btn-dashboard-continue-draft" ${hasDraft ? '' : 'disabled'}>Resume Draft</button>
                <button class="btn btn--ghost" id="btn-dashboard-settings-secondary">Open Settings</button>
              </div>
            </div>

            <div class="card card--elevated" style="padding:var(--sp-6)">
              <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
                <div>
                  <div class="context-panel-title">Archived items</div>
                  <div class="form-help">Stored out of the way, but still available if you need them again.</div>
                </div>
                <span class="badge badge--neutral">${archivedAssessments.length}</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
                ${archivedAssessments.length ? archivedAssessments.map(assessment => `
                  <div class="card dashboard-assessment-row" style="padding:var(--sp-4);background:var(--bg-elevated);text-align:left">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                      <div>
                        <div style="font-weight:600;color:var(--text-primary)">${assessment.scenarioTitle || 'Untitled scenario'}</div>
                        <div class="form-help" style="margin-top:6px">Archived ${new Date(assessment.archivedAt || assessment.completedAt || assessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}${assessment.results ? ' · Completed assessment' : ' · Draft snapshot'}</div>
                      </div>
                      <span class="badge badge--neutral">Archived</span>
                    </div>
                    <div class="flex items-center gap-3" style="margin-top:10px;flex-wrap:wrap">
                      <button type="button" class="btn btn--ghost btn--sm dashboard-restore-assessment" data-assessment-id="${assessment.id}">${assessment.results ? 'Restore to Dashboard' : 'Resume as Draft'}</button>
                      ${assessment.results ? '<button type="button" class="btn btn--ghost btn--sm dashboard-open-action" data-assessment-id="'+assessment.id+'">Open Result</button>' : ''}
                      <button type="button" class="btn btn--ghost btn--sm dashboard-delete-assessment" data-assessment-id="${assessment.id}">Delete</button>
                    </div>
                  </div>
                `).join('') : `<div class="form-help">Nothing is archived right now.</div>`}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>`);

  document.getElementById('btn-dashboard-new-assessment')?.addEventListener('click', () => {
    resetDraft();
    Router.navigate('/wizard/1');
  });
  document.getElementById('btn-dashboard-open-settings')?.addEventListener('click', () => Router.navigate('/settings'));
  document.getElementById('btn-dashboard-settings-secondary')?.addEventListener('click', () => Router.navigate('/settings'));
  document.getElementById('btn-dashboard-continue-draft')?.addEventListener('click', () => Router.navigate('/wizard/1'));
  document.querySelector('main.page')?.addEventListener('click', async event => {
    const target = event.target.closest('button');
    if (!target) return;
    const row = target.closest('.dashboard-assessment-row');
    const id = target.dataset.assessmentId || row?.dataset.assessmentId || '';
    event.preventDefault();
    event.stopPropagation();

    try {
      if (target.classList.contains('dashboard-open-action')) {
        if (id === 'draft') {
          Router.navigate('/wizard/1');
          return;
        }
        if (id) Router.navigate(`/results/${id}`);
        return;
      }

      if (target.classList.contains('dashboard-archive-assessment')) {
        if (!id) return;
        if (!await UI.confirm('Archive this assessment? It will be removed from your main dashboard.')) return;
        if (!archiveAssessment(id)) { UI.toast('Could not find that assessment to archive.', 'warning'); return; }
        renderUserDashboard();
        UI.toast('Assessment archived.', 'success');
        return;
      }

      if (target.classList.contains('dashboard-delete-assessment')) {
        if (!id) return;
        if (!await UI.confirm('Delete this assessment permanently from your workspace?')) return;
        if (!deleteAssessment(id)) { UI.toast('Could not find that assessment to delete.', 'warning'); return; }
        renderUserDashboard();
        UI.toast('Assessment deleted.', 'success');
        return;
      }

      if (target.classList.contains('dashboard-archive-draft')) {
        if (!await UI.confirm('Archive the current draft and remove it from your active dashboard?')) return;
        const archived = archiveCurrentDraft();
        if (!archived) {
          UI.toast('There is no draft to archive yet.', 'warning');
          return;
        }
        renderUserDashboard();
        UI.toast('Draft archived.', 'success');
        return;
      }

      if (target.classList.contains('dashboard-delete-draft')) {
        if (!await UI.confirm('Delete the current draft from your workspace?')) return;
        deleteCurrentDraft();
        renderUserDashboard();
        UI.toast('Draft deleted.', 'success');
        return;
      }

      if (target.classList.contains('dashboard-restore-assessment')) {
        if (!id) return;
        const assessment = getAssessmentById(id);
        if (!assessment) return;
        if (assessment.results) {
          unarchiveAssessment(id);
          renderUserDashboard();
          UI.toast('Archived assessment restored to your dashboard.', 'success');
          return;
        }
        restoreArchivedDraftToWorkspace(id);
        UI.toast('Archived draft restored to your active workspace.', 'success');
        Router.navigate('/wizard/1');
      }
    } catch (error) {
      UI.toast(`Dashboard action failed: ${error instanceof Error ? error.message : String(error)}`, 'danger');
    }
  });
}
