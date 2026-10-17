# src/data/drawn.json(전체) -> public/glyphs/<스타일>.json (사이트에서 고른 스타일만 내려받기)
import json, os, sys
src = sys.argv[1] if len(sys.argv) > 1 else 'src/data/drawn.json'
os.makedirs('public/glyphs', exist_ok=True)
for sid, gl in json.load(open(src, encoding='utf-8')).items():
    p = f'public/glyphs/{sid}.json'
    json.dump(gl, open(p, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print(sid, os.path.getsize(p) // 1024, 'KB')
