/* Carga — Mapas do corpo (fadiga, mini e de foco) e aba Músculos. */
'use strict';

// ---------- mapas do corpo (ilustração realista) ----------
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
  for (const v of ['f', 'c']) pecas[v] = pecas[v].sort((a, b) => ordem[a.n] - ordem[b.n]).map(p => ({ ...p, cor: estilo[p.n][0], op: estilo[p.n][1] }));
  const env = Object.keys(ms).filter(m => ms[m] >= 0.15);
  const baixo = env.some(m => MUSC_INF.includes(m)), cima = env.some(m => !MUSC_INF.includes(m) && m !== 'lombar');
  const [fy0, fy1] = !baixo ? [0.04, 0.55] : !cima ? (ms.lombar >= 0.15 ? [0.36, 1] : [0.42, 1]) : [0, 1];
  const W = ANAT_REAL.w, H = ANAT_REAL.h, vb = `${0.14 * W} ${fy0 * H} ${0.72 * W} ${(fy1 - fy0) * H}`;
  const st = `height:${altura}px;width:auto`;
  return `<div class="mapa-foco" aria-hidden="true">${vistaReal('f', pecas.f, vb, st)}${vistaReal('c', pecas.c, vb, st)}</div>`;
}

// uma vista (f = frente, c = costas) da ilustração com as peças {mk, frac, cor, op, titulo} pintadas por cima
function vistaReal(v, pecas, vb, estilo) {
  if (!caixasReal) medeCaixas();
  let defs = '', corpo = '';
  for (const { mk, frac, cor, op, titulo } of pecas) {
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
    corpo += `<path transform="translate(${mk.o[0] * ANAT_REAL.px2mm} ${mk.o[1] * ANAT_REAL.px2mm})" d="${mk.d}" fill="${cor}" fill-opacity="${op}"${clip}>${titulo ? `<title>${esc(titulo)}</title>` : ''}</path>`;
  }
  const W = ANAT_REAL.w, H = ANAT_REAL.h;
  return `<svg viewBox="${vb}" style="${estilo};isolation:isolate">${defs ? `<defs>${defs}</defs>` : ''}
    <image href="vendor/anatomia/male-${v === 'f' ? 'front' : 'back'}-dark.webp" width="${W}" height="${H}"/><g style="mix-blend-mode:color">${corpo}</g></svg>`;
}

// mini: frente + costas inteiras com os músculos do grupo acesos (botões de grupo e sugestão do dia)
function corpoMini(ms) {
  const pecas = { f: [], c: [] };
  for (const m of ms) for (const id of MUSC_REAL[m] || []) {
    const mk = MASK_REAL[id];
    if (mk) pecas[mk.v].push({ mk, cor: '#ff1a1a', op: 0.85 });
  }
  const W = ANAT_REAL.w, H = ANAT_REAL.h, vb = `${0.14 * W} 0 ${0.72 * W} ${H}`;
  return `<span class="corpo-mini" aria-hidden="true">${vistaReal('f', pecas.f, vb, '')}${vistaReal('c', pecas.c, vb, '')}</span>`;
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

let muscFiltro = 'todos', muscAberto = null;
function renderMusculos() {
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  // fadiga (100 − % recuperado) vira intensidade de vermelho sobre a ilustração realista
  const pecas = { f: [], c: [] };
  for (const m of MUSCULOS) {
    const t = Math.min(1, (100 - recup[m.id]) / 100 * 1.15);
    if (t < 0.05) continue;
    for (const id of MUSC_REAL[m.id] || []) {
      const mk = MASK_REAL[id];
      if (mk) pecas[mk.v].push({ mk, cor: '#ff1a1a', op: +(0.15 + 0.75 * t).toFixed(2), titulo: `${m.nome} — ${recup[m.id]}% recuperado` });
    }
  }
  const W = ANAT_REAL.w, H = ANAT_REAL.h, vb = `${0.14 * W} 0 ${0.72 * W} ${H}`;
  const st = 'display:block;width:calc(50% - 4px);height:auto;border-radius:12px;background:#111';
  $('mapa-corpo').innerHTML = `<div class="mapa-fadiga" role="img" aria-label="Mapa de fadiga: quanto mais vermelho, mais fatigado">${vistaReal('f', pecas.f, vb, st)}${vistaReal('c', pecas.c, vb, st)}</div>`
    + '<div class="escala"><span>descansado</span><div></div><span>fatigado</span></div>';

  const recuperando = MUSCULOS.filter(m => recup[m.id] < 85).length;
  const filtros = [['todos', 'Todos'], ['rec', `Recuperando · ${recuperando}`], ['prontos', `Prontos · ${MUSCULOS.length - recuperando}`]];
  $('musc-filtro').innerHTML = filtros.map(([id, txt]) => `<button class="chip" role="radio" aria-checked="${muscFiltro === id}" data-filtro="${id}">${txt}</button>`).join('');
  $('musc-filtro').querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { muscFiltro = b.dataset.filtro; renderMusculos(); });

  const lista = MUSCULOS.filter(m => muscFiltro === 'todos' || (muscFiltro === 'rec') === (recup[m.id] < 85))
    .sort((a, b) => recup[a.id] - recup[b.id]);
  const el = $('musculos-grid');
  el.innerHTML = lista.map(m => {
    const pct = recup[m.id], s = statusRecup(pct), ult = ultimoTreino(m.id);
    const treinado = ult ? `treinado ${haQuanto(ult)}` : 'nunca treinado';
    const detalhe = pct < 85 ? `pronto em ~${horasAtePronto(m.id, 85)} h · ${treinado}` : treinado;
    const aberto = muscAberto === m.id;
    return `<div><button class="musculo" data-m="${m.id}" aria-expanded="${aberto}">
        <span class="c-${s.cls}" style="display:flex">${ic(s.ic)}</span>
        <span class="musc-txt"><span class="musc-cab"><span>${esc(m.nome)}</span><b>${pct}%</b></span>
          <span class="barra"><span style="display:block;height:100%;border-radius:3px;width:${pct}%;background:var(--${s.cls === 'ok' ? 'ok' : s.cls})"></span></span>
          <span class="musc-rod"><b class="c-${s.cls}">${s.nome}</b> · ${esc(detalhe)}</span></span></button>
      ${aberto ? `<div class="fb">${pct < 90 ? `<button class="ghost" data-fb="pronto" data-m="${m.id}">Já recuperei</button>` : ''}
        ${pct >= 60 ? `<button class="ghost" data-fb="mais" data-m="${m.id}">Preciso de mais tempo</button>` : ''}</div>` : ''}</div>`;
  }).join('') || '<p class="mudo" style="padding:16px">Nenhum músculo neste filtro.</p>';
  el.querySelectorAll('.musculo').forEach(b => b.onclick = () => { muscAberto = muscAberto === b.dataset.m ? null : b.dataset.m; renderMusculos(); });
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
  toast(tipo === 'pronto' ? 'Anotado: modelo ajustado, você recupera mais rápido' : 'Ok, mais tempo para esse músculo');
  renderMusculos();
}
