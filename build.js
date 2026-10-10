#!/usr/bin/env node
// Build script: generates static SEO-friendly story pages from articles-data.js,
// plus favicon files, redirect map, link updates, and a fresh sitemap.
// Run: node build.js   (works on the local copy in ~/workspace/seo-fix/site)
const fs = require('fs');
const path = require('path');

const SITE = __dirname;                 // ~/workspace/seo-fix/site
const ORIGIN = 'https://www.portmoodypulse.ca';
const TODAY = new Date().toISOString().slice(0, 10);

// A story goes live on the site only once its liveDate has passed.
// Convention: liveDate = newsletter Friday + 7 days, so subscribers
// always get the story first. Omit liveDate = live immediately.
const isLive = (old) => !ARTICLES[old].liveDate || ARTICLES[old].liveDate <= TODAY;

// ---------- 1. Load articles ----------
global.window = {};
eval(fs.readFileSync(path.join(SITE, 'articles-data.js'), 'utf8'));
const ARTICLES = window.PMP_ARTICLES;

// Embargoed bodies live in a LOCAL-ONLY file (never deployed) so the
// public articles-data.js can't leak newsletter-first stories.
try {
  eval(fs.readFileSync(path.join(SITE, 'articles-embargoed.js'), 'utf8'));
  for (const k of Object.keys(window.PMP_EMBARGOED || {})) {
    if (ARTICLES[k]) ARTICLES[k].body = window.PMP_EMBARGOED[k];
  }
  console.log('embargoed bodies merged:', Object.keys(window.PMP_EMBARGOED || {}).join(', ') || 'none');
} catch (e) { console.log('no embargoed file'); }

// ---------- 2. Descriptive slugs ----------
function slugify(title) {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-').filter(Boolean).slice(0, 8).join('-') || 'story';
}
const used = new Set();
const slugMap = {};   // old slug -> descriptive slug
for (const old of Object.keys(ARTICLES)) {
  // Explicit `page` locks the filename so retitling never breaks an indexed URL.
  if (ARTICLES[old].page) { slugMap[old] = ARTICLES[old].page; used.add(ARTICLES[old].page); continue; }
  let base = slugify(ARTICLES[old].title);
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  slugMap[old] = s;
}
fs.writeFileSync(path.join(SITE, 'slug-map.json'), JSON.stringify(slugMap, null, 1));
console.log('slugs:', Object.keys(slugMap).length);

// ---------- 3. Helpers ----------
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const escAttr = (s) => esc(s).replace(/\n/g, ' ');
function metaDesc(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= 155) return t;
  return t.slice(0, 152).replace(/\s+\S*$/, '') + '…';
}
// Known publish dates from the old sitemap's lastmod values
const KNOWN_DATES = {
  ahyoung: '2026-10-02',
  juraj: '2026-10-09',
  ming: '2026-07-19', cobbler: '2026-07-19', dogparks: '2026-07-19',
  water: '2026-07-19', provincial: '2026-07-19', inlet: '2026-06-30',
  towers: '2026-06-30', tax: '2026-06-30', spike: '2026-06-30',
  overpass: '2026-06-30', mexicano: '2026-06-30', trails: '2026-06-30',
  concerts: '2026-06-30', volunteers: '2026-06-30',
};

// ---------- 4. Favicon files ----------
const indexHtml = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const iconMatch = indexHtml.match(/<link rel="icon" type="image\/svg\+xml" href="(data:image\/svg\+xml,[^"]+)">/);
if (iconMatch) {
  const svg = decodeURIComponent(iconMatch[1].replace(/^data:image\/svg\+xml,/, ''));
  fs.writeFileSync(path.join(SITE, 'favicon.svg'), svg);
  console.log('favicon.svg written', svg.length, 'bytes');
} else {
  console.log('no favicon data URI in index.html; keeping existing favicon.svg');
}

const FAVICON_LINKS = `<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0A3537">`;

// ---------- 5. Story page template ----------
const articleHtml = fs.readFileSync(path.join(SITE, 'article.html'), 'utf8');
const css = articleHtml.match(/<style>([\s\S]*?)<\/style>/)[1];

// pick 3 "more stories": same tag first, then others (live stories only,
// so a published page never links to a story still under embargo)
const keys = Object.keys(ARTICLES).filter(isLive);
function moreStories(old, tag) {
  const a = ARTICLES[old];
  // Explicit `related` links come first (e.g. juraj <-> ahyoung), then same tag, then the rest
  const rel = (a.related || []).filter(k => k !== old && ARTICLES[k] && isLive(k));
  const others = keys.filter(k => k !== old && !rel.includes(k));
  const sameTag = others.filter(k => ARTICLES[k].tag === tag);
  const rest = others.filter(k => ARTICLES[k].tag !== tag);
  return [...rel, ...sameTag, ...rest].slice(0, 3);
}

function storyPage(old) {
  const a = ARTICLES[old];
  const dslug = slugMap[old];
  const url = `${ORIGIN}/stories/${dslug}.html`;
  const desc = a.desc ? String(a.desc).replace(/\s+/g, ' ').trim() : metaDesc(a.body[0] || a.title);
  const title = `${a.title} — Port Moody Pulse`;
  const paras = a.body.map(p => `      <p>${esc(p)}</p>`).join('\n');
  const known = KNOWN_DATES[old];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description: desc,
    author: { '@type': 'Organization', name: 'Port Moody Pulse', url: ORIGIN },
    publisher: {
      '@type': 'Organization', name: 'Port Moody Pulse', url: ORIGIN,
      logo: { '@type': 'ImageObject', url: `${ORIGIN}/email-assets/pmp-logo-email.png` }
    },
    url, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(known ? { datePublished: known } : {}),
    dateModified: TODAY,
    inLanguage: 'en-CA',
    isAccessibleForFree: true,
    articleSection: a.tag,
    keywords: ['Port Moody', 'Port Moody news', 'Port Moody B.C.', ...(a.keywords || []), a.tag]
  };
  const more = moreStories(old, a.tag).map(k =>
    `        <li><a href="/stories/${slugMap[k]}.html">${esc(ARTICLES[k].title)}</a></li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-G0YECLVEMJ"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-G0YECLVEMJ');
</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escAttr(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<link rel="canonical" href="${url}">
${FAVICON_LINKS}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Port Moody Pulse">
<meta property="og:title" content="${escAttr(a.title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escAttr(a.title)}">
<meta name="twitter:description" content="${escAttr(desc)}">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}
  .crumbs{font-size:12.5px;color:var(--mist);margin-bottom:18px;}
  .crumbs a{color:var(--mist);text-decoration:underline;}
  .more{margin-top:52px;border-top:1px solid var(--line);padding-top:26px;}
  .more h2{font-family:var(--fd);font-size:21px;font-weight:600;margin-bottom:12px;}
  .more ul{list-style:none;}
  .more li{margin-bottom:10px;}
  .more a{font-weight:600;color:var(--inlet);}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>

<div class="util"><div class="uwrap"><span>Port Moody, B.C. · Independent community newsletter</span></div></div>

<header class="mast">
  <div class="mwrap">
    <a class="brand" href="/" aria-label="Port Moody Pulse, home">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id="stLogoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1A6E6B"/><stop offset="1" stop-color="#0A3537"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#stLogoGrad)"/>
        <circle cx="50" cy="36.6" r="3.2" fill="#E0A23C"/>
        <path d="M28.2 54.5 L37.2 54.5 L39.8 54.5 L42 47 L44.4 61.2 L46.6 54.5 Q50.3 46.8 54 54.5 Q57.7 62.2 61.4 54.5 Q65.1 47 68.8 54.5 L71.8 54.5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="word">Port Moody <b>Pulse</b></span>
    </a>
    <a class="back" href="/">← Back to Port Moody Pulse</a>
  </div>
</header>

<main id="main">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> · <a href="/#latest">Latest stories</a></nav>
    <article>
      <span class="tag">${esc(a.tag)}</span>
      <h1>${esc(a.title)}</h1>
      <p class="meta">${esc(a.meta)}</p>
      <div class="art-body">
${paras}
      </div>

      <div class="cta">
        <h2>Get the pulse of Port Moody, every week.</h2>
        <p>Free, friendly, and yours every Thursday. Join your neighbours.</p>
        <form data-form="article" novalidate>
          <label class="vh" for="email-art">Email address</label>
          <input id="email-art" type="email" placeholder="you@email.com" autocomplete="email" inputmode="email">
          <button type="button" data-subscribe="article">Subscribe free →</button>
        </form>
        <p class="msg" data-msg="article" role="status" aria-live="polite"></p>
      </div>

      <div class="more">
        <h2>More from Port Moody Pulse</h2>
        <ul>
${more}
        </ul>
      </div>
    </article>
  </div>
</main>

<footer class="site">
  <div class="fwrap">
    <div>© 2026 Port Moody Pulse · An independent community newsletter.</div>
    <div class="tagline">The heartbeat of Port Moody.</div>
  </div>
</footer>

<script>
  var EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  async function subscribe(which){
    var form = document.querySelector('[data-form="'+which+'"]');
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('[data-subscribe]');
    var email = input ? input.value.trim() : '';
    var msg = document.querySelector('[data-msg="'+which+'"]');
    if(!EMAIL.test(email)){
      if(msg){ msg.textContent = 'Please enter a valid email address.'; msg.classList.add('err'); }
      if(input) input.focus();
      return;
    }
    if(button){ button.disabled = true; button.textContent = 'Subscribing...'; }
    if(msg){ msg.classList.remove('err'); msg.textContent = ''; }
    try{
      var response = await fetch('/api/subscribe', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: email })
      });
      var data = await response.json();
      if(!response.ok || !data.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
      if(msg) msg.textContent = data.message || "You're on the list!";
      if(input) input.value = '';
    }catch(err){
      if(msg){ msg.classList.add('err'); msg.textContent = err.message || 'Something went wrong. Please try again.'; }
    }finally{
      if(button){ button.disabled = false; button.textContent = 'Subscribe free →'; }
    }
  }
  document.querySelectorAll('[data-subscribe]').forEach(function(b){
    b.addEventListener('click', function(e){ e.preventDefault(); subscribe(b.getAttribute('data-subscribe')); });
  });
</script>
</body>
</html>
`;
}

// Subscribe-gate page for embargoed (newsletter-first) stories.
// Same URL as the future story; swaps to the full article automatically
// once liveDate passes. No body text here, and noindex so search engines
// never see the gate.
function gatePage(old) {
  const a = ARTICLES[old];
  const dslug = slugMap[old];
  const url = `${ORIGIN}/stories/${dslug}.html`;
  const desc = a.desc ? String(a.desc).replace(/\s+/g, ' ').trim() : a.title;
  const title = `${a.title} — Port Moody Pulse`;
  const d = new Date((a.liveDate || '') + 'T12:00:00');
  const liveStr = isNaN(d) ? 'soon' : d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-G0YECLVEMJ"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-G0YECLVEMJ');
</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${escAttr(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<link rel="canonical" href="${url}">
${FAVICON_LINKS}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Port Moody Pulse">
<meta property="og:title" content="${escAttr(a.title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${url}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}
  .gate{max-width:640px;margin:0 auto;text-align:center;padding:40px 0;}
  .gate h1{font-family:var(--fd);font-size:clamp(28px,4vw,40px);margin:14px 0 12px;letter-spacing:-.02em;}
  .gate .lede{color:var(--ink-soft);font-size:17px;margin-bottom:8px;}
  .gate .livein{display:inline-block;background:var(--gold-soft,#fdf3e0);border:1px solid var(--gold);border-radius:999px;padding:8px 18px;font-weight:700;margin:14px 0 6px;}
  .gate form{display:flex;gap:10px;max-width:440px;margin:22px auto 0;}
  .gate input{flex:1;font-size:16px;border:1.5px solid var(--field-border);border-radius:11px;padding:13px 14px;}
  .gate button{border:0;background:var(--teal);color:#fff;font-weight:800;border-radius:11px;padding:13px 20px;cursor:pointer;}
  .gate .msg{min-height:24px;margin-top:10px;}
  .gate .alt{margin-top:26px;font-size:15px;color:var(--mist);}
  .gate .alt a{color:var(--inlet);font-weight:600;}
  @media(max-width:560px){.gate form{flex-direction:column;}}
</style>
</head>
<body>
<header class="site">
  <div class="hwrap">
    <a class="brand" href="/" aria-label="Port Moody Pulse home">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#15706E"/><path d="M28.2 54.5 L37.2 54.5 L39.8 54.5 L42 47 L44.4 61.2 L46.6 54.5 Q50.3 46.8 54 54.5 Q57.7 62.2 61.4 54.5 Q65.1 47 68.8 54.5 L71.8 54.5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="word">Port Moody <b>Pulse</b></span>
    </a>
    <a class="back" href="/">← Back to Port Moody Pulse</a>
  </div>
</header>

<main id="main">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> · <a href="/#latest">Latest stories</a></nav>
    <div class="gate">
      <span class="tag">${esc(a.tag)}</span>
      <h1>${esc(a.title)}</h1>
      <p class="lede">${esc(desc)}</p>
      <p class="lede"><strong>Subscribers read this one first.</strong> It publishes on the website ${esc(liveStr)} — newsletter readers already have it in their inbox.</p>
      <span class="livein">Free on the website ${esc(liveStr)}</span>
      <form data-form="gate" novalidate>
        <label class="vh" for="email-gate">Email address</label>
        <input id="email-gate" type="email" placeholder="you@email.com" autocomplete="email" inputmode="email">
        <button type="button" data-subscribe="gate">Subscribe free →</button>
      </form>
      <p class="msg" data-msg="gate" role="status" aria-live="polite"></p>
      <p class="alt">Can't wait? <a href="https://portmoodypulse.beehiiv.com/" target="_blank" rel="noopener">Read it in the newsletter archive →</a></p>
    </div>
  </div>
</main>

<footer class="site">
  <div class="fwrap">
    <div>© 2026 Port Moody Pulse · An independent community newsletter.</div>
    <div class="tagline">The heartbeat of Port Moody.</div>
  </div>
</footer>

<script>
  var EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  async function subscribe(which){
    var form = document.querySelector('[data-form="'+which+'"]');
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('[data-subscribe]');
    var email = input ? input.value.trim() : '';
    var msg = document.querySelector('[data-msg="'+which+'"]');
    if(!EMAIL.test(email)){
      if(msg){ msg.textContent = 'Please enter a valid email address.'; }
      if(input) input.focus();
      return;
    }
    if(button){ button.disabled = true; button.textContent = 'Subscribing...'; }
    if(msg){ msg.textContent = ''; }
    try{
      var response = await fetch('/api/subscribe', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: email })
      });
      var data = await response.json();
      if(!response.ok || !data.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
      if(msg) msg.textContent = data.message || "You're on the list!";
      if(input) input.value = '';
    }catch(err){
      if(msg){ msg.textContent = err.message || 'Something went wrong. Please try again.'; }
    }finally{
      if(button){ button.disabled = false; button.textContent = 'Subscribe free →'; }
    }
  }
  document.querySelectorAll('[data-subscribe]').forEach(function(b){
    b.addEventListener('click', function(e){ e.preventDefault(); subscribe(b.getAttribute('data-subscribe')); });
  });
</script>
</body>
</html>
`;
}

fs.mkdirSync(path.join(SITE, 'stories'), { recursive: true });
// Only rewrite a page when its content actually changed (ignoring dateModified),
// so untouched stories keep their original modified date instead of churning weekly.
function writeIfChanged(fp, content) {
  if (fs.existsSync(fp)) {
    const norm = s => s.replace(/"dateModified": "\d{4}-\d{2}-\d{2}"/, '"dateModified":"X"');
    if (norm(fs.readFileSync(fp, 'utf8')) === norm(content)) return false;
  }
  fs.writeFileSync(fp, content);
  return true;
}
let written = 0, skipped = [], unchanged = 0, gated = 0;
for (const old of Object.keys(ARTICLES)) {
  const dslug = slugMap[old];
  if (!isLive(old)) {
    // Embargoed: publish a subscribe-gate at the canonical URL (noindex),
    // so the link works now and becomes the full story automatically later.
    if (writeIfChanged(path.join(SITE, 'stories', `${dslug}.html`), gatePage(old))) written++;
    else unchanged++;
    gated++;
    skipped.push(old);
    continue;
  }
  if (writeIfChanged(path.join(SITE, 'stories', `${dslug}.html`), storyPage(old))) written++;
  else unchanged++;
}
console.log(`story pages: ${written} written, ${unchanged} unchanged` +
  (skipped.length ? `, embargoed (gated): ${skipped.join(', ')}` : ''));

// ---------- 6. Update favicon links + home links in existing pages ----------
const pages = ['index.html', 'about.html', 'article.html', 'coffee-quiz.html'];
for (const p of pages) {
  const fp = path.join(SITE, p);
  let h = fs.readFileSync(fp, 'utf8');
  const before = h;
  h = h.replace(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,[^"]+">/g, FAVICON_LINKS);
  h = h.replace(/href="index\.html"/g, 'href="/"');
  if (h !== before) { fs.writeFileSync(fp, h); console.log('updated', p); }
  else console.log('no change', p);
}

// ---------- 7. index.html: point article links at static pages ----------
{
  const fp = path.join(SITE, 'index.html');
  let h = fs.readFileSync(fp, 'utf8');
  let n = 0;
  h = h.replace(/article\.html\?slug=([a-z0-9]+)/g, (m, s) => {
    if (!slugMap[s]) { console.log('  WARNING: unknown slug in index.html:', s); return m; }
    n++;
    return `stories/${slugMap[s]}.html`;
  });
  fs.writeFileSync(fp, h);
  console.log('index.html article links rewritten:', n);
}

// ---------- 8. article.html: redirect old ?slug= URLs to static pages ----------
// Live stories only: an embargoed story has no page yet, so it must not redirect.
{
  const fp = path.join(SITE, 'article.html');
  let h = fs.readFileSync(fp, 'utf8');
  const liveMap = Object.fromEntries(
    Object.keys(ARTICLES).filter(isLive).map(o => [o, `/stories/${slugMap[o]}.html`]));
  const mapJs = 'var PMP_REDIRECTS = ' + JSON.stringify(liveMap, null, 1) + ';';
  const redirectJs = `<script>\n${mapJs}\n(function(){var s=new URLSearchParams(window.location.search).get('slug');if(s&&PMP_REDIRECTS[s]){window.location.replace(PMP_REDIRECTS[s]);}})();\n</script>`;
  // Remove any previously injected redirect blocks (idempotent: one block, always fresh)
  h = h.replace(/\n<script>\nvar PMP_REDIRECTS = \{[\s\S]*?\n<\/script>/g, '');
  h = h.replace('</head>', redirectJs + '\n</head>');
  // point the injected schema at the new canonical URL
  h = h.replace(/"url": "https:\/\/portmoodypulse\.ca\/article\.html\?slug=" \+ slug,/,
    '"url": "https://www.portmoodypulse.ca/stories/" + (' + JSON.stringify(slugMap) + '[slug] || slug) + ".html",');
  h = h.replace(/"@id": "https:\/\/portmoodypulse\.ca\/article\.html\?slug=" \+ slug/,
    '"@id": "https://www.portmoodypulse.ca/stories/" + (' + JSON.stringify(slugMap) + '[slug] || slug) + ".html"');
  fs.writeFileSync(fp, h);
  console.log('article.html redirect refreshed');
}

// ---------- 9. Fresh sitemap ----------
function urlEntry(loc, lastmod, changefreq, priority) {
  return `\n  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}
let sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
sm += urlEntry(`${ORIGIN}/`, TODAY, 'weekly', '1.0');
let smCount = 0;
for (const old of Object.keys(ARTICLES)) {
  if (!isLive(old)) continue;   // embargoed stories stay out of the sitemap until they launch
  sm += urlEntry(`${ORIGIN}/stories/${slugMap[old]}.html`, KNOWN_DATES[old] || TODAY, 'monthly', '0.8');
  smCount++;
}
sm += urlEntry(`${ORIGIN}/about.html`, '2026-09-19', 'monthly', '0.8');
sm += urlEntry(`${ORIGIN}/coffee-quiz.html`, '2026-09-19', 'monthly', '0.6');
sm += `\n\n</urlset>\n`;
fs.writeFileSync(path.join(SITE, 'sitemap.xml'), sm);
console.log('sitemap.xml rewritten with', smCount + 4, 'urls');
console.log('DONE');
