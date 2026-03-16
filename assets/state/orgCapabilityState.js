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
  const guideItems = Array.from(new Set([
    'Start or review risk assessments from your dashboard for the areas you support.',
    'Review the executive result first, then open technical detail only when you need the FAIR inputs or evidence.',
    canManageBusinessUnit ? 'Open Settings to add or update functions under your assigned business unit and keep BU context accurate.' : null,
    canManageBusinessUnit ? 'Use Manage Context to improve business-unit and function summaries before new assessments are started.' : null,
    canManageDepartment ? 'Use Settings to maintain the department context you own so function-level assessments stay grounded.' : null,
    canManageDepartment ? 'Use AI assist to refine function context and keep role-specific defaults aligned to the work your team actually does.' : null,
    !canManageBusinessUnit && !canManageDepartment ? 'Use AI assist in each step as a starting point, then adjust the wording and numbers in plain English.' : null,
    !canManageBusinessUnit && !canManageDepartment ? 'Open Personal Settings to keep your role, business context, and output preferences up to date.' : null
  ].filter(Boolean)));
  const roleSummary = roleLabels.join(' + ');
  return {
    roleKeys,
    roleLabels,
    roleSummary,
    guideItems,
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
  const heading = capability.canManageBusinessUnit && capability.canManageDepartment
    ? 'How to use this platform as a BU admin and function admin'
    : capability.canManageBusinessUnit
      ? 'How to use this platform as a BU admin'
      : capability.canManageDepartment
        ? 'How to use this platform as a function admin'
        : 'How to use this platform';
  return `
    <div class="card card--elevated" style="padding:var(--sp-6)">
      <div class="flex items-center justify-between" style="gap:var(--sp-3);flex-wrap:wrap">
        <div>
          <div class="context-panel-title">${heading}</div>
          <div class="form-help" style="margin-top:6px">Simple guidance for your current access: <strong>${capability.roleSummary}</strong>.</div>
        </div>
        <span class="badge badge--gold">Role guide</span>
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
