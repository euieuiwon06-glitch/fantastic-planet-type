// 붓: 뼈대 획(y 아래로, 스타일 단위)을 스타일 규칙에 따라 굵기·끝 장식이 있는 폴리곤으로 만든다.
import { union, closing, opening, circle, ellipse, simplify } from './geom.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- 곡선 샘플링 (centripetal Catmull-Rom) ----
function cr(p0, p1, p2, p3, t) {
  const a = 0.5;
  const d = (u, v) => Math.pow(Math.hypot(v[0] - u[0], v[1] - u[1]) || 1e-6, a);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const T = t1 + (t2 - t1) * t;
  const L = (A, B, ta, tb) => [(A[0] * (tb - T) + B[0] * (T - ta)) / (tb - ta), (A[1] * (tb - T) + B[1] * (T - ta)) / (tb - ta)];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

export function sample(st, step) {
  const P = st.pts;
  if (P.length === 1) return P.slice();
  const out = [];
  const n = P.length;
  if (!st.smooth) {
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1];
      const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let j = 0; j < k; j++) out.push([x0 + ((x1 - x0) * j) / k, y0 + ((y1 - y0) * j) / k]);
    }
    out.push(P[n - 1]);
    return out;
  }
  const get = (i) => {
    if (st.closed) return P[((i % n) + n) % n];
    if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
    if (i >= n) return [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
    return P[i];
  };
  const segs = st.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const k = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) out.push(cr(p0, p1, p2, p3, j / k));
  }
  if (!st.closed) out.push(P[n - 1]);
  return out;
}

// ---- 간단한 시드 노이즈 ----
function noise1(seed) {
  const r = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const ph = [r(1), r(2), r(3)].map((v) => v * Math.PI * 2);
  return (t) => (Math.sin(t * 1.0 + ph[0]) * 0.55 + Math.sin(t * 2.3 + ph[1]) * 0.3 + Math.sin(t * 4.1 + ph[2]) * 0.15);
}

// 끝 방향으로 획 종류 판정 (y 아래로 증가 좌표)
function classify(st, atEnd, pts) {
  const n = pts.length;
  const [a, b] = atEnd ? [pts[n - 1], pts[Math.max(0, n - 4)]] : [pts[0], pts[Math.min(n - 1, 3)]];
  let dx = a[0] - b[0], dy = a[1] - b[1];
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  if (Math.abs(dy) >= 0.62) return dy < 0 ? 'top' : 'bottom';
  return st.smooth ? 'hook' : 'bar';
}

// 끝 방향으로 직선 연장 (가시/물방울 끝)
function extend(pts, atEnd, len) {
  if (len <= 0 || pts.length < 2) return pts;
  const n = pts.length;
  const [a, b] = atEnd ? [pts[n - 1], pts[Math.max(0, n - 3)]] : [pts[0], pts[Math.min(n - 1, 2)]];
  let dx = a[0] - b[0], dy = a[1] - b[1];
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const k = Math.ceil(len / 6), add = [];
  for (let i = 1; i <= k; i++) add.push([a[0] + (dx * len * i) / k, a[1] + (dy * len * i) / k]);
  return atEnd ? pts.concat(add) : add.reverse().concat(pts);
}

// 끝 장식이 굵기에 주는 배율: [법선 방향 a배율, 진행 방향 b배율]
function endMod(term, d, R) {
  if (!term) return [1, 1];
  const L = (term.len || 1) * R;
  switch (term.type) {
    case 'spike': {
      const k = Math.pow(smooth(0, L, d), term.pow ?? 0.85);
      return [Math.max(0.012, k), Math.max(0.012, k)];
    }
    case 'flare': {
      const k = 1 + (term.amt ?? 0.8) * Math.pow(1 - smooth(0, L, d), 2);
      if (term.sharp) {
        const tip = Math.max(0.15, smooth(0, L * term.sharp, d));
        return [k * Math.pow(tip, 0.6), tip];
      }
      // 끝은 평평하게: 진행 방향 반지름을 줄여 뼈다귀처럼 뭉툭해지지 않게
      const flat = 0.3 + 0.7 * smooth(0, L * 0.5, d);
      return [k, flat / k];
    }
    case 'drip': {
      const c = L * 0.55, w = L * 0.35;
      const bulge = 1 + (term.amt ?? 0.5) * Math.exp(-Math.pow((d - c) / w, 2));
      const k = Math.pow(smooth(0, L * 0.38, d), 0.75);
      return [Math.max(0.012, bulge * k), Math.max(0.012, k)];
    }
    case 'ball': {
      // 방울 바로 앞이 살짝 잘록
      const neck = 1 - (term.neck ?? 0.15) * Math.exp(-Math.pow((d - L * 0.9) / (L * 0.5), 2));
      return [neck, 1];
    }
    default: return [1, 1];
  }
}

/**
 * strokes: [{ pts(y아래), smooth, closed, ends, dot, size, w }]
 * style.brush: { R, thin, waist, wobble, ends:{top,bottom,bar,hook}, dot, close, open, step }
 */
export function renderStrokes(strokes, B, seed = 1) {
  const polys = [];
  const step = B.step || 7;
  strokes.forEach((st, si) => {
    const R = B.R * (st.w || 1) * (st.rs || 1);
    if (st.dot) {
      const [x, y] = st.pts[0];
      polys.push(circle(x, y, R * (B.dot ?? 1.25) * (st.size || 1)));
      return;
    }
    let pts = sample(st, step);
    if (pts.length < 2) return;
    // 끝 장식 결정
    const terms = [0, 1].map((k) => {
      if (st.closed) return null;
      const tag = st.ends && st.ends[k];
      if (tag === '-') return null;
      const kind = tag || classify(st, k === 1, pts);
      const t = B.ends && B.ends[kind];
      return t ? { ...t, kind } : null;
    });
    // 가시/물방울은 끝을 연장
    if (terms[0] && terms[0].ext) pts = extend(pts, false, terms[0].ext * R);
    if (terms[1] && terms[1].ext) pts = extend(pts, true, terms[1].ext * R);
    const n = pts.length;
    // 누적 길이
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[n - 1] || 1;
    const nz = B.wobble ? noise1(seed * 31 + si * 7) : null;
    const pens = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(n - 1, i + 1)];
      let tx = q1[0] - q0[0], ty = q1[1] - q0[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const s = cum[i], e = total - cum[i];
      // 대비: 세로획 굵게, 가로획 가늘게
      const v = Math.abs(ty);
      let a = R * ((B.thin ?? 1) + (1 - (B.thin ?? 1)) * Math.pow(v, B.cpow ?? 1.4));
      // 몸통: waist>0 가운데 잘록, <0 불룩 (긴 획일수록 또렷)
      if (B.waist && !st.closed) a *= 1 - B.waist * Math.min(1, total / (R * 8)) * Math.sin(Math.PI * (s / total));
      let b = a;
      if (!st.closed) {
        const [a0, b0] = endMod(terms[0], s, R), [a1, b1] = endMod(terms[1], e, R);
        a *= a0 * a1; b *= b0 * b1;
      }
      if (nz) { const k = 1 + B.wobble * nz(s / (R * 3)); a *= k; b *= k; }
      pens.push({ p, tx, ty, a: Math.max(0.4, a), b: Math.max(0.4, Math.min(b, a * 1.6)) });
    }
    // 펜 자국 + 이웃 펜 사이 사다리꼴로 쓸어 칠하기
    for (let i = 0; i < n; i++) {
      const P = pens[i];
      polys.push(ellipse(P.p[0], P.p[1], P.a, P.b, P.tx, P.ty));
      if (i < n - 1) {
        const Q = pens[i + 1];
        // 이 구간 자체의 방향으로 법선을 잡는다 (꺾이는 모서리에서 평균 방향을 쓰면 사다리꼴이 비틀려 삐침이 생김)
        let sx = Q.p[0] - P.p[0], sy = Q.p[1] - P.p[1];
        const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
        const nx0 = -sy, ny0 = sx, nx1 = -sy, ny1 = sx;
        polys.push([
          [P.p[0] + nx0 * P.a, P.p[1] + ny0 * P.a], [Q.p[0] + nx1 * Q.a, Q.p[1] + ny1 * Q.a],
          [Q.p[0] - nx1 * Q.a, Q.p[1] - ny1 * Q.a], [P.p[0] - nx0 * P.a, P.p[1] - ny0 * P.a],
        ]);
      }
    }
    // 방울 끝
    terms.forEach((t, k) => {
      if (!t || t.type !== 'ball') return;
      const i = k === 0 ? 0 : n - 1, j = k === 0 ? Math.min(n - 1, 2) : Math.max(0, n - 3);
      const [x, y] = pts[i];
      let dx = x - pts[j][0], dy = y - pts[j][1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const r = R * (t.size ?? 1.5);
      const inset = r * (t.inset ?? 0.35);
      polys.push(circle(x + dx * (r - inset - R * 0.2) * (t.push ?? 0), y + dy * (r - inset - R * 0.2) * (t.push ?? 0), r));
    });
  });
  let out = union(polys);
  if (B.close) out = closing(out, B.close * B.R);
  if (B.open) out = opening(out, B.open * B.R);
  return simplify(out, 0.25);
}
