# 05 스타일 전체 알파벳 이미지 -> 글자별 벡터 (src/data/drawn.json 의 '05' 교체)
# 대문자: 고해상도 3장(A-I, J-R, S-Z), 소문자: 전체 시트 3·4번째 줄
import sys, os, json, re, numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from vectorize import mask_to_path

D = sys.argv[1]            # work/a05
OUT = sys.argv[2]          # src/data/drawn.json
UP = 3                     # 매끈한 윤곽을 위해 확대 후 추적


def load(name):
    im = cv2.imread(os.path.join(D, name), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    cov = 1 - im
    m = (cov > 0.5).astype(np.uint8)
    # 작은 잡티 제거 + 작은 홈/돌기 정리 (원본 단계에서 깨끗하게)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 30
    cov[~keep[lab] & (m > 0)] = 0
    m = (cov > 0.5).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    # 작은 홈만 메운다 (돌기 깎기는 e 꼬리 같은 머리카락 획을 끊어서 쓰지 않음)
    m2 = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    ch = m2 != m; cov[ch] = m2[ch]
    return cov


def letters(cov, y0=0, y1=None):
    """연결요소를 x 겹침으로 묶어 글자 단위로 (i/j 점은 기둥과 묶임)"""
    m = (cov > 0.5).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    comps = [k for k in range(1, n) if st[k][4] >= 30 and y0 <= cen[k][1] < (y1 or 1e9)]
    comps.sort(key=lambda k: st[k][0])
    groups = []
    for k in comps:
        x, w = st[k][0], st[k][2]
        if groups:
            g = groups[-1]
            gx0, gx1 = g['x0'], g['x1']
            ov = min(gx1, x + w) - max(gx0, x)
            if ov > 0.5 * min(w, gx1 - gx0):
                g['ks'].append(k); g['x0'] = min(gx0, x); g['x1'] = max(gx1, x + w); continue
        groups.append({'ks': [k], 'x0': x, 'x1': x + w})
    out = []
    for g in groups:
        mask = np.isin(lab, g['ks'])
        ys, xs = np.where(mask)
        out.append({'mask': mask, 'x0': xs.min(), 'x1': xs.max(), 'y0': ys.min(), 'y1': ys.max()})
    return out


def baseline(gl, chars, which):
    """기준선/높이: 지정 글자의 위·아래 끝 중앙값"""
    tops = [g['y0'] for g, c in zip(gl, chars) if c in which]
    bots = [g['y1'] for g, c in zip(gl, chars) if c in which]
    return float(np.median(bots)), float(np.median(tops))


def vec(cov, g, base, k):
    pad = 6
    y0, y1, x0, x1 = max(0, g['y0'] - pad), g['y1'] + pad, max(0, g['x0'] - pad), g['x1'] + pad
    sub = cov[y0:y1, x0:x1] * cv2.dilate(g['mask'][y0:y1, x0:x1].astype(np.uint8), np.ones((5, 5)))
    big = cv2.resize(sub, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    kk = k / UP
    d = mask_to_path(big, scale=kk, ox=(x0 - g['x0']) * k, oy=(y0 - base) * k,
                     sigma=1.6 * UP / 2, step=4.5 * UP, corner_ang=40)
    return re.sub(r'-?\d+\.\d+', lambda m: str(int(round(float(m.group())))), d)


res = []
# --- 소문자: 시트에서 줄 나누기 (대문자 2줄 아래) ---
sheet = load('sheet.png')
H = sheet.shape[0]
m = (sheet > 0.5).astype(np.uint8)
n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
ys = sorted(cen[k][1] for k in range(1, n) if st[k][4] >= 30)
# 줄 경계: 중심 y의 큰 간격 3곳
gaps = sorted(range(len(ys) - 1), key=lambda i: ys[i + 1] - ys[i])[-3:]
cuts = sorted((ys[i] + ys[i + 1]) / 2 for i in gaps)
rows = [letters(sheet, a, b) for a, b in zip([0] + cuts, cuts + [1e9])]
print('rows', [len(r) for r in rows])
low = rows[2] + rows[3]
lch = list('abcdefghijklm') + list('nopqrstuvwxyz')
assert len(low) == 26, len(low)
b, t = baseline(low, lch, 'acemnorsuvwxz')
# 드립(아래로 맺힌 방울) 때문에 바닥 중앙값이 기준선보다 아래 -> 엑스하이트 상단은 x/z/v 기준으로 보정
xh_px = b - t
k_low = 500.0 / xh_px
# 소문자 줄마다 기준선이 다르므로 줄별로 계산
for row, chars in ((rows[2], lch[:13]), (rows[3], lch[13:])):
    rb, rt = baseline(row, chars, 'acemnorsuvwxz')
    for g, c in zip(row, chars):
        res.append({'ch': c, 'd': vec(sheet, g, rb, k_low)})
# 시트에서 대문자 높이 / 엑스하이트 비율
upS = rows[0] + rows[1]
# 대문자 줄은 덩어리 수가 글자 수와 다를 수 있어 (갈라진 획) 큰 덩어리들의 위·아래 중앙값만 사용
big = [g for g in upS if g['y1'] - g['y0'] > 0.6 * max(x['y1'] - x['y0'] for x in upS)]
ub, ut = float(np.median([g['y1'] for g in big])), float(np.median([g['y0'] for g in big]))
cap_ratio = (ub - ut) / xh_px
cap_units = 500 * cap_ratio
print('cap/xh', round(cap_ratio, 3), 'cap units', round(cap_units))

# --- 대문자: 고해상도 3장 ---
for name, chars in (('AI.png', 'ABCDEFGHI'), ('JR.png', 'JKLMNOPQR'), ('SZ.png', 'STUVWXYZ')):
    cov = load(name)
    gl = letters(cov)
    assert len(gl) == len(chars), (name, len(gl))
    bb, tt = baseline(gl, list(chars), 'EFHIKLMNTUVXZ' + 'BDPR')
    k = cap_units / (bb - tt)
    for g, c in zip(gl, chars):
        res.append({'ch': c, 'd': vec(cov, g, bb, k)})

data = json.load(open(OUT, encoding='utf-8'))
data['05'] = res
json.dump(data, open(OUT, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
json.dump({'cap': round(cap_units)}, open(os.path.join(D, 'metrics.json'), 'w'))
print('05 glyphs', len(res), 'size KB', os.path.getsize(OUT) // 1024)
