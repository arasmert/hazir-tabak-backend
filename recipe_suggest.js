const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tuz, karabiber, su gibi her evde olan temel malzemeler sayılmaz
const BASE_INGREDIENTS = ['tuz', 'karabiber', 'su', 'kırmızı pul biber', 'nane', 'kekik', 'pişirme yağı'];

async function suggestRecipes(ingredients) {
  const ingredientList = ingredients.join(', ');

  const prompt = `Sen bir şef asistanısın. Kullanıcının elinde SADECE şu malzemeler var: ${ingredientList}

Not: Tuz, karabiber, su, kuru baharatlar (nane, kekik vb.) her evde olduğu kabul edilir, eksik saymaz.

ADIM 1 — Tam eşleşme tarifleri bul:
Sadece yukarıdaki malzemelerle yapılabilen tarifleri listele. Gerçekçi düşün — lavaş+yumurta+domates+peynir varsa "dürüm omlet", "sahanda yumurta lavaş sarma", "peynirli domates omlet" gibi kombinasyonları düşün.

ADIM 2 — 1 malzeme eksik tarifleri bul:
Yukarıdaki malzemelere TAM OLARAK 1 malzeme eklense yapılabilecek tarifleri listele. Eksik malzemeyi say: eğer bir tarif için 2 veya daha fazla malzeme eksikse O TARİFİ KESINLIKLE EKLEME.

Örnek kontrol: Menemen için gerekli: yumurta, domates, biber, zeytinyağı, soğan. Kullanıcıda yumurta ve domates var. Eksik: biber, zeytinyağı, soğan = 3 eksik → EKLEME.

Maksimum 6 tarif döndür (önce tam eşleşmeler).

SADECE JSON döndür, başka hiçbir şey yazma:
{
  "recipes": [
    {
      "name": "Tarif Adı",
      "emoji": "🍳",
      "calories": 320,
      "time": "10 dk",
      "cost": 22,
      "missingIngredient": null,
      "description": "Kısa lezzetli açıklama"
    }
  ]
}

missingIngredient: tam eşleşme için null, tam olarak 1 eksik varsa sadece o malzemenin adı.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Geçersiz AI yanıtı');

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.recipes || [];
}

module.exports = { suggestRecipes };
