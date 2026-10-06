// Authors: a name opens in place into the video end card's contact capsule (credits.py _contact_a: dark Liquid Glass,
// the photo as a round thumbnail at its left, the name in white). The photo grows out of the name's left edge and the
// line makes room smoothly (js/fit.js keeps that room free on every line, so nothing hangs off a phone's edge). Mouse:
// on hover (a click opens the homepage). Touch: the first tap opens it, a second tap opens the homepage, a tap
// elsewhere closes it.
const FACE = { 'Harsh Gupta': 'harsh_gupta', 'Tyler Ga Wei Lum': 'tyler_lum', 'Changhao Wang': 'changhao_wang', 'Chuer Pan': 'chuer_pan',
  'Karen Liu': 'karen_liu', 'Jeannette Bohg': 'jeannette_bohg', 'Shuran Song': 'shuran_song' };

export function initAuthors() {
  const box = document.querySelector('.authors'); if (!box) return;
  const aus = [...box.querySelectorAll('.au')].filter(au => FACE[au.querySelector('a')?.textContent.trim()]);
  const touch = matchMedia('(hover: none)').matches;
  const face = au => `assets/authors/${FACE[au.querySelector('a').textContent.trim()]}.webp`;
  aus.forEach(au => {
    const ph = document.createElement('span'); ph.className = 'au-ph'; ph.setAttribute('aria-hidden', 'true');
    ph.innerHTML = `<img alt="" src="${face(au)}" width="64" height="64" decoding="async">`; au.prepend(ph);
  });
  let openAu = null;
  const open = au => { if (openAu === au) return; close(); openAu = au; au.classList.add('open'); };
  const close = () => { if (openAu) openAu.classList.remove('open'); openAu = null; };
  aus.forEach(au => {
    const a = au.querySelector('a');
    if (!touch) { au.addEventListener('mouseenter', () => open(au)); au.addEventListener('mouseleave', close); a.addEventListener('focus', () => open(au)); a.addEventListener('blur', close); }
    a.addEventListener('click', e => { if (touch && openAu !== au) { e.preventDefault(); open(au); } });
  });
  if (touch) document.addEventListener('pointerdown', e => { if (openAu && !openAu.contains(e.target)) close(); });
  let lastW = innerWidth;                                  // phones fire resize when their bars move: only a new width re-lays the names
  addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; close(); } });
}
