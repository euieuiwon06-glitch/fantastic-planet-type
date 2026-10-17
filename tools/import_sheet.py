# 알파벳 시트 한 장(대문자 A-M / N-Z / 소문자 a-m / n-z 4줄) -> 글자별 벡터, drawn.json 의 해당 스타일 교체
# 사용: python tools/import_sheet.py 06 <이미지> src/data/drawn.json
import sys, os, json, re, numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from vectorize import mask_to_path

SID, IMG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
UP = 3
# 윤곽 펴기 세기(원본 px): 원본 해상도가 낮을수록(글자가 작을수록) 크게
CS = float(os.environ.get('CS', '3.0'))
ROWS = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz']
XREF = 'acemnorsuvwxz'          # 엑스하이트·기준선 측정용 소문자
CREF = 'EFHIKLMNTUVXZ'          # 대문자 높이 측정용


def load(path):
    im = cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    cov = 1 - im
    m = (cov > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 20
    cov[~keep[lab] & (m > 0)] = 0
    # 작은 홈만 메움 (가는 획을 끊는 깎기는 하지 않음)
    m = (cov > 0.5).astype(np.uint8)
    m2 = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    ch = m2 != m; cov[ch] = m2[ch]
    return cov


cov = load(IMG)
m = (cov > 0.5).astype(np.uint8)
n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
ids = [k for k in range(1, n) if st[k][4] >= 20]

# 줄 나누기: 큰 덩어리 중심 y를 4묶음으로 (작은 점은 나중에 가까운 줄로)
bigs = sorted([k for k in ids if st[k][3] > 0.25 * np.median([st[j][3] for j in ids])], key=lambda k: cen[k][1])
ys = [cen[k][1] for k in bigs]
gi = sorted(range(len(ys) - 1), key=lambda i: ys[i + 1] - ys[i])[-3:]
cuts = sorted((ys[i] + ys[i + 1]) / 2 for i in gi)
row_of = lambda y: sum(y >= c for c in cuts)


def group_row(r):
    comps = sorted([k for k in ids if row_of(cen[k][1]) == r], key=lambda k: st[k][0])
    groups = []
    for k in comps:
        x, w = st[k][0], st[k][2]
        if groups:
            g = groups[-1]
            ov = min(g['x1'], x + w) - max(g['x0'], x)
            # 가로로 겹쳐도 둘 다 큰 덩어리면 다른 글자(가시가 겹친 경우). 작은 조각(i·j 점 등)만 묶는다
            small = min(st[k][4], g['a']) < 0.3 * max(st[k][4], g['a'])
            y, h = st[k][1], st[k][3]
            apart = y + h < g['y0'] or y > g['y1']        # 위아래로 완전히 떨어진 조각(점)
            if ov > 0.45 * min(w, g['x1'] - g['x0']) and (small or apart):
                g['ks'].append(k); g['x0'] = min(g['x0'], x); g['x1'] = max(g['x1'], x + w); g['a'] += st[k][4]
                g['y0'] = min(g['y0'], y); g['y1'] = max(g['y1'], y + h); continue
        groups.append({'ks': [k], 'x0': x, 'x1': x + w, 'a': st[k][4], 'y0': st[k][1], 'y1': st[k][1] + st[k][3]})
    for g in groups:
        mask = np.isin(lab, g['ks'])
        yy, xx = np.where(mask)
        g.update(mask=mask, y0=yy.min(), y1=yy.max(), x0=xx.min(), x1=xx.max())
    return groups


# 자동으로 가리기 어려운 경우의 스타일별 보정: {줄: [('merge', i) = i와 i+1 합치기, ('split', i) = i를 둘로]}
FIXES = {}


def merge_at(groups, i):
    a, b = groups[i], groups[i + 1]
    m = a['mask'] | b['mask']
    yy, xx = np.where(m)
    g = {'mask': m, 'x0': xx.min(), 'x1': xx.max(), 'y0': yy.min(), 'y1': yy.max(), 'a': a['a'] + b['a'], 'ks': []}
    return groups[:i] + [g] + groups[i + 2:]


def split_widest(groups, i=None):
    """맞닿은 두 글자: 가장 넓은 덩어리를 좌·우 가장 굵은 점을 시드로 워터셰드 -> 가장 가는 목에서 갈라짐"""
    if i is None:
        med = np.median([g['x1'] - g['x0'] for g in groups])
        i = max(range(len(groups)), key=lambda j: (groups[j]['x1'] - groups[j]['x0']) / med)
    g = groups[i]
    x0, x1, y0, y1 = g['x0'], g['x1'] + 1, g['y0'], g['y1'] + 1
    sub = g['mask'][y0:y1, x0:x1]
    W = x1 - x0
    # 맞닿은 가시는 세로로 잉크가 가장 적은 곳: 가운데 범위에서 잉크 최소 세로줄로 자른다
    col = sub.sum(0).astype(float)
    col = np.convolve(col, np.ones(5) / 5, 'same')
    a, b = int(W * 0.25), int(W * 0.75)
    cut = a + int(np.argmin(col[a:b]))
    ws = np.zeros(sub.shape, np.int32)
    ws[:, :cut][sub[:, :cut]] = 1
    ws[:, cut:][sub[:, cut:]] = 2
    out = []
    for lab_ in (1, 2):
        m = np.zeros_like(g['mask']); m[y0:y1, x0:x1] = ws == lab_
        yy, xx = np.where(m)
        out.append({'mask': m, 'x0': xx.min(), 'x1': xx.max(), 'y0': yy.min(), 'y1': yy.max(), 'a': len(xx), 'ks': []})
    return groups[:i] + out + groups[i + 1:]


rows = [group_row(r) for r in range(4)]
for r in range(4):
    while len(rows[r]) < len(ROWS[r]):
        rows[r] = split_widest(rows[r])
# 보정은 자동 분할 뒤의 순서 기준
for r, ops in FIXES.get(SID, {}).items():
    for op, i in ops:
        rows[r] = merge_at(rows[r], i) if op == 'merge' else split_widest(rows[r], i)
for r, (g, chars) in enumerate(zip(rows, ROWS)):
    if len(g) != len(chars):
        raise SystemExit(f'{r}번째 줄: 덩어리 {len(g)}개 / 글자 {len(chars)}개  ' + str([(int(x['x0']), int(x['x1']), int(x['y0']), int(x['y1']), int(x['a'])) for x in g]))


def med(gl, chars, which, key):
    return float(np.median([g[key] for g, c in zip(gl, chars) if c in which]))


# 소문자 줄별 기준선, 엑스하이트 → 500 단위
xh = np.mean([med(rows[r], ROWS[r], XREF, 'y1') - med(rows[r], ROWS[r], XREF, 'y0') for r in (2, 3)])
k = 500.0 / xh
cap = np.mean([med(rows[r], ROWS[r], CREF, 'y1') - med(rows[r], ROWS[r], CREF, 'y0') for r in (0, 1)])
print(SID, 'xh px', round(xh, 1), 'cap/xh', round(cap / xh, 3))


def vec(g, base):
    pad = 6
    y0, y1, x0, x1 = max(0, g['y0'] - pad), g['y1'] + pad, max(0, g['x0'] - pad), g['x1'] + pad
    sub = cov[y0:y1, x0:x1] * cv2.dilate(g['mask'][y0:y1, x0:x1].astype(np.uint8), np.ones((5, 5)))
    big = cv2.resize(sub, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    d = mask_to_path(big, scale=k / UP, ox=(x0 - g['x0']) * k, oy=(y0 - base) * k,
                     sigma=1.4, step=8.0, corner_ang=38, csmooth=CS * UP)
    return re.sub(r'-?\d+\.\d+', lambda mm: str(int(round(float(mm.group())))), d)


res = []
for r in range(4):
    ref = XREF if r >= 2 else CREF
    base = med(rows[r], ROWS[r], ref, 'y1')
    for g, c in zip(rows[r], ROWS[r]):
        res.append({'ch': c, 'd': vec(g, base)})

data = json.load(open(OUT, encoding='utf-8'))
data[SID] = res
json.dump(data, open(OUT, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print(SID, 'glyphs', len(res), 'cap units', round(cap * k), 'drawn.json KB', os.path.getsize(OUT) // 1024)
