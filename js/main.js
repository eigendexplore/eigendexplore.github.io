// Bootstrap: section 1 starts right away (no 3D library needed until the 3D replay is opened), section 2 loads
// three.js, the hand model and the PCA basis only when it comes within a screen of the viewport.
import { glassify } from './glass.js';
import { initSprites } from './sprites.js';
import { fitHero } from './fit.js';
import { protectAll } from './typeset.js';
import { fitStage, fitS2, fitS3, fitS4, fitS5 } from './stage.js';
import { initAuthors } from './authors.js';
import { initBibtex } from './bibtex.js';
import { quiet } from './idle.js';
import { LITE } from './lite.js';
import { levelResets } from './resetview.js';

glassify(document);
initSprites().catch(e => console.error('sprites', e));
protectAll();
fitHero();
try { initAuthors(); } catch (e) { console.error('authors', e); }        // a decoration: it must never stop the page
try { initBibtex(); } catch (e) { console.error('bibtex', e); }
fitStage();
fitS2();
fitS3();
fitS4();
fitS5();
levelResets();
// smooth wheel scrolling only where there is a mouse or trackpad (phones never load it)
if (matchMedia('(hover: hover) and (pointer: fine)').matches)
  import('./smoothscroll.js').then(m => m.initSmoothScroll()).catch(e => console.error('smooth scroll', e));
const s1 = import('./s1.js');
s1.then(m => m.init()).catch(e => console.error('section 1', e));

// Sections 2 and Fig. 1 warm up in the background once the top of the page has loaded, in quiet moments (js/idle.js:
// never on top of a tap or a scroll), so they are ready when the reader arrives; coming near them first starts them at
// once. Their render loops only run while on screen.
const s2 = document.getElementById('idea'), fig1 = document.getElementById('fig1');
let s2Started = false, f1Started = false;
function startFig1() {
  if (f1Started) return; f1Started = true; f1io.disconnect();
  import('./fig1.js').then(m => m.initFig1()).catch(e => console.error('fig 1', e))
    .then(() => LITE || quiet(startS3));
}
// section 3 (training): the same way, after Fig. 1; last of all, section 1's 3D replay is made ready
const s3el = document.getElementById('training');
let s3Started = false;
function startS3() {
  if (s3Started) return; s3Started = true; s3io.disconnect();
  import('./s3.js').then(m => m.init()).catch(e => { console.error('section 3', e); document.getElementById('s3loading').textContent = 'The training replay could not start in this browser.'; })
    .then(() => LITE || quiet(startS4))
    .then(() => LITE || quiet(() => s1.then(m => m.prewarm3d()), { after: 1500 }));
}
// section 4 (the real cube): light (no 3D library, a small data file); the same way, after section 3
const s4el = document.getElementById('reorient');
let s4Started = false;
function startS4() {
  if (s4Started) return; s4Started = true; s4io.disconnect();
  return import('./s4.js').then(m => m.init()).catch(e => console.error('section 4', e))
    .then(() => LITE || quiet(startS5));
}
// section 5 (DexMachina, SPIDER): its data and, quietly, its 3D; after section 4, or as soon as the reader comes near
const s5el = document.getElementById('hands');
let s5Started = false;
function startS5() {
  if (s5Started) return; s5Started = true; s5io.disconnect();
  return import('./s5.js').then(m => m.init()).catch(e => console.error('section 5', e));
}
const s5io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) startS5(); }, { rootMargin: '900px 0px' });
s5io.observe(s5el);
const s4io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) startS4(); }, { rootMargin: '900px 0px' });
s4io.observe(s4el);
const s3io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) startS3(); }, { rootMargin: '900px 0px' });
s3io.observe(s3el);
function start(force) {
  if (s2Started) return;
  const r = s2.getBoundingClientRect();
  if (!force && (r.top > innerHeight + 900 || r.bottom < -900)) return;
  s2Started = true; io.disconnect(); removeEventListener('scroll', onScroll);
  import('./s2.js').then(m => m.init()).then(() => LITE || quiet(startFig1))
    .catch(e => { console.error('section 2', e); document.getElementById('s2loading').textContent = 'The live scene could not start in this browser.'; });
}
const onScroll = () => start(false);
const io = new IntersectionObserver(() => start(false), { rootMargin: '900px 0px' });
io.observe(s2);
addEventListener('scroll', onScroll, { passive: true });
start(false);
const f1io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) startFig1(); }, { rootMargin: '100% 0px' });
f1io.observe(fig1);
const warm = () => quiet(() => start(true), { delay: 1200 });       // after section 1 has started its own footage
if (!LITE) { if (document.readyState === 'complete') warm(); else addEventListener('load', warm, { once: true }); }
