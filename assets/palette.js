/* ============================================================================
   COMMAND PALETTE — nuttakitkundum.com
   Cmd/Ctrl+K or "/" opens a search over every article on the index. Entries
   are read from the index's `a.entry` links, so the shelves stay the single
   source of truth; on other pages the index is fetched once.
   ========================================================================= */

(() => {
  'use strict';

  const MAX_RESULTS = 40;
  const root = document.getElementById('cp');
  const trigger = document.getElementById('cp-trigger');
  if (!root || !trigger) return;

  const input = root.querySelector('input');
  const list = root.querySelector('.cp-results');
  const empty = root.querySelector('.cp-empty');
  let entries = null;
  let shown = [];
  let active = 0;

  const toEntry = (a) => ({
    href: a.getAttribute('href'),
    title: (a.querySelector('h3')?.textContent || '').trim(),
    kind: (a.querySelector('.kind')?.textContent || '').trim(),
    text: a.textContent.toLowerCase(),
  });

  const loadEntries = async () => {
    if (entries) return entries;
    const local = [...document.querySelectorAll('a.entry')].filter((a) => a.querySelector('h3'));
    if (local.length && location.pathname === '/') {
      entries = local.map(toEntry);
      return entries;
    }
    try {
      const res = await fetch('/', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      entries = [...doc.querySelectorAll('a.entry')].filter((a) => a.querySelector('h3')).map(toEntry);
    } catch (err) {
      console.error('[palette]', err);
      entries = local.map(toEntry);
    }
    return entries;
  };

  const option = (e, i) => {
    const a = document.createElement('a');
    a.href = e.href;
    a.setAttribute('role', 'option');
    a.setAttribute('aria-selected', String(i === active));
    a.textContent = e.title;
    const meta = document.createElement('span');
    meta.textContent = `${e.kind.toLowerCase()}  ${e.href}`;
    a.prepend(meta);
    a.addEventListener('mousemove', () => { if (active !== i) { active = i; paint(); } });
    const li = document.createElement('li');
    li.append(a);
    return li;
  };

  const paint = () => {
    list.replaceChildren(...shown.map(option));
    empty.hidden = shown.length > 0;
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };

  const filter = () => {
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = (entries || []).filter((e) => terms.every((t) => e.text.includes(t))).slice(0, MAX_RESULTS);
    active = 0;
    paint();
  };

  const open = async () => {
    root.hidden = false;
    input.value = '';
    input.focus();
    await loadEntries();
    filter();
  };
  const close = () => { root.hidden = true; trigger.focus(); };
  const move = (d) => {
    if (!shown.length) return;
    active = (active + d + shown.length) % shown.length;
    paint();
  };

  trigger.addEventListener('click', open);
  root.querySelector('.cp-backdrop').addEventListener('click', close);
  input.addEventListener('input', filter);

  document.addEventListener('keydown', (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); root.hidden ? open() : close(); return; }
    if (root.hidden) { if (ev.key === '/' && !typing) { ev.preventDefault(); open(); } return; }
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowDown' || (ev.ctrlKey && ev.key === 'j')) { ev.preventDefault(); move(1); }
    else if (ev.key === 'ArrowUp' || (ev.ctrlKey && ev.key === 'k')) { ev.preventDefault(); move(-1); }
    else if (ev.key === 'Enter' && shown[active]) { ev.preventDefault(); location.href = shown[active].href; }
  });
})();
