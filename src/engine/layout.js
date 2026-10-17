// 문구 -> 글자 배치(자동 간격) -> SVG
import { getGlyph, BAND } from './glyphs.js';
import { union, closing, offset, difference, transform, bbox, polysToPath, tidy } from './geom.js';

function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// 두 글자 사이 간격: 가로 띠마다 앞 글자의 오른쪽 끝과 뒤 글자의 왼쪽 끝을 비교
function placeAfter(A, ax, B, gap) {
  let need = -Infinity;
  for (const [b, [bmin]] of B.prof) {
    for (let k = b - 1; k <= b + 1; k++) {
      const a = A.prof.get(k);
      if (a) need = Math.max(need, ax + a[1] - bmin + gap);
    }
  }
  const bboxNeed = ax + A.x1 - B.x0 + gap;
  let bx = Number.isFinite(need) ? need : bboxNeed;
  // 너무 깊이 파고들지 않도록: 뒤 글자 왼쪽이 앞 글자 폭의 30% 지점보다 앞으로 오지 않게
  bx = Math.max(bx, ax + A.x0 + (A.x1 - A.x0) * 0.3 - B.x0);
  // 한글끼리는 음절 상자 기준 고정폭 (자모가 음절 사이로 흩어지지 않게)
  if (A.hangul && B.hangul) bx = ax + A.boxW * 0.94 + gap * 0.4;
  return bx;
}

/**
 * opts: { tracking(단위), leading(배수), align, alternates, jitter, generatedOnly }
 */
export function layout(text, st, opts = {}) {
  const { tracking = 0, leading = 1, align = 'center', alternates = true, jitter = true, generatedOnly = false } = opts;
  const lines = text.replace(/\r/g, '').split('\n');
  const counts = {};
  const lineH = (st.cap - st.dsc + st.lineGap) * leading;
  const out = [];
  let gi = 0;
  lines.forEach((line, li) => {
    const items = [];
    let prev = null, px = 0, pendingSpace = 0;
    for (const ch of line) {
      if (ch === ' ' || ch === '\t' || ch === '　') {
        pendingSpace += (ch === '\t' ? 4 : 1) * (st.space + tracking);
        continue;
      }
      const n = counts[ch] = (counts[ch] || 0) + 1;
      const g = getGlyph(st, ch, { variant: alternates ? n - 1 : 0, generated: generatedOnly });
      if (!g) { pendingSpace += st.space * 0.6; continue; }
      let x;
      if (!prev) x = -g.x0 + pendingSpace;
      else if (pendingSpace) x = px + prev.x1 - g.x0 + pendingSpace;
      else x = placeAfter(prev, px, g, st.gap + tracking);
      pendingSpace = 0;
      const j = jitter && st.jitter ? st.jitter : null;
      const r1 = rand(gi * 2 + 1), r2 = rand(gi * 2 + 2);
      items.push({
        ch, g, x, y: li * lineH + (j ? (r1 - 0.5) * 2 * j.dy : 0),
        rot: j && !g.drawn ? ((r2 - 0.5) * 2 * j.rot * Math.PI) / 180 : 0,
      });
      prev = g; px = x; gi++;
    }
    const w = items.length ? items[items.length - 1].x + items[items.length - 1].g.x1 + pendingSpace : 0;
    out.push({ items, w, y: li * lineH });
  });
  const maxW = Math.max(0, ...out.map((l) => l.w));
  for (const l of out) {
    const shift = align === 'center' ? (maxW - l.w) / 2 : align === 'right' ? maxW - l.w : 0;
    for (const it of l.items) it.x += shift;
  }
  return { lines: out, width: maxW, lineH };
}

function placed(it) {
  const { g } = it;
  const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
  return transform(g.polys, { dx: it.x, dy: it.y, rot: it.rot, cx, cy });
}

/** 배치 결과 -> 레이어 목록 [{d, fill}] + 전체 영역 */
export function compose(L, st, opts = {}) {
  const { merge = true, halo = true, box = !!st.box, knock = !!st.koKnock, pad = 120 } = opts;
  const layers = [];
  const all = [];
  const fg = [], ko = [];
  for (const line of L.lines) {
    let polysLine = line.items.map((it) => ({ it, P: placed(it) }));
    if (st.halo && halo) {
      // 뒤 글자일수록 위: 앞 글자에서 뒤 글자 + 틈(halo)만큼 깎아 낸다
      for (let i = 0; i < polysLine.length; i++) {
        const later = [];
        for (let k = i + 1; k < Math.min(polysLine.length, i + 4); k++) later.push(...polysLine[k].P);
        if (later.length) polysLine[i].P = tidy(difference(polysLine[i].P, offset(union(later), st.halo)), { close: 0, open: 6, minArea: 900 });
      }
    }
    if (st.merge && merge) {
      const u = tidy(closing(union(polysLine.flatMap((x) => x.P)), st.merge * st.brush.R));
      fg.push(...u);
    } else {
      for (const { it, P } of polysLine) (knock && box && it.g.hangul ? ko : fg).push(...P);
    }
    for (const { P } of polysLine) all.push(...P);
  }
  const bb = all.length ? bbox(all) : { x0: 0, y0: 0, x1: 100, y1: 100 };
  let vb = { x: bb.x0 - pad, y: bb.y0 - pad, w: bb.x1 - bb.x0 + pad * 2, h: bb.y1 - bb.y0 + pad * 2 };
  if (box && all.length) {
    const bx = { x: bb.x0 - pad * 0.9, y: bb.y0 - pad * 0.9, w: bb.x1 - bb.x0 + pad * 1.8, h: bb.y1 - bb.y0 + pad * 1.8 };
    const rect = [[bx.x, bx.y], [bx.x + bx.w, bx.y], [bx.x + bx.w, bx.y + bx.h], [bx.x, bx.y + bx.h]];
    layers.push({ role: 'box', d: polysToPath(ko.length ? difference([rect], union(ko)) : [rect], 1, false) });
    vb = { x: bx.x - pad, y: bx.y - pad, w: bx.w + pad * 2, h: bx.h + pad * 2 };
  } else if (ko.length) fg.push(...ko);
  layers.push({ role: 'ink', d: polysToPath(fg, 1, true) });
  return { layers, vb };
}

export function toSVG(C, { ink = '#000', paper = '#fff', boxColor = '#fff', transparent = false, width } = {}) {
  const { vb } = C;
  const w = width || Math.round(vb.w / 4), h = Math.round((w * vb.h) / vb.w);
  const bg = transparent ? '' : `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${paper}"/>`;
  const body = C.layers.map((l) => `<path d="${l.d}" fill="${l.role === 'box' ? boxColor : ink}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x.toFixed(0)} ${vb.y.toFixed(0)} ${vb.w.toFixed(0)} ${vb.h.toFixed(0)}" width="${w}" height="${h}">${bg}${body}</svg>`;
}
