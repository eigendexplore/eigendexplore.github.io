// Justified prose in the glass bubbles is hyphenated where a line would otherwise open wide gaps (narrow phones), but
// never inside a name: these terms are wrapped in <span class="nohy"> so the browser cannot break them.
const TERMS = ['EigenDEXplore', 'Eigen-Residual', 'Eigen-Space', 'Joint-Space', 'SimToolReal', 'DeXtreme', 'DexMachina',
  'EgoSuite', 'Sharpa', 'Allegro', 'KUKA', 'iiwa14', 'Standard RL', 'Stanford', 'REALab', 'IPRL', 'NSERC', 'Tyler Ga Wei Lum'];
const RE = new RegExp(`(${TERMS.map(t => t.replace(/[-]/g, '\\-')).join('|')})`, 'g');

export function protect(root) {
  if (!root) return;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement.closest('.nohy') || !RE.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const n of nodes) {
    RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = RE.exec(n.nodeValue))) {
      if (m.index > last) frag.append(n.nodeValue.slice(last, m.index));
      const s = document.createElement('span'); s.className = 'nohy'; s.textContent = m[0]; frag.append(s);
      last = m.index + m[0].length;
    }
    if (last < n.nodeValue.length) frag.append(n.nodeValue.slice(last));
    n.replaceWith(frag);
  }
}

export const JUSTIFIED = '.tldr, .glass.panel p:not(.eqline):not(.dims):not(.tag):not(.score-note)';
export function protectAll(root = document) { root.querySelectorAll(JUSTIFIED).forEach(protect); }
