// BibTeX: the hero's button pops up a light glass card with the entry and a Copy button. The card floats over the page
// (nothing below moves), grows out of the button, and closes on a tap outside, Esc, or the button again. Phones: the
// card fits the screen and the entry scrolls sideways inside it.
// The entry is arXiv's own record (arxiv.org/bibtex/2610.07681), with the short key and the title's capitals kept.
const ENTRY = `@misc{gupta2026eigendexplore,
  title         = {{EigenDEXplore}: Structured Exploration for Dexterous Manipulation with Human Priors},
  author        = {Gupta, Harsh and Lum, Tyler Ga Wei and Wang, Changhao and Pan, Chuer and Liu, C. Karen and Bohg, Jeannette and Song, Shuran},
  year          = {2026},
  eprint        = {2610.07681},
  archivePrefix = {arXiv},
  primaryClass  = {cs.RO},
  url           = {https://arxiv.org/abs/2610.07681}
}`;
const EASE = 'cubic-bezier(.45, 0, .2, 1)';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initBibtex() {
  const btn = document.getElementById('bibBtn'); if (!btn) return;
  const card = document.createElement('div');
  card.className = 'bib-card'; card.id = 'bibCard'; card.hidden = true;
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'BibTeX citation');
  card.innerHTML = `<div class="bib-head"><span>BibTeX</span><button type="button" class="bib-copy">Copy</button></div><pre class="bib-pre"><code></code></pre>`;
  // one block per line: wide screens wrap a long field under its value (a hanging indent), phones scroll sideways
  card.querySelector('code').append(...ENTRY.split('\n').map(l => Object.assign(document.createElement('span'), { className: 'l', textContent: l })));
  document.body.appendChild(card);
  const copyBtn = card.querySelector('.bib-copy');
  let open = false, anim = null, copiedT = 0;

  function place() {                                       // under the row of links, centred on it, inside the screen
    const r = btn.getBoundingClientRect(), row = (btn.closest('.links') || btn).getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(700, vw - 32);
    const left = Math.min(Math.max(row.left + row.width / 2 - w / 2, 16), vw - 16 - w);
    Object.assign(card.style, { width: `${w}px`, left: `${left + scrollX}px`, top: `${r.bottom + scrollY + 10}px` });
    card.style.transformOrigin = `${r.left + r.width / 2 - left}px 0`;    // it grows out of the button
  }
  function show(on) {
    if (on === open) return; open = on;
    btn.setAttribute('aria-expanded', on);
    anim?.cancel();
    if (on) { card.hidden = false; place(); }
    const kf = [{ opacity: 0, transform: 'translateY(-6px) scale(.96)' }, { opacity: 1, transform: 'none' }];
    anim = card.animate(on ? kf : kf.slice().reverse(), { duration: reduced ? 0 : on ? 260 : 200, easing: EASE, fill: 'forwards' });
    anim.onfinish = () => { anim = null; if (!open) card.hidden = true; };
  }
  btn.addEventListener('click', e => { e.preventDefault(); show(!open); });
  document.addEventListener('pointerdown', e => { if (open && !card.contains(e.target) && !btn.contains(e.target)) show(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && open) { show(false); btn.focus(); } });
  addEventListener('resize', () => { if (open) place(); });

  copyBtn.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(ENTRY); ok = true; } catch {
      const t = Object.assign(document.createElement('textarea'), { value: ENTRY }); t.style.cssText = 'position:fixed;opacity:0';   // older browsers
      document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } t.remove();
    }
    copyBtn.textContent = ok ? 'Copied' : 'Select and copy';
    clearTimeout(copiedT); copiedT = setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
  });
}
