const puppeteer = require('puppeteer');
const https = require('https');
const { getImageForRecipe } = require('./image_catalog');

const BASE = 'https://www.nefisyemektarifleri.com';
let _sharedBrowser = null;
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

// ── Tarif adına göre tahmini kalori ve maliyet ───────────────────────────
const RECIPE_ESTIMATES = {
  // [kalori, maliyet₺]
  'mercimek':   [220, 25],  'çorba':    [180, 20],  'tarhana':   [200, 22],
  'tavuk':      [320, 55],  'piliç':    [320, 55],  'hindi':     [280, 60],
  'köfte':      [380, 65],  'kebap':    [420, 80],  'kıyma':     [350, 60],
  'kuzu':       [400, 90],  'biftek':   [450, 110], 'et ':       [380, 75],
  'pilav':      [250, 20],  'bulgur':   [220, 18],
  'makarna':    [350, 30],  'lazanya':  [420, 45],
  'salata':     [120, 25],  'çoban':    [130, 28],
  'menemen':    [280, 30],  'omlet':    [250, 20],  'yumurta':   [180, 15],
  'börek':      [340, 35],  'poğaça':   [320, 30],  'gözleme':   [300, 28],
  'baklava':    [480, 40],  'tatlı':    [380, 35],  'kek':       [350, 30],
  'pasta':      [400, 50],  'kurabiye': [320, 25],  'helva':     [360, 22],
  'balık':      [280, 70],  'somon':    [320, 90],  'levrek':    [260, 85],
  'sote':       [310, 55],  'güveç':    [290, 50],  'dolma':     [260, 45],
  'mantı':      [380, 40],  'pide':     [420, 45],  'lahmacun':  [350, 40],
};

function estimateRecipe(name) {
  const n = name.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c');
  for (const [key, [cal, cost]] of Object.entries(RECIPE_ESTIMATES)) {
    const k = key.replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
      .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c');
    if (n.includes(k)) return { calories: cal, cost };
  }
  return { calories: 300, cost: 40 }; // genel fallback
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
    const est = estimateRecipe(title);
    results.push({
      id: parseInt(id),
      name: title,
      url,
      serves:   servesM ? servesM[1] : null,
      prepTime: prepM   ? `${prepM[1]} dk`  : null,
      cookTime: cookM   ? `${cookM[1]} dk`  : null,
      image:    getImageForRecipe(title, categorySlug) || (imgMatch ? imgMatch[1] : null),
      calories: est.calories,
      cost:     est.cost,
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

// ── HTML'den malzeme ve adımları regex ile çek (Puppeteer'sız) ───────────
function parseIngredientsFromHtml(html) {
  const results = [];
  // <li> içindeki malzeme metinlerini yakala
  const liMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  for (const m of liMatches) {
    const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 2 && text.length < 150 &&
        !text.match(/^(Giriş|TARİF|VİDEO|MENÜ|Reklam|©|Cookie|Paylaş|Yorum)/i)) {
      results.push(text);
    }
  }
  // Eğer <li> bulunamazsa, JSON içindeki ingredient_name'leri dene
  return results.slice(0, 30);
}

function parseStepsFromHtml(html) {
  const steps = [];
  // Adım bloklarını yakala: numbered list veya p tags in preparation section
  const olMatch = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
  if (olMatch) {
    const liMatches = olMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    for (const m of liMatches) {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 20 && !text.match(/©|Cookie|Reklam/i)) steps.push(text);
    }
  }
  // Fallback: preparation div içindeki p'ler
  if (steps.length === 0) {
    const prepMatch = html.match(/class="[^"]*(?:preparation|hazirlanis|recipe-steps|tarif-yapilis)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section|ul)>/i);
    if (prepMatch) {
      const pMatches = prepMatch[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      for (const m of pMatches) {
        const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text.length > 30 && !text.match(/©|Cookie|Reklam/i)) steps.push(text);
      }
    }
  }
  return steps.slice(0, 20);
}

// ── Tarif detayı (sadece HTTP fetch — hızlı) ─────────────────────────────
async function getRecipeDetail(recipeUrl) {
  const html = await fetchHtml(recipeUrl);
  const meta = parseDataLayer(html);

  const titleM = html.match(/<meta property="og:title" content="([^"]+)"/);
  const imgM   = html.match(/<meta property="og:image" content="([^"]+)"/);
  const name   = titleM ? titleM[1].replace(/ - Nefis Yemek Tarifleri.*/, '').trim() : 'Tarif';
  const image  = imgM ? imgM[1] : null;

  const spanMeta = parseMetaSpan(html);
  const ingredientNames = (meta.ingredients || []).map(i => i.ingredient_name);

  // HTML'den direkt parse et (Puppeteer yok)
  const ingredients = ingredientNames.length > 0
    ? ingredientNames
    : parseIngredientsFromHtml(html);

  const steps = parseStepsFromHtml(html);

  return {
    id: meta.id || null,
    name,
    url: recipeUrl,
    image: getImageForRecipe(name) || image,
    prepTime:   meta.prepTime     || spanMeta.prepTime || null,
    cookTime:   meta.cookDuration || spanMeta.cookTime || null,
    serves:     (meta.serves?.trim()) || spanMeta.serves || null,
    categories: meta.categories || [],
    tags:       meta.tags        || [],
    ingredientNames,
    ingredients,
    steps,
    difficulty: null,
  };
}

module.exports = { searchRecipes, listByCategory, getRecipeDetail, CATEGORY_SLUGS };
