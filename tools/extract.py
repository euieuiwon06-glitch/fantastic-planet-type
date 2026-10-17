# 2단계: 완성본 래스터에서 글자를 하나씩 분리 -> 폰트 좌표 벡터 + 측정값(JSON)
# 붙은 글자는 시드 기반 워터셰드(가장 가는 목에서 갈라짐)로 나눈다.
import sys, os, json, numpy as np, cv2
from scipy import ndimage as ndi
from skimage.segmentation import watershed
sys.path.insert(0, os.path.dirname(__file__))
from vectorize import mask_to_path
from polish import coverage, clean, SIG, CORNER

S = 6.0
WORD = list("FantasticPlanet")

# 글자별 시드 (viewBox 좌표). 정수 = segment.py 연결요소 번호(그 요소 전체가 한 글자)
SEEDS = {
    '01': [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13,
           [(688, 310), (700, 292)], [(747, 310), (750, 262), (712, 262)]],
    '02': [0, 1, 2, 3, 4, 5, [(400, 280), (380, 240), (400, 215)], [(430, 285)], 8, 9, 10, 11, 12,
           [(675, 283), (690, 300)], [(733, 237), (738, 300), (700, 240), (760, 237)]],
    '05': [1, 3, 6, 8, 10, 11, 13, 16, 17, 20, 23, 24, 25, 28, 29],
    '06': [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15],
    '07': [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15],
    '04': [
        [(88, 163), (76, 279), (65, 383), (160, 216), (153, 260)],                 # F
        [(134, 337), (169, 344), (180, 325)],                                      # a
        [(201, 270), (238, 302), (206, 337), (250, 325)],                          # n
        [(285, 191), (245, 258), (306, 253), (277, 300), (270, 362)],              # t
        [(301, 295), (308, 344), (338, 325)],                                      # a
        [(373, 279), (389, 325), (366, 337)],                                      # s
        [(418, 207), (382, 253), (449, 258), (412, 302), (424, 360)],              # t
        [(452, 285), (448, 320), (450, 348)],                                      # i
        [(480, 320), (506, 280), (506, 350)],                                      # c
        [(550, 180), (520, 210), (584, 230), (542, 300), (542, 360)],              # P
        [(606, 188), (603, 250), (598, 370)],                                      # l
        [(620, 296), (610, 340), (650, 320)],                                      # a
        [(666, 280), (676, 320), (700, 300), (704, 360)],                          # n
        [(720, 320), (750, 290), (740, 350)],                                      # e
        [(770, 220), (746, 270), (802, 262), (776, 300), (784, 370)],              # t
    ],
}


def split_letters(i, W):
    cov = clean(coverage(i, W))
    if i == '05':
        im = cv2.imread(os.path.join(W, 'raster', 'r05.png'), cv2.IMREAD_GRAYSCALE)
        ys, xs = np.where(im > 128)
        box = np.zeros_like(cov); box[ys.min()+20:int(310*S), xs.min()+20:xs.max()-20] = 1
        cov = cov * box
    ink = cov > 0.5
    comps = json.load(open(os.path.join(W, 'comps.json')))[i]
    n, lab = cv2.connectedComponents(ink.astype(np.uint8), connectivity=8)
    markers = np.zeros(ink.shape, np.int32)
    for li, sd in enumerate(SEEDS[i]):
        if isinstance(sd, int):
            c = comps[sd]
            # 요소 bbox 안에서 가장 굵은 점을 시드로
            # bbox 안에서 면적이 원래 요소와 가장 비슷한 현재 요소만 사용 (bbox가 겹치는 이웃 배제)
            sl = lab[c['y']:c['y']+c['h'], c['x']:c['x']+c['w']]
            ids, cnt = np.unique(sl[sl > 0], return_counts=True)
            best = ids[np.argmin(np.abs(cnt - c['a']))]
            sub = sl == best
            dt = ndi.distance_transform_edt(sub)
            yy, xx = np.unravel_index(np.argmax(dt), dt.shape)
            pts = [((c['x']+xx)/S, (c['y']+yy)/S)]
        else:
            pts = sd
        for (x, y) in pts:
            cv2.circle(markers, (int(x*S), int(y*S)), 6, li + 1, -1)
    markers[~ink] = 0
    dist = ndi.distance_transform_edt(ink)
    lbl = watershed(-dist, markers, mask=ink)
    # 시드가 없는 조각(i 점 등)은 가장 가까운 글자에 붙인다
    rest = ink & (lbl == 0)
    if rest.any():
        rn, rl = cv2.connectedComponents(rest.astype(np.uint8), connectivity=8)
        _, idx = ndi.distance_transform_edt(lbl == 0, return_indices=True)
        for k in range(1, rn):
            yy, xx = np.where(rl == k)
            cy, cx = int(yy.mean()), int(xx.mean())
            # 아래쪽(같은 열) 우선: 점은 보통 기둥 위에 있다
            col = lbl[cy:, max(0, cx-3):cx+4]
            v = col[col > 0]
            lbl[rl == k] = v[0] if len(v) else lbl[idx[0][cy, cx], idx[1][cy, cx]]
    return cov, lbl


def measure_style(lbl):
    """기준선/엑스하이트: a n c e 의 바닥/꼭대기 중앙값"""
    bots, tops = [], []
    for li, ch in enumerate(WORD):
        if ch in 'ance':
            ys, xs = np.where(lbl == li + 1)
            if len(ys) == 0: continue
            bots.append(np.percentile(ys, 99.0)); tops.append(np.percentile(ys, 1.0))
    return float(np.median(bots)), float(np.median(tops))


if __name__ == "__main__":
    W = sys.argv[1]
    out = {}
    os.makedirs(os.path.join(W, 'glyphs'), exist_ok=True)
    for i in SEEDS:
        cov, lbl = split_letters(i, W)
        base, top = measure_style(lbl)
        xh = base - top
        k = 500.0 / xh                     # 폰트 단위: x-height = 500
        glyphs = []
        vis = np.full(lbl.shape + (3,), 255, np.uint8)
        rng = np.random.RandomState(3)
        for li, ch in enumerate(WORD):
            m = lbl == li + 1
            ys, xs = np.where(m)
            if len(xs) == 0: raise SystemExit(f'{i}: {ch}({li}) 비어 있음')
            x0, x1 = xs.min(), xs.max()
            col = rng.randint(40, 200, 3)
            vis[m] = col
            # 글자 마스크의 농도(안티앨리어싱 유지) — 경계 1px 확장 후 소속만
            mm = cv2.dilate(m.astype(np.uint8), np.ones((5, 5))) > 0
            other = (lbl > 0) & ~m
            g = cov * mm * (~other)
            pad = 12
            yA, yB = max(0, ys.min()-pad), ys.max()+pad
            xA, xB = max(0, x0-pad), x1+pad
            sub = g[yA:yB, xA:xB]
            if i == '04':   # 워터셰드로 잘린 평평한 면을 둥글게 (블롭 스타일)
                sub = np.clip(cv2.GaussianBlur(sub.astype(np.float32), (0, 0), 5.0) * 1.15, 0, 1)
            d = mask_to_path(sub, scale=k, ox=(xA - x0)*k, oy=(yA - base)*k,
                             sigma=SIG[i], step=9.0, corner_ang=CORNER[i])
            glyphs.append(dict(ch=ch, d=d, w=round((x1-x0)*k, 1), x=round(x0*k, 1),
                               top=round((ys.min()-base)*k, 1), bot=round((ys.max()-base)*k, 1)))
            cv2.putText(vis, ch, (int(x0), int(ys.min())-10), cv2.FONT_HERSHEY_SIMPLEX, 3, (0, 0, 0), 6)
        ys, xs = np.where(lbl > 0)
        v = vis[ys.min()-120:ys.max()+30, xs.min()-30:xs.max()+30]
        cv2.imwrite(os.path.join(W, 'glyphs', f'split{i}.png'), cv2.resize(v, None, fx=0.35, fy=0.35, interpolation=cv2.INTER_AREA))
        out[i] = dict(xh=round(xh/S, 2), scale=k*S, glyphs=glyphs)
        print(i, 'xh', round(xh/S, 1), [(g['ch'], float(g['w'])) for g in glyphs][:6])
    json.dump(out, open(os.path.join(W, 'drawn_glyphs.json'), 'w'), ensure_ascii=False)
