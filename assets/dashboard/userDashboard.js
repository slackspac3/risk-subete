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
  const quickStatus = hasDraft
    ? 'You have a draft in progress and can resume it immediately.'
    : assessmentsNeedingReview.length
      ? 'You have completed assessments that need review.'
      : 'You are ready to start a new assessment.';


  const workspaceSummary = [
    profile.jobTitle || 'Role not yet set',
    profile.businessUnit || user?.businessUnit || 'Business unit not yet set',
    profile.department || user?.department || ''
  ].filter(Boolean).join(' · ');
  const guidanceSummary = focusAreas.length
    ? `Focus areas: ${focusAreas.slice(0, 3).join(', ')}${focusAreas.length > 3 ? ', and more.' : '.'}`
    : 'No focus areas saved yet.';

  setPage(`
    <main class="page">
      <div class="container container--wide dashboard-shell">
        <section class="card card--elevated dashboard-hero">
          <div class="dashboard-hero-grid">
            <div class="dashboard-hero-main">
              <div class="landing-badge">Personal Dashboard</div>
              <h2 style="margin-top:var(--sp-4)">Welcome back, ${user?.displayName || 'there'}.</h2>
              <p style="margin-top:10px;color:rgba(255,255,255,.74);max-width:680px">This is your main working space. Start a new assessment, resume unfinished work, or review completed results from here.</p>
              <div class="dashboard-hero-actions flex items-center gap-3 mt-6" style="flex-wrap:wrap">
                <button class="btn btn--primary btn--lg" id="btn-dashboard-new-assessment">Start a New Risk Assessment</button>
                <button class="btn btn--secondary" id="btn-dashboard-continue-draft" ${hasDraft ? '' : 'disabled'}>Resume Draft</button>
                <button class="btn btn--ghost" id="btn-dashboard-open-settings">${capability.experience.primaryActionLabel}</button>
              </div>
            </div>
            <div class="card dashboard-hero-side">
              <div class="context-panel-title">What to do next</div>
              <div class="context-panel-copy" style="margin-top:8px">${quickStatus}</div>
              <div class="form-help" style="margin-top:10px;color:rgba(255,255,255,.65)">${capability.experience.dashboardLead}</div>
              <div class="form-help" style="margin-top:10px;color:rgba(255,255,255,.65)">Current access: ${capability.roleSummary} · Default geography: ${settings.geographyPrimary || settings.geography || globalSettings.geography}</div>
            </div>
          </div>
        </section>

        <section class="admin-overview-grid dashboard-at-a-glance" style="margin-top:var(--sp-8)">
          ${UI.dashboardOverviewCard({
            label: 'Open work',
            value: openAssessmentRows.length,
            foot: 'Drafts and results that are most likely to need attention now.'
          })}
          ${UI.dashboardOverviewCard({
            label: 'Completed assessments',
            value: assessments.length,
            foot: latestAssessment ? `Latest: ${new Date(latestAssessment.completedAt || latestAssessment.createdAt || Date.now()).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No completed assessments yet'
          })}
          ${UI.dashboardOverviewCard({
            label: 'Needs review',
            value: assessmentsNeedingReview.length,
            foot: assessmentsNeedingReview.length ? 'Scenarios near or above tolerance are ready for review.' : 'Nothing currently stands out for urgent review.'
          })}
        </section>

        <section class="grid-2 dashboard-main-grid">
          <div class="dashboard-column">
            ${UI.dashboardSectionCard({
              title: 'Next up',
              description: 'Resume unfinished work or open the results that most likely need attention.',
              badge: openAssessmentRows.length,
              body: openAssessmentRows.length ? openAssessmentRows.map(item => UI.dashboardAssessmentRow({
                assessmentId: item.action,
                title: item.title,
                detail: item.detail,
                badgeClass: /above tolerance/i.test(item.status) ? 'badge--danger' : /review/i.test(item.status) ? 'badge--warning' : 'badge--gold',
                badgeLabel: item.status,
                actions: `
                  <button type="button" class="btn btn--ghost btn--sm dashboard-open-action" data-assessment-id="${item.action}">${item.actionLabel}</button>
                  ${item.action === 'draft'
                    ? '<button type="button" class="btn btn--ghost btn--sm dashboard-archive-draft">Archive</button><button type="button" class="btn btn--ghost btn--sm dashboard-delete-draft">Delete</button>'
                    : `<button type="button" class="btn btn--ghost btn--sm dashboard-archive-assessment" data-assessment-id="${item.action}">Archive</button><button type="button" class="btn btn--ghost btn--sm dashboard-delete-assessment" data-assessment-id="${item.action}">Delete</button>`}
                `
              })).join('') : `<div class="empty-state">You have nothing waiting for review right now. Start a new assessment when you are ready.</div>`
            })}

            ${UI.dashboardSectionCard({
              title: 'Recent assessments',
              description: 'Your latest saved analysis outputs.',
              badge: recentAssessments.length,
              body: recentAssessments.length ? recentAssessments.map(assessment => UI.dashboardAssessmentRow({
                assessmentId: assessment.id,
                title: assessment.scenarioTitle || 'Untitled assessment',
                detail: `${assessment.buName || profile.businessUnit || user?.businessUnit || 'Business unit not set'} · ${new Date(assessment.completedAt || assessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}`,
                badgeClass: assessment.results?.toleranceBreached ? 'badge--danger' : assessment.results?.nearTolerance ? 'badge--warning' : 'badge--gold',
                badgeLabel: assessment.results?.toleranceBreached ? 'Above tolerance' : assessment.results?.nearTolerance ? 'Close to tolerance' : 'Open result',
                actions: `
                  <button type="button" class="btn btn--ghost btn--sm dashboard-open-action" data-assessment-id="${assessment.id}">Open Result</button>
                  <button type="button" class="btn btn--ghost btn--sm dashboard-archive-assessment" data-assessment-id="${assessment.id}">Archive</button>
                  <button type="button" class="btn btn--ghost btn--sm dashboard-delete-assessment" data-assessment-id="${assessment.id}">Delete</button>
                `
              })).join('') : `<div class="empty-state">No completed assessments yet. Finished assessments will appear here with quick access to results and follow-up actions.</div>`
            })}

            <details class="dashboard-disclosure card card--elevated dashboard-section-card">
              <summary>Your settings and saved context <span class="badge badge--neutral">${focusAreas.length ? 'Ready' : 'Needs setup'}</span></summary>
              <div class="dashboard-disclosure-copy">Reference information that shapes AI-assisted output and your default working context.</div>
              <div class="dashboard-disclosure-body">
                <div class="card card--elevated dashboard-context-card dashboard-context-card--nested">
                  <div class="results-section-heading">Current profile</div>
                  <div class="context-panel-copy" style="margin-top:10px">${workspaceSummary}</div>
                  <div class="form-help" style="margin-top:12px">${guidanceSummary}</div>
                  <div class="form-help" style="margin-top:8px">${profile.workingContext ? 'Working context is saved and will be reused in AI-assisted steps.' : 'Add working context in Personal Settings to improve AI-assisted outputs.'}</div>
                  <div class="flex items-center gap-3 mt-5" style="flex-wrap:wrap">
                    <button class="btn btn--secondary" id="btn-dashboard-settings-secondary">Open Settings</button>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div class="dashboard-column">
            <details class="dashboard-disclosure card card--elevated dashboard-section-card" open>
              <summary>How to use this platform <span class="badge badge--neutral">${capability.roleSummary}</span></summary>
              <div class="dashboard-disclosure-copy">Guidance matched to the access and responsibilities you currently have.</div>
              <div class="dashboard-disclosure-body">
                ${renderNonAdminHowToGuide(capability)}
              </div>
            </details>

            <details class="dashboard-disclosure card card--elevated dashboard-section-card" ${archivedAssessments.length ? '' : ''}>
              <summary>Archived items <span class="badge badge--neutral">${archivedAssessments.length}</span></summary>
              <div class="dashboard-disclosure-copy">Stored out of the way, but still available if you need them again.</div>
              <div class="dashboard-disclosure-body">${archivedAssessments.length ? archivedAssessments.map(assessment => UI.dashboardAssessmentRow({
                title: assessment.scenarioTitle || 'Untitled scenario',
                detail: `Archived ${new Date(assessment.archivedAt || assessment.completedAt || assessment.createdAt || Date.now()).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}${assessment.results ? ' · Completed assessment' : ' · Draft snapshot'}`,
                badgeClass: 'badge--neutral',
                badgeLabel: 'Archived',
                actions: `
                  <button type="button" class="btn btn--ghost btn--sm dashboard-restore-assessment" data-assessment-id="${assessment.id}">${assessment.results ? 'Restore to Dashboard' : 'Resume as Draft'}</button>
                  ${assessment.results ? `<button type="button" class="btn btn--ghost btn--sm dashboard-open-action" data-assessment-id="${assessment.id}">Open Result</button>` : ''}
                  <button type="button" class="btn btn--ghost btn--sm dashboard-delete-assessment" data-assessment-id="${assessment.id}">Delete</button>
                `
              })).join('') : `<div class="empty-state">Nothing is archived right now. Items you archive will stay available here for restore or deletion.</div>`}</div>
            </details>
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
      UI.toast('That action could not be completed. Try again in a moment.', 'danger');
    }
  });
}
