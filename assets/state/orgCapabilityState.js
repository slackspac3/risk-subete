'use strict';

// Shared organisation-selection and non-admin capability helpers extracted from app.js.

function getDefaultOrgAssignmentForUser(username = '', settings = getAdminSettings()) {
  const safeUsername = String(username || '').trim().toLowerCase();
  const structure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const ownedBusiness = structure.find(node => isCompanyEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === safeUsername);
  if (ownedBusiness) {
    return {
      businessUnitEntityId: ownedBusiness.id,
      departmentEntityId: ''
    };
  }
  const ownedDepartment = structure.find(node => isDepartmentEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === safeUsername);
  if (!ownedDepartment) return { businessUnitEntityId: '', departmentEntityId: '' };
  return {
    businessUnitEntityId: ownedDepartment.parentId || '',
    departmentEntityId: ownedDepartment.id
  };
}

function getManagedAccountsForAdmin(settings = getAdminSettings()) {
  const structure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  return AuthService.getManagedAccounts().map(account => {
    const ownedBusiness = structure.find(node => isCompanyEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === account.username);
    const ownedDepartment = structure.find(node => isDepartmentEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === account.username);
    if (ownedBusiness) {
      return {
        ...account,
        role: 'bu_admin',
        businessUnitEntityId: ownedBusiness.id,
        departmentEntityId: ''
      };
    }
    if (ownedDepartment) {
      return {
        ...account,
        role: 'function_admin',
        businessUnitEntityId: account.businessUnitEntityId || ownedDepartment.parentId || '',
        departmentEntityId: account.departmentEntityId || ownedDepartment.id
      };
    }
    return account;
  });
}

function resolveUserOrganisationSelection(user = AuthService.getCurrentUser(), userSettings = getUserSettings(), settings = getAdminSettings()) {
  const profile = normaliseUserProfile(userSettings.userProfile, user);
  const fallback = getDefaultOrgAssignmentForUser(user?.username || '', settings);
  const structure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const safeUsername = String(user?.username || '').trim().toLowerCase();
  const ownsBusiness = structure.some(node => isCompanyEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === safeUsername);
  const ownsDepartment = structure.some(node => isDepartmentEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === safeUsername);
  if (!ownsBusiness && !ownsDepartment) {
    return {
      businessUnitEntityId: String(user?.businessUnitEntityId || fallback.businessUnitEntityId || '').trim(),
      departmentEntityId: String(user?.departmentEntityId || fallback.departmentEntityId || '').trim()
    };
  }
  const businessUnitEntityId = String(user?.businessUnitEntityId || profile.businessUnitEntityId || fallback.businessUnitEntityId || '').trim();
  const departmentEntityId = String(user?.departmentEntityId || profile.departmentEntityId || fallback.departmentEntityId || '').trim();
  return { businessUnitEntityId, departmentEntityId };
}

function getRoleExperienceProfile({ canManageBusinessUnit, canManageDepartment, managedBusiness, managedDepartment }) {
  if (canManageBusinessUnit && canManageDepartment) {
    return {
      title: 'BU and function leadership view',
      summary: 'You are shaping both the business-unit context and a function-level context, so this workspace should help you govern, refine context, and review results quickly.',
      dashboardLead: 'Review flagged assessments first, then keep BU and function context aligned before new work starts.',
      settingsLead: 'Use settings to maintain both the BU-level context and the function detail your team relies on.',
      onboardingLead: 'This setup keeps both your BU-level and function-level guidance aligned from the start.',
      primaryActionLabel: 'Manage Role Context',
      guideItems: [
        'Use the dashboard to review assessments that need attention across the business unit and the function you own.',
        'Keep business-unit and function context up to date before teams start new assessments so AI outputs stay grounded.',
        'Use the executive result first for decisions, then open technical detail only when you need the drivers, evidence, or FAIR inputs.'
      ]
    };
  }
  if (canManageBusinessUnit) {
    return {
      title: 'Business unit leadership view',
      summary: 'You are responsible for the quality of context and decision support across one business unit.',
      dashboardLead: 'Focus on assessments that need review, then keep the business-unit and function context aligned for your teams.',
      settingsLead: 'Use settings to maintain business-unit context and choose the function context you want to work within.',
      onboardingLead: 'This setup keeps your business-unit perspective and working function context aligned from the start.',
      primaryActionLabel: 'Manage BU Context',
      guideItems: [
        'Review assessments that are near or above tolerance for the business unit you manage.',
        'Open settings to refine business-unit context and function summaries before new assessments are started.',
        'Switch function context only when you need to work within a different team inside your assigned business unit.'
      ]
    };
  }
  if (canManageDepartment) {
    return {
      title: 'Function leadership view',
      summary: 'You own one function or department context and should keep that context accurate for future analysis.',
      dashboardLead: 'Review the latest function-level results first, then keep your owned function context current.',
      settingsLead: 'Use settings to maintain the function context you own and the output style that works best for your team.',
      onboardingLead: 'This setup keeps your function-level context and reporting style aligned from the start.',
      primaryActionLabel: 'Manage Function Context',
      guideItems: [
        'Use the dashboard to review assessments relevant to the function or department you own.',
        'Maintain your function context in settings so AI-assisted analysis stays grounded in how your team actually works.',
        'Use executive results for decisions first, then technical detail only when you need to validate ranges or evidence.'
      ]
    };
  }
  return {
    title: 'Personal working view',
    summary: 'You are using the platform as an individual contributor or standard user, so the experience should stay guided and lightweight.',
    dashboardLead: 'Start with the next assessment or review the latest result, then adjust only the details you can justify.',
    settingsLead: 'Use settings to keep your role, working context, and preferred output style up to date.',
    onboardingLead: 'This setup gives the platform enough context to tailor guidance to your role without overloading you.',
    primaryActionLabel: 'Open Personal Settings',
    guideItems: [
      'Start or review risk assessments from your dashboard for the areas you support.',
      'Use AI assist as a starting point, then adjust wording and numbers in plain English where you have evidence.',
      'Review the executive result first, then open technical detail only when you need the FAIR inputs or evidence.'
    ]
  };
}

function getNonAdminCapabilityState(user = AuthService.getCurrentUser(), userSettings = getUserSettings(), settings = getAdminSettings()) {
  const safeUsername = String(user?.username || '').trim().toLowerCase();
  const structure = Array.isArray(settings.companyStructure) ? settings.companyStructure : [];
  const selection = resolveUserOrganisationSelection(user, userSettings, settings);
  const managedBusiness = structure.find(node => isCompanyEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === safeUsername) || null;
  const managedDepartment = structure.find(node => isDepartmentEntityType(node.type) && String(node.ownerUsername || '').trim().toLowerCase() === safeUsername) || null;
  const selectedBusiness = getEntityById(structure, selection.businessUnitEntityId);
  const selectedDepartment = getEntityById(structure, selection.departmentEntityId);
  const canManageBusinessUnit = !!managedBusiness;
  const canManageDepartment = !!managedDepartment;
  const managedBusinessId = managedBusiness?.id || '';
  const managedDepartmentId = managedDepartment?.id || '';
  const roleKeys = [
    canManageBusinessUnit ? 'bu_admin' : null,
    canManageDepartment ? 'function_admin' : null,
    !canManageBusinessUnit && !canManageDepartment ? 'standard_user' : null
  ].filter(Boolean);
  const roleLabels = [
    canManageBusinessUnit ? 'Business unit admin' : null,
    canManageDepartment ? 'Function admin' : null,
    !canManageBusinessUnit && !canManageDepartment ? 'Standard user' : null
  ].filter(Boolean);
  const experience = getRoleExperienceProfile({ canManageBusinessUnit, canManageDepartment, managedBusiness, managedDepartment });
  const guideItems = Array.from(new Set([
    ...experience.guideItems,
    canManageBusinessUnit ? 'Use Manage Context to improve business-unit and function summaries before new assessments are started.' : null,
    canManageDepartment ? 'Use AI assist to refine function context and keep role-specific defaults aligned to the work your team actually does.' : null,
    !canManageBusinessUnit && !canManageDepartment ? 'Open Personal Settings to keep your role, business context, and output preferences up to date.' : null
  ].filter(Boolean)));
  const roleSummary = roleLabels.join(' + ');
  return {
    roleKeys,
    roleLabels,
    roleSummary,
    guideItems,
    experience,
    selection,
    canManageBusinessUnit,
    canManageDepartment,
    managedBusinessId,
    managedDepartmentId,
    managedBusiness,
    managedDepartment,
    selectedBusiness,
    selectedDepartment
  };
}

function renderNonAdminHowToGuide(capability = getNonAdminCapabilityState()) {
  return `
    <div class="card card--elevated" style="padding:var(--sp-6)">
      <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
        <div>
          <div class="context-panel-title">${capability.experience.title}</div>
          <div class="form-help" style="margin-top:6px">${capability.experience.summary}</div>
        </div>
        <span class="badge badge--gold">${capability.roleSummary}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:var(--sp-5)">
        ${capability.guideItems.map((item, index) => `
          <div style="display:flex;gap:12px;align-items:flex-start;background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
            <div style="width:28px;height:28px;border-radius:999px;background:rgba(244,193,90,.18);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:var(--accent-gold);flex-shrink:0">${index + 1}</div>
            <div style="font-size:.9rem;line-height:1.6">${item}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

Object.assign(window, {
  getDefaultOrgAssignmentForUser,
  getManagedAccountsForAdmin,
  resolveUserOrganisationSelection,
  getNonAdminCapabilityState,
  renderNonAdminHowToGuide
});
