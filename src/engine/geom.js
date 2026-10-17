// 폴리곤 기하 연산 (clipper-lib 래퍼). 좌표는 폰트 단위, y는 아래로 증가(SVG와 동일).
import ClipperLib from 'clipper-lib';

const S = 8; // 정수 좌표 정밀도 (1/8 단위)

const toC = (poly) => poly.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
const fromC = (paths) => paths.map((p) => p.map((q) => [q.X / S, q.Y / S]));

export function union(polys) {
  if (!polys.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(polys.filter((p) => p.length > 2).map(toC), ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromC(out);
}

export function difference(a, b) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(a.map(toC), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(b.map(toC), ClipperLib.PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctDifference, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromC(out);
}

export function intersect(a, b) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(a.map(toC), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(b.map(toC), ClipperLib.PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromC(out);
}

export function offset(polys, delta, arcTol = 0.6) {
  if (!polys.length || !delta) return polys;
  const co = new ClipperLib.ClipperOffset(2, arcTol * S);
  co.AddPaths(polys.map(toC), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out = new ClipperLib.Paths();
  co.Execute(out, delta * S);
  return fromC(out);
}

// 안쪽 모서리를 둥글게 메움 (구이/액체 느낌의 이음새)
export const closing = (polys, r) => (r > 0 ? offset(offset(polys, r), -r) : polys);
// 바깥 모서리를 둥글게 깎음
export const opening = (polys, r) => (r > 0 ? offset(offset(polys, -r), r) : polys);

export function transform(polys, { dx = 0, dy = 0, sx = 1, sy = 1, rot = 0, cx = 0, cy = 0 } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return polys.map((p) => p.map(([x, y]) => {
    let X = (x - cx) * sx, Y = (y - cy) * sy;
    const rx = X * c - Y * s, ry = X * s + Y * c;
    return [rx + cx + dx, ry + cy + dy];
  }));
}

export function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export function circle(cx, cy, r, n) {
  n = n || Math.max(10, Math.min(40, Math.ceil(r / 2.5)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// 접선 방향 (tx,ty)에 맞춰 놓인 타원 펜: a = 법선 방향 반지름, b = 진행 방향 반지름
export function ellipse(cx, cy, a, b, tx, ty, n) {
  n = n || Math.max(10, Math.min(40, Math.ceil(Math.max(a, b) / 2.5)));
  const nx = -ty, ny = tx, out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    out.push([cx + nx * a * c + tx * b * s, cy + ny * a * c + ty * b * s]);
  }
  return out;
}

// SVG path(M/L/C/Q/Z, 절대좌표) -> 폴리곤
export function pathToPolys(d, seg = 8) {
  const polys = [];
  const tok = d.match(/[MLCQZHV]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  let i = 0, cur = null, x = 0, y = 0, cmd = '';
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[a-z]/i.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { x = num(); y = num(); cur = [[x, y]]; polys.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { x = num(); y = num(); cur.push([x, y]); }
    else if (cmd === 'H') { x = num(); cur.push([x, y]); }
    else if (cmd === 'V') { y = num(); cur.push([x, y]); }
    else if (cmd === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      for (let k = 1; k <= seg; k++) {
        const t = k / seg, m = 1 - t;
        cur.push([m * m * m * x + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3,
                  m * m * m * y + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3]);
      }
      x = x3; y = y3;
    } else if (cmd === 'Q') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num();
      for (let k = 1; k <= seg; k++) {
        const t = k / seg, m = 1 - t;
        cur.push([m * m * x + 2 * m * t * x1 + t * t * x2, m * m * y + 2 * m * t * y1 + t * t * y2]);
      }
      x = x2; y = y2;
    } else if (cmd === 'Z' || cmd === 'z') { cmd = ''; }
    else i++;
  }
  return polys.filter((p) => p.length > 2);
}

// 폴리곤 -> SVG path. smooth면 점열을 2차 베지어 중점 보간으로 매끈하게
export function polysToPath(polys, prec = 1, smooth = true) {
  const f = (v) => +v.toFixed(prec);
  let d = '';
  for (const p of polys) {
    if (p.length < 3) continue;
    if (!smooth) {
      d += 'M' + p.map(([x, y]) => f(x) + ' ' + f(y)).join('L') + 'Z';
      continue;
    }
    const n = p.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m0 = mid(p[n - 1], p[0]);
    d += `M${f(m0[0])} ${f(m0[1])}`;
    for (let i = 0; i < n; i++) {
      const a = p[i], m = mid(a, p[(i + 1) % n]);
      d += `Q${f(a[0])} ${f(a[1])} ${f(m[0])} ${f(m[1])}`;
    }
    d += 'Z';
  }
  return d;
}

export function area(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % n];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

// 너무 촘촘한 점 줄이기 (거의 직선인 점 제거)
export function simplify(polys, tol = 0.35) {
  return polys.map((p) => {
    if (p.length < 8) return p;
    const out = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const a = out[out.length - 1], b = p[i], c = p[i + 1];
      const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      if (cross / len > tol) out.push(b);
    }
    out.push(p[p.length - 1]);
    return out;
  });
}

// 작은 삐침·흠집 정리: 작은 홈 메우기(closing) -> 작은 돌기 깎기(opening) -> 아주 작은 조각/구멍 제거
export function tidy(polys, { close = 7, open = 5, minArea = 260 } = {}) {
  let p = union(polys);
  if (close) p = closing(p, close);
  if (open) p = opening(p, open);
  return p.filter((q) => Math.abs(area(q)) >= minArea);
}
