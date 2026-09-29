/* Carga — Fotos/animação de execução do exercício. */
'use strict';

// ---------- animação ilustrativa do exercício ----------
// ponytail: boneco palito com 2 poses interpoladas cobre os movimentos sem foto com ~23 padrões;
// GIFs reais = licença + megabytes + quebra o offline. Trocar por vídeo/GIF se um dia fizer sentido.
let animRAF = null, animInterval = null, animToken = 0;
function pararAnim() {
  cancelAnimationFrame(animRAF);
  clearInterval(animInterval);
  animToken++;
}

let urlGif = null;
async function mostraAnim(exId) {
  pararAnim();
  const box = $('anim-ex'), ex = exMap[exId], token = animToken;
  if (!box) return;
  let gif = null;
  try { gif = await idbReq((await txGifs('readonly')).get(exId)); } catch { /* sem IndexedDB */ }
  if (token !== animToken || !box.isConnected) return;
  if (urlGif) { URL.revokeObjectURL(urlGif); urlGif = null; }
  if (gif) { montaGif(box, ex, gif.blob); return; }
  if (!ex || (!ex.img && !ex.fe && !ANIMS[ex.anim])) { box.hidden = true; return; }
  if (ex.img) montaFotos(box, ex, q => `imgs/${ex.img}_${q}.jpg`);
  else if (ex.fe) montaFotos(box, ex, q => `${FE_URL}/${ex.fe}/${q}.jpg`);
  else montaBoneco(box, ex.anim);
}

// GIF (ou vídeo) que o próprio usuário escolheu — fica só no IndexedDB deste aparelho, nunca vai para o site
function montaGif(box, ex, blob) {
  urlGif = URL.createObjectURL(blob);
  box.hidden = false;
  if (blob.type.startsWith('video/')) {
    box.innerHTML = `<video src="${urlGif}" autoplay loop muted playsinline aria-label="Execução: ${esc(ex.nome)}"></video>`;
  } else {
    box.innerHTML = `<img src="${urlGif}" alt="Execução: ${esc(ex.nome)}">`;
    box.querySelector('img').onclick = () => abreLightbox(urlGif);
  }
  box.classList.add('gif');
}

// dois quadros alternados = efeito GIF (fotos do dataset aberto free-exercise-db); sem foto, cai no boneco
const FE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
function montaFotos(box, ex, quadroUrl) {
  const token = animToken;
  box.hidden = false;
  box.classList.remove('gif');
  box.innerHTML = `<img src="${quadroUrl(0)}" alt="Execução: ${esc(ex.nome)}">`;
  const img = box.querySelector('img');
  img.onerror = () => { if (token === animToken) { pararAnim(); montaBoneco(box, ex.anim); } }; // sem internet/foto: boneco
  img.onclick = () => abreLightbox(img.src);
  new Image().src = quadroUrl(1); // pré-carrega o 2º quadro
  let quadro = 0;
  animInterval = setInterval(() => { quadro = 1 - quadro; img.src = quadroUrl(quadro); }, 700);
}

function montaBoneco(box, animId) {
  const an = ANIMS[animId];
  if (!an) { box.hidden = true; return; }
  box.hidden = false;
  box.classList.remove('gif');
  box.innerHTML = '<svg viewBox="0 0 100 100" width="92" height="92"></svg>';
  const svg = box.querySelector('svg');
  const NS = 'http://www.w3.org/2000/svg';
  // cenário estático
  let fundo = '';
  if (an.chao) fundo += `<line x1="12" y1="${an.chao}" x2="88" y2="${an.chao}" stroke="#4d4d46" stroke-width="2" stroke-linecap="round"/>`;
  if (an.topo) fundo += `<line x1="30" y1="10" x2="70" y2="10" stroke="#4d4d46" stroke-width="3" stroke-linecap="round"/>`;
  if (an.banco) fundo += `<rect x="${an.banco[0]}" y="${an.banco[1]}" width="${an.banco[2]}" height="${an.banco[3]}" rx="2" fill="#4d4d46"/>`;
  if (an.linha) fundo += `<line x1="${an.linha[0]}" y1="${an.linha[1]}" x2="${an.linha[2]}" y2="${an.linha[3]}" stroke="#4d4d46" stroke-width="3" stroke-linecap="round"/>`;
  svg.innerHTML = fundo;
  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    svg.appendChild(n);
    return n;
  };
  const cabo = an.ancora ? el('line', { stroke: 'var(--grade)', 'stroke-width': 1.5 }) : null;
  const segs = [['om', 'qu'], ['ca', 'om'], ['om', 'co'], ['co', 'ma'], ['qu', 'jo'], ['jo', 'pe']]
    .map(par => ({ par, el: el('line', { stroke: 'var(--ink2)', 'stroke-width': 4.5, 'stroke-linecap': 'round' }) }));
  const cabeca = el('circle', { r: 5.5, fill: 'var(--ink2)' });
  const peso = an.peso ? el('circle', { r: 4.5, fill: 'var(--pagina)', stroke: 'var(--azul)', 'stroke-width': 2.5 }) : null;

  const t0 = performance.now();
  const passo = agora => {
    const t = (Math.sin((agora - t0) / 1400 * 2 * Math.PI - Math.PI / 2) + 1) / 2; // vai-e-vem suave
    const P = {};
    for (const j in an.A) P[j] = [an.A[j][0] + (an.B[j][0] - an.A[j][0]) * t, an.A[j][1] + (an.B[j][1] - an.A[j][1]) * t];
    for (const { par: [a, b], el: l } of segs) {
      l.setAttribute('x1', P[a][0]); l.setAttribute('y1', P[a][1]);
      l.setAttribute('x2', P[b][0]); l.setAttribute('y2', P[b][1]);
    }
    cabeca.setAttribute('cx', P.ca[0]); cabeca.setAttribute('cy', P.ca[1]);
    const pp = P[an.pesoEm || 'ma'];
    if (peso) { peso.setAttribute('cx', pp[0]); peso.setAttribute('cy', pp[1]); }
    if (cabo) {
      cabo.setAttribute('x1', an.ancora[0]); cabo.setAttribute('y1', an.ancora[1]);
      cabo.setAttribute('x2', P.ma[0]); cabo.setAttribute('y2', P.ma[1]);
    }
    animRAF = requestAnimationFrame(passo);
  };
  animRAF = requestAnimationFrame(passo);
}

function abreLightbox(src) {
  $('lightbox').querySelector('img').src = src;
  $('lightbox').classList.add('aberto');
}
