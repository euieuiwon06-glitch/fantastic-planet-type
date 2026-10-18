# 1단계: 스케치 래스터 -> 잡티 제거 + 외곽 스무딩 -> 매끈한 벡터 재추적 -> 완성본 SVG
import sys, os, numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from vectorize import mask_to_path

S = 6.0                      # 래스터 배율 (viewBox 1 = 6px)
VB = (841.89, 595.28)
# 스타일별 스무딩 세기(px). 03은 스캔 테두리 요철이 커서 강하게
SIG = {'01': 1.0, '02': 0.9, '03': 3.0, '04': 1.4, '05': 1.2, '06': 1.0, '07': 1.2}
# 코너(뾰족한 끝) 판정 각도: 작을수록 진짜 뾰족한 곳만 코너로
CORNER = {'01': 75, '02': 80, '03': 70, '04': 45, '05': 55, '06': 65, '07': 55}


def coverage(i, W):
    """Chrome 안티앨리어싱 회색값 -> 잉크 농도(0~1)"""
    im = cv2.imread(os.path.join(W, 'raster', f'r{i}.png'), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    return 1.0 - im


def clean(cov, min_area=600, hole_area=500):
    m = (cov > 0.5).astype(np.uint8)
    # 작은 잉크 조각 제거
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_area
    drop = (~keep[lab]) & (m > 0)
    cov = cov.copy(); cov[cv2.dilate(drop.astype(np.uint8), np.ones((3, 3))) > 0] = 0
    # 작은 구멍(잡티) 메우기
    inv = 1 - (cov > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    small = np.zeros(n, bool); small[1:] = st[1:, cv2.CC_STAT_AREA] < hole_area
    fill = small[lab]
    cov[cv2.dilate(fill.astype(np.uint8), np.ones((3, 3))) > 0] = 1
    # 작은 삐침/흠집 제거: 작은 홈 메우고(closing) 작은 돌기 깎기(opening), 바뀐 픽셀만 반영
    m = (cov > 0.5).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    m2 = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_CLOSE, k), cv2.MORPH_OPEN, k)
    ch = m2 != m
    cov[ch] = m2[ch].astype(np.float32)
    return cov


def trace(cov, i):
    # 윤곽을 선 따라 편 뒤 긴 베지어로 커브 피팅 (울퉁불퉁한 잔표면 없이)
    return mask_to_path(cov, scale=1/S, sigma=SIG[i], step=5.0, corner_ang=min(CORNER[i], 45), csmooth=5.0, fit_err=2.5)


if __name__ == "__main__":
    W, OUT = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    for i in ['01', '02', '03', '04', '05', '06', '07']:
        cov = coverage(i, W)
        if i == '05':
            im = cv2.imread(os.path.join(W, 'raster', 'r05.png'), cv2.IMREAD_GRAYSCALE)
            ys, xs = np.where(im > 128)
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            box = np.zeros_like(cov); box[y0 + 20:y1 - 20, x0 + 20:x1 - 20] = 1
            cov = cov * box
            split = int(310 * S)          # 위 줄 영문 / 아래 줄 한글
            lat = cov.copy(); lat[split:] = 0
            kor = cov.copy(); kor[:split] = 0
            dl, dk = trace(clean(lat), i), trace(clean(kor), i)
            bx0, bx1, by0, by1 = x0 / S, x1 / S, y0 / S, y1 / S
            body = (f'<path fill="#fff" fill-rule="evenodd" d="M{bx0:.2f} {by0:.2f}H{bx1:.2f}V{by1:.2f}H{bx0:.2f}Z{dk}"/>\n'
                    f'  <path fill="#000" fill-rule="evenodd" d="{dl}"/>')
        else:
            body = f'<path fill="#000" fill-rule="evenodd" d="{trace(clean(cov), i)}"/>'
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB[0]} {VB[1]}">\n'
               f'  {body}\n</svg>\n')
        open(os.path.join(OUT, f'fantastic-planet-{i}.svg'), 'w', encoding='utf-8').write(svg)
        print(i, len(svg) // 1024, 'KB')
