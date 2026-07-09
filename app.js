/* Carga — diário de treino. Vanilla JS, dados no aparelho (localStorage + IndexedDB). */
'use strict';

// ---------- estado ----------
const LS_LOGS = 'carga.logs', LS_PERFIL = 'carga.perfil';
const PERFIL_PADRAO = { experiencia: 'intermediario', sono: 'media', fator: 1 };
let logs = JSON.parse(localStorage.getItem(LS_LOGS) || '[]');
let perfil = Object.assign({}, PERFIL_PADRAO, JSON.parse(localStorage.getItem(LS_PERFIL) || '{}'));

const $ = id => document.getElementById(id);
const exMap = Object.fromEntries(EXERCICIOS.map(e => [e.id, e]));
const muscMap = Object.fromEntries(MUSCULOS.map(m => [m.id, m]));
const salvarLogs = () => localStorage.setItem(LS_LOGS, JSON.stringify(logs));
const salvarPerfil = () => localStorage.setItem(LS_PERFIL, JSON.stringify(perfil));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const dataBr = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const kg = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

// ---------- modelo de recuperação ----------
// ponytail: modelo heurístico (volume × intensidade relativa → horas de recuperação),
// não fisiologia exata; o ajuste fino vem do perfil do usuário em Ajustes.
const FATOR_EXP = { iniciante: 1.15, intermediario: 1, avancado: 0.9 };
const FATOR_SONO = { ruim: 1.2, media: 1, boa: 0.9 };

const e1rm = (peso, reps) => peso > 0 ? peso * (1 + reps / 30) : 0;

function melhorE1rm(exId) {
  return logs.reduce((m, l) => l.ex === exId ? Math.max(m, e1rm(l.peso, l.reps)) : m, 0);
}

function intensidade(l) {
  const best = melhorE1rm(l.ex), e = e1rm(l.peso, l.reps);
  if (!best || !e) return 1;
  return Math.min(1, Math.max(0.5, e / best));
}

// estímulo de um registro sobre um músculo (unidade arbitrária: séries × fração × intensidade)
const estimulo = (l, muscId) => {
  const frac = (exMap[l.ex] && exMap[l.ex].musculos[muscId]) || 0;
  return frac ? l.series * frac * intensidade(l) : 0;
};

function fadigaEm(muscId, t) {
  let fat = 0;
  for (const l of logs) {
    const horas = (t - l.ts) / 3.6e6;
    if (horas < 0 || horas > 240) continue;
    const sti = estimulo(l, muscId);
    if (!sti) continue;
    const precisa = Math.min(96, 24 + sti * 6) * FATOR_EXP[perfil.experiencia] * FATOR_SONO[perfil.sono] * perfil.fator;
    fat += sti * Math.max(0, 1 - horas / precisa);
  }
  return fat;
}

const pctRecuperado = (muscId, t = Date.now()) =>
  Math.max(0, Math.min(100, Math.round(100 - fadigaEm(muscId, t) * 12)));

function horasAtePronto(muscId) { // horas até ficar >= 90% recuperado
  const agora = Date.now();
  for (let h = 0; h <= 168; h++) if (pctRecuperado(muscId, agora + h * 3.6e6) >= 90) return h;
  return 168;
}

function ultimoTreino(muscId) {
  return logs.reduce((m, l) => {
    const frac = (exMap[l.ex] && exMap[l.ex].musculos[muscId]) || 0;
    return frac >= 0.15 ? Math.max(m, l.ts) : m;
  }, 0);
}

// ---------- sugestão de treino ----------
const GASTO_ALVO = 5; // estímulo diário a partir do qual o músculo conta como "finalizado" (= nível "pesado")
const nivelSti = s => s < 2 ? 'leve' : s < 5 ? 'moderado' : 'pesado';

function sugerirTreino() {
  const hoje = dayKey(Date.now());
  const logsHoje = logs.filter(l => dayKey(l.ts) === hoje);
  const stiHoje = {};
  MUSCULOS.forEach(m => { stiHoje[m.id] = logsHoje.reduce((s, l) => s + estimulo(l, m.id), 0); });
  const estados = MUSCULOS.map(m => ({ m, pct: pctRecuperado(m.id), ultimo: ultimoTreino(m.id), sti: stiHoje[m.id] }));
  const emRecuperacao = estados.filter(x => x.pct < 60 && x.sti < 0.5); // fatigado de dias anteriores
  const feitosHoje = new Set(logsHoje.map(l => l.ex));

  const escolheExs = mId => {
    const alvo = EXERCICIOS.filter(e => (e.musculos[mId] || 0) >= 0.5 && !feitosHoje.has(e.id));
    const conhecidos = alvo.filter(e => logs.some(l => l.ex === e.id));
    return [...conhecidos, ...alvo.filter(e => !conhecidos.includes(e))].slice(0, 2);
  };

  // sessão em andamento: detecta a região pelo estímulo do dia e sugere o que falta finalizar nela
  let regiao = null, grupos = [], completa = false;
  if (logsHoje.length) {
    const top = REGIOES.map(r => ({ r, score: r.musculos.reduce((s, m) => s + stiHoje[m], 0) }))
      .sort((a, b) => b.score - a.score)[0];
    if (top.score > 0) {
      regiao = top.r;
      grupos = estados
        .filter(x => regiao.musculos.includes(x.m.id) && x.sti < GASTO_ALVO && !emRecuperacao.includes(x))
        .sort((a, b) => a.sti - b.sti || b.pct - a.pct)
        .map(x => ({ m: x.m, sti: x.sti, exs: escolheExs(x.m.id) }))
        .filter(g => g.exs.length)
        .slice(0, 4);
      completa = !grupos.length;
    }
  }

  // sem treino hoje (ou região finalizada): sugere pelos mais descansados/parados há mais tempo
  if (!grupos.length) {
    grupos = estados
      .filter(x => x.pct >= 85 && x.sti < 0.5)
      .sort((a, b) => (a.ultimo || 0) - (b.ultimo || 0))
      .slice(0, 4)
      .map(x => ({ m: x.m, exs: escolheExs(x.m.id) }))
      .filter(g => g.exs.length);
  }

  return { grupos, emRecuperacao, regiao, completa };
}

// ---------- navegação ----------
const TABS = { treino: renderTreino, musculos: renderMusculos, progresso: renderProgresso, maquinas: renderMaquinas, ajustes: renderAjustes };
function mostrarTab(nome) {
  document.querySelectorAll('main > section, body > section').forEach(s => s.hidden = true);
  $('tab-' + nome).hidden = false;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('ativo', b.dataset.tab === nome));
  TABS[nome]();
  if (nome !== 'treino') { cancelAnimationFrame(animRAF); clearInterval(animInterval); }
}

// ---------- aba Treino ----------
function renderTreino() {
  $('hoje-data').textContent = '— ' + new Date().toLocaleDateString('pt-BR');
  renderSugestoes();
  renderLogHoje();
  mostraAnim($('sel-exercicio').value);
}

function renderSugestoes() {
  const el = $('sugestoes');
  if (!logs.length) {
    el.innerHTML = '<p class="mudo">Sem histórico ainda — registre seu primeiro exercício abaixo e as sugestões aparecem aqui.</p>';
    return;
  }
  const { grupos, emRecuperacao, regiao, completa } = sugerirTreino();
  let html = '';
  if (regiao && !completa) {
    html += `<p class="ink2" style="margin-bottom:8px">🎯 Treino de hoje: <b>${esc(regiao.nome)}</b> — falta finalizar:</p>`;
  } else if (regiao && completa) {
    html += `<p class="ink2" style="margin-bottom:8px">✅ <b>${esc(regiao.nome)}</b> finalizado! Se quiser continuar, opções descansadas:</p>`;
  }
  if (!grupos.length) {
    html += '<p class="mudo">Todos os grupos já foram treinados hoje ou estão em recuperação — descanso também é treino 😴</p>';
  }
  for (const g of grupos) {
    const gasto = g.sti > 0.2 ? ` · já ${nivelSti(g.sti)}` : '';
    html += `<div class="grupo-sug"><div class="titulo">${esc(g.m.nome)}${gasto}</div><div class="chips">`
      + g.exs.map(e => `<button class="chip" data-ex="${e.id}"><b>+</b> ${esc(e.nome)}</button>`).join('')
      + '</div></div>';
  }
  if (emRecuperacao.length) {
    html += `<p class="mudo" style="margin-top:6px">🔻 Em recuperação (evite hoje): ${emRecuperacao.map(x => `${esc(x.m.nome)} (${x.pct}%)`).join(', ')}</p>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    $('sel-exercicio').value = c.dataset.ex;
    mostraAnim(c.dataset.ex);
    $('in-peso').focus();
    $('in-peso').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function renderLogHoje() {
  const hoje = dayKey(Date.now());
  const doDia = logs.filter(l => dayKey(l.ts) === hoje);
  const ul = $('log-hoje');
  ul.innerHTML = '';
  if (!doDia.length) {
    ul.innerHTML = '<li class="mudo" style="padding:6px 0">Nada registrado hoje ainda.</li>';
    $('gasto-hoje').innerHTML = '';
    return;
  }
  for (const l of doDia.slice().reverse()) {
    const ex = exMap[l.ex];
    const li = document.createElement('li');
    li.className = 'reg';
    const vol = l.peso * l.reps * l.series;
    li.innerHTML =
      `<div class="info"><div class="nome">${esc(ex ? ex.nome : l.ex)}${l.pr ? '<span class="badge-pr">PR 🏆</span>' : ''}</div>
       <div class="det">${l.peso} kg × ${l.reps} reps × ${l.series} séries${vol ? ` · volume ${kg(vol)} kg` : ''}${e1rm(l.peso, l.reps) ? ` · e1RM ~${kg(e1rm(l.peso, l.reps))} kg` : ''}</div></div>
       <button class="bt-x" aria-label="Excluir registro">✕</button>`;
    li.querySelector('.bt-x').onclick = () => {
      if (!confirm('Excluir este registro?')) return;
      logs = logs.filter(x => x.id !== l.id);
      salvarLogs();
      renderTreino();
    };
    ul.appendChild(li);
  }
  // estímulo por músculo hoje
  const porMusc = {};
  doDia.forEach(l => MUSCULOS.forEach(m => {
    const s = estimulo(l, m.id);
    if (s) porMusc[m.id] = (porMusc[m.id] || 0) + s;
  }));
  const linhas = Object.entries(porMusc).sort((a, b) => b[1] - a[1]).map(([mId, s]) => {
    const pctBar = Math.min(100, Math.round(s * 12));
    const nivel = nivelSti(s);
    return `<div class="musculo"><div class="cab"><span class="nome">${esc(muscMap[mId].nome)}</span><span class="estado ink2">${nivel}</span></div>
      <div class="barra"><div style="width:${pctBar}%;background:var(--azul)"></div></div></div>`;
  }).join('');
  $('gasto-hoje').innerHTML = `<h3 style="margin-top:14px">Gasto por músculo hoje</h3>${linhas}`;
}

// ---------- animação ilustrativa do exercício ----------
// ponytail: boneco palito com 2 poses interpoladas cobre os 48 exercícios com ~23 padrões;
// GIFs reais = licença + megabytes + quebra o offline. Trocar por vídeo/GIF se um dia fizer sentido.
let animRAF = null, animInterval = null, animToken = 0;
function mostraAnim(exId) {
  cancelAnimationFrame(animRAF);
  clearInterval(animInterval);
  const box = $('anim-ex');
  if (!exId || !exMap[exId]) { box.hidden = true; return; }
  // tenta as fotos reais (imgs/<id>_0.jpg + _1.jpg); sem elas, cai no boneco palito
  const token = ++animToken;
  const teste = new Image();
  teste.onload = () => { if (token === animToken) montaFotos(exId); };
  teste.onerror = () => { if (token === animToken) montaBoneco(exId); };
  teste.src = `imgs/${exId}_0.jpg`;
}

// dois quadros alternados = efeito GIF (fotos do dataset aberto free-exercise-db)
function montaFotos(exId) {
  const box = $('anim-ex');
  box.hidden = false;
  box.innerHTML = `<img src="imgs/${exId}_0.jpg" alt=""><span>${esc(exMap[exId].nome)}</span>`;
  const img = box.querySelector('img');
  img.onclick = () => {
    $('lightbox').querySelector('img').src = img.src;
    $('lightbox').classList.add('aberto');
  };
  new Image().src = `imgs/${exId}_1.jpg`; // pré-carrega o 2º quadro
  let quadro = 0;
  animInterval = setInterval(() => { quadro = 1 - quadro; img.src = `imgs/${exId}_${quadro}.jpg`; }, 700);
}

function montaBoneco(exId) {
  const box = $('anim-ex');
  const an = ANIMS[EX_ANIM[exId]];
  if (!an) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<svg viewBox="0 0 100 100" width="92" height="92"></svg><span>${esc(exMap[exId].nome)}</span>`;
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

function adicionarLog() {
  const exId = $('sel-exercicio').value;
  const peso = parseFloat($('in-peso').value);
  const reps = parseInt($('in-reps').value, 10);
  const series = parseInt($('in-series').value, 10);
  if (!exId) return toast('Escolha um exercício.');
  if (isNaN(peso) || peso < 0 || !reps || reps < 1 || !series || series < 1) return toast('Confira peso, repetições e séries.');
  const e = e1rm(peso, reps);
  const pr = e > 0 && e > melhorE1rm(exId);
  logs.push({ id: Date.now() + Math.random(), ex: exId, peso, reps, series, ts: Date.now(), pr });
  salvarLogs();
  toast(pr ? '🏆 Novo recorde de força!' : 'Registrado ✔');
  renderTreino();
}

// ---------- aba Músculos ----------
// mapa corporal 2D: fadiga (100 − % recuperado) vira intensidade de vermelho — rampa sequencial de um matiz
function corpoSvg(recup) {
  const cor = m => {
    if (!m) return '#262624'; // partes não rastreadas (cabeça, mãos…)
    const t = Math.min(1, (100 - recup[m]) / 100 * 1.15);
    const c = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${c(51, 208)},${c(51, 59)},${c(47, 59)})`; // #33332f → #d03b3b
  };
  const espelha = ([tag, at]) => {
    const a = { ...at };
    if (tag === 'ellipse') a.cx = 200 - a.cx;
    else if (tag === 'rect') a.x = 200 - a.x - a.width;
    else a.d = a.d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (s, x, y) => `${200 - parseFloat(x)},${y}`);
    return [tag, a];
  };
  const el = ([tag, at], m) => {
    const attrs = Object.entries(at).map(([k, v]) => `${k}="${v}"`).join(' ');
    const titulo = m ? `<title>${esc(muscMap[m].nome)} — ${recup[m]}% recuperado</title>` : '';
    return `<${tag} ${attrs} fill="${cor(m)}" stroke="var(--card)" stroke-width="1.5">${titulo}</${tag}>`;
  };
  let g = '';
  for (const [vista, dx, rotulo] of [['f', 0, 'Frente'], ['c', 200, 'Costas']]) {
    g += `<g transform="translate(${dx},0)">`;
    for (const p of CORPO_SVG[vista]) {
      g += el(p.forma, p.m);
      if (p.esp) g += el(espelha(p.forma), p.m);
    }
    g += `<text x="100" y="326" text-anchor="middle" fill="var(--mudo)" font-size="11">${rotulo}</text></g>`;
  }
  return `<svg viewBox="0 0 400 332" style="width:100%;max-width:340px;display:block;margin:0 auto">${g}</svg>`;
}

function renderMusculos() {
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  $('mapa-corpo').innerHTML = corpoSvg(recup) +
    '<div class="escala"><span>descansado</span><div></div><span>fatigado</span></div>';
  const el = $('musculos-grid');
  el.innerHTML = MUSCULOS.map(m => {
    const pct = recup[m.id];
    const ultimo = ultimoTreino(m.id);
    const cor = pct >= 85 ? 'var(--bom)' : pct >= 60 ? 'var(--atencao)' : pct >= 35 ? 'var(--serio)' : 'var(--critico)';
    const estado = pct >= 85 ? '✅ Pronto' : `⏳ ~${horasAtePronto(m.id)}h p/ 90%`;
    return `<div class="musculo">
      <div class="cab"><span class="nome">${esc(m.nome)}</span><span class="estado" style="color:${cor}">${estado} · ${pct}%</span></div>
      <div class="barra"><div style="width:${pct}%;background:${cor}"></div></div>
      <div class="rodape">${ultimo ? 'último treino: ' + dataBr(ultimo) : 'nunca treinado'}</div>
    </div>`;
  }).join('');
}

// ---------- aba Progresso ----------
function seriesPorDia(exId) {
  const porDia = {};
  logs.filter(l => l.ex === exId).forEach(l => {
    const k = dayKey(l.ts);
    const d = porDia[k] || (porDia[k] = { e1: 0, vol: 0 });
    d.e1 = Math.max(d.e1, e1rm(l.peso, l.reps));
    d.vol += l.peso * l.reps * l.series;
  });
  return Object.keys(porDia).sort().map(k => ({ x: new Date(k + 'T12:00').getTime(), ...porDia[k] }));
}

function renderProgresso() {
  // tiles gerais
  const agora = Date.now(), d7 = agora - 7 * 864e5, d30 = agora - 30 * 864e5;
  const dias30 = new Set(logs.filter(l => l.ts >= d30).map(l => dayKey(l.ts))).size;
  const vol7 = logs.filter(l => l.ts >= d7).reduce((s, l) => s + l.peso * l.reps * l.series, 0);
  const prs = logs.filter(l => l.pr).length;
  $('tiles-gerais').innerHTML =
    tile(dias30, 'treinos (30 dias)') + tile(kg(vol7) + ' kg', 'volume (7 dias)') + tile(prs, 'recordes (PR)');

  // select de exercícios com histórico
  const sel = $('sel-progresso');
  const comLog = [...new Set(logs.map(l => l.ex))].filter(id => exMap[id]);
  const atual = sel.value;
  sel.innerHTML = comLog.length
    ? comLog.map(id => `<option value="${id}">${esc(exMap[id].nome)}</option>`).join('')
    : '<option value="">— sem histórico ainda —</option>';
  if (comLog.includes(atual)) sel.value = atual;

  const exId = sel.value;
  if (!exId) {
    $('tiles-ex').innerHTML = '';
    $('graf-e1rm').innerHTML = $('graf-volume').innerHTML = '<p class="mudo">Registre treinos para ver sua progressão.</p>';
    return;
  }
  const doEx = logs.filter(l => l.ex === exId);
  const melhorPeso = Math.max(...doEx.map(l => l.peso));
  const sessoes = new Set(doEx.map(l => dayKey(l.ts))).size;
  $('tiles-ex').innerHTML =
    tile(melhorPeso + ' kg', 'melhor carga') + tile(kg(melhorE1rm(exId)) + ' kg', 'melhor e1RM') + tile(sessoes, 'sessões');

  const pts = seriesPorDia(exId);
  graficoLinha($('graf-e1rm'), pts.map(p => ({ x: p.x, y: p.e1 })), 'var(--azul)', v => kg(v) + ' kg');
  graficoLinha($('graf-volume'), pts.map(p => ({ x: p.x, y: p.vol })), 'var(--aqua)', v => kg(v) + ' kg');
}

const tile = (valor, rotulo) => `<div class="tile"><div class="valor">${valor}</div><div class="rotulo">${rotulo}</div></div>`;

// gráfico de linha SVG: marca fina 2px, marcadores 8px com anel da superfície,
// grade recessiva, tooltip + crosshair no toque/hover (specs do guia de dataviz)
function graficoLinha(el, pontos, cor, fmt) {
  el.innerHTML = '';
  if (pontos.length < 2) {
    el.innerHTML = '<p class="mudo">Registre este exercício em pelo menos 2 dias para ver o gráfico.</p>';
    return;
  }
  const W = el.clientWidth || 500, H = 180, ml = 44, mr = 12, mt = 10, mb = 20;
  const xs = pontos.map(p => p.x), ys = pontos.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 = Math.max(0, y0 - 1); y1 += 1; }
  else { const pad = (y1 - y0) * 0.12; y0 = Math.max(0, y0 - pad); y1 += pad; }
  const X = t => ml + (t - x0) / (x1 - x0) * (W - ml - mr);
  const Y = v => mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.width = '100%';
  const add = (tag, attrs, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };
  // grade horizontal recessiva + rótulos do eixo
  for (let i = 0; i <= 2; i++) {
    const v = y0 + (y1 - y0) * i / 2, y = Y(v);
    add('line', { x1: ml, x2: W - mr, y1: y, y2: y, stroke: 'var(--grade)', 'stroke-width': 1 });
    const t = add('text', { x: ml - 6, y: y + 3, 'text-anchor': 'end', fill: 'var(--mudo)', 'font-size': 10 });
    t.textContent = fmt(v).replace(' kg', '');
  }
  // rótulos do eixo x (primeira e última data)
  [[pontos[0], 'start'], [pontos[pontos.length - 1], 'end']].forEach(([p, anchor]) => {
    const t = add('text', { x: X(p.x), y: H - 6, 'text-anchor': anchor, fill: 'var(--mudo)', 'font-size': 10 });
    t.textContent = dataBr(p.x);
  });
  // crosshair (escondido até o hover)
  const cross = add('line', { y1: mt, y2: H - mb, stroke: 'var(--mudo)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
  // linha da série + marcadores com anel da superfície
  add('path', {
    d: pontos.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(''),
    fill: 'none', stroke: cor, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  });
  pontos.forEach(p => add('circle', { cx: X(p.x), cy: Y(p.y), r: 4, fill: cor, stroke: 'var(--card)', 'stroke-width': 2 }));

  const tip = document.createElement('div');
  tip.className = 'tip';
  el.appendChild(svg);
  el.appendChild(tip);

  const mover = ev => {
    const r = svg.getBoundingClientRect();
    const mx = (ev.clientX - r.left) * W / r.width;
    let melhor = pontos[0], dist = Infinity;
    for (const p of pontos) { const d = Math.abs(X(p.x) - mx); if (d < dist) { dist = d; melhor = p; } }
    cross.setAttribute('x1', X(melhor.x)); cross.setAttribute('x2', X(melhor.x));
    cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<span class="v">${fmt(melhor.y)}</span> <span class="d">· ${dataBr(melhor.x)}</span>`;
    tip.style.left = (X(melhor.x) * r.width / W) + 'px';
    tip.style.top = (Y(melhor.y) * r.height / H) + 'px';
    tip.style.display = 'block';
  };
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerdown', mover);
  svg.addEventListener('pointerleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); });
}

// ---------- aba Máquinas (fotos em IndexedDB) ----------
let dbPromise = null;
function db() {
  dbPromise ??= new Promise((res, rej) => {
    const r = indexedDB.open('carga', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}
const txFotos = async modo => (await db()).transaction('fotos', modo).objectStore('fotos');
const idbReq = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

let fotoPendente = null;
let urlsGaleria = [];

async function renderMaquinas() {
  urlsGaleria.forEach(URL.revokeObjectURL);
  urlsGaleria = [];
  const fotos = (await idbReq((await txFotos('readonly')).getAll())).sort((a, b) => b.ts - a.ts);
  const gal = $('galeria');
  gal.innerHTML = '';
  if (!fotos.length) {
    gal.innerHTML = '<p class="mudo" style="grid-column:1/-1">Nenhuma máquina cadastrada ainda.</p>';
    return;
  }
  for (const f of fotos) {
    const url = URL.createObjectURL(f.blob);
    urlsGaleria.push(url);
    const card = document.createElement('div');
    card.className = 'foto-card';
    card.innerHTML = `<img src="${url}" alt="Máquina" loading="lazy">
      <div class="leg"><div class="ex">${esc(f.ex && exMap[f.ex] ? exMap[f.ex].nome : 'Sem vínculo')}</div>
      ${f.nota ? `<div class="nota">${esc(f.nota)}</div>` : ''}
      <button class="ghost">Excluir</button></div>`;
    card.querySelector('img').onclick = () => {
      $('lightbox').querySelector('img').src = url;
      $('lightbox').classList.add('aberto');
    };
    card.querySelector('button').onclick = async () => {
      if (!confirm('Excluir esta foto?')) return;
      await idbReq((await txFotos('readwrite')).delete(f.id));
      renderMaquinas();
    };
    gal.appendChild(card);
  }
}

function prepararFoto(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  fotoPendente = f;
  $('preview-foto').src = URL.createObjectURL(f);
  $('foto-nota').value = '';
  $('form-foto').hidden = false;
  $('form-foto').scrollIntoView({ behavior: 'smooth' });
  input.value = '';
}

async function salvarFoto() {
  if (!fotoPendente) return;
  await idbReq((await txFotos('readwrite')).put({
    id: Date.now(), blob: fotoPendente, ex: $('foto-exercicio').value, nota: $('foto-nota').value.trim(), ts: Date.now(),
  }));
  fotoPendente = null;
  $('form-foto').hidden = true;
  toast('Máquina salva 📷');
  renderMaquinas();
}

// ---------- aba Ajustes ----------
function renderAjustes() {
  $('aj-exp').value = perfil.experiencia;
  $('aj-sono').value = perfil.sono;
  $('aj-fator').value = perfil.fator;
  atualizaFatorTxt();
}
function atualizaFatorTxt() {
  const v = parseFloat($('aj-fator').value);
  $('aj-fator-txt').textContent = v < 0.95 ? `rápido (×${v})` : v <= 1.05 ? 'na média' : `devagar (×${v})`;
}

function exportar() {
  const blob = new Blob([JSON.stringify({ versao: 1, perfil, logs })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `carga-backup-${dayKey(Date.now())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importar(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.logs)) throw new Error('formato inválido');
    if (!confirm(`Substituir os dados atuais por ${d.logs.length} registros do backup?`)) return;
    logs = d.logs;
    perfil = Object.assign({}, PERFIL_PADRAO, d.perfil);
    salvarLogs(); salvarPerfil();
    toast('Backup restaurado ✔');
    mostrarTab('treino');
  } catch {
    toast('Arquivo de backup inválido.');
  }
}

async function apagarTudo() {
  if (!confirm('Apagar TODOS os treinos, perfil e fotos? Não tem volta.')) return;
  if (!confirm('Certeza mesmo?')) return;
  logs = [];
  perfil = Object.assign({}, PERFIL_PADRAO);
  localStorage.removeItem(LS_LOGS);
  localStorage.removeItem(LS_PERFIL);
  await idbReq((await txFotos('readwrite')).clear());
  toast('Dados apagados.');
  mostrarTab('treino');
}

// ---------- timer de descanso ----------
let timerFim = 0, timerInt = null, audioCtx = null;
function iniciarTimer(seg) {
  timerFim = Date.now() + seg * 1000;
  audioCtx ??= new (window.AudioContext || window.webkitAudioContext)(); // criado no gesto do usuário
  clearInterval(timerInt);
  timerInt = setInterval(tickTimer, 200);
  $('timer-display').classList.remove('acabou');
  tickTimer();
}
function tickTimer() {
  const r = Math.ceil((timerFim - Date.now()) / 1000);
  if (r <= 0) {
    clearInterval(timerInt);
    $('timer-display').textContent = '0:00';
    $('timer-display').classList.add('acabou');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    bip();
    toast('Descanso concluído — próxima série! 💪');
    return;
  }
  $('timer-display').textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}
function bip() {
  if (!audioCtx) return;
  audioCtx.resume();
  for (let i = 0; i < 3; i++) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + i * 0.25;
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  }
}

// ---------- toast ----------
let toastTimeout = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('mostrar');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('mostrar'), 2200);
}

// ---------- init ----------
function popularSelects() {
  const cats = [...new Set(EXERCICIOS.map(e => e.cat))];
  const opts = cats.map(c =>
    `<optgroup label="${c}">${EXERCICIOS.filter(e => e.cat === c).map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</optgroup>`
  ).join('');
  $('sel-exercicio').innerHTML = '<option value="" disabled selected>— escolha o exercício —</option>' + opts;
  $('foto-exercicio').innerHTML = '<option value="">(sem vínculo)</option>' + opts;
}

popularSelects();
document.querySelectorAll('nav button').forEach(b => b.onclick = () => mostrarTab(b.dataset.tab));
$('bt-add').onclick = adicionarLog;
$('sel-exercicio').onchange = e => mostraAnim(e.target.value);
document.querySelectorAll('[data-timer]').forEach(b => b.onclick = () => iniciarTimer(parseInt(b.dataset.timer, 10)));
$('sel-progresso').onchange = renderProgresso;
$('input-foto').onchange = e => prepararFoto(e.target);
$('bt-salvar-foto').onclick = salvarFoto;
$('bt-cancelar-foto').onclick = () => { fotoPendente = null; $('form-foto').hidden = true; };
$('lightbox').onclick = () => $('lightbox').classList.remove('aberto');
$('aj-exp').onchange = e => { perfil.experiencia = e.target.value; salvarPerfil(); };
$('aj-sono').onchange = e => { perfil.sono = e.target.value; salvarPerfil(); };
$('aj-fator').oninput = e => { perfil.fator = parseFloat(e.target.value); salvarPerfil(); atualizaFatorTxt(); };
$('bt-exportar').onclick = exportar;
$('input-importar').onchange = e => importar(e.target);
$('bt-apagar').onclick = apagarTudo;
mostrarTab('treino');
