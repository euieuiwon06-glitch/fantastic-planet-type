// 엔진 시험 렌더: 스타일별로 여러 문구를 SVG로 뽑아 HTML 한 장에 모은다
import { STYLES } from '../src/engine/styles.js';
import { layout, compose, toSVG } from '../src/engine/layout.js';
import fs from 'node:fs';
const texts = (process.env.TEXTS || 'Fantastic Planet|abcdefghijklm|nopqrstuvwxyz|ABCDEFGHIJKLM|NOPQRSTUVWXYZ|0123456789 !?&|판타스틱 플래닛').split('|');
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const gen = !!process.env.GEN;
let html = '<html><body style="margin:0;padding:16px;background:#eee;font:14px sans-serif">';
for (const st of STYLES) {
  if (only && !only.includes(st.id)) continue;
  html += `<div style="background:#fff;margin:0 0 12px;padding:8px"><b>${st.id} ${st.name}</b><br>`;
  for (const t of texts) {
    const t0 = Date.now();
    const L = layout(t, st, { generatedOnly: gen });
    const C = compose(L, st);
    html += toSVG(C, { width: Math.min(1700, Math.round(C.vb.w / 4.2)) }).replace('<svg ', '<svg style="display:block;margin:4px 0;max-width:100%;height:auto" ');
    process.stderr.write(`${st.id} ${t.slice(0, 12)} ${Date.now() - t0}ms\n`);
  }
  html += '</div>';
}
fs.writeFileSync(process.env.OUT || 'work/proof.html', html + '</body></html>');
