/* Sort control for the index. Shelves in index.html stay the source of truth
   (no-JS view, palette.js); this moves the same `a.entry` nodes into one flat
   list ordered by date added, or back into their shelves. */
(() => {
  const bar = document.querySelector('.sortbar');
  const jump = document.querySelector('.jump');
  const shelves = [...document.querySelectorAll('section.shelf')];
  if (!bar || !shelves.length) return;

  const KEY = 'index-sort';
  const DEFAULT = 'newest';
  const entries = shelves.flatMap((sec) =>
    [...sec.querySelectorAll('a.entry')].map((el) => ({ el, grid: sec.querySelector('.card-grid') })));
  const text = (e, sel) => (e.el.querySelector(sel)?.textContent || '').trim().toLowerCase();

  const flat = document.createElement('div');
  flat.className = 'card-grid';
  flat.id = 'flat';
  shelves[0].before(flat);

  const sorters = {
    newest: (a, b) => b.el.dataset.added.localeCompare(a.el.dataset.added),
    oldest: (a, b) => a.el.dataset.added.localeCompare(b.el.dataset.added),
    title: (a, b) => text(a, 'h3').localeCompare(text(b, 'h3')),
    kind: (a, b) => text(a, '.kind').localeCompare(text(b, '.kind')) || b.el.dataset.added.localeCompare(a.el.dataset.added),
  };

  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } };

  const apply = (mode) => {
    const grouped = mode === 'shelf';
    if (grouped) {
      entries.forEach((e) => e.grid.append(e.el));
    } else {
      // Array.sort is stable, so ties keep shelf order.
      [...entries].sort(sorters[mode]).forEach((e) => flat.append(e.el));
    }
    flat.hidden = grouped;
    shelves.forEach((s) => { s.hidden = !grouped; });
    if (jump) jump.hidden = !grouped;
    bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === mode)));
    const count = document.getElementById('sort-count');
    if (count) count.textContent = `${entries.length} entries`;
  };

  bar.addEventListener('click', (ev) => {
    const mode = ev.target.closest('button[data-sort]')?.dataset.sort;
    if (!mode) return;
    write(mode);
    apply(mode);
  });

  // Section links (#quant, header nav) need the shelves visible.
  const revealShelf = () => {
    const target = location.hash && document.querySelector(location.hash);
    if (target?.matches('section.shelf') && target.hidden) {
      apply('shelf');
      target.scrollIntoView();
    }
  };
  window.addEventListener('hashchange', revealShelf);

  const saved = read();
  apply(saved && (saved === 'shelf' || sorters[saved]) ? saved : DEFAULT);
  revealShelf();
})();
