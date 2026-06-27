const puppeteer = require('puppeteer');
const https = require('https');
const { getImageForRecipe } = require('./image_catalog');

const BASE = 'https://www.nefisyemektarifleri.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CATEGORY_SLUGS = {
  kahvalti:    'kahvalti-tarifleri',
  corba:       'corba-tarifleri',
  salata:      'salata-tarifleri',
  et:          'et-yemekleri',
  tavuk:       'tavuk-yemekleri-tarifleri',
  tatli:       'tatli-tarifleri',
  pasta:       'pasta-tarifleri',
  vegan:       'vejeteryan-ve-vegan-tarifler',
  pilav:       'pilav-tarifleri',
  makarna:     'makarna-tarifleri',
  balik:       'deniz-urunleri-tarifleri',
  hamurisi:    'hamur-isleri',
  zeytinyagli: 'zeytinyagli-yemekler',
};

// ── HTTP fetch (yönlendirme destekli) ────────────────────────────────────
function fetchHtml(url, redirects = 0) {
  if (redirects > 4) return Promise.reject(new Error('Çok fazla yönlendirme'));
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : BASE + res.headers.location;
        res.resume();
        return fetchHtml(next, redirects + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── dataLayer'dan tarif JSON'u çek ───────────────────────────────────────
function parseDataLayer(html) {
  try {
    // dataLayer.push({ ... "recipe": { ... } ... }) bloğunu yakala
    const pushMatch = html.match(/dataLayer\.push\(\s*(\{[\s\S]+?\})\s*\)\s*;/);
    if (pushMatch) {
      const obj = JSON.parse(pushMatch[1]);
      if (obj.recipe) return obj.recipe;
    }
  } catch {}
  try {
    // Fallback: daha geniş eşleşme
    const m = html.match(/"recipe"\s*:\s*(\{[^<]+?\})\s*[,}]/);
    if (m) return JSON.parse(m[1]);
  } catch {}
  return {};
}

// ── recipe-elements span'dan meta çek (ham HTML) ─────────────────────────
function parseMetaSpan(html) {
  const m = html.match(/<span class="recipe-elements">([^<]+)<\/span>/);
  if (!m) return {};
  const meta = m[1];
  const servesM = meta.match(/([\d-]+)\s*[Kk]işilik/);
  const prepM   = meta.match(/(\d+)dk Hazırlık/);
  const cookM   = meta.match(/(\d+)dk Pişirme/);
  return {
    serves:   servesM ? servesM[1] : null,
    prepTime: prepM   ? `${prepM[1]} dk` : null,
    cookTime: cookM   ? `${cookM[1]} dk` : null,
  };
}

// ── HTML'den tarif listesi çıkar ──────────────────────────────────────────
function parseRecipeList(html, limit = 12, categorySlug = null) {
  const results = [];
  const seen = new Set();

  // Pattern: href ile ID'li tarif URL'leri + title
  const re = /href="(https:\/\/www\.nefisyemektarifleri\.com\/[^\/\"]+?-(\d{5,})\/)"[^>]*title="([^"]{5,80})"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, url, id, rawTitle] = m;
    if (seen.has(id)) continue;
    // Kullanıcı profili/kategori linkleri atla
    if (url.includes('/u/') || url.includes('/kategori/') || url.includes('/video/')) continue;
    seen.add(id);

    // Bu URL'nin çevresinde recipe-elements meta bilgisi ara
    const urlIdx = html.indexOf(url);
    const context = html.slice(Math.max(0, urlIdx - 50), urlIdx + 800);
    const metaMatch = context.match(/recipe-elements"?>([^<]+)</);
    const meta = metaMatch ? metaMatch[1] : '';

    const servesM  = meta.match(/([\d-]+)\s*kişilik/);
    const prepM    = meta.match(/(\d+)dk Hazırlık/);
    const cookM    = meta.match(/(\d+)dk Pişirme/);
    const imgMatch = context.match(/data-lazy-src="([^"]+?-\d+x\d+[^"]*\.(?:jpg|webp))"/);

    const title = rawTitle.trim();
    results.push({
      id: parseInt(id),
      name: title,
      url,
      serves:   servesM ? servesM[1] : null,
      prepTime: prepM   ? `${prepM[1]} dk`  : null,
      cookTime: cookM   ? `${cookM[1]} dk`  : null,
      image:    getImageForRecipe(title, categorySlug) || (imgMatch ? imgMatch[1] : null),
    });

    if (results.length >= limit) break;
  }
  return results;
}

// ── Tarif arama ───────────────────────────────────────────────────────────
async function searchRecipes(query, limit = 12) {
  const url = `${BASE}/ara/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  return parseRecipeList(html, limit);
}

// ── Kategori listeleme ────────────────────────────────────────────────────
async function listByCategory(category, limit = 12) {
  const slug = CATEGORY_SLUGS[category] || category;
  const url = `${BASE}/kategori/tarifler/${slug}/`;
  const html = await fetchHtml(url);
  return parseRecipeList(html, limit, category);
}

// ── Tarif detayı (Puppeteer) ──────────────────────────────────────────────
async function getRecipeDetail(recipeUrl) {
  // 1) Raw HTML ile hızlı meta çek
  const html = await fetchHtml(recipeUrl);
  const meta = parseDataLayer(html);

  const titleM = html.match(/<meta property="og:title" content="([^"]+)"/);
  const imgM   = html.match(/<meta property="og:image" content="([^"]+)"/);
  const name   = titleM ? titleM[1].replace(/ - Nefis Yemek Tarifleri.*/, '').trim() : 'Tarif';
  const image  = imgM ? imgM[1] : null;

  const spanMeta = parseMetaSpan(html);
  const ingredientNames = (meta.ingredients || []).map(i => i.ingredient_name);

  // 2) Puppeteer ile tam içerik (malzeme miktarları + adımlar)
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(recipeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // İçerik yüklenene kadar kısa bekle
    await new Promise(r => setTimeout(r, 3000));

    const extracted = await page.evaluate(() => {
      // ── Malzemeler ──────────────────────────────────────────────────
      const ingredients = [];

      // Siteye özel: .recipe-ingredients veya .ingredients-table veya ul içindeki li'ler
      const selectors = [
        '.recipe-ingredients li',
        '.ingredients li',
        '.ing-list li',
        '[class*="ingredient"] li',
        '.malzeme-listesi li',
        '.recipe-content ul li',
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 2) {
          els.forEach(li => {
            const t = li.innerText.trim();
            if (t.length > 1 && t.length < 200 && !t.match(/^(TARİFLER|VİDEO|MENÜ|Giriş)/i)) {
              ingredients.push(t);
            }
          });
          break;
        }
      }

      // Fallback: metin içeriğindeki li'ler
      if (ingredients.length === 0) {
        document.querySelectorAll('ul li').forEach(li => {
          const cls = (li.closest('[class]')?.className || '') + (li.className || '');
          if (cls.match(/ing|malzeme|ingredient|recipe/i)) {
            const t = li.innerText.trim();
            if (t.length > 2 && t.length < 200) ingredients.push(t);
          }
        });
      }

      // ── Adımlar ─────────────────────────────────────────────────────
      const steps = [];
      const stepSelectors = [
        '.recipe-steps li',
        '.preparation li',
        '.recipe-preparation li',
        '.steps li',
        '.hazirlanis li',
        '[class*="step"] p',
        '.recipe-content .preparation p',
        '.owner-note p',
      ];
      for (const sel of stepSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          els.forEach(el => {
            const t = el.innerText.trim();
            if (t.length > 15 && !t.match(/^(Reklam|Cookie|©|Giriş|TARİFLER)/i)) steps.push(t);
          });
          if (steps.length > 0) break;
        }
      }

      // Fallback: article içindeki p'ler
      if (steps.length === 0) {
        document.querySelectorAll('article p, .recipe-text p').forEach(p => {
          const t = p.innerText.trim();
          if (t.length > 30 && !t.match(/©|Cookie|Reklam/i)) steps.push(t);
        });
      }

      // ── Görsel (yüklü hali) ──────────────────────────────────────────
      const heroImg = document.querySelector('.recipe-hero img, .recipe-image img, article img')?.src || null;

      // ── Güçlük seviyesi ──────────────────────────────────────────────
      const diffEl = document.querySelector('[class*="difficulty"], [class*="zorluk"], [class*="level"]');
      const difficulty = diffEl?.innerText?.trim() || null;

      return { ingredients, steps, heroImg, difficulty };
    });

    await browser.close();
    browser = null;

    return {
      id: meta.id || null,
      name,
      url: recipeUrl,
      image: getImageForRecipe(name) || extracted.heroImg || image,
      prepTime:  meta.prepTime     || spanMeta.prepTime || null,
      cookTime:  meta.cookDuration || spanMeta.cookTime || null,
      serves:    (meta.serves?.trim()) || spanMeta.serves || null,
      categories: meta.categories || [],
      tags:       meta.tags        || [],
      ingredientNames,
      ingredients: extracted.ingredients,
      steps:       extracted.steps,
      difficulty:  extracted.difficulty,
    };

  } catch (err) {
    if (browser) { try { await browser.close(); } catch {} }
    return {
      id: meta.id || null,
      name,
      url: recipeUrl,
      image: getImageForRecipe(name) || image,
      prepTime:  meta.prepTime     || spanMeta.prepTime || null,
      cookTime:  meta.cookDuration || spanMeta.cookTime || null,
      serves:    (meta.serves?.trim()) || spanMeta.serves || null,
      categories: meta.categories || [],
      tags:       meta.tags        || [],
      ingredientNames,
      ingredients: [],
      steps: [],
      difficulty: null,
      puppeteerError: err.message,
    };
  }
}

module.exports = { searchRecipes, listByCategory, getRecipeDetail, CATEGORY_SLUGS };
