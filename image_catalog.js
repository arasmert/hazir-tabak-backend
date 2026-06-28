// Illustrasyon stili yemek görselleri — Higgsfield CDN (kalıcı)
// Stil: Top-down flat lay, mavi-beyaz çiçekli tabak, tahta masa, gouache illustration

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3AFhoF9vus7MvcqgrPqGwNrR61p';

const IMAGE_CATALOG = {
  // ── Çorba ────────────────────────────────────────────────────────────────
  mercimek: `${CDN}/hf_20260628_092929_6ab0793a-d05f-41fd-aa48-4cb5ac6a7445.png`,
  corba:    `${CDN}/hf_20260628_092929_6ab0793a-d05f-41fd-aa48-4cb5ac6a7445.png`,

  // ── Tavuk ─────────────────────────────────────────────────────────────────
  tavuk:    `${CDN}/hf_20260628_092935_b98d9da1-481e-47e1-8163-322ecb8ee62f.png`,
  pilic:    `${CDN}/hf_20260628_092935_b98d9da1-481e-47e1-8163-322ecb8ee62f.png`,
  sote:     `${CDN}/hf_20260628_092935_b98d9da1-481e-47e1-8163-322ecb8ee62f.png`,

  // ── Et / Köfte ────────────────────────────────────────────────────────────
  kofte:    `${CDN}/hf_20260628_091825_9c52193b-43b4-4e1f-8973-65c54973fa43.png`,
  et:       `${CDN}/hf_20260628_091825_9c52193b-43b4-4e1f-8973-65c54973fa43.png`,
  kebap:    `${CDN}/hf_20260628_091825_9c52193b-43b4-4e1f-8973-65c54973fa43.png`,

  // ── Pilav ─────────────────────────────────────────────────────────────────
  pilav:    `${CDN}/hf_20260628_091835_75530a66-a1f6-4859-9364-2b9457b55d37.png`,
  bulgur:   `${CDN}/hf_20260628_091835_75530a66-a1f6-4859-9364-2b9457b55d37.png`,

  // ── Makarna ───────────────────────────────────────────────────────────────
  makarna:  `${CDN}/hf_20260628_092941_754991bd-8c51-4df8-96b9-cb3f7e32c3f7.png`,
  spagetti: `${CDN}/hf_20260628_092941_754991bd-8c51-4df8-96b9-cb3f7e32c3f7.png`,

  // ── Salata ────────────────────────────────────────────────────────────────
  salata:   `${CDN}/hf_20260628_092945_7db16fa4-553b-48db-b8ef-661bf0d12183.png`,

  // ── Kahvaltı / Yumurta ────────────────────────────────────────────────────
  menemen:  `${CDN}/hf_20260628_091830_0c7f54d4-b752-4dc6-a38d-9d35b00787ea.png`,
  omlet:    `${CDN}/hf_20260628_091830_0c7f54d4-b752-4dc6-a38d-9d35b00787ea.png`,
  yumurta:  `${CDN}/hf_20260628_091830_0c7f54d4-b752-4dc6-a38d-9d35b00787ea.png`,
  kahvalti: `${CDN}/hf_20260628_091830_0c7f54d4-b752-4dc6-a38d-9d35b00787ea.png`,

  // ── Tatlı / Baklava ───────────────────────────────────────────────────────
  baklava:  `${CDN}/hf_20260628_092950_4ab9cf0b-b41d-4490-814a-a9175abe93d0.png`,
  tatli:    `${CDN}/hf_20260628_092950_4ab9cf0b-b41d-4490-814a-a9175abe93d0.png`,
  kek:      `${CDN}/hf_20260628_092950_4ab9cf0b-b41d-4490-814a-a9175abe93d0.png`,
  pasta:    `${CDN}/hf_20260628_092950_4ab9cf0b-b41d-4490-814a-a9175abe93d0.png`,

  // ── Balık (henüz üretiliyor, geçici olarak salata) ────────────────────────
  balik:    `${CDN}/hf_20260628_092945_7db16fa4-553b-48db-b8ef-661bf0d12183.png`,
  somon:    `${CDN}/hf_20260628_092945_7db16fa4-553b-48db-b8ef-661bf0d12183.png`,
  deniz:    `${CDN}/hf_20260628_092945_7db16fa4-553b-48db-b8ef-661bf0d12183.png`,

  // ── Börek / Hamurişi (henüz üretiliyor, geçici olarak baklava) ───────────
  borek:    `${CDN}/hf_20260628_092950_4ab9cf0b-b41d-4490-814a-a9175abe93d0.png`,
  hamurisi: `${CDN}/hf_20260628_092950_4ab9cf0b-b41d-4490-814a-a9175abe93d0.png`,
};

const CATEGORY_FALLBACK = {
  corba:       'corba',
  salata:      'salata',
  tavuk:       'tavuk',
  et:          'et',
  pilav:       'pilav',
  makarna:     'makarna',
  tatli:       'tatli',
  pasta:       'pasta',
  balik:       'balik',
  deniz:       'balik',
  kahvalti:    'kahvalti',
  vegan:       'salata',
  zeytinyagli: 'salata',
  hamurisi:    'borek',
};

const NAME_KEYWORDS = [
  ['mercimek', 'mercimek'], ['ezogelin', 'corba'], ['tarhana', 'corba'],
  ['şehriye', 'corba'], ['domates', 'corba'], ['çorba', 'corba'], ['corba', 'corba'],
  ['tavuk', 'tavuk'], ['piliç', 'pilic'], ['hindi', 'tavuk'],
  ['köfte', 'kofte'], ['kebap', 'kebap'], ['kıyma', 'kofte'], ['biftek', 'et'], ['kuzu', 'et'],
  ['pilav', 'pilav'], ['bulgur', 'bulgur'],
  ['makarna', 'makarna'], ['spagetti', 'spagetti'], ['fettucine', 'makarna'], ['lazanya', 'makarna'],
  ['menemen', 'menemen'], ['omlet', 'omlet'], ['yumurta', 'yumurta'],
  ['börek', 'borek'], ['poğaça', 'borek'], ['gözleme', 'borek'],
  ['salata', 'salata'], ['çoban', 'salata'],
  ['baklava', 'baklava'], ['tatlı', 'tatli'], ['sufle', 'tatli'],
  ['pasta', 'pasta'], ['kek', 'kek'], ['kurabiye', 'tatli'],
  ['muhallebi', 'tatli'], ['sütlaç', 'tatli'], ['helva', 'tatli'],
  ['balık', 'balik'], ['somon', 'somon'], ['levrek', 'balik'],
  ['çipura', 'balik'], ['ton', 'balik'],
  ['sote', 'sote'],
];

function getImageForRecipe(recipeName, categorySlug) {
  if (!recipeName) return categorySlug ? (IMAGE_CATALOG[CATEGORY_FALLBACK[categorySlug]] || null) : null;

  const name = recipeName.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c');

  for (const [keyword, key] of NAME_KEYWORDS) {
    const kw = keyword.replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
      .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c');
    if (name.includes(kw) && IMAGE_CATALOG[key]) return IMAGE_CATALOG[key];
  }

  if (categorySlug) {
    const fallbackKey = CATEGORY_FALLBACK[categorySlug];
    if (fallbackKey && IMAGE_CATALOG[fallbackKey]) return IMAGE_CATALOG[fallbackKey];
    for (const [slug, key] of Object.entries(CATEGORY_FALLBACK)) {
      if (categorySlug.includes(slug) && IMAGE_CATALOG[key]) return IMAGE_CATALOG[key];
    }
  }

  return null;
}

module.exports = { IMAGE_CATALOG, getImageForRecipe };
