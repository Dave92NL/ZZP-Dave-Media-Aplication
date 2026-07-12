'use strict';

// Tłumaczenie opisów na żywo (PL → NL/EN). Działa w procesie głównym (omija CSP okna).
// Silnik: DeepL jeśli w Ustawieniach jest klucz API, inaczej fallback na darmowe MyMemory.

const https = require('https');
const settings = require('./settings');

// Kody języków docelowych akceptowane przez UI → (DeepL, MyMemory)
const LANGS = {
  pl: { deepl: 'PL', mymemory: 'pl' },
  nl: { deepl: 'NL', mymemory: 'nl' },
  en: { deepl: 'EN-GB', mymemory: 'en' }
};

function _request(options, bodyStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function _deepl(text, targetDeepl, apiKey) {
  // Klucz darmowy kończy się na ":fx" → host api-free; inaczej api (pro).
  const host = apiKey.trim().endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  // Pomijamy source_lang → DeepL sam wykrywa język źródłowy (PL/NL/EN → dowolny cel).
  const form = new URLSearchParams({
    text, target_lang: targetDeepl
  }).toString();
  const { status, body } = await _request({
    hostname: host, path: '/v2/translate', method: 'POST',
    headers: {
      'Authorization': 'DeepL-Auth-Key ' + apiKey.trim(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form)
    }
  }, form);
  if (status !== 200) throw new Error(`DeepL HTTP ${status}: ${body.slice(0, 200)}`);
  const parsed = JSON.parse(body);
  const out = parsed?.translations?.[0]?.text;
  if (!out) throw new Error('DeepL: pusta odpowiedź');
  return out;
}

async function _myMemory(text, targetMM) {
  // MyMemory wymaga pary źródło|cel. Przy celu PL zakładamy niderlandzki (język
  // klienta); przy celu NL/EN zakładamy polski (język, w którym piszesz opisy).
  const source = targetMM === 'pl' ? 'nl' : 'pl';
  const q = encodeURIComponent(text);
  const path = `/get?q=${q}&langpair=${source}|${targetMM}`;
  const { status, body } = await _request({
    hostname: 'api.mymemory.translated.net', path, method: 'GET'
  });
  if (status !== 200) throw new Error(`MyMemory HTTP ${status}`);
  const parsed = JSON.parse(body);
  const out = parsed?.responseData?.translatedText;
  if (!out) throw new Error('MyMemory: pusta odpowiedź');
  return out;
}

// text: tekst PL, target: 'nl' | 'en'. Zwraca { text, engine }.
async function translate(text, target) {
  const src = String(text || '').trim();
  if (!src) return { text: '', engine: null };
  const lang = LANGS[target];
  if (!lang) throw new Error('Nieobsługiwany język: ' + target);

  const apiKey = (settings.get('deepl_api_key') || '').trim();
  if (apiKey) {
    try {
      return { text: await _deepl(src, lang.deepl, apiKey), engine: 'deepl' };
    } catch (err) {
      // Klucz błędny / limit / brak sieci → spróbuj darmowego silnika
      try {
        return { text: await _myMemory(src, lang.mymemory), engine: 'mymemory' };
      } catch {
        throw err; // pokaż pierwotny błąd DeepL, jeśli i fallback padł
      }
    }
  }
  return { text: await _myMemory(src, lang.mymemory), engine: 'mymemory' };
}

module.exports = { translate };
