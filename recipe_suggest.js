// Kural tabanlı tarif öneri sistemi — API key gerektirmez

const RECIPE_DB = [
  { name: 'Menemen', emoji: '🍳', calories: 280, time: '15 dk', cost: 30,
    ingredients: ['yumurta', 'domates', 'biber'], optional: ['soğan', 'zeytinyağı'] },
  { name: 'Sahanda Yumurta', emoji: '🍳', calories: 180, time: '10 dk', cost: 15,
    ingredients: ['yumurta', 'tereyağı'], optional: ['peynir', 'sucuk'] },
  { name: 'Peynirli Omlet', emoji: '🍳', calories: 260, time: '10 dk', cost: 20,
    ingredients: ['yumurta', 'peynir'], optional: ['domates', 'maydanoz'] },
  { name: 'Domates Soslu Makarna', emoji: '🍝', calories: 350, time: '20 dk', cost: 30,
    ingredients: ['makarna', 'domates'], optional: ['soğan', 'sarımsak', 'zeytinyağı'] },
  { name: 'Peynirli Makarna', emoji: '🧀', calories: 420, time: '20 dk', cost: 35,
    ingredients: ['makarna', 'peynir'], optional: ['tereyağı'] },
  { name: 'Tavuk Sote', emoji: '🍗', calories: 320, time: '25 dk', cost: 55,
    ingredients: ['tavuk', 'soğan', 'biber'], optional: ['domates', 'zeytinyağı'] },
  { name: 'Tavuklu Pilav', emoji: '🍚', calories: 380, time: '35 dk', cost: 60,
    ingredients: ['tavuk', 'pirinç'], optional: ['soğan', 'tereyağı'] },
  { name: 'Mercimek Çorbası', emoji: '🍲', calories: 220, time: '30 dk', cost: 25,
    ingredients: ['mercimek', 'soğan'], optional: ['havuç', 'zeytinyağı', 'limon'] },
  { name: 'Domates Çorbası', emoji: '🍅', calories: 180, time: '20 dk', cost: 20,
    ingredients: ['domates', 'soğan'], optional: ['sarımsak', 'zeytinyağı'] },
  { name: 'Köfte', emoji: '🥩', calories: 380, time: '25 dk', cost: 65,
    ingredients: ['kıyma', 'soğan'], optional: ['maydanoz', 'ekmek'] },
  { name: 'Kıymalı Makarna', emoji: '🍝', calories: 450, time: '25 dk', cost: 55,
    ingredients: ['makarna', 'kıyma'], optional: ['domates', 'soğan'] },
  { name: 'Pilav', emoji: '🍚', calories: 250, time: '25 dk', cost: 20,
    ingredients: ['pirinç'], optional: ['tereyağı', 'şehriye'] },
  { name: 'Bulgur Pilavı', emoji: '🌾', calories: 220, time: '20 dk', cost: 15,
    ingredients: ['bulgur'], optional: ['soğan', 'domates', 'tereyağı'] },
  { name: 'Çoban Salatası', emoji: '🥗', calories: 120, time: '10 dk', cost: 25,
    ingredients: ['domates', 'salatalık', 'soğan'], optional: ['biber', 'maydanoz', 'zeytinyağı'] },
  { name: 'Peynirli Tost', emoji: '🥪', calories: 320, time: '10 dk', cost: 20,
    ingredients: ['ekmek', 'peynir'], optional: ['domates', 'sucuk'] },
  { name: 'Sucuklu Yumurta', emoji: '🍳', calories: 380, time: '10 dk', cost: 35,
    ingredients: ['yumurta', 'sucuk'], optional: ['biber', 'domates'] },
  { name: 'Yoğurtlu Salata', emoji: '🥗', calories: 140, time: '10 dk', cost: 20,
    ingredients: ['yoğurt', 'salatalık'], optional: ['sarımsak', 'nane'] },
  { name: 'Patates Kızartması', emoji: '🍟', calories: 350, time: '20 dk', cost: 15,
    ingredients: ['patates'], optional: ['zeytinyağı', 'tuz'] },
  { name: 'Patates Yemeği', emoji: '🥔', calories: 280, time: '30 dk', cost: 20,
    ingredients: ['patates', 'soğan', 'domates'], optional: ['biber', 'zeytinyağı'] },
  { name: 'Ispanak Yemeği', emoji: '🥬', calories: 180, time: '20 dk', cost: 25,
    ingredients: ['ıspanak', 'soğan'], optional: ['yumurta', 'zeytinyağı'] },
  { name: 'Kuru Fasulye', emoji: '🫘', calories: 290, time: '45 dk', cost: 20,
    ingredients: ['kuru fasulye', 'soğan', 'domates'], optional: ['biber'] },
  { name: 'Nohutlu Yemek', emoji: '🫘', calories: 310, time: '40 dk', cost: 22,
    ingredients: ['nohut', 'soğan'], optional: ['domates', 'havuç'] },
];

const BASE = new Set(['tuz', 'karabiber', 'su', 'pul biber', 'nane', 'kekik',
  'zeytinyağı', 'ayçiçek yağı', 'yağ', 'sirke', 'şeker']);

function normalize(s) {
  return s.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').trim();
}

function hasIngredient(userList, needed) {
  const n = normalize(needed);
  return userList.some(u => normalize(u).includes(n) || n.includes(normalize(u)));
}

async function suggestRecipes(ingredients) {
  const userIngredients = ingredients.filter(i => !BASE.has(normalize(i)));

  const exact = [];
  const oneShort = [];

  for (const recipe of RECIPE_DB) {
    const missing = recipe.ingredients.filter(i => !hasIngredient(userIngredients, i));

    if (missing.length === 0) {
      exact.push({
        name: recipe.name,
        emoji: recipe.emoji,
        calories: recipe.calories,
        time: recipe.time,
        cost: recipe.cost,
        description: `${recipe.ingredients.slice(0,3).join(', ')} ile`,
        missingIngredient: null,
      });
    } else if (missing.length === 1) {
      oneShort.push({
        name: recipe.name,
        emoji: recipe.emoji,
        calories: recipe.calories,
        time: recipe.time,
        cost: recipe.cost,
        description: `${recipe.ingredients.slice(0,3).join(', ')} ile`,
        missingIngredient: missing[0],
      });
    }
  }

  // Tam eşleşmeler önce, toplamda max 6
  const results = [...exact, ...oneShort].slice(0, 6);

  if (results.length === 0) {
    return [{ name: 'Tarif bulunamadı', emoji: '😕', calories: 0, time: '—', cost: 0,
      description: 'Daha fazla malzeme ekle', missingIngredient: null }];
  }

  return results;
}

module.exports = { suggestRecipes };
