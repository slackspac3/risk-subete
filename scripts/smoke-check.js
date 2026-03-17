#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const notes = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function extractAssetVersions(indexHtml) {
  const matches = [...indexHtml.matchAll(/assets\/[^"']+\?v=([A-Za-z0-9]+)/g)].map(match => match[1]);
  return [...new Set(matches)];
}

const indexHtml = read('index.html');
const appJs = read('assets/app.js');
const exportJs = read('assets/services/exportService.js');
const llmJs = read('assets/services/llmService.js');
const benchmarkServiceJs = read('assets/services/benchmarkService.js');
const benchmarkData = read('data/benchmarks.json');
const settingsApi = read('api/settings.js');
const usersApi = read('api/users.js');
const authServiceJs = read('assets/services/authService.js');
const resultsRouteJs = read('assets/results/resultsRoute.js');
const userPreferencesJs = read('assets/settings/userPreferences.js');
const userOnboardingJs = read('assets/settings/userOnboarding.js');
const assessmentStateJs = read('assets/state/assessmentState.js');
const auditLogSectionJs = read('assets/admin/auditLogSection.js');
const e2eSmokeSpecJs = read('tests/e2e/smoke.spec.js');

const versions = extractAssetVersions(indexHtml);
expect(versions.length === 1, `Expected one frontend asset version, found: ${versions.join(', ') || 'none'}`);
expect(indexHtml.includes('assets/services/reportPresentation.js'), 'index.html is missing reportPresentation.js');
expect(indexHtml.includes('assets/services/benchmarkService.js'), 'index.html is missing benchmarkService.js');
expect(indexHtml.indexOf('assets/services/reportPresentation.js') < indexHtml.indexOf('assets/services/exportService.js'), 'reportPresentation.js must load before exportService.js');
expect(indexHtml.indexOf('assets/services/reportPresentation.js') < indexHtml.indexOf('assets/app.js'), 'reportPresentation.js must load before app.js');

expect(appJs.includes('function safeRenderAdminSettings('), 'safeRenderAdminSettings helper missing');
expect(appJs.includes('function rerenderCurrentAdminSection()'), 'rerenderCurrentAdminSection helper missing from admin renderer');
expect(appJs.includes('function normaliseAdminSettings('), 'frontend normaliseAdminSettings helper missing');
expect(settingsApi.includes('function normaliseSettings('), 'backend normaliseSettings helper missing');

expect(llmJs.includes('function _withEvidenceMeta('), 'AI evidence wrapper missing');
expect(llmJs.includes('confidenceLabel'), 'AI evidence contract missing confidenceLabel');
expect(llmJs.includes('evidenceQuality'), 'AI evidence contract missing evidenceQuality');
expect(llmJs.includes('missingInformation'), 'AI evidence contract missing missingInformation');
expect(llmJs.includes('primaryGrounding'), 'AI evidence contract missing primaryGrounding');
expect(llmJs.includes('supportingReferences'), 'AI evidence contract missing supportingReferences');
expect(llmJs.includes('inferredAssumptions'), 'AI evidence contract missing inferredAssumptions');
expect(llmJs.includes('Structured numeric benchmarks:'), 'LLM prompts are missing structured numeric benchmark context');
expect(llmJs.includes('benchmarkReferences'), 'LLM output is not carrying benchmarkReferences');
expect(benchmarkServiceJs.includes('retrieveRelevantBenchmarks'), 'benchmark service is missing retrieveRelevantBenchmarks');
expect(benchmarkServiceJs.includes('deriveSuggestedInputs'), 'benchmark service is missing deriveSuggestedInputs');
expect(benchmarkServiceJs.includes('sourceTypeLabel'), 'benchmark service is missing sourceTypeLabel trust metadata');
expect(benchmarkServiceJs.includes('Recent source'), 'benchmark service is missing freshness trust labels');
expect(benchmarkData.includes('bm-databreach-global-ibm-2025'), 'benchmark dataset is missing global IBM 2025 breach profile');
expect(benchmarkData.includes('bm-ransomware-sophos-2024'), 'benchmark dataset is missing Sophos ransomware benchmark profile');
expect(benchmarkData.includes('bm-thirdparty-verizon-2025'), 'benchmark dataset is missing Verizon third-party benchmark profile');
expect(benchmarkData.includes('bm-exportcontrol-semiconductor-bis-2026'), 'benchmark dataset is missing semiconductor export-control benchmark profile');
expect(benchmarkData.includes('bm-industrial-ibm-2024'), 'benchmark dataset is missing industrial IBM benchmark profile');
expect(benchmarkServiceJs.includes("return 'export-control'"), 'benchmark service is missing export-control scenario detection');

expect(assessmentStateJs.includes('primaryGrounding'), 'assessmentState is not persisting primaryGrounding');
expect(assessmentStateJs.includes('supportingReferences'), 'assessmentState is not persisting supportingReferences');
expect(assessmentStateJs.includes('inferredAssumptions'), 'assessmentState is not persisting inferredAssumptions');
expect(assessmentStateJs.includes('benchmarkReferences'), 'assessmentState is not persisting benchmarkReferences');

expect(usersApi.includes('Organisation assignment can only be changed by an admin.'), 'users API self-update scope restriction missing');
expect(usersApi.includes('await deleteUserState(removed.username);'), 'users API delete-user is not clearing shared user state');
expect(!authServiceJs.includes('businessUnitEntityId: payload.businessUnitEntityId'), 'authService self-update still sends businessUnitEntityId');
expect(!authServiceJs.includes('departmentEntityId: payload.departmentEntityId'), 'authService self-update still sends departmentEntityId');

expect(resultsRouteJs.includes('Confirm your organisation context'), 'results route is missing the updated organisation-context copy');
expect(resultsRouteJs.includes('const canChooseDepartment = capability.canManageBusinessUnit && !capability.canManageDepartment;'), 'results route is missing the aligned BU-admin-only department chooser guard');

expect(userPreferencesJs.includes('Your business-unit and function assignment is controlled by your current role.'), 'user preferences role guidance is missing');
expect(userOnboardingJs.includes('Your organisation assignment is set by your current admin-managed role.'), 'user onboarding role guidance is missing');

expect(exportJs.includes('ReportPresentation.buildExecutiveScenarioSummary'), 'exportService is not using shared ReportPresentation summary helper');
expect(exportJs.includes('ReportPresentation.buildExecutiveThresholdModel'), 'exportService is not using shared ReportPresentation threshold helper');
expect(exportJs.includes('ReportPresentation.buildExecutiveDecisionSupport'), 'exportService is not using shared ReportPresentation decision helper');

expect(!appJs.includes("'${DEFAULT_COMPASS_PROXY_URL}'"), 'Literal DEFAULT_COMPASS_PROXY_URL placeholder leaked into app.js');
expect(!appJs.includes("Cannot access 'settings' before initialization"), 'Static error text leaked into app.js');
expect(appJs.includes('renderEvidenceDetails(supportingReferences'), 'supporting references evidence renderer missing');
expect(appJs.includes('renderEvidenceDetails(inferredAssumptions'), 'inferred assumptions evidence renderer missing');
expect(appJs.includes("route: typeof window !== 'undefined'"), 'runtime instrumentation is not capturing current route');
expect(appJs.includes('sourceTypeLabel || ref.sourceType'), 'benchmark reference UI is missing source type labels');
expect(appJs.includes('item.sourceTypeLabel'), 'input provenance UI is missing source type labels');
expect(auditLogSectionJs.includes('<th>Route</th>'), 'audit log runtime health table is missing route column');
expect(e2eSmokeSpecJs.includes('Unexpected page errors on'), 'Playwright smoke suite is not checking for client-side crashes');
expect(e2eSmokeSpecJs.includes('/#/results/example-assessment'), 'Playwright smoke suite is missing results-route coverage');

if (!failures.length) {
  notes.push('Smoke check passed.');
  if (versions[0]) notes.push(`Asset version: ${versions[0]}`);
  console.log(notes.join('\n'));
  process.exit(0);
}

console.error('Smoke check failed:');
for (const failure of failures) console.error(`- ${failure}`);
process.exit(1);
