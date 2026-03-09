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

async function fetchText(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Risk-Intelligence-Platform/1.0'
    },
    signal: controller.signal
  });
  clearTimeout(timeout);
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

function extractCompanySearchTerm(canonicalUrl) {
  const hostname = new URL(canonicalUrl).hostname.replace(/^www\./, '');
  const root = hostname.split('.')[0] || hostname;
  return root.replace(/[-_]+/g, ' ').trim();
}

function extractCompanyAliases(canonicalUrl, rootHtml) {
  const aliases = new Set();
  aliases.add(extractCompanySearchTerm(canonicalUrl));
  const title = stripHtml((String(rootHtml).match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const ogSite = stripHtml((String(rootHtml).match(/property=["']og:site_name["']\s+content=["']([^"']+)["']/i) || [])[1] || '');
  const h1 = stripHtml((String(rootHtml).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  [title, ogSite, h1]
    .map(value => value.split(/[|\-–:]/)[0].trim())
    .filter(value => value && value.length > 2 && value.length < 80)
    .forEach(value => aliases.add(value));
  return Array.from(aliases).slice(0, 4);
}

function decodeXml(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRssItems(xml) {
  const items = [];
  const matches = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  matches.forEach(block => {
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    const link = decodeXml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '').trim();
    const description = stripHtml(decodeXml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '')).trim();
    const pubDate = decodeXml((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '').trim();
    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  });
  return items;
}

async function fetchNewsContext(canonicalUrl, rootHtml = '') {
  const aliases = extractCompanyAliases(canonicalUrl, rootHtml);
  const quotedAlias = encodeURIComponent(`"${aliases[0] || extractCompanySearchTerm(canonicalUrl)}"`);
  const aliasQuery = aliases.map(alias => `"${alias}"`).join(' OR ');
  const encodedAliasQuery = encodeURIComponent(aliasQuery);
  const feeds = [
    {
      label: 'Local UAE/GCC business news',
      url: `https://news.google.com/rss/search?q=${encodedAliasQuery}%20(site%3Athenationalnews.com%20OR%20site%3Agulfnews.com%20OR%20site%3Akhaleejtimes.com%20OR%20site%3Azawya.com%20OR%20site%3Aarabianbusiness.com)&hl=en-AE&gl=AE&ceid=AE:en`
    },
    {
      label: 'Global business news',
      url: `https://news.google.com/rss/search?q=${encodedAliasQuery}%20(site%3Areuters.com%20OR%20site%3Abloomberg.com%20OR%20site%3Acnbc.com%20OR%20site%3Aft.com%20OR%20site%3Awsj.com)&hl=en-US&gl=US&ceid=US:en`
    },
    {
      label: 'Risk and incident news',
      url: `https://news.google.com/rss/search?q=${quotedAlias}%20(cyber%20OR%20breach%20OR%20outage%20OR%20incident%20OR%20fine%20OR%20sanctions)&hl=en-US&gl=US&ceid=US:en`
    },
    {
      label: 'Strategy and regulatory news',
      url: `https://news.google.com/rss/search?q=${quotedAlias}%20(regulation%20OR%20compliance%20OR%20licence%20OR%20partnership%20OR%20acquisition%20OR%20expansion)&hl=en-US&gl=US&ceid=US:en`
    }
  ];
  const feedResults = await Promise.allSettled(
    feeds.map(feed => fetchText(feed.url, 6000).then(xml => ({ feed, xml })))
  );
  const results = [];
  feedResults.forEach(result => {
    if (result.status !== 'fulfilled') return;
    const items = parseRssItems(result.value.xml).slice(0, 4).map(item => ({
      ...item,
      feed: result.value.feed.label
    }));
    results.push(...items);
  });
  return Array.from(new Map(results.map(item => [item.link, item])).values()).slice(0, 12);
}

function buildFallbackProfile(canonicalUrl, pages, newsItems = []) {
  const combined = pages.map(page => page.content).join(' ').toLowerCase();
  const signals = [];
  if (/cloud|platform|software|digital|data/.test(combined)) signals.push('Material dependence on digital platforms, data flows, or cloud services.');
  if (/customer|consumer|client|member|patient|user/.test(combined)) signals.push('Potential exposure to personal, customer, or regulated data handling obligations.');
  if (/partner|supplier|vendor|ecosystem/.test(combined)) signals.push('Third-party and supplier dependence may be relevant to the operating model.');
  if (/global|regional|international|middle east|uae|gcc/.test(combined)) signals.push('Cross-border operations or regional footprint may change regulatory and resilience expectations.');
  if (newsItems.length) signals.push('Recent public news coverage was also reviewed to widen the context beyond the corporate website.');
  return {
    companySummary: `Public context was gathered for ${canonicalUrl}, but the AI response could not be parsed cleanly. This fallback summary is based on the website content${newsItems.length ? ' and public news coverage' : ''} that was fetched.`,
    businessProfile: `Review the fetched public context manually and refine the profile before saving. The company appears to have a business model with some combination of technology dependence, partner reliance, and customer-facing operations.${newsItems.length ? ' Public news coverage may provide additional signals on growth, partnerships, incidents, regulation, or strategic direction.' : ''}`,
    riskSignals: signals.length ? signals : ['Public website content suggests a need to assess technology reliance, data handling, third-party dependencies, and resilience requirements.'],
    regulatorySignals: [],
    aiGuidance: 'Use the public website material as a starting point, then refine the business profile, likely regulations, and technology exposure manually before relying on it in assessments.',
    suggestedGeography: '',
    sources: [
      ...pages.map(page => ({ url: page.url, note: 'Public website page fetched for context building.' })),
      ...newsItems.map(item => ({ url: item.link, note: `${item.feed}: ${item.title}` }))
    ]
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
  let newsItems = [];
  try {
    const rootHtml = await fetchText(canonicalUrl);
    const candidateUrls = deriveCandidateUrls(canonicalUrl, rootHtml);

    const pageResults = await Promise.allSettled(
      candidateUrls.slice(0, 6).map(url =>
        (url === canonicalUrl ? Promise.resolve(rootHtml) : fetchText(url, 6500))
          .then(html => ({ url, html }))
      )
    );
    pages = pageResults
      .filter(result => result.status === 'fulfilled')
      .map(result => ({
        url: result.value.url,
        content: stripHtml(result.value.html).slice(0, 4500)
      }))
      .filter(page => page.content.length > 200)
      .slice(0, 5);

    if (!pages.length) {
      throw new Error('No usable public website content could be extracted from the supplied URL.');
    }

    const aliases = extractCompanyAliases(canonicalUrl, rootHtml);
    newsItems = await fetchNewsContext(canonicalUrl, rootHtml);

    const systemPrompt = `You are a senior enterprise risk advisor. Given public company website material and public news context, produce a concise business-risk context profile.
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

Known company aliases:
${aliases.join(', ')}

Public news context:
${newsItems.length ? newsItems.map((item, idx) => `News ${idx + 1}: ${item.feed} | ${item.title} | ${item.pubDate}\n${item.description}\n${item.link}`).join('\n\n') : '(no public news items were retrieved)'}

Instructions:
- infer the company's business model, operating profile, technology reliance, data exposure, and likely regulatory posture
- focus on technology, cyber, operational resilience, third-party, compliance, and data risks
- use the aliases and the mix of local and global news to widen the context beyond the company website
- keep the output useful for setting admin context for a risk quantification platform
- mention that this is based on public website and public news context only
- use British English`;

    const upstream = await fetch(compassApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.COMPASS_API_KEY}`
      },
      body: JSON.stringify({
        model: compassModel,
        max_completion_tokens: 2200,
        temperature: 0.15,
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
    const parsed = cleaned ? JSON.parse(cleaned) : buildFallbackProfile(canonicalUrl, pages, newsItems);
    res.status(200).json(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(200).json(buildFallbackProfile(canonicalUrl, pages, newsItems));
      return;
    }
    res.status(502).json({
      error: 'Company context builder could not fetch or analyse the website.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
