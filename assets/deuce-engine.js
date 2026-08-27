/* =============================================================================
   DEUCE-TO-SEVEN TRIPLE DRAW — equity, EV and improvement engine
   ---------------------------------------------------------------------------
   Card  = rank*4 + suit,  rank 0..12 == 2..A.  The ace is ALWAYS high, so
   A-5-4-3-2 is an ace-high hand and 7-6-5-4-3 is a straight.
   Value = a single integer where SMALLER IS BETTER.
   ========================================================================== */
(function (root) {
'use strict';

const CAT_MUL = 67108864, PRIM_MUL = 8192, TOTAL5 = 2598960;
const NUT = 385024;                      /* 7-5-4-3-2, not all one suit */

/* -- 1. evaluator ---------------------------------------------------------- */
function evalHand(a, b, c, d, e) {
  let m1 = 0, m2 = 0, m3 = 0, m4 = 0, t;
  t = 1 << (a >> 2); if (m3 & t) m4 |= t; else if (m2 & t) m3 |= t; else if (m1 & t) m2 |= t; else m1 |= t;
  t = 1 << (b >> 2); if (m3 & t) m4 |= t; else if (m2 & t) m3 |= t; else if (m1 & t) m2 |= t; else m1 |= t;
  t = 1 << (c >> 2); if (m3 & t) m4 |= t; else if (m2 & t) m3 |= t; else if (m1 & t) m2 |= t; else m1 |= t;
  t = 1 << (d >> 2); if (m3 & t) m4 |= t; else if (m2 & t) m3 |= t; else if (m1 & t) m2 |= t; else m1 |= t;
  t = 1 << (e >> 2); if (m3 & t) m4 |= t; else if (m2 & t) m3 |= t; else if (m1 & t) m2 |= t; else m1 |= t;
  if (m2 === 0) {
    const s = a & 3;
    const flush = ((b & 3) === s) && ((c & 3) === s) && ((d & 3) === s) && ((e & 3) === s);
    const straight = (m1 & (m1 >> 1) & (m1 >> 2) & (m1 >> 3) & (m1 >> 4)) !== 0;
    return (straight ? (flush ? 8 : 4) : (flush ? 5 : 0)) * CAT_MUL + m1 * PRIM_MUL;
  }
  if (m4) return 7 * CAT_MUL + m4 * PRIM_MUL + (m1 & ~m4);
  if (m3) { const p = m2 & ~m3;
    return p ? 6 * CAT_MUL + m3 * PRIM_MUL + p : 3 * CAT_MUL + m3 * PRIM_MUL + (m1 & ~m2); }
  const kick = m1 & ~m2;
  return ((m2 & (m2 - 1)) ? 2 : 1) * CAT_MUL + m2 * PRIM_MUL + kick;
}

/* -- 2. the 7,462 value classes, by exact enumeration ---------------------- */
let CLASS_VAL = null, CLASS_FREQ = null, CLASS_PCT = null, NCLASS = 0;

function buildClasses() {
  const vals = [], freqs = [];
  const push = (v, f) => { vals.push(v); freqs.push(f); };
  for (let mask = 0; mask < 8192; mask++) {
    let n = 0, m = mask; while (m) { n += m & 1; m >>= 1; }
    if (n !== 5) continue;
    const st = (mask & (mask >> 1) & (mask >> 2) & (mask >> 3) & (mask >> 4)) !== 0;
    push((st ? 4 : 0) * CAT_MUL + mask * PRIM_MUL, 1020);
    push((st ? 8 : 5) * CAT_MUL + mask * PRIM_MUL, 4);
  }
  for (let p = 0; p < 13; p++)
    for (let i = 0; i < 13; i++) { if (i === p) continue;
      for (let j = i + 1; j < 13; j++) { if (j === p) continue;
        for (let k = j + 1; k < 13; k++) { if (k === p) continue;
          push(CAT_MUL + (1 << p) * PRIM_MUL + ((1 << i) | (1 << j) | (1 << k)), 384); } } }
  for (let p = 0; p < 13; p++) for (let q = p + 1; q < 13; q++)
    for (let k = 0; k < 13; k++) { if (k === p || k === q) continue;
      push(2 * CAT_MUL + ((1 << p) | (1 << q)) * PRIM_MUL + (1 << k), 144); }
  for (let t = 0; t < 13; t++)
    for (let i = 0; i < 13; i++) { if (i === t) continue;
      for (let j = i + 1; j < 13; j++) { if (j === t) continue;
        push(3 * CAT_MUL + (1 << t) * PRIM_MUL + ((1 << i) | (1 << j)), 64); } }
  for (let t = 0; t < 13; t++) for (let p = 0; p < 13; p++) { if (t === p) continue;
    push(6 * CAT_MUL + (1 << t) * PRIM_MUL + (1 << p), 24); }
  for (let q = 0; q < 13; q++) for (let k = 0; k < 13; k++) { if (q === k) continue;
    push(7 * CAT_MUL + (1 << q) * PRIM_MUL + (1 << k), 4); }

  const order = vals.map((_, i) => i).sort((x, y) => vals[x] - vals[y]);
  NCLASS = order.length;
  CLASS_VAL = new Int32Array(NCLASS);
  CLASS_FREQ = new Float64Array(NCLASS);
  for (let i = 0; i < NCLASS; i++) { CLASS_VAL[i] = vals[order[i]]; CLASS_FREQ[i] = freqs[order[i]]; }
  setOpponentDistribution(CLASS_FREQ);              /* bootstrap: uniform random hand */
  return { classes: NCLASS, hands: CLASS_FREQ.reduce((a, b) => a + b, 0) };
}

function classIndex(v) {
  let lo = 0, hi = NCLASS - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (CLASS_VAL[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}

/* strength(v) = P(beat opponent) + ½P(tie), against whatever distribution is set */
function setOpponentDistribution(counts) {
  let tot = 0; for (let i = 0; i < NCLASS; i++) tot += counts[i];
  CLASS_PCT = new Float64Array(NCLASS);
  let cum = 0;                                       /* mass strictly better than i */
  for (let i = 0; i < NCLASS; i++) {
    const f = counts[i];
    CLASS_PCT[i] = tot > 0 ? ((tot - cum - f) + 0.5 * f) / tot : 0.5;
    cum += f;
  }
}
function strengthOf(v) { return CLASS_PCT[classIndex(v)]; }

/* -- 3. candidate keep-sets ------------------------------------------------
   In 2-7 you keep your lowest cards and never keep a duplicate rank, so the
   candidate family is exactly "keep the j lowest distinct ranks".            */
const UNIQ = new Int32Array(5);        /* the distinct-rank cards, lowest first */
const PMASK = new Int32Array(6);       /* rank mask of the j-card prefix        */
const PSS = new Uint8Array(6);         /* is that prefix all one suit?          */
const _sortBuf = new Int32Array(5);

function analyze(hand) {
  for (let i = 0; i < 5; i++) _sortBuf[i] = hand[i];
  for (let i = 1; i < 5; i++) {
    const v = _sortBuf[i]; let j = i - 1;
    while (j >= 0 && (_sortBuf[j] >> 2) > (v >> 2)) { _sortBuf[j + 1] = _sortBuf[j]; j--; }
    _sortBuf[j + 1] = v;
  }
  let n = 0, mask = 0, suit = -1, same = 1;
  PMASK[0] = 0; PSS[0] = 0;
  for (let i = 0; i < 5; i++) {
    const c = _sortBuf[i], b = 1 << (c >> 2);
    if (mask & b) continue;
    mask |= b; UNIQ[n] = c;
    const s = c & 3;
    if (suit === -1) suit = s; else if (s !== suit) same = 0;
    n++;
    PMASK[n] = mask; PSS[n] = (n >= 2) ? same : 0;
  }
  return n;
}
const keyOf = (mask, ss) => ss ? (mask | 8192) : mask;

/* -- 4. draw-value table: E[final strength | keep set, d draws left] -------- */
function comb(n, k) { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); }

function buildDrawTable(opts) {
  opts = opts || {};
  const EXACT_MAX = opts.exactMax || 2000, SAMPLES = opts.samples || 12000;
  const onProgress = opts.onProgress;
  const DV = [null, new Float64Array(16384), new Float64Array(16384), new Float64Array(16384)];
  const masks = [];
  for (let m = 0; m < 8192; m++) {
    let n = 0, t = m; while (t) { n += t & 1; t >>= 1; }
    if (n <= 4) masks.push([m, n]);
  }
  let s = 2463534242 >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const hand = new Int32Array(5), pool = new Int32Array(52), deck = new Int32Array(52);
  const idx = new Int32Array(5);
  const total = masks.length * 2 * 3; let done = 0;

  for (let d = 1; d <= 3; d++) {
    const prev = DV[d - 1];
    for (let mi = 0; mi < masks.length; mi++) {
      const mask = masks[mi][0], n = masks[mi][1];
      for (let sf = 0; sf < 2; sf++) {
        done++;
        if (sf && n < 2) continue;
        let si = 0, nk = 0;
        for (let r = 0; r < 13; r++) if (mask & (1 << r)) hand[nk++] = r * 4 + (sf ? 0 : (si++ % 4));
        let D = 0;
        const used = new Uint8Array(52);
        for (let i = 0; i < n; i++) used[hand[i]] = 1;
        for (let c = 0; c < 52; c++) if (!used[c]) deck[D++] = c;
        const k = 5 - n;
        let acc = 0, cnt = 0;

        const one = () => {
          const v = evalHand(hand[0], hand[1], hand[2], hand[3], hand[4]);
          let best = CLASS_PCT[classIndex(v)];
          if (d > 1) {
            const nu = analyze(hand);
            for (let j = 0; j <= nu; j++) {           /* j === 5 is the pat line, already in `best` */
              if (j === 5) continue;
              const cand = prev[keyOf(PMASK[j], PSS[j])];
              if (cand > best) best = cand;
            }
          }
          acc += best; cnt++;
        };

        if (comb(D, k) <= EXACT_MAX) {
          const rec = (start, depth) => {
            if (depth === k) { for (let i = 0; i < k; i++) hand[n + i] = deck[idx[i]]; one(); return; }
            for (let i = start; i <= D - (k - depth); i++) { idx[depth] = i; rec(i + 1, depth + 1); }
          };
          if (k === 0) one(); else rec(0, 0);
        } else {
          for (let i = 0; i < D; i++) pool[i] = deck[i];
          for (let t = 0; t < SAMPLES; t++) {
            for (let i = 0; i < k; i++) {
              const j = i + ((rnd() * (D - i)) | 0);
              const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
              hand[n + i] = pool[i];
            }
            one();
          }
        }
        DV[d][keyOf(mask, !!sf)] = acc / cnt;
      }
      if (onProgress && (mi & 127) === 0) onProgress(done / total);
    }
  }
  return DV;
}

/* -- 5. the policy --------------------------------------------------------- */
function chooseKeep(hand, d, DV) {
  const n = analyze(hand);
  const pat = CLASS_PCT[classIndex(evalHand(hand[0], hand[1], hand[2], hand[3], hand[4]))];
  if (d === 0) return { size: 5, discards: 0, ev: pat, pat: true };
  let bestJ = -1, bestV = -1;
  for (let j = 0; j <= n; j++) {
    const v = (j === 5) ? pat : DV[d][keyOf(PMASK[j], PSS[j])];
    if (v > bestV) { bestV = v; bestJ = j; }
  }
  return { size: bestJ, discards: 5 - bestJ, ev: bestV, pat: bestJ === 5 };
}
/* the kept cards live in UNIQ[0..size-1] right after chooseKeep (analyze ran) */

/* -- 6. shoe: draws from the stub, reshuffles the muck when it runs dry ----- */
function Shoe(base, rnd) {
  this.buf = new Int32Array(52); this.n = base.length; this.pos = 0;
  this.muck = new Int32Array(52); this.nmuck = 0; this.rnd = rnd;
  for (let i = 0; i < this.n; i++) this.buf[i] = base[i];
}
Shoe.prototype.reset = function (base) {
  this.n = base.length; this.pos = 0; this.nmuck = 0;
  for (let i = 0; i < this.n; i++) this.buf[i] = base[i];
  for (let i = this.n - 1; i > 0; i--) {
    const j = (this.rnd() * (i + 1)) | 0;
    const t = this.buf[i]; this.buf[i] = this.buf[j]; this.buf[j] = t;
  }
};
Shoe.prototype.draw = function () {
  if (this.pos >= this.n) {                       /* stub exhausted: reshuffle the muck */
    this.n = this.nmuck; this.pos = 0;
    for (let i = 0; i < this.nmuck; i++) this.buf[i] = this.muck[i];
    this.nmuck = 0;
    for (let i = this.n - 1; i > 0; i--) {
      const j = (this.rnd() * (i + 1)) | 0;
      const t = this.buf[i]; this.buf[i] = this.buf[j]; this.buf[j] = t;
    }
  }
  return this.buf[this.pos++];
};
Shoe.prototype.discard = function (c) { this.muck[this.nmuck++] = c; };

function mulberry(seed) {
  let s = seed >>> 0;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* play one hand forward from d draws remaining, in place */
const _keepTmp = new Int32Array(5);
function drawOnce(hand, d, DV, shoe) {
  {
    const ch = chooseKeep(hand, d, DV);
    if (ch.discards === 0) return;
    for (let i = 0; i < ch.size; i++) _keepTmp[i] = UNIQ[i];
    for (let i = 0; i < 5; i++) {
      let kept = false;
      for (let j = 0; j < ch.size; j++) if (_keepTmp[j] === hand[i]) { kept = true; break; }
      if (!kept) shoe.discard(hand[i]);
    }
    for (let i = 0; i < ch.size; i++) hand[i] = _keepTmp[i];
    for (let i = ch.size; i < 5; i++) hand[i] = shoe.draw();
  }
}
function playOut(hand, d, DV, shoe) { for (let r = d; r >= 1; r--) drawOnce(hand, r, DV, shoe); }

/* -- 7. self-play fixed point ----------------------------------------------
   The value function must score a hand against an opponent who has ALSO drawn
   three times, not against a uniform random hand — otherwise junk like K-5-4-3-2
   looks strong enough to stand pat. Build the table, roll the policy out, use
   the resulting showdown distribution as the new opponent, repeat.           */
function calibrate(opts) {
  opts = opts || {};
  const rounds = opts.rounds || 3, rollouts = opts.rollouts || 120000;
  const onProgress = opts.onProgress || (() => {});
  let DV = null;
  for (let r = 0; r < rounds; r++) {
    DV = buildDrawTable({ samples: opts.samples,
      onProgress: p => onProgress((r + p * 0.8) / rounds) });
    if (r === rounds - 1) break;
    const counts = new Float64Array(NCLASS);
    const rnd = mulberry(777 + r * 1013);
    const base = new Int32Array(52); for (let c = 0; c < 52; c++) base[c] = c;
    const shoe = new Shoe(base, rnd), hand = new Int32Array(5);
    for (let t = 0; t < rollouts; t++) {
      shoe.reset(base);
      for (let i = 0; i < 5; i++) hand[i] = shoe.draw();
      playOut(hand, 3, DV, shoe);
      counts[classIndex(evalHand(hand[0], hand[1], hand[2], hand[3], hand[4]))]++;
    }
    setOpponentDistribution(counts);
    onProgress((r + 1) / rounds);
  }
  return DV;
}

/* -- 8. categories --------------------------------------------------------- */
const CATS = ['Seven low', 'Eight low', 'Nine low', 'Ten low', 'Jack low', 'Queen low',
  'King low', 'Ace high', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
  'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const CAT_OF = [0, 8, 9, 10, 11, 12, 13, 14, 15];
function categorize(v) {
  const cat = (v / CAT_MUL) | 0;
  if (cat === 0) return (31 - Math.clz32(((v - cat * CAT_MUL) / PRIM_MUL) | 0)) - 5;
  return CAT_OF[cat];
}

/* -- 9. equity ------------------------------------------------------------- */
function runEquity(o) {
  const players = o.players, P = players.length, trials = o.trials, DV = o.DV;
  const drawsLeft = o.drawsLeft, dead = o.dead || [];
  const win = new Float64Array(P), tie = new Float64Array(P);
  const eq = new Float64Array(P), eq2 = new Float64Array(P);
  const rnd = mulberry(o.seed || 20260827);

  const blocked = new Uint8Array(52);
  for (const c of dead) blocked[c] = 1;
  for (const p of players) if (p.cards) for (const c of p.cards) blocked[c] = 1;
  const baseArr = []; for (let c = 0; c < 52; c++) if (!blocked[c]) baseArr.push(c);
  const base = Int32Array.from(baseArr);

  const hands = []; for (let i = 0; i < P; i++) hands.push(new Int32Array(5));
  const vals = new Float64Array(P);
  const shoe = new Shoe(base, rnd);

  for (let t = 0; t < trials; t++) {
    shoe.reset(base);
    for (let i = 0; i < P; i++) {
      if (players[i].cards) for (let j = 0; j < 5; j++) hands[i][j] = players[i].cards[j];
      else for (let j = 0; j < 5; j++) hands[i][j] = shoe.draw();
    }
    for (let d = drawsLeft; d >= 1; d--)
      for (let i = 0; i < P; i++) drawOnce(hands[i], d, DV, shoe);
    let bestV = Infinity, nBest = 0;
    for (let i = 0; i < P; i++) {
      const h = hands[i];
      vals[i] = evalHand(h[0], h[1], h[2], h[3], h[4]);
      if (vals[i] < bestV) { bestV = vals[i]; nBest = 1; }
      else if (vals[i] === bestV) nBest++;
    }
    for (let i = 0; i < P; i++) {
      if (vals[i] !== bestV) continue;
      const share = 1 / nBest;
      if (nBest === 1) win[i]++; else tie[i]++;
      eq[i] += share; eq2[i] += share * share;
    }
  }
  return players.map((_, i) => ({
    win: win[i] / trials, tie: tie[i] / trials, equity: eq[i] / trials,
    stderr: Math.sqrt(Math.max(0, eq2[i] / trials - (eq[i] / trials) ** 2) / trials)
  }));
}

/* -- 10. improvement, by draws remaining ----------------------------------- */
function runImprovement(handIn, drawsLeft, dead, DV, trials, seed) {
  const counts = new Float64Array(16);
  let nut = 0, total = 0;
  const blocked = new Uint8Array(52);
  for (const c of (dead || [])) blocked[c] = 1;
  for (const c of handIn) blocked[c] = 1;
  const baseArr = []; for (let c = 0; c < 52; c++) if (!blocked[c]) baseArr.push(c);
  const base = Int32Array.from(baseArr);
  const hand = Int32Array.from(handIn);

  const plan = chooseKeep(hand, drawsLeft, DV);
  const keep = Array.from(UNIQ.slice(0, plan.size));
  const tally = v => { counts[categorize(v)]++; if (v === NUT) nut++; total++; };

  if (plan.discards === 0) {
    tally(evalHand(hand[0], hand[1], hand[2], hand[3], hand[4]));
    return { counts: Array.from(counts), nut, exact: true, plan, keep, outcomes: 1 };
  }

  if (drawsLeft <= 1) {                       /* last draw: exact enumeration */
    const h = new Int32Array(5), k = plan.discards, D = base.length;
    for (let i = 0; i < plan.size; i++) h[i] = keep[i];
    const idx = new Int32Array(5);
    const rec = (start, depth) => {
      if (depth === k) { for (let i = 0; i < k; i++) h[plan.size + i] = base[idx[i]];
        tally(evalHand(h[0], h[1], h[2], h[3], h[4])); return; }
      for (let i = start; i <= D - (k - depth); i++) { idx[depth] = i; rec(i + 1, depth + 1); }
    };
    rec(0, 0);
    for (let i = 0; i < 16; i++) counts[i] /= total;
    return { counts: Array.from(counts), nut: nut / total, exact: true, plan, keep, outcomes: total };
  }

  const rnd = mulberry(seed || 4242);
  const shoe = new Shoe(base, rnd), h = new Int32Array(5);
  for (let t = 0; t < trials; t++) {
    shoe.reset(base);
    for (let i = 0; i < 5; i++) h[i] = handIn[i];
    playOut(h, drawsLeft, DV, shoe);
    tally(evalHand(h[0], h[1], h[2], h[3], h[4]));
  }
  for (let i = 0; i < 16; i++) counts[i] /= total;
  return { counts: Array.from(counts), nut: nut / total, exact: false, plan, keep, outcomes: total };
}

root.Deuce = { evalHand, buildClasses, classIndex, strengthOf, setOpponentDistribution,
  analyze, chooseKeep, buildDrawTable, calibrate, categorize, CATS, NUT, runEquity,
  runImprovement, Shoe, mulberry, playOut, drawOnce, UNIQ,
  get CLASS_VAL() { return CLASS_VAL; }, get CLASS_PCT() { return CLASS_PCT; },
  get CLASS_FREQ() { return CLASS_FREQ; } };

})(typeof self !== 'undefined' ? self : (typeof module !== 'undefined' ? module.exports : this));
