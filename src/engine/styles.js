// 7개 스타일 정의: 스케치에서 측정한 비율 + 붓 규칙 + 배치 효과
// 단위: 엑스하이트 = 500 (스케치에서 그린 글자도 같은 기준으로 정규화되어 있음)
// asc/cap/dsc: 어센더·대문자 높이·디센더 (y 위로 기준 값), sx: 가로 비율, gap: 글자 사이 기본 간격

export const STYLES = [
  {
    id: '01', name: 'Thorn Drip', ko: '가시 물방울',
    note: '굵게 부푼 줄기 끝이 가시로 뻗고, 바닥은 녹아 흘러내림',
    asc: 900, cap: 888, dsc: -280, sx: 1.05, gap: 36, space: 300, lineGap: 170,
    jitter: { rot: 2.2, dy: 14 },
    brush: {
      R: 50, thin: 0.6, waist: -0.32, wobble: 0.1, dot: 1.25, close: 0.45, step: 7,
      ends: {
        top: { type: 'spike', len: 3.4, ext: 2.4 },
        bottom: { type: 'drip', len: 4.2, amt: 0.45, ext: 1.6 },
        bar: { type: 'spike', len: 4.2, ext: 3.2 },
        hook: { type: 'spike', len: 3.2, ext: 1.8 },
      },
    },
    ko_: { size: 1.02, rs: 0.78, sx: 0.98 },
  },
  {
    id: '02', name: 'Needle', ko: '바늘 가시',
    note: '01보다 가늘고 날카롭게, 획 끝이 길게 찔러 나감',
    asc: 880, cap: 847, dsc: -300, sx: 1.05, gap: 30, space: 300, lineGap: 170,
    jitter: { rot: 2.6, dy: 16 },
    brush: {
      R: 40, thin: 0.46, waist: -0.36, wobble: 0.1, dot: 1.4, close: 0.4, step: 7,
      ends: {
        top: { type: 'spike', len: 4.6, ext: 3.6, pow: 1.1 },
        bottom: { type: 'spike', len: 4.2, ext: 3.0, pow: 1.0 },
        bar: { type: 'spike', len: 5, ext: 4.6, pow: 1.1 },
        hook: { type: 'spike', len: 4, ext: 2.6 },
      },
    },
    ko_: { size: 1.02, rs: 0.8, sx: 0.98 },
  },
  {
    id: '03', name: 'Interlock', ko: '맞물린 블록',
    note: '아주 굵은 획이 서로 겹쳐 맞물리고, 흰 틈으로 글자를 가름',
    asc: 840, cap: 822, dsc: -220, sx: 1.22, gap: -36, space: 260, lineGap: 120,
    halo: 15, jitter: { rot: 1.2, dy: 10 },
    brush: {
      R: 84, thin: 0.58, waist: 0.04, wobble: 0.07, dot: 1.15, close: 0.3, step: 8,
      ends: {
        top: { type: 'flare', len: 2.0, amt: 0.55, sharp: 0.55 },
        bottom: { type: 'flare', len: 2.4, amt: 1.05 },
        bar: { type: 'spike', len: 2.6, ext: 1.8 },
        hook: { type: 'spike', len: 2.2, ext: 1.1 },
      },
    },
    ko_: { size: 1.0, rs: 0.62, sx: 1.0 },
  },
  {
    id: '04', name: 'Blob', ko: '말랑 블롭',
    note: '모든 끝이 동그란 방울, 이웃 글자와 녹아 붙음',
    asc: 860, cap: 798, dsc: -270, sx: 1.05, gap: 34, space: 270, lineGap: 120,
    jitter: { rot: 1.5, dy: 12 },
    brush: {
      R: 72, thin: 1, waist: 0.12, dot: 1.45, close: 0.6, step: 7,
      ends: {
        top: { type: 'ball', size: 1.35, len: 2.2, neck: 0.25 },
        bottom: { type: 'ball', size: 1.45, len: 2.2, neck: 0.25 },
        bar: { type: 'ball', size: 1.3, len: 2.0, neck: 0.28 },
        hook: { type: 'ball', size: 1.35, len: 2.0, neck: 0.25 },
      },
    },
    ko_: { size: 1.02, rs: 0.5, sx: 1.0, brush: { close: 0.15 } },
  },
  {
    id: '05', name: 'Bulb Box', ko: '구근 박스',
    note: '굵은 몸통과 머리카락처럼 가는 획의 대비, 박스 안 반전 한글',
    asc: 790, cap: 757, dsc: -230, sx: 0.95, gap: 30, space: 260, lineGap: 170,
    box: true, koKnock: true,
    brush: {
      R: 54, thin: 0.2, cpow: 1.15, waist: -0.06, dot: 1.2, close: 0.3, step: 7,
      ends: {
        top: { type: 'spike', len: 2.0, ext: 0.8 },
        bottom: { type: 'flare', len: 1.6, amt: 0.25 },
        bar: { type: 'spike', len: 1.6, ext: 0.6 },
        hook: { type: 'ball', size: 1.05, len: 2.0, neck: 0.1 },
      },
    },
    ko_: { size: 1.0, rs: 0.7, sx: 1.0, brush: { thin: 0.75, waist: -0.2, wobble: 0.08, ends: {
      top: { type: 'flare', len: 2.6, amt: 0.7, sharp: 0.35 }, bottom: { type: 'flare', len: 2.6, amt: 0.7, sharp: 0.35 },
      bar: { type: 'flare', len: 3, amt: 0.6, sharp: 0.4 }, hook: { type: 'flare', len: 3, amt: 0.6, sharp: 0.4 } } } },
  },
  {
    id: '06', name: 'Nouveau', ko: '아르누보',
    note: '허리가 잘록한 줄기, 뾰족하게 퍼지는 세리프와 작은 물방울',
    asc: 860, cap: 894, dsc: -260, sx: 0.9, gap: 40, space: 250, lineGap: 150,
    brush: {
      R: 30, thin: 0.5, waist: 0.3, dot: 1.3, close: 0.3, step: 7,
      ends: {
        top: { type: 'flare', len: 2.6, amt: 0.95, sharp: 0.55 },
        bottom: { type: 'flare', len: 3.0, amt: 1.15, sharp: 0.5 },
        bar: { type: 'spike', len: 2.6, ext: 1.2 },
        hook: { type: 'ball', size: 1.3, len: 2.0, neck: 0.15 },
      },
    },
    ko_: { size: 1.0, rs: 0.9, sx: 0.98 },
  },
  {
    id: '07', name: 'Groovy', ko: '70s 그루비',
    note: '굵은 몸통, 나팔처럼 퍼지는 바닥, 동글게 말린 끝',
    asc: 760, cap: 717, dsc: -230, sx: 1.0, gap: 26, space: 250, lineGap: 140,
    brush: {
      R: 58, thin: 0.6, waist: 0.2, dot: 1.25, close: 0.35, step: 7,
      ends: {
        top: { type: 'flare', len: 2.0, amt: 0.35 },
        bottom: { type: 'flare', len: 2.6, amt: 0.85 },
        bar: { type: 'flare', len: 1.6, amt: 0.3 },
        hook: { type: 'ball', size: 1.3, len: 2.2, neck: 0.12 },
      },
    },
    ko_: { size: 1.0, rs: 0.72, sx: 1.0 },
  },
];

export const styleById = Object.fromEntries(STYLES.map((s) => [s.id, s]));
