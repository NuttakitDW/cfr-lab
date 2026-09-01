// Voiceover clips for the classify Q1 learning experience (voice: khanomkrok).
// Hand-crafted conversational scripts — question narration, shared verdict
// clips, and a mini-lesson solution — in English and Thai.
//
// Usage: node scripts/gen-plo-q1-experience.mjs [clip-id]
//   Reads PAXA_API_KEY from the environment, .env.local, or .env.
//   Always regenerates (overwrites) the clips it owns; pass a clip id
//   (e.g. classify-01-th) to regenerate just that one.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
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

const OUT_DIR = join(ROOT, 'assets', 'audio', 'plo-starting-hands');
const VOICE = 'khanomkrok';
const MODEL = 'paxa-tts-flash-v1';

const CLIPS = {
  // Question narration — plays when classify Q1 appears
  'classify-q-01-en':
    "Question one. Your four cards: the King of spades, the King of diamonds, " +
    "the Queen of diamonds, and the Jack of spades. Double suited, all high cards. " +
    "So — Premium, Speculative, Marginal, or Trash? Take your time.",
  'classify-q-01-th':
    "ข้อที่หนึ่งครับ ไพ่สี่ใบของคุณคือ K โพดำ, K ข้าวหลามตัด, Q ข้าวหลามตัด และ J โพดำ " +
    "— double suited ไพ่สูงทั้งหมด แล้วมือนี้เป็น Premium, Speculative, Marginal " +
    "หรือ Trash ครับ ค่อยๆ คิดได้เลย",

  // Shared verdict clips — reusable across every question
  'verdict-correct-en':
    "Correct! Well done. Now, let's talk about why.",
  'verdict-correct-th':
    "ถูกต้องครับ! เยี่ยมมาก ทีนี้มาดูเหตุผลกันครับ",
  'verdict-incorrect-en':
    "Not quite. That's alright — this one teaches a good lesson. Listen closely.",
  'verdict-incorrect-th':
    "ยังไม่ใช่ครับ ไม่เป็นไร ข้อนี้มีบทเรียนดีๆ ซ่อนอยู่ ลองฟังดูครับ",

  // Solution mini-lesson — replaces the plain text read-out
  'classify-01-en':
    "This hand is Premium. Here's the test: imagine the flops it loves. " +
    "Ten, nine, eight — you've flopped the nut straight, with redraws to improve even further. " +
    "King, ten, nine — the nut straight again, and now a full house is within reach. " +
    "Even ten, nine, and a blank gives you a twelve-card draw to the nut straight, " +
    "with an overpair as backup. Two big pairs, two suits, and every card working together. " +
    "That is what Premium looks like.",
  'classify-01-th':
    "มือนี้คือ Premium ครับ วิธีคิดคือ ลองนึกภาพ flop ที่มือนี้ชอบ " +
    "ถ้ามา สิบ เก้า แปด — คุณได้ nut straight ทันที แถมยังมี redraw ต่อยอดได้อีก " +
    "ถ้ามา K สิบ เก้า — ก็ยังเป็น nut straight และคราวนี้มีโอกาสไปถึง full house ด้วย " +
    "หรือแม้แต่ สิบ เก้า กับไพ่อะไรก็ได้ คุณก็มี draw ถึงสิบสองใบไปหา nut straight " +
    "พร้อม overpair คอยหนุน คู่ใหญ่สองคู่ สองดอก ไพ่ทุกใบทำงานร่วมกัน " +
    "— แบบนี้แหละครับที่เรียกว่า Premium",
};

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
    if (res.status === 402) throw new Error(`insufficient credits: ${body.slice(0, 120)}`);
    console.error(`  attempt ${attempt} failed (${res.status}): ${body.slice(0, 120)} — waiting ${retryAfter}s`);
    if (attempt === 8) throw new Error(`giving up on ${outFile}`);
    await sleep((retryAfter + 1) * 1000);
  }
}

mkdirSync(OUT_DIR, { recursive: true });

const only = process.argv[2];
const entries = Object.entries(CLIPS).filter(([id]) => !only || id === only);
console.log(`${entries.length} clips to generate`);
const failed = [];
for (const [n, [id, text]] of entries.entries()) {
  try {
    await tts(text, join(OUT_DIR, `${id}.mp3`));
    console.log(`ok ${id} (${n + 1}/${entries.length})`);
  } catch (err) {
    failed.push(id);
    console.error(`FAIL ${id}: ${err.message}`);
    if (err.message.startsWith('insufficient credits')) break;
  }
  await sleep(6500); // API allows 10 requests/minute
}
console.log(failed.length ? `FAILED: ${failed.join(', ')}` : 'all done');
process.exit(failed.length ? 1 : 0);
