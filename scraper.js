const puppeteer = require('puppeteer');

const MIGROS_SEARCH_URL = 'https://www.migros.com.tr/rest/search/screens/products?q=';
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

function parsePrice(raw) {
  // Migros fiyatları kuruş cinsinden (22995 = 229.95 TL)
  return raw / 100;
}

function parseXmlProducts(xmlText) {
  const products = [];
  const productRegex = /<storeProductInfos>([\s\S]*?)<\/storeProductInfos>/g;
  let match;

  while ((match = productRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const name = block.match(/<name>(.*?)<\/name>/)?.[1] || '';
    const sku = block.match(/<sku>(.*?)<\/sku>/)?.[1] || '';
    const regularPrice = parseInt(block.match(/<regularPrice>(\d+)<\/regularPrice>/)?.[1] || '0');
    const shownPrice = parseInt(block.match(/<shownPrice>(\d+)<\/shownPrice>/)?.[1] || '0');
    const status = block.match(/<status>(.*?)<\/status>/)?.[1] || '';
    const image = block.match(/<PRODUCT_LIST>(.*?)<\/PRODUCT_LIST>/)?.[1] || '';
    const unit = block.match(/<unit>(.*?)<\/unit>/)?.[1] || '';

    if (name && regularPrice > 0 && status === 'IN_SALE') {
      products.push({
        sku,
        name,
        unit,
        regularPrice: parsePrice(regularPrice),
        salePrice: parsePrice(shownPrice),
        image,
      });
    }
  }

  return products;
}

async function searchProduct(query, maxResults = 5) {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setUserAgent(USER_AGENT);
    const url = `${MIGROS_SEARCH_URL}${encodeURIComponent(query)}&reid=${Date.now()}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const xmlText = await page.evaluate(() => document.body.innerText);
    const products = parseXmlProducts(xmlText);
    return products.slice(0, maxResults);
  } finally {
    await page.close();
  }
}

async function fetchIngredientPrices(ingredients) {
  const results = {};

  for (const ingredient of ingredients) {
    try {
      console.log(`⏳ ${ingredient} aranıyor...`);
      const products = await searchProduct(ingredient, 3);

      if (products.length > 0) {
        // En düşük fiyatlıyı al
        const cheapest = products.reduce((a, b) => a.salePrice < b.salePrice ? a : b);
        results[ingredient] = {
          name: cheapest.name,
          pricePerUnit: cheapest.salePrice,
          unit: cheapest.unit,
          image: cheapest.image,
          source: 'migros',
          updatedAt: new Date().toISOString(),
        };
        console.log(`✅ ${ingredient}: ₺${cheapest.salePrice} — ${cheapest.name}`);
      } else {
        console.log(`❌ ${ingredient}: sonuç bulunamadı`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`❌ ${ingredient} hatası:`, err.message);
    }
  }

  return results;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { searchProduct, fetchIngredientPrices, closeBrowser };
