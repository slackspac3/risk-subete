# Risk すべて Platform

Subete means "everything" in Japanese. The product slogan is: one platform for every risk.

Browser-based cyber and technology risk quantification platform with AI-assisted context building, FAIR-style scenario analysis, executive reporting, and role-based administration.

This repository is the current product codebase behind the GitHub Pages frontend and Vercel-backed shared APIs.

## What It Does

- lets global admin define organisation structure, platform defaults, and scoped defaults
- lets BU and function owners maintain retained business context
- lets users complete onboarding and maintain personal guidance/context
- supports AI-assisted risk intake, scenario drafting, and FAIR input suggestions
- runs Monte Carlo simulation for loss exposure
- produces executive and technical results views plus PDF export
- keeps shared users, settings, assessments, and audit events in backend storage

## Core Capabilities

### Administration
- organisation tree management for entities and departments/functions
- user management with `Standard user`, `Function admin`, and `BU admin`
- platform-wide defaults and governance
- scoped defaults for a selected BU or linked entity
- audit log for important admin, BU-admin, and user actions
- company context building from public web/news sources

### End-User Workflow
- personal onboarding and settings
- role-aware dashboard and usage guidance
- AI-assisted risk and context builder
- scenario refinement and FAIR input suggestion
- plain-language estimation step
- executive results and technical detail tabs
- before/after comparison for improvement cases
- archive/delete/restore for saved work

### AI Features
- website-based company context building
- context refinement with follow-up prompts
- document-grounded context build/refine
- AI-assisted scenario enhancement
- AI-assisted FAIR input drafting
- AI challenge/critique for completed assessments
- evidence quality and confidence metadata across major AI flows

## Roles

### Global Admin
- manage organisation structure
- manage users and ownership
- manage platform defaults and scoped defaults
- review audit log
- configure shared platform context

### BU Admin
- manage retained context for their BU and BU-owned functions
- update function/department setup beneath their BU

### Function Admin
- manage retained context for their owned function/department

### Standard User
- complete onboarding
- maintain personal settings
- run, save, compare, archive, and export assessments

## Architecture

### Frontend
Static single-page application served by GitHub Pages.

Main frontend files:
- [index.html](./index.html)
- [assets/app.js](./assets/app.js)
- [assets/app.css](./assets/app.css)
- [assets/tokens.css](./assets/tokens.css)
- [assets/router.js](./assets/router.js)

Feature modules:
- admin sections:
  - [assets/admin/orgSetupSection.js](./assets/admin/orgSetupSection.js)
  - [assets/admin/platformDefaultsSection.js](./assets/admin/platformDefaultsSection.js)
  - [assets/admin/systemAccessSection.js](./assets/admin/systemAccessSection.js)
  - [assets/admin/userAccountsSection.js](./assets/admin/userAccountsSection.js)
  - [assets/admin/auditLogSection.js](./assets/admin/auditLogSection.js)
- dashboard:
  - [assets/dashboard/userDashboard.js](./assets/dashboard/userDashboard.js)
- results:
  - [assets/results/resultsRoute.js](./assets/results/resultsRoute.js)
- onboarding and settings:
  - [assets/settings/userOnboarding.js](./assets/settings/userOnboarding.js)
  - [assets/settings/userPreferences.js](./assets/settings/userPreferences.js)
- assessment wizard:
  - [assets/wizard/step1.js](./assets/wizard/step1.js)
  - [assets/wizard/step2.js](./assets/wizard/step2.js)
  - [assets/wizard/step3.js](./assets/wizard/step3.js)

Shared frontend services:
- [assets/services/authService.js](./assets/services/authService.js)
- [assets/services/llmService.js](./assets/services/llmService.js)
- [assets/services/exportService.js](./assets/services/exportService.js)
- [assets/services/reportPresentation.js](./assets/services/reportPresentation.js)
- [assets/services/ragService.js](./assets/services/ragService.js)

Simulation engine:
- [assets/engine/riskEngine.js](./assets/engine/riskEngine.js)

UI helpers:
- [assets/ui/components.js](./assets/ui/components.js)

### Backend
Serverless APIs hosted separately on Vercel.

Main API routes:
- [api/compass.js](./api/compass.js)
- [api/company-context.js](./api/company-context.js)
- [api/users.js](./api/users.js)
- [api/settings.js](./api/settings.js)
- [api/user-state.js](./api/user-state.js)
- [api/audit-log.js](./api/audit-log.js)

### Persistence Model
Shared through backend:
- users and access changes
- organisation structure and retained context
- platform defaults and scoped BU defaults
- user settings and saved assessments
- audit events

Browser-local by design for this PoC:
- admin API secret in the admin browser
- direct-testing LLM config in the admin browser

## How To Run Locally

```bash
cd risk-calculator
python3 -m http.server 8080
```

Open:
- `http://localhost:8080`

Do not open the app as `file://`.

## Deployment

### Frontend
- hosted on GitHub Pages
- Pages workflow is defined in:
  - [.github/workflows/pages.yml](./.github/workflows/pages.yml)

### Backend
- deploy Vercel project for the `api/` routes
- configure shared storage and environment variables there

## Key Environment Variables

Typical backend configuration includes:
- `COMPASS_API_KEY`
- `COMPASS_API_URL`
- `COMPASS_MODEL`
- `ADMIN_API_SECRET`
- `ALLOWED_ORIGIN`
- shared KV/storage connection values used by the deployed APIs

## Admin Model

### Platform-Wide Defaults
Configured in `Platform Defaults And Governance`:
- thresholds
- geography
- linked-risk default
- regulations
- AI guidance
- benchmark strategy
- risk appetite
- escalation guidance
- typical departments

### Scoped Defaults
Also configured in `Platform Defaults And Governance`:
- choose a BU or linked entity
- open scoped defaults editor
- override governance and defaults for that scope

Scoped defaults currently support:
- geography
- regulations
- AI guidance
- benchmark strategy
- linked-risk default
- risk appetite
- escalation guidance
- warning / tolerance / annual review thresholds

## Assessment Flow

1. user logs in and lands on dashboard
2. user starts or resumes an assessment
3. `AI-Assisted Risk & Context Builder`
4. `Refine the Scenario`
5. `Estimate the Scenario in Plain Language`
6. simulation and results
7. executive and technical review
8. export or compare a better outcome

## QA And Checks

Basic checks used in this repo:

```bash
node scripts/smoke-check.js
node --check assets/app.js
```

Common additional checks during changes:

```bash
node --check assets/services/llmService.js
node --check assets/services/exportService.js
node --check assets/admin/platformDefaultsSection.js
```

Release checklist:
- [docs/release-checklist.md](./docs/release-checklist.md)

## Security Notes

This is still a PoC and should not be treated as production-grade security architecture.

Important current safeguards:
- backend checks prevent normal users from reading or overwriting another user’s shared state
- backend checks prevent normal users from writing shared admin settings
- logout clears user-scoped cached state in-browser to reduce same-browser residue risk

Still PoC-oriented:
- browser-local convenience storage exists for admin secret and direct LLM testing config
- the frontend remains a static SPA with client-heavy logic

## Current Product Direction

Recent improvements reflected in this codebase:
- modularised admin sections
- modularised dashboard, results, onboarding, settings, and assessment steps
- role-aware user guidance
- scoped defaults in admin defaults screen
- executive-first results and PDF export
- stronger AI output normalisation and evidence metadata
- improved state-sync hardening and shared persistence

## Repository Notes

This codebase has evolved significantly from the original single-file PoC. If you are changing behavior now, prefer working in the extracted modules rather than adding more logic back into one large file.
