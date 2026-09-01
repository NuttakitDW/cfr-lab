// Generate Paxa Labs TTS voiceovers for the solution explanations in
// plo-starting-hands.html (voice: yoyo, Thai + English).
//
// Usage: node scripts/gen-plo-voiceovers.mjs [clip-id]
//   Reads PAXA_API_KEY from the environment, .env.local, or .env.
//   Skips clips that already exist; pass a clip id (e.g. classify-01-en)
//   to force-regenerate just that one.
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvKey() {
  if (process.env.PAXA_API_KEY) return process.env.PAXA_API_KEY;
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^PAXA_API_KEY\s*=\s*"?([^"\n]+)"?/m);
    if (m) return m[1];
  }
  return null;
}

const API_KEY = loadEnvKey();
if (!API_KEY) {
  console.error('PAXA_API_KEY not found in environment, .env.local, or .env');
  process.exit(1);
}

const PAGE = join(ROOT, 'plo-starting-hands.html');
const OUT_DIR = join(ROOT, 'assets', 'audio', 'plo-starting-hands');
const VOICE = 'yoyo';
const MODEL = 'paxa-tts-flash-v1';

const src = readFileSync(PAGE, 'utf8');

function extractArray(name) {
  const start = src.indexOf(`const ${name} = [`);
  if (start === -1) throw new Error(`${name} not found in page`);
  const open = src.indexOf('[', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) break; }
  }
  return eval(src.slice(open, i + 1));
}

const CLASSIFY = extractArray('CLASSIFY');
const SITUATIONS = extractArray('SITUATIONS');

const SUITS_EN = { '♠': ' spades', '♥': ' hearts', '♦': ' diamonds', '♣': ' clubs' };
const SUITS_TH = { '♠': ' โพดำ', '♥': ' โพแดง', '♦': ' ข้าวหลามตัด', '♣': ' ดอกจิก' };

// yoyo is a Thai voice, so bare digits in English text are read as Thai
// numbers — spell them out as English words instead.
const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function numToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) {
    return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
  }
  return numToWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
}
function spellNumbersEn(t) {
  t = t.replace(/\$([\d,]+)/g, (_, d) => numToWords(parseInt(d.replace(/,/g, ''), 10)) + ' dollars');
  t = t.replace(/\b(\d+)\/(\d+)\b/g, (_, a, b) => numToWords(+a) + ' to ' + numToWords(+b));
  t = t.replace(/\b(\d+)\.(\d+)\b/g, (_, a, b) =>
    numToWords(+a) + ' point ' + [...b].map(d => ONES[+d]).join(' '));
  t = t.replace(/\b\d+\b/g, m => numToWords(+m));
  return t;
}

// Turn the HTML explanation into clean speakable text.
function clean(html, lang) {
  let t = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  const suits = lang === 'th' ? SUITS_TH : SUITS_EN;
  t = t.replace(/[♠♥♦♣]/g, m => suits[m] + ', ');
  t = t.replace(/~/g, lang === 'en' ? 'about ' : 'ประมาณ ');
  // card runs like "T-9-8" or "A-9-8-7" read better as separate cards
  t = t.replace(/\b([AKQJT2-9x](?:-[AKQJT2-9x]){1,4})\b/g, s => s.replace(/-/g, ' '));
  if (lang === 'en') t = spellNumbersEn(t);
  t = t.replace(/\s+,/g, ',').replace(/,\s*([.)])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return t;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tts(text, outFile) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch('https://api.paxalabs.com/v1/tts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: VOICE, model: MODEL }),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) throw new Error(`suspiciously small response for ${outFile}`);
      writeFileSync(outFile, buf);
      return;
    }
    const retryAfter = Number(res.headers.get('retry-after')) || 10;
    const body = await res.text();
    console.error(`  attempt ${attempt} failed (${res.status}): ${body.slice(0, 120)} — waiting ${retryAfter}s`);
    if (attempt === 8) throw new Error(`giving up on ${outFile}`);
    await sleep((retryAfter + 1) * 1000);
  }
}

mkdirSync(OUT_DIR, { recursive: true });

const jobs = [];
for (const [mode, data] of [['classify', CLASSIFY], ['situations', SITUATIONS]]) {
  data.forEach((item, i) => {
    for (const lang of ['en', 'th']) {
      const id = `${mode}-${String(i + 1).padStart(2, '0')}-${lang}`;
      jobs.push({ id, text: clean(item.e[lang], lang), out: join(OUT_DIR, `${id}.mp3`) });
    }
  });
}

// manifest of the spoken text, for review
writeFileSync(join(OUT_DIR, 'manifest.json'),
  JSON.stringify(jobs.map(j => ({ id: j.id, text: j.text })), null, 2));

const only = process.argv[2];
const queue = jobs.filter(j => {
  if (only) return j.id === only;
  return !(existsSync(j.out) && statSync(j.out).size > 500);
});

console.log(`${queue.length} clips to generate (${jobs.length} total)`);
const failed = [];
for (const [n, j] of queue.entries()) {
  try {
    await tts(j.text, j.out);
    console.log(`ok ${j.id} (${n + 1}/${queue.length})`);
  } catch (err) {
    failed.push(j.id);
    console.error(`FAIL ${j.id}: ${err.message}`);
  }
  await sleep(6500); // API allows 10 requests/minute
}
console.log(failed.length ? `FAILED: ${failed.join(', ')}` : 'all done');
process.exit(failed.length ? 1 : 0);
