import { STYLES } from '../src/engine/styles.js';
import { layout, compose, toSVG } from '../src/engine/layout.js';
import { registerDrawn } from '../src/engine/glyphs.js';
import ALL from '../src/data/drawn.json';
for (const [id, list] of Object.entries(ALL)) registerDrawn(id, list);
const t = 'Fantastic Planet Hello';
for (const st of STYLES) {
  const r = [];
  for (let k = 0; k < 3; k++) {
    const a = performance.now(); const L = layout(t + k, st); const b = performance.now();
    const C = compose(L, st); const c = performance.now(); const s = toSVG(C); const d = performance.now();
    r.push(`${(b - a) | 0}/${(c - b) | 0}/${(d - c) | 0}ms ${(s.length / 1024) | 0}KB`);
  }
  console.log(st.id, r.join(' | '));
}
