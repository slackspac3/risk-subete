const { test, expect } = require('@playwright/test');

function buildSession(user, apiSessionToken = 'test-session-token') {
  return {
    authenticated: true,
    ts: Date.now(),
    user,
    apiSessionToken,
    context: {}
  };
}

async function seedAuthenticatedUser(page, {
  username = 'alex.trafton',
  displayName = 'Alex Trafton',
  role = 'user',
  userSettings = null,
  adminSettings = null,
  preferredAdminSection = 'org'
} = {}) {
  await page.addInitScript(({ session, userSettings, adminSettings, preferredAdminSection }) => {
    sessionStorage.setItem('rq_auth_session', JSON.stringify(session));
    if (userSettings) {
      localStorage.setItem(`rq_user_settings__${session.user.username}`, JSON.stringify(userSettings));
    }
    if (adminSettings) {
      localStorage.setItem('rq_admin_settings', JSON.stringify(adminSettings));
    }
    if (preferredAdminSection) {
      localStorage.setItem('rq_admin_active_section', preferredAdminSection);
    }
  }, {
    session: buildSession({ username, displayName, role, businessUnitEntityId: '', departmentEntityId: '' }),
    userSettings,
    adminSettings,
    preferredAdminSection
  });
}

async function mockSharedApis(page, {
  loginUser = null,
  userState = null,
  settings = null,
  skipUsers = false
} = {}) {
  if (!skipUsers) await page.route('**/api/users', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      if (payload?.action === 'login' && loginUser) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: loginUser,
            sessionToken: 'playwright-session-token'
          })
        });
        return;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accounts: [], storage: { writable: true, mode: 'shared-kv' } })
    });
  });

  await page.route('**/api/user-state*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: userState || {
            userSettings: null,
            assessments: [],
            learningStore: { templates: {} },
            draft: null,
            _meta: { revision: 1, updatedAt: Date.now() }
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route('**/api/settings', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: settings || {} })
    });
  });

  await page.route('**/api/audit-log*', async route => {
    const request = route.request();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(request.method() === 'GET'
        ? { entries: [], summary: { total: 0, retainedCapacity: 200 } }
        : { ok: true })
    });
  });
}

async function expectNoClientCrashOnRoute(page, route, assertion) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(route);
  await assertion();
  expect(pageErrors, `Unexpected page errors on ${route}: ${pageErrors.join(' | ')}`).toEqual([]);
}

test('login screen renders', async ({ page }) => {
  await expectNoClientCrashOnRoute(page, '/#/login', async () => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});

test('dashboard route redirects unauthenticated users to login', async ({ page }) => {
  await expectNoClientCrashOnRoute(page, '/#/dashboard', async () => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page).toHaveURL(/#\/login$/);
  });
});

test('admin login route renders without crashing', async ({ page }) => {
  await expectNoClientCrashOnRoute(page, '/#/admin/settings/org', async () => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page).toHaveURL(/#\/login$/);
  });
});

test('wizard route redirects unauthenticated users to login', async ({ page }) => {
  await expectNoClientCrashOnRoute(page, '/#/wizard/1', async () => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page).toHaveURL(/#\/login$/);
  });
});

test('results route redirects unauthenticated users to login', async ({ page }) => {
  await expectNoClientCrashOnRoute(page, '/#/results/example-assessment', async () => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page).toHaveURL(/#\/login$/);
  });
});

test('wizard step 1 dry-run examples prefill the scenario and shortlist', async ({ page }) => {
  const seededUserSettings = {
    userProfile: {
      fullName: 'Alex Trafton',
      jobTitle: 'Risk Manager',
      businessUnit: 'G42',
      department: 'Security',
      focusAreas: ['Resilience'],
      preferredOutputs: 'Executive summaries',
      workingContext: 'Support regulated services.'
    },
    onboardedAt: '2026-03-17T00:00:00.000Z',
    _overrideKeys: []
  };
  await seedAuthenticatedUser(page, { userSettings: seededUserSettings });
  await mockSharedApis(page, {
    settings: {
      geography: 'United Arab Emirates',
      applicableRegulations: ['UAE PDPL'],
      entityContextLayers: [],
      companyStructure: [],
      aiInstructions: 'Use British English.',
      benchmarkStrategy: 'Prefer GCC and UAE benchmark references.',
      typicalDepartments: ['Security']
    },
    userState: {
      userSettings: seededUserSettings,
      assessments: [],
      learningStore: { templates: {} },
      draft: null,
      _meta: { revision: 1, updatedAt: Date.now() }
    }
  });

  await expectNoClientCrashOnRoute(page, '/#/wizard/1', async () => {
    await page.getByRole('button', { name: 'Load Example' }).first().click();
    await expect(page.locator('#btn-clear-dry-run')).toBeVisible();
    await expect(page.locator('.card').filter({ has: page.locator('#btn-clear-dry-run') }).getByText('Supplier outage on a regulated platform')).toBeVisible();
    await expect(page.locator('#guided-event')).toContainText('critical supplier');
    await expect(page.locator('#intake-risk-statement')).toContainText('critical supplier');
    await expect(page.locator('.risk-select-checkbox:checked')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Continue with 2 selected risks/i })).toBeVisible();
  });
});

test('pressing Enter signs in and opens the personal dashboard', async ({ page }) => {
  await mockSharedApis(page, {
    loginUser: {
      username: 'alex.trafton',
      displayName: 'Alex Trafton',
      role: 'user',
      businessUnitEntityId: '',
      departmentEntityId: ''
    },
    userState: {
      userSettings: {
        userProfile: {
          fullName: 'Alex Trafton',
          jobTitle: 'Risk Manager',
          businessUnit: 'G42',
          department: 'Security',
          focusAreas: ['Resilience'],
          preferredOutputs: 'Executive summaries',
          workingContext: 'Support regulated services.'
        },
        onboardedAt: '2026-03-17T00:00:00.000Z',
        _overrideKeys: []
      },
      assessments: [],
      learningStore: { templates: {} },
      draft: null,
      _meta: { revision: 1, updatedAt: Date.now() }
    },
    settings: {}
  });

  await expectNoClientCrashOnRoute(page, '/#/login', async () => {
    await page.getByLabel(/username/i).fill('alex.trafton');
    await page.getByLabel(/password/i).fill('secret');
    await page.getByLabel(/password/i).press('Enter');
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page.getByText(/personal dashboard/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /start a new risk assessment/i })).toBeVisible();
  });
});

test('authenticated user dashboard renders without crashing', async ({ page }) => {
  const seededUserSettings = {
    userProfile: {
      fullName: 'Alex Trafton',
      jobTitle: 'Risk Manager',
      businessUnit: 'G42',
      department: 'Security',
      focusAreas: ['Resilience'],
      preferredOutputs: 'Executive summaries',
      workingContext: 'Support regulated services.'
    },
    onboardedAt: '2026-03-17T00:00:00.000Z',
    _overrideKeys: []
  };
  await seedAuthenticatedUser(page, { userSettings: seededUserSettings });
  await mockSharedApis(page, {
    settings: {},
    userState: {
      userSettings: seededUserSettings,
      assessments: [],
      learningStore: { templates: {} },
      draft: null,
      _meta: { revision: 1, updatedAt: Date.now() }
    }
  });

  await expectNoClientCrashOnRoute(page, '/#/dashboard', async () => {
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page.getByRole('button', { name: /start a new risk assessment/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /open personal settings/i })).toBeVisible();
  });
});

test('authenticated admin shell renders without crashing', async ({ page }) => {
  await seedAuthenticatedUser(page, {
    username: 'admin',
    displayName: 'Global Admin',
    role: 'admin',
    adminSettings: {
      geography: 'United Arab Emirates',
      companyStructure: [],
      entityContextLayers: [],
      applicableRegulations: ['UAE PDPL'],
      aiInstructions: 'Use British English.',
      benchmarkStrategy: 'Prefer GCC and UAE benchmark references.',
      typicalDepartments: ['Security']
    },
    preferredAdminSection: 'org'
  });
  await mockSharedApis(page, {
    settings: {
      geography: 'United Arab Emirates',
      companyStructure: [],
      entityContextLayers: [],
      applicableRegulations: ['UAE PDPL'],
      aiInstructions: 'Use British English.',
      benchmarkStrategy: 'Prefer GCC and UAE benchmark references.',
      typicalDepartments: ['Security']
    }
  });

  await expectNoClientCrashOnRoute(page, '/#/admin/settings/org', async () => {
    await expect(page.getByText(/platform control/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /organisation setup/i })).toBeVisible();
    await expect(page.locator('#btn-admin-logout')).toBeVisible();
  });
});



test('wizard step 1 clear all keeps manually added risks unselected after rerender', async ({ page }) => {
  const seededUserSettings = {
    userProfile: {
      fullName: 'Alex Trafton',
      jobTitle: 'Risk Manager',
      businessUnit: 'G42',
      department: 'Security',
      focusAreas: ['Resilience'],
      preferredOutputs: 'Executive summaries',
      workingContext: 'Support regulated services.'
    },
    onboardedAt: '2026-03-17T00:00:00.000Z',
    _overrideKeys: []
  };
  await seedAuthenticatedUser(page, { userSettings: seededUserSettings });
  await mockSharedApis(page, {
    settings: {
      geography: 'United Arab Emirates',
      applicableRegulations: ['UAE PDPL'],
      entityContextLayers: [],
      companyStructure: [],
      aiInstructions: 'Use British English.',
      benchmarkStrategy: 'Prefer GCC and UAE benchmark references.',
      typicalDepartments: ['Security']
    },
    userState: {
      userSettings: seededUserSettings,
      assessments: [],
      learningStore: { templates: {} },
      draft: null,
      _meta: { revision: 1, updatedAt: Date.now() }
    }
  });

  await expectNoClientCrashOnRoute(page, '/#/wizard/1', async () => {
    const advancedSummary = page.getByText('Import from a risk register or add risks manually');
    const manualInput = page.locator('#manual-risk-add');
    const addManualRisk = page.locator('#btn-add-manual-risk');

    await advancedSummary.click();
    await manualInput.fill('Cloud storage exposure');
    await addManualRisk.click();

    await advancedSummary.click();
    await manualInput.fill('Privileged access misuse');
    await addManualRisk.click();

    await expect(page.getByRole('button', { name: /^Clear All$/ })).toBeVisible();
    await expect(page.locator('.risk-select-checkbox:checked')).toHaveCount(2);
    await page.getByRole('button', { name: /^Clear All$/ }).click();
    await expect(page.locator('.risk-select-checkbox:checked')).toHaveCount(0);
  });
});

test('dashboard archive and restore flow works through the real confirm modal', async ({ page }) => {
  const seededUserSettings = {
    userProfile: {
      fullName: 'Alex Trafton',
      jobTitle: 'Risk Manager',
      businessUnit: 'G42',
      department: 'Security',
      focusAreas: ['Resilience'],
      preferredOutputs: 'Executive summaries',
      workingContext: 'Support regulated services.'
    },
    onboardedAt: '2026-03-17T00:00:00.000Z',
    _overrideKeys: []
  };
  const activeAssessment = {
    id: 'assess-1',
    scenarioTitle: 'Ransomware on shared ERP',
    buName: 'G42',
    createdAt: '2026-03-15T00:00:00.000Z',
    completedAt: '2026-03-16T00:00:00.000Z',
    results: { toleranceBreached: false, nearTolerance: true, annualReviewTriggered: false }
  };
  await seedAuthenticatedUser(page, { userSettings: seededUserSettings });
  await page.addInitScript(({ activeAssessment }) => {
    localStorage.setItem('rq_assessments__alex.trafton', JSON.stringify([activeAssessment]));
  }, { activeAssessment });
  await mockSharedApis(page, {
    settings: {},
    userState: {
      userSettings: seededUserSettings,
      assessments: [activeAssessment],
      learningStore: { templates: {} },
      draft: null,
      _meta: { revision: 1, updatedAt: Date.now() }
    }
  });

  await expectNoClientCrashOnRoute(page, '/#/dashboard', async () => {
    const activeRow = page.locator('.dashboard-assessment-row[data-assessment-id="assess-1"]').first();
    await expect(activeRow).toBeVisible();
    await activeRow.getByRole('button', { name: /^Archive$/ }).click();
    await page.locator('#confirm-ok').click();
    await expect(page.getByText(/assessment archived\./i)).toBeVisible();
    const archivedDisclosure = page.locator('.dashboard-disclosure').filter({ hasText: 'Archived items' }).first();
    await archivedDisclosure.locator('summary').click();
    await expect(archivedDisclosure).toHaveAttribute('open', '');
    const restoreButton = archivedDisclosure.locator('.dashboard-restore-assessment[data-assessment-id="assess-1"]').first();
    await expect(restoreButton).toBeVisible();
    await restoreButton.click();
    await expect(page.getByText(/archived assessment restored to your dashboard\./i)).toBeVisible();
    const restoredRow = page.locator('.dashboard-assessment-row[data-assessment-id="assess-1"]').filter({ has: page.locator('.dashboard-archive-assessment[data-assessment-id="assess-1"]') }).first();
    await expect(restoredRow).toBeVisible();
    await expect(restoredRow).toContainText(/open result|close to tolerance|above tolerance/i);
  });
});

test('admin can update user access and the request carries the expected role assignment', async ({ page }) => {
  const settings = {
    geography: 'United Arab Emirates',
    companyStructure: [
      { id: 'bu-g42', name: 'G42', type: 'Holding company', parentId: '', ownerUsername: '' },
      { id: 'dept-sec', name: 'Security', type: 'Department / function', parentId: 'bu-g42', ownerUsername: '' }
    ],
    entityContextLayers: [],
    applicableRegulations: ['UAE PDPL'],
    aiInstructions: 'Use British English.',
    benchmarkStrategy: 'Prefer GCC and UAE benchmark references.',
    typicalDepartments: ['Security']
  };
  const accounts = [
    {
      username: 'alex.trafton',
      displayName: 'Alex Trafton',
      role: 'user',
      businessUnitEntityId: 'bu-g42',
      departmentEntityId: 'dept-sec'
    }
  ];
  let patchPayload = null;
  await seedAuthenticatedUser(page, {
    username: 'admin',
    displayName: 'Global Admin',
    role: 'admin',
    adminSettings: settings,
    preferredAdminSection: 'users'
  });
  await page.addInitScript(() => {
    localStorage.setItem('rq_admin_api_secret', 'test-admin-secret');
  });
  await page.route('**/api/users', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accounts, storage: { writable: true, mode: 'shared-kv' } })
      });
      return;
    }
    if (request.method() === 'PATCH') {
      patchPayload = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accounts: [{ ...accounts[0], ...patchPayload.updates }] })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accounts, storage: { writable: true, mode: 'shared-kv' } })
    });
  });
  await mockSharedApis(page, { settings, skipUsers: true });

  await expectNoClientCrashOnRoute(page, '/#/admin/settings/users', async () => {
    await expect(page.locator('.managed-account-row')).toHaveCount(1);
    const row = page.locator('.managed-account-row[data-username="alex.trafton"]');
    const roleSelect = row.locator('.account-role-select');
    await roleSelect.selectOption('function_admin', { force: true });
    await row.locator('.account-bu-select').selectOption('bu-g42', { force: true });
    await row.locator('.account-department-select').selectOption('dept-sec', { force: true });
    await page.locator('.btn-apply-user-access[data-username="alex.trafton"]').evaluate(button => button.click());
    await page.getByRole('button', { name: /^confirm$/i }).click();
    await expect(page.getByText(/updated access for alex trafton\./i)).toBeVisible();
    expect(patchPayload).toBeTruthy();
    expect(patchPayload.action).toBe('admin-update');
    expect(patchPayload.username).toBe('alex.trafton');
    expect(patchPayload.updates.role).toBe('function_admin');
    expect(patchPayload.updates.businessUnitEntityId).toBe('bu-g42');
    expect(patchPayload.updates.departmentEntityId).toBe('dept-sec');
  });
});
