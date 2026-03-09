function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const regex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      links.push(url.toString());
    } catch {}
  }
  return Array.from(new Set(links));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Risk-Intelligence-Platform/1.0'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

function sameHost(url, host) {
  try {
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}

function deriveCandidateUrls(rootUrl, html) {
  const root = new URL(rootUrl);
  const discovered = extractLinks(html, rootUrl)
    .filter(link => sameHost(link, root.hostname))
    .filter(link => /about|company|solutions|services|products|industries|security|compliance|governance|investor|news|contact/i.test(link));
  const defaults = [
    rootUrl,
    new URL('/about', root).toString(),
    new URL('/company', root).toString(),
    new URL('/services', root).toString(),
    new URL('/products', root).toString(),
    new URL('/industries', root).toString(),
    new URL('/security', root).toString(),
    new URL('/compliance', root).toString(),
    new URL('/about-us', root).toString()
  ];
  return Array.from(new Set([...defaults, ...discovered])).slice(0, 8);
}

function buildFallbackProfile(canonicalUrl, pages) {
  const combined = pages.map(page => page.content).join(' ').toLowerCase();
  const signals = [];
  if (/cloud|platform|software|digital|data/.test(combined)) signals.push('Material dependence on digital platforms, data flows, or cloud services.');
  if (/customer|consumer|client|member|patient|user/.test(combined)) signals.push('Potential exposure to personal, customer, or regulated data handling obligations.');
  if (/partner|supplier|vendor|ecosystem/.test(combined)) signals.push('Third-party and supplier dependence may be relevant to the operating model.');
  if (/global|regional|international|middle east|uae|gcc/.test(combined)) signals.push('Cross-border operations or regional footprint may change regulatory and resilience expectations.');
  return {
    companySummary: `Public website context was gathered for ${canonicalUrl}, but the AI response could not be parsed cleanly. This fallback summary is based only on the website text that was fetched.`,
    businessProfile: 'Review the fetched website context manually and refine the profile before saving. The site appears to describe a business with some combination of technology dependence, partner reliance, and customer-facing operations.',
    riskSignals: signals.length ? signals : ['Public website content suggests a need to assess technology reliance, data handling, third-party dependencies, and resilience requirements.'],
    regulatorySignals: [],
    aiGuidance: 'Use the public website material as a starting point, then refine the business profile, likely regulations, and technology exposure manually before relying on it in assessments.',
    suggestedGeography: '',
    sources: pages.map(page => ({ url: page.url, note: 'Public website page fetched for context building.' }))
  };
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://slackspac3.github.io';
  const compassApiUrl = process.env.COMPASS_API_URL || 'https://api.core42.ai/v1/chat/completions';
  const compassModel = process.env.COMPASS_MODEL || 'gpt-5.1';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.COMPASS_API_KEY) {
    res.status(500).json({ error: 'Missing COMPASS_API_KEY secret in Vercel.' });
    return;
  }

  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  const websiteUrl = String(req.body?.websiteUrl || '').trim();
  if (!websiteUrl) {
    res.status(400).json({ error: 'websiteUrl is required.' });
    return;
  }

  let canonicalUrl;
  try {
    canonicalUrl = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).toString();
  } catch {
    res.status(400).json({ error: 'Invalid website URL.' });
    return;
  }

  let pages = [];
  try {
    const rootHtml = await fetchText(canonicalUrl);
    const candidateUrls = deriveCandidateUrls(canonicalUrl, rootHtml);

    for (const url of candidateUrls) {
      try {
        const html = url === canonicalUrl ? rootHtml : await fetchText(url);
        const text = stripHtml(html).slice(0, 6000);
        if (text.length > 200) {
          pages.push({ url, content: text });
        }
      } catch {}
      if (pages.length >= 5) break;
    }

    if (!pages.length) {
      throw new Error('No usable public website content could be extracted from the supplied URL.');
    }

    const systemPrompt = `You are a senior enterprise risk advisor. Given public company website material, produce a concise business-risk context profile.
Respond ONLY with valid JSON matching this schema:
{
  "companySummary": "string",
  "businessProfile": "string",
  "riskSignals": ["string"],
  "regulatorySignals": ["string"],
  "aiGuidance": "string",
  "suggestedGeography": "string",
  "sources": [{"url":"string","note":"string"}]
}`;

    const userPrompt = `Website URL: ${canonicalUrl}

Public website extracts:
${pages.map((page, idx) => `Source ${idx + 1}: ${page.url}\n${page.content}`).join('\n\n')}

Instructions:
- infer the company's business model, operating profile, technology reliance, data exposure, and likely regulatory posture
- focus on technology, cyber, operational resilience, third-party, compliance, and data risks
- keep the output useful for setting admin context for a risk quantification platform
- mention that this is based on public web context only
- use British English`;

    const upstream = await fetch(compassApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.COMPASS_API_KEY}`
      },
      body: JSON.stringify({
        model: compassModel,
        max_completion_tokens: 1400,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).send(text);
      return;
    }

    const payload = await upstream.json();
    const raw = payload.choices?.[0]?.message?.content || '';
    const cleaned = String(raw).replace(/```json\n?|```/g, '').trim();
    const parsed = cleaned ? JSON.parse(cleaned) : buildFallbackProfile(canonicalUrl, pages);
    res.status(200).json(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(200).json(buildFallbackProfile(canonicalUrl, pages));
      return;
    }
    res.status(502).json({
      error: 'Company context builder could not fetch or analyse the website.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
