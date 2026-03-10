# G42 Tech & Cyber Risk Quantifier — PoC

A FAIR-based Monte Carlo simulation tool for structured cyber risk assessment. Built as a pure front-end SPA (HTML + CSS + Vanilla JS), no build tools required.

> ⚠ **This is a Proof of Concept.** Not for production risk decisions without expert FAIR input validation.

---

## How to Run

```
# Option A: Python simple server (recommended)
cd risk-quantifier
python3 -m http.server 8080
# Open: http://localhost:8080

# Option B: Node http-server
npx http-server . -p 8080
# Open: http://localhost:8080

# Option C: VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

> ⚠ Do NOT open `index.html` directly as `file://` — the JSON data files require a server for fetch().

---

## Admin Access

- URL: `#/admin`
- Default password: `G42Risk2024!`
- Change in: `assets/services/authService.js` → `ADMIN_PASSWORD`

---

## Architecture Overview

```
index.html
├── assets/
│   ├── tokens.css          # Design tokens (CSS variables) — replace with G42 brand tokens
│   ├── app.css             # All component styles
│   ├── app.js              # Main app: state, routing, page rendering
│   ├── router.js           # Hash-based SPA router
│   ├── services/
│   │   ├── authService.js  # Auth stub → replace with Entra ID [ENTRA-INTEGRATION]
│   │   ├── ragService.js   # RAG stub → replace with Azure Cognitive Search [RAG-INTEGRATION]
│   │   ├── llmService.js   # LLM stub → already supports OpenAI/Compass API [LLM-INTEGRATION]
│   │   └── exportService.js# PDF (print-ready HTML), PPTX spec, JSON
│   ├── engine/
│   │   └── riskEngine.js   # FAIR Monte Carlo engine (compound Poisson ALE)
│   └── ui/
│       └── components.js   # Toast, modal, stepper, charts, tag input, skeleton
└── data/
    ├── bu.json             # 7 sample business units with FAIR defaults
    └── docs.json           # 12 sample internal policy documents for RAG
```

---

## FAIR Model Documentation

### Distributions
- **Triangular**: Uses min/likely/max directly. Simple, intuitive, appropriate for expert elicitation.
- **Lognormal**: Uses likely as P50 (median), estimates sigma from max/likely ratio. Better for cyber loss data (heavy right tail).

### Vulnerability Model
- **Derived (default)**: `vulnerability = sigmoid(k × (ThreatCapability − ControlStrength))` where k=6.
  - Both inputs sampled per iteration → vulnerability has natural uncertainty.
  - Outputs are bounded [0,1].
- **Direct**: User provides vulnerability min/likely/max directly.

### ALE (Annual Loss Exposure) — Compound Poisson
```
LEF = TEF × Vulnerability
N ~ Poisson(LEF)       # Number of events this year
ALE = Σ LM_i for i=1..N  # Loss resample per event
```
This correctly models years with 0 events (common) and multiple events (tail risk).

### Loss Magnitude (LM) per event
```
LM = Σ(loss components) + Secondary Loss
   = IR + BI + DB + RL + TP + RC + Bernoulli(p) × SecondaryMag
```
Optional correlation between BI↔IR and Regulatory↔Reputation.

### Tolerance Flag
Applied to **per-event P90 (LM)** vs **$5,000,000 USD threshold** (configurable via `TOLERANCE_THRESHOLD` in `app.js`). Annual P90 also displayed for reference.

---

## Integration Guides

### 1. Enable Real LLM (OpenAI / Compass)

**Browser-only testing (not secure):**
```javascript
LLMService.setCompassConfig({
  apiKey: 'your-compass-key',
  apiUrl: 'https://risk-calculator-eight.vercel.app/api/compass',
  model: 'gpt-5.1'
});
```

**Recommended — Vercel proxy:**

This repo now includes a minimal Vercel serverless proxy in [`api/compass.js`](./api/compass.js) that:
- accepts browser requests from your GitHub Pages origin
- handles CORS/preflight correctly
- keeps the Compass API key server-side
- forwards the request to `https://api.core42.ai/v1/chat/completions`

#### Deploy on Vercel

1. Push this repo to GitHub.
2. Go to `https://vercel.com/dashboard`.
3. Click `Add New -> Project`.
4. Import the `risk-calculator` GitHub repo.
5. Keep the default framework as `Other`.
6. Before deploying, add these environment variables in Vercel:
- `COMPASS_API_KEY` = your real Compass API key
- `ALLOWED_ORIGIN` = `https://slackspac3.github.io`
- `COMPASS_API_URL` = `https://api.core42.ai/v1/chat/completions`
- `COMPASS_MODEL` = `gpt-5.1`
7. Deploy the project.
8. Vercel will give you a site URL such as:
```text
https://risk-calculator-eight.vercel.app
```

9. In the app, go to `Admin -> Settings -> Compass Session Access` and set:
- `Compass URL`: `https://risk-calculator-eight.vercel.app/api/compass`
- `Model`: `gpt-5.1`
- `Compass API Key`: leave blank when using Vercel

#### How the Vercel flow works

1. The browser sends a request to your Vercel function URL.
2. The Vercel function responds to `OPTIONS` preflight with correct CORS headers.
3. The function forwards the `POST` body to Compass.
4. The function adds `Authorization: Bearer <COMPASS_API_KEY>` using Vercel environment variables.
5. The function returns Compass’s response to the browser.

This solves both:
- browser CORS failure
- public exposure of the Compass API key

### 2. Entra ID Authentication [ENTRA-INTEGRATION]

Replace `assets/services/authService.js` with MSAL.js:
```javascript
// Install: npm install @azure/msal-browser
import { PublicClientApplication } from '@azure/msal-browser';

const msalConfig = {
  auth: {
    clientId: 'YOUR_ENTRA_APP_CLIENT_ID',
    authority: 'https://login.microsoftonline.com/YOUR_TENANT_ID'
  }
};
const msalInstance = new PublicClientApplication(msalConfig);

async function login() {
  const result = await msalInstance.loginPopup({ scopes: ['User.Read'] });
  return result.account;
}
```

### 3. Azure Cognitive Search RAG [RAG-INTEGRATION]

Replace `ragService.js` keyword matching with:
```javascript
async function retrieveRelevantDocs(buId, query, topK = 4) {
  const response = await fetch(
    `https://YOUR-SEARCH.search.windows.net/indexes/policies/docs/search?api-version=2023-11-01`,
    {
      method: 'POST',
      headers: { 'api-key': AZURE_SEARCH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: query,
        filter: `bu_id eq '${buId}'`,
        top: topK,
        queryType: 'semantic',
        semanticConfiguration: 'policy-semantic'
      })
    }
  );
  const data = await response.json();
  return data.value.map(d => ({ docId: d.id, title: d.title, excerpt: d.content, url: d.url }));
}
```

### 4. SharePoint Integration

For SharePoint document store (future):
```javascript
// Use Microsoft Graph API:
const graphEndpoint = 'https://graph.microsoft.com/v1.0/sites/YOUR_SITE/drive/items';
// Requires Entra ID token + appropriate SharePoint permissions
```

### 5. Real PPTX Export

Replace `exportService.exportPPTXSpec()` with pptxgenjs:
```html
<script src="https://cdn.jsdelivr.net/npm/pptxgenjs/dist/pptxgen.bundle.js"></script>
```
```javascript
function exportPPTX(assessment) {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();
  slide.addText(assessment.scenarioTitle, { x: 1, y: 1, fontSize: 28, bold: true });
  slide.addText(`P90 Loss: ${fmtCurrency(assessment.results.lm.p90)}`, { x: 1, y: 2 });
  pptx.writeFile({ fileName: 'G42_Risk_Assessment.pptx' });
}
```

### 6. PDF with jsPDF

Replace the print-to-PDF approach with jsPDF:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsPDF/2.5.1/jspdf.umd.min.js"></script>
```
```javascript
function exportPDF(assessment) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text(assessment.scenarioTitle, 20, 30);
  // Add tables with jspdf-autotable
  doc.save('G42_Risk_Report.pdf');
}
```

---

## Security Considerations (PoC → Production)

| Item | PoC State | Production Fix |
|------|-----------|----------------|
| Authentication | Shared password | Entra ID (MSAL.js) |
| Data storage | localStorage/sessionStorage | Azure Storage / Cosmos DB |
| API keys | In JS source | Azure Key Vault / env vars |
| Data residency | Browser only | UAE-hosted Azure services |
| Audit trail | None | Azure Monitor + Log Analytics |
| RBAC | None | Entra ID groups + RBAC |

---

## Sample Assessment Flow

1. Open `http://localhost:8080`
2. Click **"Load Sample Scenario"** for a pre-filled ransomware + fintech BU scenario
3. Click through the wizard steps
4. On Step 2, click **"LLM Assist"** to simulate AI-generated inputs (or with real API key)
5. Adjust FAIR inputs on Step 3 (toggle Advanced for more options)
6. Review on Step 4, then click **Run Monte Carlo Simulation**
7. View results: tolerance flag, charts, recommendations
8. Export as PDF (browser print), PPTX spec (JSON), or JSON

---

## Notes on FAIR Input Ranges

The default BU assumptions in `bu.json` are **illustrative only**. For production use:

1. Conduct structured expert elicitation workshops per FAIR methodology
2. Use historical incident data from your environment
3. Reference industry benchmarks (Verizon DBIR, IBM X-Force, Ponemon studies)
4. Validate ranges with your cyber insurance provider
5. Document assumptions and review annually

---

*G42 Tech & Cyber Risk Quantifier PoC — Built with FAIR methodology principles*
