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

// mapa de foco: frente + costas lado a lado, recortado na região trabalhada. Azul mais forte = mais envolvido;
// quando o exercício tem uma PARTE definida (ex.: deltoide lateral) o músculo inteiro fica apagado e só ela acende
const MUSC_INF = ['gluteos', 'quadriceps', 'posteriores', 'adutores', 'panturrilha'];
function mapaFoco(ex, altura) {
  const ms = ex.musculos, top = Math.max(...Object.values(ms));
  const nivel = f => f >= 0.5 || f >= top * 0.8 ? 1 : f >= 0.2 ? 0.6 : 0.35;
  const partes = ex.foco.map(id => PARTES[id]).filter(Boolean);
  const comParte = new Set(partes.flatMap(pt => pt.p.map(pc => pc.m)));
  const env = Object.keys(ms).filter(m => ms[m] >= 0.15);
  const baixo = env.some(m => MUSC_INF.includes(m)), cima = env.some(m => !MUSC_INF.includes(m) && m !== 'lombar');
  // recorte: tronco (com braços), só pernas (vistas encostadas, maior) ou corpo inteiro
  const [y0, h, w, offs, esc2] = !baixo ? [4, 156, 240, [-40, 80], 1] : !cima ? (ms.lombar >= 0.15 ? [118, 188, 136, [-62, -2], 1.4] : [140, 166, 136, [-62, -2], 1.3]) : [4, 304, 240, [-40, 80], 1];
  const forma = ([tag, at], fill, op) => `<${tag} ${Object.entries(at).map(([k, v]) => `${k}="${v}"`).join(' ')} fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''} stroke="var(--card)" stroke-width="1.5"/>`;
  const inst = s => s.esp ? [s.forma, espelha(s.forma)] : [s.forma];
  const recortes = r => { const m = [200 - r[0] - r[2], r[1], r[2], r[3]]; return m[0] === r[0] ? [r] : [r, m]; };
  let g = '';
  for (const [vista, dx] of [['f', offs[0]], ['c', offs[1]]]) { // vistas lado a lado (cada uma ocupa x 40–160 no original)
    g += `<g transform="translate(${dx},0)">`;
    for (const s of CORPO_SVG[vista]) {
      const f = s.m ? ms[s.m] || 0 : 0;
      for (const fo of inst(s)) g += !s.m ? forma(fo, '#262624', 1) : f ? forma(fo, 'var(--azul)', comParte.has(s.m) ? 0.16 : nivel(f)) : forma(fo, '#33332f', 1);
    }
    for (const pt of partes) for (const pc of pt.p) {
      if (pc.v !== vista) continue;
      const op = Math.max(0.6, nivel(ms[pt.p[0].m] || 0));
      for (const s of CORPO_SVG[vista].filter(x => x.m === pc.m)) for (const fo of inst(s)) {
        if (!pc.r) g += forma(fo, 'var(--azul)', op);
        else for (const r of recortes(pc.r)) g += `<svg x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" viewBox="${r.join(' ')}">${forma(fo, 'var(--azul)', op)}</svg>`;
      }
    }
    g += '</g>';
  }
  return `<svg class="mapa-foco" viewBox="0 ${y0} ${w} ${h}" style="height:${Math.round(altura * esc2)}px" aria-hidden="true">${g}</svg>`;
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
