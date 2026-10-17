# 스케치 래스터 -> 잉크 마스크 -> 연결요소 목록 + 번호 붙인 미리보기
import sys, os, numpy as np, cv2, json
W = sys.argv[1]
out = {}
for i in ['01','02','03','04','05','06','07']:
    im = cv2.imread(os.path.join(W,'raster',f'r{i}.png'), cv2.IMREAD_GRAYSCALE)
    ink = (im < 128).astype(np.uint8)
    if i == '05':
        # 흰 박스 안쪽만: 박스 = 밝은 영역의 bbox
        ys, xs = np.where(im > 128)
        x0,x1,y0,y1 = xs.min(), xs.max(), ys.min(), ys.max()
        m = np.zeros_like(ink); m[y0+20:y1-20, x0+20:x1-20] = 1
        ink = ink * m
    np.save(os.path.join(W,'raster',f'ink{i}.npy'), ink)
    n, lab, st, cen = cv2.connectedComponentsWithStats(ink, 8)
    comps = []
    for k in range(1,n):
        x,y,w,h,a = st[k]
        if a < 400: continue
        comps.append(dict(k=int(k),x=int(x),y=int(y),w=int(w),h=int(h),a=int(a)))
    comps.sort(key=lambda c:c['x'])
    out[i] = comps
    vis = cv2.cvtColor((255-ink*255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    for j,c in enumerate(comps):
        cv2.rectangle(vis,(c['x'],c['y']),(c['x']+c['w'],c['y']+c['h']),(0,0,255),4)
        cv2.putText(vis,str(j),(c['x'],c['y']-10),cv2.FONT_HERSHEY_SIMPLEX,3,(255,0,0),6)
    ys,xs = np.where(ink>0)
    vis = vis[max(0,ys.min()-150):ys.max()+60, max(0,xs.min()-60):xs.max()+60]
    s = 1800/vis.shape[1]
    cv2.imwrite(os.path.join(W,'raster',f'seg{i}.png'), cv2.resize(vis,None,fx=s,fy=s,interpolation=cv2.INTER_AREA))
    print(i, len(comps), [ (j,c['x']//6,c['w']//6,c['a']) for j,c in enumerate(comps)])
json.dump(out, open(os.path.join(W,'comps.json'),'w'))
