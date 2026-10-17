import './style.css';
import { STYLES, styleById } from './engine/styles.js';
import { layout, compose, toSVG } from './engine/layout.js';
import { registerDrawn, hasDrawn, clearGlyphCache } from './engine/glyphs.js';

// 손그림 글자는 스타일별 파일을 고를 때 내려받는다
const loading = {};
function ensure(id) {
  if (hasDrawn(id)) return Promise.resolve();
  return (loading[id] ||= fetch(`glyphs/${id}.json`).then((r) => r.json()).then((list) => { registerDrawn(id, list); clearGlyphCache(); }).catch(() => {}));
}

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('fpt:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fpt:' + k, JSON.stringify(v)); } catch {} },
};

// 모노톤 조합만: [글자, 배경]
const TONES = [['#111111', '#ffffff'], ['#ffffff', '#111111'], ['#111111', '#ededed'], ['#6f6f6f', '#ffffff'], ['#ededed', '#2a2a2a']];

const state = {
  text: store.get('text', 'Fantastic Planet'),
  style: store.get('style', '07'),
  mode: 'one',
  size: store.get('size', 140), track: store.get('track', 0), lead: store.get('lead', 100), align: store.get('align', 'center'),
  alt: store.get('alt', true), jit: store.get('jit', true), fx: store.get('fx', true),
  tone: store.get('tone2', 0),
};
const ink = () => TONES[state.tone][0], paper = () => TONES[state.tone][1];

// 주소로 공유: ?t=문구&s=07&mode=all
const qs = new URLSearchParams(location.search);
if (qs.get('t')) state.text = qs.get('t');
state.text = state.text.replace(/[ᄀ-ᇿ㄰-㆏가-힣]/g, '');
if (qs.get('s') && styleById[qs.get('s')]) state.style = qs.get('s');
const startMode = ['one', 'all', 'sketch'].includes(qs.get('mode')) ? qs.get('mode') : 'one';

// ---------- 렌더 ----------
function build(st, text = state.text, exact = false) {
  const L = layout(text || ' ', st, {
    tracking: state.track, leading: state.lead / 100, align: state.align,
    alternates: state.alt, jitter: state.jit,
  });
  return compose(L, st, { merge: state.fx, halo: state.fx, box: state.fx && !!st.box, knock: state.fx, exact });
}
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
function svgOf(C, scale = state.size / 1000) {
  const boxed = C.layers.some((l) => l.role === 'box');
  // 05 박스: 바깥은 중간 회색 -> 뚫린 한글이 보이게
  return toSVG(C, { ink: ink(), paper: boxed ? mix(ink(), paper(), 0.5) : paper(), boxColor: paper(),
    width: Math.max(1, Math.round(C.vb.w * scale)) });
}
const pad = (n) => String(n).padStart(2, '0');

let last = null, job = 0;
async function render() {
  const my = ++job;
  if (state.mode === 'one') await ensure(state.style);
  else if (state.mode === 'all') await Promise.all(STYLES.map((s) => ensure(s.id)));
  if (my !== job) return;
  const stage = $('#stage');
  stage.style.setProperty('--paper', paper());
  stage.className = 'stage ' + state.mode;
  if (state.mode === 'sketch') {
    stage.innerHTML = STYLES.map((st, i) => `
      <figure class="row"><div class="meta"><span>${st.name} <span class="d">— sketch, refined</span></span>
      <span><a class="dl" href="polished/fantastic-planet-${st.id}.svg" download>svg</a>&nbsp;&nbsp;${pad(i + 1)}</span></div>
      <img src="polished/fantastic-planet-${st.id}.svg" alt="${st.name} 완성본 레터링" loading="lazy" /></figure>`).join('');
    return;
  }
  if (state.mode === 'one') {
    const st = styleById[state.style];
    const t0 = performance.now();
    const empty = !state.text.trim();
    const C = empty ? null : build(st);
    last = C ? { C, st } : null;
    stage.innerHTML = `<div class="meta"><span>${st.name} <span class="d">— ${st.note}</span></span><span>${st.id} / 07</span></div><div class="art">${C ? svgOf(C) : ''}</div>`;
    $('#hint').textContent = `${Math.round(performance.now() - t0)} ms`;
    return;
  }
  stage.innerHTML = STYLES.map((st) => `<figure class="row" data-id="${st.id}"><div class="meta"><span>${st.name} <span class="d">— ${st.ko}</span></span><span>${st.id}</span></div><div class="art pending"></div></figure>`).join('');
  let i = 0;
  const step = () => {
    if (my !== job || i >= STYLES.length) return;
    const st = STYLES[i++];
    const el = stage.querySelector(`[data-id="${st.id}"] .art`);
    el.classList.remove('pending');
    el.innerHTML = state.text.trim() ? svgOf(build(st), Math.min(state.size, 110) / 1000) : '';
    el.onclick = () => { state.style = st.id; store.set('style', st.id); setMode('one'); };
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

let timer = 0;
const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 120); };

function paintStyles() {
  const box = $('#styles');
  if (!box.children.length) {
    box.innerHTML = STYLES.map((st) => `<li><button data-id="${st.id}" title="${st.note}"><span class="n">${st.id}</span><span class="t">${st.name}</span><span class="ko">${st.ko}</span></button></li>`).join('');
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      state.style = b.dataset.id; store.set('style', state.style);
      if (state.mode !== 'one') setMode('one'); else { paintStyles(); schedule(); }
    }));
  }
  box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === state.style));
}

function setMode(m) {
  state.mode = m;
  document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  paintStyles(); render();
}

function bind() {
  const txt = $('#txt');
  txt.value = state.text;
  // 한글은 입력받지 않는다 (조합 중엔 기다렸다가 끝나면 지움)
  const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/g;
  let composing = false;
  const strip = () => {
    if (!HANGUL.test(txt.value)) return;
    HANGUL.lastIndex = 0;
    const pos = txt.selectionStart - (txt.value.slice(0, txt.selectionStart).match(HANGUL) || []).length;
    txt.value = txt.value.replace(HANGUL, '');
    txt.setSelectionRange(pos, pos);
    flash('한글은 입력할 수 없어요 — 영문·숫자·기호만 가능해요');
  };
  txt.addEventListener('compositionstart', () => { composing = true; });
  txt.addEventListener('compositionend', () => { composing = false; strip(); state.text = txt.value; store.set('text', state.text); schedule(); });
  txt.addEventListener('input', () => {
    if (composing) return;
    strip();
    state.text = txt.value; store.set('text', state.text); schedule();
  });
  const range = (id, fmt) => {
    const el = $('#' + id), out = $('#' + id + 'V');
    el.value = state[id];
    const show = () => { out.textContent = fmt(state[id]); };
    show();
    el.addEventListener('input', () => { state[id] = +el.value; store.set(id, state[id]); show(); schedule(); });
  };
  range('size', (v) => v + 'px');
  range('track', (v) => (v > 0 ? '+' : '') + v);
  range('lead', (v) => v + '%');
  const al = $('#align').querySelectorAll('button');
  al.forEach((b) => {
    b.classList.toggle('on', b.dataset.v === state.align);
    b.addEventListener('click', () => { state.align = b.dataset.v; store.set('align', state.align); al.forEach((x) => x.classList.toggle('on', x === b)); schedule(); });
  });
  for (const k of ['alt', 'jit', 'fx']) {
    const el = $('#' + k);
    el.classList.toggle('on', state[k]); el.setAttribute('aria-pressed', state[k]);
    el.addEventListener('click', () => {
      state[k] = !state[k]; store.set(k, state[k]);
      el.classList.toggle('on', state[k]); el.setAttribute('aria-pressed', state[k]); schedule();
    });
  }
  const tones = $('#presets');
  tones.innerHTML = TONES.map(([i, p], n) => `<button class="tone" style="--i:${i};--p:${p}" data-n="${n}" aria-label="톤 ${n + 1}"></button>`).join('');
  const paintTones = () => tones.querySelectorAll('.tone').forEach((b) => b.classList.toggle('on', +b.dataset.n === state.tone));
  paintTones();
  tones.querySelectorAll('.tone').forEach((b) => b.addEventListener('click', () => { state.tone = +b.dataset.n; store.set('tone2', state.tone); paintTones(); schedule(); }));
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  const fname = () => `${(state.text.trim().split('\n')[0] || 'type').slice(0, 24).replace(/[\\/:*?"<>|\s]+/g, '_')}_${state.style}`;
  // 저장할 때는 정밀 계산(03 겹침 틈을 실제 윤곽으로)
  const current = () => ({ C: build(styleById[state.style], state.text.trim() ? state.text : ' ', true) });
  $('#dlSvg').addEventListener('click', () => download(new Blob([svgOf(current().C)], { type: 'image/svg+xml' }), fname() + '.svg'));
  $('#copySvg').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(svgOf(current().C)); flash('복사했어요 — 피그마·일러스트에 바로 붙여넣기'); }
    catch { flash('복사가 막혀 있어요. SVG 저장을 써 주세요.'); }
  });
  $('#dlPng').addEventListener('click', () => {
    const { C } = current();
    const svg = svgOf(C, Math.min(8000 / C.vb.w, (state.size / 1000) * 3));   // 화면 크기의 3배, 최대 가로 8000px
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      cv.toBlob((b) => download(b, fname() + '.png'), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function flash(msg) { $('#hint').textContent = msg; }

bind();
setMode(startMode);
