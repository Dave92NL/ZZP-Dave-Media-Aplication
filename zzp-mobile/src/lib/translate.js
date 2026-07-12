// Tłumaczenie opisów PL → NL/EN na telefonie. Darmowe MyMemory — działa wprost
// z przeglądarki (CORS: Access-Control-Allow-Origin: *), bez klucza i konta.
// (DeepL blokuje CORS z przeglądarki; jakość DeepL na mobile wymagałaby proxy
//  przez Supabase Edge Function — do dodania później, gdyby była potrzeba.)

const LANG = { pl: 'pl', nl: 'nl', en: 'en' };

export async function translate(text, target) {
  const src = String(text || '').trim();
  if (!src) return '';
  const lang = LANG[target];
  if (!lang) throw new Error('Nieobsługiwany język: ' + target);
  // Para źródło|cel: przy celu PL zakładamy niderlandzki, inaczej polski.
  const source = lang === 'pl' ? 'nl' : 'pl';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(src)}&langpair=${source}|${lang}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const out = j?.responseData?.translatedText;
  if (!out) throw new Error('pusta odpowiedź tłumaczenia');
  return out;
}
