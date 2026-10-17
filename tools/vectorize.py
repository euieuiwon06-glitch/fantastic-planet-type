# 래스터 마스크 -> 매끈한 베지어 윤곽 (서브픽셀 윤곽 + Schneider 곡선 피팅, 뾰족한 끝은 코너로 유지)
import numpy as np, cv2
from skimage import measure


def smooth_field(mask, sigma):
    return cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)


def contours(mask, sigma=1.4):
    f = np.pad(smooth_field(mask, sigma), 2)
    cs = measure.find_contours(f, 0.5)
    out = []
    for c in cs:
        if len(c) < 12:
            continue
        pts = c[:, ::-1] - 2.0          # (x, y)
        if np.allclose(pts[0], pts[-1]):
            pts = pts[:-1]
        out.append(pts)
    return out


def resample(pts, step):
    p = np.vstack([pts, pts[:1]])
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    n = max(8, int(d[-1] / step))
    t = np.linspace(0, d[-1], n, endpoint=False)
    return np.c_[np.interp(t, d, p[:, 0]), np.interp(t, d, p[:, 1])]


def find_corners(p, k, ang_deg):
    n = len(p)
    a = p[(np.arange(n) - k) % n] - p
    b = p[(np.arange(n) + k) % n] - p
    cos = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-9)
    ang = np.degrees(np.arccos(np.clip(cos, -1, 1)))     # 180 = 직선, 작을수록 뾰족
    sharp = ang < ang_deg
    idx = []
    for i in np.where(sharp)[0]:
        lo = [(i + j) % n for j in range(-k, k + 1)]
        if ang[i] <= ang[lo].min():
            idx.append(i)
    return sorted(set(idx))


# ---------- Schneider bezier fitting ----------
def _bez(ctrl, t):
    t = t[:, None]; mt = 1 - t
    return mt**3*ctrl[0] + 3*mt**2*t*ctrl[1] + 3*mt*t**2*ctrl[2] + t**3*ctrl[3]

def _bez_d1(ctrl, t):
    t = t[:, None]; mt = 1 - t
    return 3*mt**2*(ctrl[1]-ctrl[0]) + 6*mt*t*(ctrl[2]-ctrl[1]) + 3*t**2*(ctrl[3]-ctrl[2])

def _bez_d2(ctrl, t):
    t = t[:, None]; mt = 1 - t
    return 6*mt*(ctrl[2]-2*ctrl[1]+ctrl[0]) + 6*t*(ctrl[3]-2*ctrl[2]+ctrl[1])

def _chord(pts):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    return d / d[-1] if d[-1] > 0 else d

def _gen(pts, u, t1, t2):
    p0, p3 = pts[0], pts[-1]
    A1 = u[:, None] * 0 + t1 * (3*(1-u)**2*u)[:, None]
    A2 = t2 * (3*(1-u)*u**2)[:, None]
    C = np.array([[np.sum(A1*A1), np.sum(A1*A2)], [np.sum(A1*A2), np.sum(A2*A2)]])
    tmp = pts - _bez(np.array([p0, p0, p3, p3]), u)
    X = np.array([np.sum(A1*tmp), np.sum(A2*tmp)])
    det = C[0,0]*C[1,1] - C[0,1]*C[1,0]
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        a1 = (X[0]*C[1,1] - X[1]*C[0,1]) / det
        a2 = (C[0,0]*X[1] - C[1,0]*X[0]) / det
    else:
        a1 = a2 = seg / 3
    if a1 < 1e-6*seg or a2 < 1e-6*seg:
        a1 = a2 = seg / 3
    return np.array([p0, p0 + t1*a1, p3 + t2*a2, p3])

def _reparam(ctrl, pts, u):
    d = _bez(ctrl, u) - pts
    d1 = _bez_d1(ctrl, u); d2 = _bez_d2(ctrl, u)
    num = (d*d1).sum(1); den = (d1*d1).sum(1) + (d*d2).sum(1)
    with np.errstate(divide='ignore', invalid='ignore'):
        nu = np.where(np.abs(den) > 1e-12, u - num/den, u)
    return np.clip(nu, 0, 1)

def _maxerr(ctrl, pts, u):
    d = np.linalg.norm(_bez(ctrl, u) - pts, axis=1)
    i = int(np.argmax(d)); return d[i], i

def _unit(v):
    n = np.linalg.norm(v); return v / n if n > 1e-12 else v

def fit_cubic(pts, t1, t2, err, depth=0):
    if len(pts) == 2:
        dist = np.linalg.norm(pts[1]-pts[0]) / 3
        return [np.array([pts[0], pts[0]+t1*dist, pts[1]+t2*dist, pts[1]])]
    u = _chord(pts)
    ctrl = _gen(pts, u, t1, t2)
    e, split = _maxerr(ctrl, pts, u)
    if e < err:
        return [ctrl]
    if e < err * 4:
        for _ in range(20):
            u = _reparam(ctrl, pts, u)
            ctrl = _gen(pts, u, t1, t2)
            e, split = _maxerr(ctrl, pts, u)
            if e < err:
                return [ctrl]
    if depth > 40 or len(pts) < 4:
        return [ctrl]
    split = min(max(split, 1), len(pts) - 2)
    tc = _unit(pts[split-1] - pts[split+1])
    return fit_cubic(pts[:split+1], t1, tc, err, depth+1) + fit_cubic(pts[split:], -tc, t2, err, depth+1)

def fit_open(pts, err):
    t1 = _unit(pts[1] - pts[0]); t2 = _unit(pts[-2] - pts[-1])
    return fit_cubic(pts, t1, t2, err)


def fit_closed(pts, err, corner_k=4, corner_ang=110):
    """닫힌 윤곽 -> 베지어 리스트. 코너 없으면 가장 곡률 낮은 점에서 시작해 매끄럽게 닫는다."""
    n = len(pts)
    cs = find_corners(pts, corner_k, corner_ang)
    beziers = []
    if not cs:
        # 이음매도 접선 연속이 되도록 양 끝 접선을 같은 방향으로
        p = np.vstack([pts, pts[:1]])
        tan = _unit(pts[1] - pts[-1])
        return fit_cubic(p, tan, -tan, err)
    for j in range(len(cs)):
        a, b = cs[j], cs[(j+1) % len(cs)]
        idx = np.arange(a, b + 1) if b > a else np.r_[np.arange(a, n), np.arange(0, b + 1)]
        seg = pts[idx]
        if len(seg) < 2:
            continue
        if len(seg) == 2:
            beziers += fit_open(seg, err); continue
        beziers += fit_open(seg, err)
    return beziers


def catmull_closed(p, corners=()):
    """균일 간격 닫힌 점열 -> C1 연속 베지어. corners 인덱스에서는 접선을 끊어 뾰족하게."""
    n = len(p); cs = set(corners); out = []
    for i in range(n):
        p0, p1, p2, p3 = p[(i-1) % n], p[i], p[(i+1) % n], p[(i+2) % n]
        t1 = (p2 - p0) / 6.0
        t2 = (p3 - p1) / 6.0
        if i in cs: t1 = (p2 - p1) / 3.0 * 0.0
        if (i+1) % n in cs: t2 = (p2 - p1) / 3.0 * 0.0
        out.append(np.array([p1, p1 + t1, p2 - t2, p2]))
    return out


def smooth_contour(c, csig, corner_ang=45):
    """윤곽선을 선을 따라 가우시안으로 고르게 편다(우글거림 제거). 뾰족한 코너 점은 고정."""
    p = resample(c, 1.0)
    n = len(p)
    if n < 12 or csig <= 0:
        return p
    # 코너는 미리 한 번 편 윤곽에서 넓은 범위로 판정 -> 우글거림을 코너로 오인하지 않게
    k = max(4, int(csig * 2.5))
    r0 = int(csig * 2)
    w0 = np.exp(-0.5 * (np.arange(-r0, r0 + 1) / (csig * 0.7)) ** 2)
    wr0 = np.arange(-r0, n + r0) % n
    pre = np.stack([np.convolve(p[wr0, d], w0 / w0.sum(), 'valid') for d in range(2)], 1)
    cs = find_corners(pre, k, corner_ang) if corner_ang else []
    r = int(csig * 3)
    w = np.exp(-0.5 * (np.arange(-r, r + 1) / csig) ** 2)
    out = p.copy()
    if not cs:
        wrap = np.arange(-r, n + r) % n          # 둘레가 짧은 고리도 안전하게 감싸기
        for d in range(2):
            out[:, d] = np.convolve(p[wrap, d], w / w.sum(), 'valid')
        return out
    # 코너 사이 구간마다 따로 펴고, 코너 근처는 코너 쪽으로 덜 움직이게(끝점 고정)
    for j in range(len(cs)):
        a, b = cs[j], cs[(j + 1) % len(cs)]
        idx = np.arange(a, b + 1) if b > a else np.r_[np.arange(a, n), np.arange(0, b + 1)]
        seg = p[idx]
        m = len(seg)
        if m < 5:
            continue
        sm = np.empty_like(seg)
        for d in range(2):
            # 끝점 고정: 짧은 구간은 끝값 반복, 긴 구간은 점대칭 반사로 바깥을 채운다
            ext = np.pad(seg[:, d], r, mode='reflect', reflect_type='odd') if m > r + 1 else np.pad(seg[:, d], r, mode='edge')
            sm[:, d] = np.convolve(ext, w / w.sum(), 'valid')[:m]
        out[idx[1:-1]] = sm[1:-1]
    return out


def mask_to_path(mask, scale=1.0, ox=0.0, oy=0.0, sigma=1.4, step=5.0, err=None,
                 corner_ang=70, corner_k=3, flip_y=False, min_len=20, csmooth=0.0):
    """mask(px) -> SVG path d. 좌표 = (px*scale + ox, py*scale + oy) (flip_y면 y 부호 반전)
    csmooth: 윤곽선을 선 방향으로 펴는 세기(px). 저해상도 원본의 우글거림 제거용"""
    d = []
    for c in contours(mask, sigma):
        if len(c) < min_len:
            continue
        if csmooth:
            c = smooth_contour(c, csmooth, corner_ang)
        p = resample(c, step)
        if len(p) < 6:
            continue
        cs = find_corners(p, corner_k, corner_ang) if corner_ang else []
        bz = catmull_closed(p, cs)
        def f(q):
            x = q[0]*scale + ox; y = q[1]*scale + oy
            if flip_y: y = -y
            return f"{x:.2f} {y:.2f}"
        d.append("M" + f(bz[0][0]))
        for b in bz:
            d.append("C" + f(b[1]) + " " + f(b[2]) + " " + f(b[3]))
        d.append("Z")
    return "".join(d)
