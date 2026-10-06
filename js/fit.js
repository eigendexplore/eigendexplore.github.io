// Fit-to-width for the hero's one-line rows (the author lines, the link buttons). The row's real extent is measured
// with a Range over its contents (scrollWidth misses the overflow on the left of a centred row, and Safari and Chrome
// differ there), the font is scaled down until the row fits, then re-measured and nudged again, so it fits in whatever
// font the device actually renders. If even the floor size cannot fit, the row falls back to its wrapped layout.
function extent(row) {
  const r = document.createRange();
  r.selectNodeContents(row);
  return r.getBoundingClientRect().width;
}

// spare: room (in em of the fitted font) kept free on every line (the authors keep room for an opened name's capsule)
function fitRow({ box, rows, prop, max, min, onFail, onOk, spare = 0 }) {
  onOk();
  box.style.setProperty(prop, `${max}px`);
  const avail = box.clientWidth - 2;                  // a hair of margin for subpixel rounding
  let f = max;
  const need = () => Math.max(...rows.map(extent)) + spare * f;
  for (let i = 0; i < 4 && need() > avail; i++) {     // scale, re-measure (kerning and rounding are not linear)
    f = Math.floor(f * avail / need() * 20) / 20 - 0.05;
    if (f < min) { box.style.setProperty(prop, `${max}px`); onFail(); return false; }
    box.style.setProperty(prop, `${f.toFixed(2)}px`);
  }
  return true;
}

function watch(box, fit) {
  fit();
  document.fonts?.ready.then(fit);
  let lastW = box.clientWidth;                         // refit on width changes only (a font change alters the height)
  new ResizeObserver(() => { if (box.clientWidth !== lastW) { lastW = box.clientWidth; fit(); } }).observe(box);
}

export function fitHero(root = document) {
  // authors: two lines (the four first authors, the three professors) from 15 px down to 13.5 px, each line keeping
  // room for an opened name's capsule (js/authors.js: photo + padding, 3.2 em, 2.8 em on phones); where that would take
  // the names smaller (phones), three lines (the first two authors, the next two, the professors), 15 px down to 10.5 px
  const authors = root.querySelector('.authors');
  if (authors) {
    const rows = [...authors.querySelectorAll('.arow')];
    watch(authors, () => {
      const SPARE = innerWidth < 600 ? 2.8 : 3.2;          // the capsule is a little more compact on phones (css: .au.open)
      if (fitRow({ box: authors, rows, prop: '--af', max: 15, min: 13.5, spare: SPARE, onOk: () => authors.classList.remove('stack'), onFail: () => {} })) return;
      fitRow({ box: authors, rows, prop: '--af', max: 15, min: 10.5, spare: SPARE, onOk: () => authors.classList.add('stack'), onFail: () => {} });
    });
  }
  // links: one row of five buttons, 14 px down to 11 px; otherwise they wrap
  const links = root.querySelector('.links');
  if (links) {
    watch(links, () => fitRow({ box: links, rows: [links], prop: '--lf', max: 14, min: 11,
      onOk: () => links.classList.add('one-row'), onFail: () => links.classList.remove('one-row') }));
  }
}
