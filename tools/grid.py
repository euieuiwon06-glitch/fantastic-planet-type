import sys, os, numpy as np, cv2
W, i, x0, x1, y0, y1 = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
ink = np.load(os.path.join(W,'raster',f'ink{i}.npy'))
S=6
crop = ink[y0*S:y1*S, x0*S:x1*S]
vis = cv2.cvtColor((255-crop*200).astype(np.uint8), cv2.COLOR_GRAY2BGR)
for x in range(x0 - x0%10, x1, 10):
    c=(0,0,255) if x%50==0 else (200,200,255)
    cv2.line(vis,((x-x0)*S,0),((x-x0)*S,vis.shape[0]),c,3 if x%50==0 else 1)
    if x%50==0: cv2.putText(vis,str(x),((x-x0)*S+4,40),cv2.FONT_HERSHEY_SIMPLEX,1.4,(0,0,255),3)
for y in range(y0 - y0%10, y1, 10):
    c=(0,160,0) if y%50==0 else (200,255,200)
    cv2.line(vis,(0,(y-y0)*S),(vis.shape[1],(y-y0)*S),c,3 if y%50==0 else 1)
    if y%50==0: cv2.putText(vis,str(y),(4,(y-y0)*S-6),cv2.FONT_HERSHEY_SIMPLEX,1.4,(0,140,0),3)
s=min(1.0, 1900/vis.shape[1])
cv2.imwrite(sys.argv[7], cv2.resize(vis,None,fx=s,fy=s,interpolation=cv2.INTER_AREA))
