/* Carga — Mapas do corpo (grande, mini e de foco) e aba Músculos. */
'use strict';

// ---------- aba Músculos ----------
// mapa corporal 2D reaproveitado: grande (fadiga em vermelho) e mini (músculos do grupo em azul)
const espelha = ([tag, at]) => { // forma do lado esquerdo → lado direito (eixo x = 100)
  const a = { ...at };
  if (tag === 'ellipse') a.cx = 200 - a.cx;
  else if (tag === 'rect') a.x = 200 - a.x - a.width;
  else a.d = a.d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (s, x, y) => `${200 - parseFloat(x)},${y}`);
  return [tag, a];
};

function corpoSvg({ cor, titulo, rotulos = true, estilo = '' }) {
  const el = ([tag, at], m) => {
    const attrs = Object.entries(at).map(([k, v]) => `${k}="${v}"`).join(' ');
    const t = m && titulo ? `<title>${esc(titulo(m))}</title>` : '';
    return `<${tag} ${attrs} fill="${m ? cor(m) : '#262624'}" stroke="var(--card)" stroke-width="1.5">${t}</${tag}>`;
  };
  let g = '';
  for (const [vista, dx, rotulo] of [['f', 0, 'Frente'], ['c', 200, 'Costas']]) {
    g += `<g transform="translate(${dx},0)">`;
    for (const p of CORPO_SVG[vista]) {
      g += el(p.forma, p.m);
      if (p.esp) g += el(espelha(p.forma), p.m);
    }
    if (rotulos) g += `<text x="100" y="326" text-anchor="middle" fill="var(--mudo)" font-size="11">${rotulo}</text>`;
    g += '</g>';
  }
  return `<svg viewBox="0 0 400 ${rotulos ? 332 : 310}" style="${estilo}" aria-hidden="${rotulos ? 'false' : 'true'}">${g}</svg>`;
}

const corpoMini = ms => corpoSvg({ cor: m => ms.includes(m) ? 'var(--azul)' : '#33332f', rotulos: false });

// mapa de foco: ilustração realista (frente + costas) com os músculos "acesos" por cima — vermelho forte = foco,
// vermelho claro = auxiliar. Quando o exercício tem uma PARTE definida (ex.: deltoide lateral) só aquele pedaço acende.
// Máscaras de vendor/anatomia/realista.js (js-rich-body-highlighter, MIT).
const MUSC_INF = ['gluteos', 'quadriceps', 'posteriores', 'adutores', 'panturrilha'];
const MUSC_REAL = {
  peito: ['pectoralis'], costas: ['lats'], trapezio: ['trapezius', 'upper_back'], ombros: ['deltoids', 'deltoids_back'], biceps: ['biceps'],
  triceps: ['triceps'], antebraco: ['forearms', 'forearms_back'], abdomen: ['rectus_abdominis', 'obliques'], lombar: ['lower_back'],
  gluteos: ['glutes'], quadriceps: ['quadriceps'], posteriores: ['hamstrings'], panturrilha: ['calves', 'calves_back'], adutores: [],
};
// [máscara, [x0, x1, y0, y1]] — x medido da borda de FORA do corpo (0) até a linha do meio (1); null = máscara inteira
const PARTE_REAL = {
  delt_ant: [['deltoids', [0.35, 1, 0, 1]]], delt_lat: [['deltoids', [0, 0.45, 0, 1]], ['deltoids_back', [0, 0.45, 0, 1]]],
  delt_post: [['deltoids_back', [0.35, 1, 0, 1]]],
  peito_sup: [['pectoralis', [0, 1, 0, 0.42]]], peito_med: [['pectoralis', [0, 1, 0.3, 0.72]]], peito_inf: [['pectoralis', [0, 1, 0.6, 1]]],
  dorsal: [['lats', null]], meio_costas: [['upper_back', [0, 1, 0.4, 1]]], trap_sup: [['upper_back', [0, 1, 0, 0.45]], ['trapezius', null]],
  biceps_longa: [['biceps', [0, 0.5, 0, 1]]], biceps_curta: [['biceps', [0.5, 1, 0, 1]]], braquial: [['biceps', [0, 1, 0.65, 1]], ['forearms', [0, 1, 0, 0.35]]],
  triceps_longa: [['triceps', [0.5, 1, 0, 1]]], triceps_lat: [['triceps', [0, 0.5, 0, 1]]],
  antebraco_flex: [['forearms', null]], antebraco_ext: [['forearms_back', null]],
  gluteo_max: [['glutes', null]], gluteo_med: [['glutes', [0, 0.55, 0, 0.4]]],
  gastro: [['calves_back', [0, 1, 0, 0.55]]], soleo: [['calves_back', [0, 1, 0.5, 1]]],
  abd_sup: [['rectus_abdominis', [0, 1, 0, 0.5]]], abd_inf: [['rectus_abdominis', [0, 1, 0.5, 1]]], obliquos: [['obliques', null]],
};
const MASK_REAL = Object.fromEntries(ANAT_REAL.masks.map(m => [m.id, m]));
let caixasReal = null, clipN = 0;
function medeCaixas() { // caixa de cada lado do corpo por máscara (coordenadas da máscara) — medida uma vez no navegador
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('style', 'position:absolute;left:-9999px;width:1px;height:1px;visibility:hidden');
  document.body.appendChild(svg);
  caixasReal = {};
  for (const m of ANAT_REAL.masks) {
    const lados = {};
    for (const sub of m.d.split(/(?=M)/)) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', sub);
      svg.appendChild(p);
      const b = p.getBBox();
      svg.removeChild(p);
      const lado = b.x + b.width / 2 + m.o[0] * ANAT_REAL.px2mm < ANAT_REAL.w / 2 ? 'e' : 'd';
      const u = lados[lado];
      lados[lado] = !u ? { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height }
        : { x0: Math.min(u.x0, b.x), x1: Math.max(u.x1, b.x + b.width), y0: Math.min(u.y0, b.y), y1: Math.max(u.y1, b.y + b.height) };
    }
    caixasReal[m.id] = lados;
  }
  svg.remove();
}

function mapaFoco(ex, altura) {
  if (!caixasReal) medeCaixas();
  const ms = ex.musculos, top = Math.max(...Object.values(ms));
  const nivel = f => f >= 0.4 || f === top ? 'foco' : f >= 0.2 ? 'aux' : 'aux2';
  const partes = ex.foco.filter(id => PARTES[id]);
  const pecas = { f: [], c: [] };
  for (const [m, f] of Object.entries(ms)) {
    const n = nivel(f), ps = partes.filter(id => PARTES[id].p[0].m === m);
    const lista = ps.length ? ps.flatMap(id => PARTE_REAL[id] || []) : (MUSC_REAL[m] || []).map(id => [id, null]);
    for (const [id, frac] of lista) if (MASK_REAL[id]) pecas[MASK_REAL[id].v].push({ mk: MASK_REAL[id], frac, n });
  }
  const ordem = { aux2: 0, aux: 1, foco: 2 }; // foco por cima
  const estilo = { foco: ['#ff1a1a', 0.85], aux: ['#ff4d4d', 0.6], aux2: ['#ff4d4d', 0.35] };
  const env = Object.keys(ms).filter(m => ms[m] >= 0.15);
  const baixo = env.some(m => MUSC_INF.includes(m)), cima = env.some(m => !MUSC_INF.includes(m) && m !== 'lombar');
  const [fy0, fy1] = !baixo ? [0.04, 0.55] : !cima ? (ms.lombar >= 0.15 ? [0.36, 1] : [0.42, 1]) : [0, 1];
  const W = ANAT_REAL.w, H = ANAT_REAL.h, vb = `${0.14 * W} ${fy0 * H} ${0.72 * W} ${(fy1 - fy0) * H}`;
  const vista = v => {
    let defs = '', corpo = '';
    for (const { mk, frac, n } of pecas[v].sort((a, b) => ordem[a.n] - ordem[b.n])) {
      let clip = '';
      if (frac) {
        const id = 'cf' + (++clipN), [fx0, fx1, y0, y1] = frac;
        const rects = ['e', 'd'].map(l => {
          const b = caixasReal[mk.id][l];
          if (!b) return '';
          const w = b.x1 - b.x0, h = b.y1 - b.y0;
          const x = l === 'e' ? b.x0 + fx0 * w : b.x1 - fx1 * w; // "fora" é a esquerda no lado esquerdo e a direita no direito
          return `<rect x="${x}" y="${b.y0 + y0 * h}" width="${(fx1 - fx0) * w}" height="${(y1 - y0) * h}"/>`;
        }).join('');
        defs += `<clipPath id="${id}">${rects}</clipPath>`;
        clip = ` clip-path="url(#${id})"`;
      }
      const [cor, op] = estilo[n];
      corpo += `<path transform="translate(${mk.o[0] * ANAT_REAL.px2mm} ${mk.o[1] * ANAT_REAL.px2mm})" d="${mk.d}" fill="${cor}" fill-opacity="${op}"${clip}/>`;
    }
    return `<svg viewBox="${vb}" style="height:${altura}px;width:auto;isolation:isolate">${defs ? `<defs>${defs}</defs>` : ''}
      <image href="vendor/anatomia/male-${v === 'f' ? 'front' : 'back'}-dark.webp" width="${W}" height="${H}"/><g style="mix-blend-mode:color">${corpo}</g></svg>`;
  };
  return `<div class="mapa-foco" aria-hidden="true">${vista('f')}${vista('c')}</div>`;
}

// texto do foco: partes (ou músculos inteiros) do alvo principal × auxiliares
function focoInfo(ex) {
  const ms = Object.entries(ex.musculos).filter(([, f]) => f >= 0.15).sort((a, b) => b[1] - a[1]);
  const top = ms.length ? ms[0][1] : 0;
  const foco = [], aux = [];
  const partes = ex.foco.filter(id => PARTES[id]).map(id => PARTES[id]);
  const cobertos = new Set(partes.flatMap(pt => pt.p.slice(1).map(pc => pc.m))); // ex.: braquial já inclui o antebraço
  for (const [m, f] of ms) {
    const ps = partes.filter(pt => pt.p[0].m === m);
    if (!ps.length && cobertos.has(m)) continue;
    const itens = ps.length ? ps.map(pt => ({ nome: pt.nome, info: pt.info })) : [{ nome: nomeCurto(m) }];
    (f >= 0.4 || f === top ? foco : aux).push(...itens);
  }
  return { foco, aux };
}

function renderMusculos() {
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  const cor = m => { // fadiga (100 − % recuperado) vira intensidade de vermelho — rampa sequencial de um matiz
    const t = Math.min(1, (100 - recup[m]) / 100 * 1.15);
    const c = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${c(51, 208)},${c(51, 59)},${c(47, 59)})`; // #33332f → #d03b3b
  };
  $('mapa-corpo').innerHTML = corpoSvg({
    cor, titulo: m => `${muscMap[m].nome} — ${recup[m]}% recuperado`,
    estilo: 'width:100%;max-width:340px;display:block;margin:0 auto',
  }) + '<div class="escala"><span>descansado</span><div></div><span>fatigado</span></div>';
  const el = $('musculos-grid');
  el.innerHTML = MUSCULOS.map(m => {
    const pct = recup[m.id];
    const ultimo = ultimoTreino(m.id);
    const estado = pct >= 85 ? '✅ Pronto' : `⏳ ~${horasAtePronto(m.id)}h p/ 90%`;
    return `<div class="musculo">
      <div class="cab"><span class="nome">${esc(m.nome)}</span><span class="estado" style="color:${corPct(pct)}">${estado} · ${pct}%</span></div>
      <div class="barra"><div style="width:${pct}%;background:${corPct(pct)}"></div></div>
      <div class="rodape">${ultimo ? 'último treino: ' + dataBr(ultimo) : 'nunca treinado'}</div>
      <div class="fb">
        ${pct < 90 ? `<button data-fb="pronto" data-m="${m.id}">💪 Já recuperei</button>` : ''}
        ${pct >= 60 ? `<button data-fb="mais" data-m="${m.id}">😮‍💨 Preciso de mais tempo</button>` : ''}
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-fb]').forEach(b => b.onclick = () => feedbackMusculo(b.dataset.m, b.dataset.fb));
}

// feedback do usuário corrige a exibição agora E calibra o fator de recuperação do perfil
function feedbackMusculo(mId, tipo) {
  overrides[mId] = { tipo, ts: Date.now() };
  perfil.fator = tipo === 'pronto'
    ? Math.max(0.7, +(perfil.fator * 0.95).toFixed(2))
    : Math.min(1.3, +(perfil.fator * 1.05).toFixed(2));
  salvarPerfil();
  salvarOverrides();
  toast(tipo === 'pronto' ? 'Anotado! Modelo ajustado: você recupera mais rápido 💪' : 'Ok, dando mais tempo pra esse músculo 😮‍💨');
  renderMusculos();
}
