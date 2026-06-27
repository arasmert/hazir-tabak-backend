require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { searchProduct, fetchIngredientPrices, closeBrowser } = require('./scraper');
const { suggestRecipes } = require('./recipe_suggest');
const { searchRecipes, listByCategory, getRecipeDetail } = require('./recipe_scraper');

const app = express();
app.use(cors());
app.use(express.json());

// Önbellek — her gün güncellenir
let priceCache = {};
let lastUpdated = null;

const COMMON_INGREDIENTS = [
  'tavuk gogsu', 'yumurta', 'domates', 'salatalik', 'marul',
  'zeytinyagi', 'limon', 'mercimek', 'makarna', 'yulaf ezmesi',
  'sut', 'peynir', 'ekmek', 'pirinc', 'patates',
  'sogan', 'sarimsak', 'tereyagi', 'un', 'yogurt',
  'somon', 'kiyma', 'fasulye', 'brokoli', 'havuc',
];

// Ürün ara
app.get('/api/prices/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parametresi gerekli' });

  try {
    const products = await searchProduct(q, 5);
    res.json({ query: q, products, source: 'migros' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Önbellekteki fiyatları getir
app.get('/api/prices', (req, res) => {
  res.json({
    prices: priceCache,
    lastUpdated,
    count: Object.keys(priceCache).length,
  });
});

// Belirli malzemenin fiyatını getir
app.get('/api/prices/:ingredient', async (req, res) => {
  const { ingredient } = req.params;

  // Önce cache'e bak
  if (priceCache[ingredient]) {
    return res.json({ ingredient, ...priceCache[ingredient], fromCache: true });
  }

  // Cache'de yoksa canlı çek
  try {
    const products = await searchProduct(ingredient, 3);
    if (products.length === 0) {
      return res.status(404).json({ error: 'Ürün bulunamadı' });
    }
    const cheapest = products.reduce((a, b) => a.salePrice < b.salePrice ? a : b);
    const result = {
      name: cheapest.name,
      pricePerUnit: cheapest.salePrice,
      unit: cheapest.unit,
      image: cheapest.image,
      source: 'migros',
      updatedAt: new Date().toISOString(),
    };
    priceCache[ingredient] = result;
    res.json({ ingredient, ...result, fromCache: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dolap içeriğine göre tarif öner (Claude AI)
app.post('/api/recipes/suggest', async (req, res) => {
  const { ingredients } = req.body;
  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array gerekli' });
  }
  try {
    const recipes = await suggestRecipes(ingredients);
    res.json({ recipes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Adet olarak kullanılan malzemelerin ortalama ağırlıkları (gram)
const AVERAGE_WEIGHTS = {
  domates: 150,
  'salkım domates': 150,
  salatalik: 200,
  hiyar: 200,
  limon: 100,
  portakal: 180,
  elma: 180,
  muz: 120,
  patates: 150,
  sogan: 120,
  sarimsak: 5, // 1 diş
  havuc: 80,
  biber: 100,
  patlican: 300,
  kabak: 250,
  avokado: 200,
  yumurta: 60,
};

// Türkçe eşanlamlılar — Migros'ta farklı isimle geçen malzemeler
const SYNONYMS = {
  'salatalik': 'hiyar',
  'hiyar': 'hiyar',
  'zeytinyagi': 'zeytinyagi',
  'sarimsak': 'sarimsak',
  'sogan': 'sogan',
  'biber': 'biber',
  'patlican': 'patlican',
  'kabak': 'kabak',
};

// Taze ürünler: adet olsa da GRAM birim tercih edilir (ortalama ağırlık kullanılır)
const FRESH_PRODUCE = new Set(Object.keys(AVERAGE_WEIGHTS));

// Tarife göre hangi Migros birimini tercih etmeliyiz
function preferredMigrosUnit(recipeUnit, ingredientName) {
  if (['g', 'kg'].includes(recipeUnit)) return 'GRAM';
  if (['ml', 'l', 'yemek_kasigi', 'cay_kasigi'].includes(recipeUnit)) return 'MILLILITER';
  // "adet" ama taze ürünse GRAM tercih et (Migros kg olarak satar)
  if (recipeUnit === 'adet' && FRESH_PRODUCE.has((ingredientName || '').toLowerCase())) return 'GRAM';
  return 'PIECE';
}

// Ürün seçim skoru
function productRelevanceScore(product, query, preferUnit) {
  const name = product.name.toLowerCase();
  const q = query.toLowerCase();
  const words = q.split(' ');

  let score = 0;

  // Tercih edilen birim eşleşiyor mu? (+50)
  if (preferUnit && product.unit === preferUnit) score += 50;

  // Tüm kelimeler adda geçiyor mu? (+100)
  const allMatch = words.every(w => name.includes(w));
  if (allMatch) score += 100;
  else {
    // Kısmi eşleşme (+20 her kelime için)
    words.forEach(w => { if (name.includes(w)) score += 20; });
  }

  // "Kg" veya tartım ürünü → gram bazlı, güvenilir
  if (name.includes(' kg') || name.includes(' g ') || name.endsWith(' g')) score += 10;

  // Paketli/işlenmiş ürünler için ceza (taze ürün arıyorsak)
  const processedKeywords = [
    'turşu', 'konserve', 'hazır', 'füme', 'pres', 'ezme', 'sos',
    'reçel', 'marmelat', 'kurutulmuş', 'dondurulmuş', 'toz',
    'baharat', 'çay', 'aroması', 'özü', 'kabuğu', 'suyu',
    'sandviç', 'fileto', 'nugget', 'köfte', 'sosis',
  ];
  if (processedKeywords.some(k => name.includes(k))) score -= 60;

  return score;
}

// Birim dönüşüm: tarif miktarı + Migros birimi → maliyet
function calculateIngredientCost(pricePerUnit, migrosUnit, recipeAmount, recipeUnit, ingredientName) {
  // migrosUnit: Migros'tan gelen birim (GRAM=kg fiyatı, PIECE=adet, MILLILITER=litre)
  // recipeAmount: tarif miktarı (sayı)
  // recipeUnit: tarifte kullanılan birim ('g', 'kg', 'ml', 'l', 'adet', 'yemek_kasigi', 'cay_kasigi')

  if (!pricePerUnit || !migrosUnit) return null;

  const name = (ingredientName || '').toLowerCase();

  // Tarif "adet" diyor ama Migros kg fiyatı veriyor → ortalama ağırlık kullan
  if (recipeUnit === 'adet' && migrosUnit === 'GRAM') {
    const avgWeight = AVERAGE_WEIGHTS[name] || 150; // bilinmiyorsa 150g varsay
    return (pricePerUnit / 1000) * avgWeight * recipeAmount;
  }

  switch (migrosUnit) {
    case 'GRAM': {
      let grams = recipeAmount;
      if (recipeUnit === 'kg') grams = recipeAmount * 1000;
      return (pricePerUnit / 1000) * grams;
    }
    case 'MILLILITER': {
      let ml = recipeAmount;
      if (recipeUnit === 'l') ml = recipeAmount * 1000;
      if (recipeUnit === 'yemek_kasigi') ml = recipeAmount * 15;
      if (recipeUnit === 'cay_kasigi') ml = recipeAmount * 5;
      return (pricePerUnit / 1000) * ml;
    }
    case 'PIECE': {
      if (recipeUnit === 'yemek_kasigi') return (pricePerUnit / 10) * recipeAmount;
      if (recipeUnit === 'cay_kasigi') return (pricePerUnit / 30) * recipeAmount;
      return pricePerUnit * recipeAmount;
    }
    default:
      return pricePerUnit * recipeAmount;
  }
}

// Tarif için maliyet hesapla
app.post('/api/prices/calculate', async (req, res) => {
  // ingredients: [{ name: 'tavuk gogsu', amount: 200, unit: 'g' }]
  const { ingredients } = req.body;

  if (!ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'ingredients array gerekli' });
  }

  const breakdown = [];
  let totalCost = 0;

  for (const ing of ingredients) {
    // Cache'de yoksa canlı çek
    if (!priceCache[ing.name]) {
      try {
        const products = await searchProduct(ing.name, 15);
        if (products.length > 0) {
          const pref = preferredMigrosUnit(ing.unit, ing.name);
          // Eşanlamlı varsa hem orijinal hem eşanlamlı ile ara
          const searchTerm = SYNONYMS[ing.name.toLowerCase()] || ing.name;
          const scored = products
            .map(p => ({
              ...p,
              score: Math.max(
                productRelevanceScore(p, ing.name, pref),
                productRelevanceScore(p, searchTerm, pref)
              )
            }))
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score || a.salePrice - b.salePrice);

          const best = scored[0] || products[0];
          priceCache[ing.name] = {
            name: best.name,
            pricePerUnit: best.salePrice,
            migrosUnit: best.unit,
            image: best.image,
            source: 'migros',
            updatedAt: new Date().toISOString(),
          };
        }
      } catch (_) {}
    }

    const cached = priceCache[ing.name];
    const estimatedCost = cached
      ? calculateIngredientCost(cached.pricePerUnit, cached.migrosUnit, ing.amount, ing.unit, ing.name)
      : null;

    if (estimatedCost) totalCost += estimatedCost;

    breakdown.push({
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      marketName: cached?.name,
      pricePerUnit: cached?.pricePerUnit,
      migrosUnit: cached?.migrosUnit,
      estimatedCost: estimatedCost ? parseFloat(estimatedCost.toFixed(2)) : null,
    });
  }

  res.json({
    breakdown,
    totalCost: parseFloat(totalCost.toFixed(2)),
    currency: 'TRY',
  });
});

// Fiyatları güncelle (manuel tetikleme)
app.post('/api/prices/refresh', async (req, res) => {
  res.json({ message: 'Güncelleme başlatıldı, arka planda devam ediyor.' });
  try {
    priceCache = await fetchIngredientPrices(COMMON_INGREDIENTS);
    lastUpdated = new Date().toISOString();
    console.log(`✅ Fiyatlar güncellendi: ${Object.keys(priceCache).length} ürün`);
  } catch (err) {
    console.error('Güncelleme hatası:', err);
  }
});

// Her gün 06:00'da otomatik güncelle
cron.schedule('0 6 * * *', async () => {
  console.log('⏰ Günlük fiyat güncellemesi başlıyor...');
  try {
    priceCache = await fetchIngredientPrices(COMMON_INGREDIENTS);
    lastUpdated = new Date().toISOString();
    console.log(`✅ Fiyatlar güncellendi: ${Object.keys(priceCache).length} ürün`);
  } catch (err) {
    console.error('Cron güncelleme hatası:', err);
  }
});

// ── Nefis Yemek Tarifleri Endpoints ──────────────────────────────────────

// Tarif ara: GET /api/nefis/search?q=mercimek
app.get('/api/nefis/search', async (req, res) => {
  const { q, limit = 10 } = req.query;
  if (!q) return res.status(400).json({ error: 'q parametresi gerekli' });
  try {
    const results = await searchRecipes(q, parseInt(limit));
    res.json({ query: q, count: results.length, recipes: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kategori listele: GET /api/nefis/category?cat=corba&limit=10
app.get('/api/nefis/category', async (req, res) => {
  const { cat = 'corba', limit = 10 } = req.query;
  try {
    const results = await listByCategory(cat, parseInt(limit));
    res.json({ category: cat, count: results.length, recipes: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tarif detayı: GET /api/nefis/detail?url=https://...
app.get('/api/nefis/detail', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parametresi gerekli' });
  try {
    const recipe = await getRecipeDetail(url);
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', lastUpdated }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
  console.log('💡 Fiyatları başlatmak için: POST /api/prices/refresh');
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
