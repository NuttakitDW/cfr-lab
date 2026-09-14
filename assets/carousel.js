/* ============================================================================
   ARTICLE CAROUSEL — nuttakitkundum.com index
   Builds one card per article from the `a.entry` links on the shelves below,
   so the shelves stay the single source of truth. Card art is flat vector
   shapes (no filters), drawn from the article's kind.
   ========================================================================= */

(() => {
  'use strict';

  const FILLS = [
    { cls: 'fc-sapphire', bg: '#16408F', ink: '#F1F3F8', accent: '#CDB892', onAccent: '#080B12' },
    { cls: 'fc-mist',     bg: '#C6D0E3', ink: '#080B12', accent: '#16408F', onAccent: '#F1F3F8' },
    { cls: 'fc-midnight', bg: '#0E1A33', ink: '#F1F3F8', accent: '#4C8DFF', onAccent: '#080B12' },
    { cls: 'fc-tan',      bg: '#CDB892', ink: '#080B12', accent: '#16408F', onAccent: '#F1F3F8' },
    { cls: 'fc-slate',    bg: '#9AA6BC', ink: '#080B12', accent: '#F1F3F8', onAccent: '#080B12' },
  ];
  const TILTS = [-3.2, 2, -1.6, 2.8, -2.4, 1.2, -0.8];
  const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '5', '2'];
  const DISPLAY = 'Inclusive Sans, Helvetica Neue, sans-serif';

  /* deterministic 0..1 noise so every reload draws the same art */
  const seeded = (a, b) => {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const pad = (n) => String(n).padStart(2, '0');

  /* ---- motifs: (index, fill, tag) -> SVG markup in a 252x200 box ------- */

  const bars = (i, c) => [0, 1, 2, 3]
    .map((k) => {
      const h = 34 + k * 24 + Math.round(seeded(i, k) * 28);
      const fill = k === i % 4 ? c.accent : c.ink;
      return `<rect x="${42 + k * 46}" y="${184 - h}" width="30" height="${h}" rx="6" fill="${fill}"/>`;
    })
    .join('');

  const cards = (i, c) => [[34, 82, -10], [99, 62, 3], [165, 84, 12]]
    .map(([x, y, r], k) => {
      const rank = RANKS[(i + k * 3) % RANKS.length];
      const face = k === 1 ? c.accent : c.ink;
      const text = k === 1 ? c.onAccent : c.bg;
      const cx = x + 27;
      const cy = y + 42;
      return `<g transform="rotate(${r} ${cx} ${cy})">`
        + `<rect x="${x}" y="${y}" width="54" height="84" rx="9" fill="${face}"/>`
        + `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="${DISPLAY}" font-weight="600" font-size="34" fill="${text}">${rank}</text>`
        + '</g>';
    })
    .join('');

  const glyph = (i, c, tag) => {
    /* a whole short word ("CFR+", "Deep", "Leduc") or a single initial — never a cut-off word */
    const word = (tag.split(/[\s-]+/)[0] || 'N').replace(/[^A-Za-z0-9+]/g, '') || 'N';
    const text = word.length <= 5 ? word : word[0];
    const size = Math.min(170, Math.round(300 / text.length));
    return `<text x="24" y="182" font-family="${DISPLAY}" font-weight="600" font-size="${size}" letter-spacing="-3" fill="${c.ink}">${esc(text)}</text>`
      + `<circle cx="${204 + (i % 3) * 8}" cy="${54 + (i % 2) * 14}" r="14" fill="${c.accent}"/>`;
  };

  const network = (i, c) => {
    const cols = [[50, [82, 142]], [126, [58, 112, 166]], [202, [82, 142]]];
    const lines = cols.slice(0, -1).flatMap(([x1, ys1], li) => {
      const [x2, ys2] = cols[li + 1];
      return ys1.flatMap((y1) => ys2.map((y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`));
    });
    const nodes = cols.flatMap(([x, ys], li) => ys.map((y, k) => {
      const fill = li === 1 && k === i % 3 ? c.accent : c.ink;
      return `<circle cx="${x}" cy="${y}" r="13" fill="${fill}"/>`;
    }));
    return `<g stroke="${c.ink}" stroke-width="3" opacity=".5">${lines.join('')}</g>${nodes.join('')}`;
  };

  const curve = (i, c) => {
    const drop = 20 + Math.round(seeded(i, 7) * 40);
    return `<line x1="20" y1="122" x2="232" y2="122" stroke="${c.accent}" stroke-width="4" stroke-dasharray="10 8"/>`
      + `<path d="M28 40 C 60 ${120 + drop}, 110 ${176 - drop / 2}, 160 152 S 212 148, 226 150" fill="none" stroke="${c.ink}" stroke-width="10" stroke-linecap="round"/>`
      + `<circle cx="226" cy="150" r="11" fill="${c.ink}"/>`;
  };

  const tree = (i, c) => {
    const root = [126, 44];
    const mid = [[72, 104], [180, 104]];
    const leaves = [[40, 166], [102, 166], [150, 166], [212, 166]];
    const hotLeaf = leaves[i % 4];
    const hotMid = i % 4 < 2 ? mid[0] : mid[1];
    const edges = [[root, mid[0]], [root, mid[1]], [mid[0], leaves[0]], [mid[0], leaves[1]], [mid[1], leaves[2]], [mid[1], leaves[3]]];
    const isHot = ([a, b]) => (a === root && b === hotMid) || (a === hotMid && b === hotLeaf);
    const edgeSvg = edges.map((e) => {
      const hot = isHot(e);
      const [[x1, y1], [x2, y2]] = e;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${hot ? c.accent : c.ink}" stroke-width="${hot ? 7 : 4}" stroke-linecap="round"/>`;
    });
    const nodeSvg = [root, ...mid, ...leaves].map((p) => {
      const hot = p === root || p === hotMid || p === hotLeaf;
      return `<circle cx="${p[0]}" cy="${p[1]}" r="${p === root ? 16 : 12}" fill="${hot ? c.accent : c.ink}"/>`;
    });
    return edgeSvg.join('') + nodeSvg.join('');
  };

  const grid = (i, c) => Array.from({ length: 24 }, (_, n) => {
    const row = Math.floor(n / 6);
    const col = n % 6;
    const v = seeded(i + row * 7, col + 3);
    const hot = v > 0.74;
    return `<rect x="${30 + col * 33}" y="${50 + row * 33}" width="26" height="26" rx="5" fill="${hot ? c.accent : c.ink}" opacity="${hot ? 1 : (0.2 + v * 0.55).toFixed(2)}"/>`;
  }).join('');

  const MOTIFS = {
    paper: [bars], drill: [cards], quiz: [cards], cfr: [tree, glyph], mccfr: [tree],
    metric: [curve, grid], deep: [network, glyph], note: [grid], tool: [grid, glyph], lesson: [glyph],
  };
  const motifFor = (kind, i) => {
    const set = MOTIFS[kind] || [grid];
    return set[i % set.length];
  };

  /* ---- data + cards --------------------------------------------------- */

  const readEntry = (entry) => {
    const shelfName = entry.closest('section.shelf')?.querySelector('.shelf-head h2')?.textContent.trim() ?? '';
    const [name, sub] = (entry.querySelector('h3')?.textContent.trim() ?? '').split(/\s+—\s+/);
    const kindClass = [...entry.classList].find((k) => k.startsWith('k-'));
    return {
      href: entry.getAttribute('href'),
      external: entry.getAttribute('target') === '_blank',
      name,
      claim: sub || shelfName,
      tag: entry.querySelector('.kind')?.textContent.trim() ?? '',
      kind: kindClass ? kindClass.slice(2) : 'tool',
    };
  };

  const buildCard = (item, i) => {
    const fill = FILLS[i % FILLS.length];
    const art = motifFor(item.kind, i)(i, fill, item.tag);
    const li = document.createElement('li');
    const a = document.createElement('a');
    li.className = 'carousel-item';
    a.className = `fan-card ${fill.cls}`;
    a.href = item.href;
    if (item.external) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.style.setProperty('--tilt', `${TILTS[i % TILTS.length]}deg`);
    a.innerHTML = '<div class="fc-head"><span class="fc-tag"></span><span class="fc-name"></span><p class="fc-claim"></p></div>'
      + `<div class="fc-img"><svg viewBox="0 0 252 200" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${art}</svg></div>`;
    a.querySelector('.fc-tag').textContent = item.tag;
    a.querySelector('.fc-name').textContent = item.name;
    a.querySelector('.fc-claim').textContent = item.claim;
    li.append(a);
    return li;
  };

  /* ---- controls ------------------------------------------------------- */

  const wire = (root, track, total) => {
    const prev = root.querySelector('[data-dir="-1"]');
    const next = root.querySelector('[data-dir="1"]');
    const status = root.querySelector('[data-carousel-status]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* distance between two card starts; 0 until the track is laid out as a row
       (iOS Safari can run this before site.css applies, when cards still stack) */
    const step = () => {
      const [a, b] = track.children;
      if (!a || !b) return 0;
      const s = b.getBoundingClientRect().left - a.getBoundingClientRect().left;
      return Number.isFinite(s) && s > 0 ? s : 0;
    };
    const perView = (s) => {
      const padInline = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      return Math.max(1, Math.floor((track.clientWidth - padInline * 2 + 16) / s));
    };
    const update = () => {
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      const s = step();
      const first = s ? Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / s))) : 0;
      const last = s ? Math.min(total, first + perView(s)) : 1;
      const range = last > first + 1 ? `${pad(first + 1)}–${pad(last)}` : pad(first + 1);
      status.textContent = `${range} / ${pad(total)}`;
    };
    const go = (dir) => {
      const s = step();
      if (!s) return;
      track.scrollBy({ left: dir * perView(s) * s, behavior: reduced ? 'auto' : 'smooth' });
    };

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    track.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      go(e.key === 'ArrowLeft' ? -1 : 1);
    });

    /* re-measure whenever layout settles. `load` waits for every stylesheet, and
       reading layout inside these callbacks forces a fresh layout, so update runs
       directly rather than waiting on an animation frame. */
    if ('ResizeObserver' in window) new ResizeObserver(() => update()).observe(track);
    window.addEventListener('load', () => update());
    document.fonts?.ready.then(() => update());
    update();
  };

  const init = () => {
    const root = document.querySelector('[data-carousel]');
    if (!root) return;
    const track = root.querySelector('.carousel-track');
    const items = [...document.querySelectorAll('main a.entry')].map(readEntry);
    if (!track || items.length === 0) return;

    track.replaceChildren(...items.map(buildCard));
    root.hidden = false;
    wire(root, track, items.length);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
