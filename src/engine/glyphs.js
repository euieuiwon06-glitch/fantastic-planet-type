// 글자 -> 폴리곤. 스케치에 직접 그린 글자가 있으면 그것(대체 글자 포함)을, 없으면 뼈대+붓으로 생성.
import { LATIN, LATIN_METRICS } from './skeleton.js';
import { hangulStrokes, isHangul } from './hangul.js';
import { renderStrokes } from './brush.js';
import { pathToPolys, bbox } from './geom.js';
import DRAWN from '../data/drawn.json';

const cache = new Map();
const BAND = 20;

const CAPISH = /[A-Z0-9!?'"()[\]/\\&@#%*’‘“”★♡]/;

function latinStrokes(st, ch) {
  const g = LATIN[ch];
  if (!g) return null;
  const { XH, CAP, ASC, DSC } = LATIN_METRICS;
  const cap = CAPISH.test(ch);
  const ky = st.cap / CAP;
  const up = (st.asc - XH) / (ASC - XH);
  const dn = st.dsc / DSC;
  // 대문자·숫자는 통째로 비례 확대(가로는 완만하게), 소문자는 엑스하이트 고정 + 어센더/디센더만 늘림
  const sx = cap ? st.sx * Math.pow(ky, 0.42) : st.sx;
  const my = cap ? (y) => (y < 0 ? y * Math.max(1, dn) : y * ky)
                 : (y) => (y > XH ? XH + (y - XH) * up : y < 0 ? y * dn : y);
  return g.s.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * sx, -my(y)]) }));
}

// 한글 음절 크기: 대문자·어센더 중 낮은 쪽 기준 (가시 스타일의 아주 긴 대문자에 끌려가지 않게)
const koSize = (st) => Math.min(st.cap, st.asc + 40) * 0.92 * st.ko_.size;

function koStrokes(st, ch) {
  const size = koSize(st);
  const k = size / 1000;
  return hangulStrokes(ch).map((s) => ({
    ...s, rs: (s.rs || 1) * st.ko_.rs,
    pts: s.pts.map(([x, y]) => [x * k * st.ko_.sx, -(y * k - 0.07 * size)]),
  }));
}

function profile(polys) {
  // 가로 띠별 잉크 좌우 끝 (글자 간격 자동 계산용)
  const prof = new Map();
  const put = (b, x) => {
    const v = prof.get(b);
    if (!v) prof.set(b, [x, x]); else { if (x < v[0]) v[0] = x; if (x > v[1]) v[1] = x; }
  };
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
      const b0 = Math.floor(Math.min(y0, y1) / BAND), b1 = Math.floor(Math.max(y0, y1) / BAND);
      for (let b = b0; b <= b1; b++) {
        const yc = Math.min(Math.max((b + 0.5) * BAND, Math.min(y0, y1)), Math.max(y0, y1));
        const t = y1 === y0 ? 0 : (yc - y0) / (y1 - y0);
        put(b, x0 + (x1 - x0) * t);
      }
    }
  }
  return prof;
}

function finish(polys, extra = {}) {
  const bb = bbox(polys);
  return { polys, ...bb, prof: profile(polys), ...extra };
}

export function drawnVariants(styleId, ch) {
  const list = DRAWN[styleId];
  if (!list) return 0;
  return list.filter((g) => g.ch === ch).length;
}

/**
 * opts.variant: 그린 글자의 몇 번째 변형을 쓸지 (없으면 0)
 * opts.generated: true면 그린 글자를 무시하고 생성 글자만
 */
export function getGlyph(st, ch, { variant = 0, generated = false } = {}) {
  const nv = generated ? 0 : drawnVariants(st.id, ch);
  const v = nv ? variant % nv : 0;
  const key = `${st.id}|${ch}|${nv ? 'd' + v : 'g'}`;
  if (cache.has(key)) return cache.get(key);
  let g = null;
  if (nv) {
    const src = DRAWN[st.id].filter((x) => x.ch === ch)[v];
    g = finish(pathToPolys(src.d, 6), { drawn: true });
  } else if (isHangul(ch)) {
    const strokes = koStrokes(st, ch);
    const B = st.ko_.brush ? { ...st.brush, ...st.ko_.brush, ends: { ...st.brush.ends, ...(st.ko_.brush.ends || {}) } } : st.brush;
    const polys = renderStrokes(strokes, B, ch.codePointAt(0));
    const W = koSize(st) * st.ko_.sx;
    g = finish(polys, { hangul: true, boxW: W });
  } else {
    let base = ch;
    if (!LATIN[base]) {
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      base = LATIN[plain] ? plain : LATIN[ch.toLowerCase()] ? ch.toLowerCase() : LATIN[ch.toUpperCase()] ? ch.toUpperCase() : null;
    }
    if (!base) return null;
    if (base !== ch && !generated && drawnVariants(st.id, base)) return getGlyph(st, base, { variant, generated });
    const strokes = latinStrokes(st, base);
    const polys = renderStrokes(strokes, st.brush, [...base].reduce((a, c) => a + c.codePointAt(0), 0));
    g = finish(polys, { generated: true });
  }
  cache.set(key, g);
  return g;
}

export function clearGlyphCache() { cache.clear(); }
export { BAND };
