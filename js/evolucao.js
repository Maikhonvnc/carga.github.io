/* Carga — Evolução: tendências, gráficos, histórico por exercício e aba Progresso. */
'use strict';

// ---------- aba Progresso ----------
function seriesPorDia(exId) {
  const porDia = {};
  logs.filter(l => l.ex === exId).forEach(l => {
    const k = dayKey(l.ts);
    const d = porDia[k] || (porDia[k] = { e1: 0, vol: 0, reps: 0, totReps: 0 });
    for (const s of l.sets) {
      d.e1 = Math.max(d.e1, e1rm(s.peso, s.reps));
      d.reps = Math.max(d.reps, s.reps);
      d.vol += s.peso * s.reps;
      d.totReps += s.reps;
    }
  });
  return Object.keys(porDia).sort().map(k => ({ x: new Date(k + 'T12:00').getTime(), ...porDia[k] }));
}

// pontos por sessão de uma variação: e1RM, ou a melhor série quando é peso corporal
function pontosEx(exId) {
  const pts = seriesPorDia(exId);
  const corporal = pts.every(p => !p.e1);
  return { corporal, pts: pts.map(p => ({ x: p.x, y: corporal ? p.reps : p.e1 })) };
}

// variação % entre a 1ª sessão dos últimos 60 dias (ou das últimas 8) e a mais recente
function tendencia(pts) {
  if (pts.length < 2) return null;
  const janela = pts.filter(p => p.x >= Date.now() - 60 * 864e5);
  const base = (janela.length >= 2 ? janela : pts.slice(-8))[0], ult = pts[pts.length - 1];
  return base.y && base !== ult ? Math.round((ult.y / base.y - 1) * 100) : null;
}
const setaTend = t => t == null ? '' : t >= 2 ? `<span class="t-sobe">↗ +${t}%</span>`
  : t <= -2 ? `<span class="t-desce">↘ −${-t}%</span>` : '<span class="t-igual">→ estável</span>';

function sparkline(pts) {
  const p = pts.slice(-12);
  if (p.length < 2) return '<svg class="spark" width="72" height="22"></svg>';
  const W = 72, H = 22, ys = p.map(q => q.y), y0 = Math.min(...ys), dy = Math.max(...ys) - y0 || 1;
  const X = i => 3 + i / (p.length - 1) * (W - 6), Y = v => H - 4 - (v - y0) / dy * (H - 8);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="${p.map((q, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(q.y).toFixed(1)}`).join('')}" fill="none" stroke="var(--azul)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(p.length - 1).toFixed(1)}" cy="${Y(p[p.length - 1].y).toFixed(1)}" r="2.6" fill="var(--azul)"/></svg>`;
}

// séries por semana (8 semanas) de um grupo — barras; a semana atual fica mais clara (ainda em andamento)
function graficoSemanas(el, grupo) {
  const hoje = new Date(semanaKey(Date.now()) + 'T12:00').getTime();
  const semanas = Array.from({ length: 8 }, (_, i) => semanaKey(hoje - (7 - i) * 7 * 864e5));
  const cont = Object.fromEntries(semanas.map(k => [k, 0]));
  for (const l of logs) {
    const e = exMap[l.ex], k = semanaKey(l.ts);
    if (k in cont && (grupo === 'Todos' || (e && e.cat === grupo))) cont[k] += l.sets.length;
  }
  const vals = semanas.map(k => cont[k]), max = Math.max(4, ...vals);
  const W = el.clientWidth || 330, H = 118, mt = 16, mb = 18, gap = 6, bw = (W - gap * 7) / 8;
  const Y = v => mt + (1 - v / max) * (H - mt - mb);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" role="img" aria-label="Séries por semana">
    <line x1="0" x2="${W}" y1="${H - mb}" y2="${H - mb}" stroke="var(--grade)"/>
    ${vals.map((v, i) => {
      const x = i * (bw + gap), atual = i === 7;
      return `${v ? `<rect x="${x.toFixed(1)}" y="${Y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - mb - Y(v)).toFixed(1)}" rx="3" fill="var(--azul)"${atual ? ' fill-opacity=".55"' : ''}/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(Y(v) - 4).toFixed(1)}" text-anchor="middle" fill="var(--ink2)" font-size="10">${v}</text>` : ''}
        ${i % 2 === 1 || atual ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" fill="var(--mudo)" font-size="9">${atual ? 'esta' : dataBr(new Date(semanas[i] + 'T12:00').getTime())}</text>` : ''}`;
    }).join('')}</svg>`;
  return vals;
}

// evolução de um grupo (ou de todos): resumo semanal + exercícios com tendência; toque abre o detalhe
let evoAberto = null;
function renderEvolucao(el, grupo) {
  const exs = [...new Set(logs.map(l => l.ex))].filter(id => exMap[id] && (grupo === 'Todos' || exMap[id].cat === grupo));
  const ult = {};
  logs.forEach(l => { ult[l.ex] = Math.max(ult[l.ex] || 0, l.ts); });
  exs.sort((a, b) => ult[b] - ult[a]);
  el.innerHTML = `<div class="tiles evo-tiles"></div>
    <h3>Séries por semana${grupo === 'Todos' ? '' : ` — ${esc(nomeGrupo(grupo))}`}</h3><div class="evo-sem"></div>
    ${volumeMusculos(grupo)}
    <h3 style="margin-top:14px">Exercícios <span class="mudo" style="font-weight:400">— toque para ver o gráfico</span></h3>
    <div class="evo-lista">${exs.length ? exs.map(id => {
      const ex = exMap[id], { pts } = pontosEx(id);
      const doEx = logs.filter(l => l.ex === id), l = doEx.reduce((a, b) => b.ts > a.ts ? b : a), top = melhorSerie(l.sets);
      return `<div class="evo-item${evoAberto === id ? ' aberto' : ''}">
        <button class="evo-cab" data-evo="${id}"><div class="evo-info"><div class="evo-nome">${esc(ex.nome)}</div>
          <div class="det">${esc(carga(top.peso))} × ${esc(repsCurto(top, ex.seg))} · ${quando(l.ts)} · ${pts.length} sess${pts.length > 1 ? 'ões' : 'ão'}${estagnacao(id) ? ' · <span class="aviso">⏸ estagnado</span>' : ''}</div></div>
          ${sparkline(pts)}<div class="evo-t">${setaTend(tendencia(pts)) || '<span class="t-igual">—</span>'}</div></button>
        ${evoAberto === id ? '<div class="evo-det"></div>' : ''}</div>`;
    }).join('') : '<p class="mudo">Nenhum exercício registrado aqui ainda — o histórico aparece depois do primeiro treino.</p>'}</div>`;
  const vals = graficoSemanas(el.querySelector('.evo-sem'), grupo);
  const media = Math.round(vals.slice(3, 7).reduce((a, b) => a + b, 0) / 4 * 10) / 10;
  const ultimo = Math.max(0, ...exs.map(id => ult[id]));
  el.querySelector('.evo-tiles').innerHTML = tile(vals[7], 'séries nesta semana') + tile(num(media), 'média/semana (4 sem.)') + tile(ultimo ? quando(ultimo) : '–', 'último treino');
  el.querySelectorAll('[data-evo]').forEach(b => b.onclick = () => {
    evoAberto = evoAberto === b.dataset.evo ? null : b.dataset.evo;
    renderEvolucao(el, grupo);
    const aberto = el.querySelector('.evo-item.aberto');
    if (aberto) aberto.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  const det = el.querySelector('.evo-det');
  if (det) detalheExercicio(det, evoAberto, true);
}

// detalhe de uma variação: recordes, gráficos por sessão e as últimas sessões série a série
function detalheExercicio(el, exId, comBotao) {
  const ex = exMap[exId];
  const doEx = logs.filter(l => l.ex === exId);
  if (!doEx.length) { el.innerHTML = '<p class="mudo" style="margin-top:8px">Sem registros ainda — o histórico aparece depois da primeira série.</p>'; return; }
  const sets = doEx.flatMap(l => l.sets);
  const { corporal, pts } = pontosEx(exId);
  const porDia = seriesPorDia(exId);
  const sessoes = porDia.length;
  const un = ex.seg ? ' s' : ' reps';
  const t = tendencia(pts);
  el.innerHTML = `<div class="tiles" style="margin:8px 0 4px">${corporal
    ? tile(Math.max(...sets.map(s => s.reps)) + un, 'melhor série') + tile(sets.length, 'séries') + tile(sessoes, 'sessões')
    : tile(num(Math.max(...sets.map(s => s.peso))) + ' kg', 'melhor carga') + tile(kg(melhorE1rm(exId)) + ' kg', 'melhor e1RM') + tile(sessoes, 'sessões')}</div>
    ${t != null ? `<p class="mudo">Tendência (últimos 60 dias): ${setaTend(t)}</p>` : ''}
    ${ladoFraco(sets)}
    ${estagnacao(exId) ? avisoEstagnacao(ex) : ''}
    <h3>${corporal ? `Melhor série (${un.trim()})` : 'Força estimada (e1RM, kg)'}</h3><div class="grafico g1"></div>
    <h3>${corporal ? `Total por treino (${un.trim()})` : 'Volume por treino (kg)'}</h3><div class="grafico g2"></div>
    <h3>Últimas sessões</h3>
    ${doEx.slice().sort((a, b) => b.ts - a.ts).slice(0, 5).map(l => {
      const tut = l.sets.reduce((a, s) => a + (s.dur || 0), 0);
      const q = quando(l.ts);
      return `<div class="sessao"><div class="cab"><b>${dataBr(l.ts)}</b> <span class="mudo">${q !== dataBr(l.ts) ? `· ${q} ` : ''}· ${l.sets.length} série${l.sets.length > 1 ? 's' : ''}${tut ? ` · ⏱ ${mmss(tut)}` : ''}</span></div>
        <div class="pills">${l.sets.map(s => `<span class="pill">${esc(carga(s.peso))} × ${esc(repsCurto(s, ex.seg))}${s.dur && !ex.seg ? ` · ${mmss(s.dur)}` : ''}${s.rir != null ? ` · <span class="rir r${Math.min(s.rir, 4)}">${rirTxt(s.rir)}</span>` : ''}</span>`).join('')}</div></div>`;
    }).join('')}
    ${comBotao ? `<button class="ghost larga" data-treinar="${exId}">🏋️ Treinar ${esc(ex.nome)}</button>` : ''}`;
  const fmt = corporal ? v => kg(v) + un : v => kg(v) + ' kg';
  graficoLinha(el.querySelector('.g1'), pts, 'var(--azul)', fmt);
  graficoLinha(el.querySelector('.g2'), porDia.map(p => ({ x: p.x, y: corporal ? p.totReps : p.vol })), 'var(--aqua)', fmt);
  const bt = el.querySelector('[data-treinar]');
  if (bt) bt.onclick = () => abrirExercicio(exId);
}

// ---------- aba Progresso: evolução por grupo ----------
let progGrupo = 'Todos';
function renderProgresso() {
  const agora = Date.now(), d7 = agora - 7 * 864e5, d30 = agora - 30 * 864e5;
  const dias30 = new Set(logs.filter(l => l.ts >= d30).map(l => dayKey(l.ts))).size;
  const vol7 = logs.filter(l => l.ts >= d7).reduce((s, l) => s + volumeLog(l), 0);
  const prs = logs.filter(l => l.pr || l.sets.some(s => s.pr)).length;
  $('tiles-gerais').innerHTML =
    tile(dias30, 'treinos (30 dias)') + tile(kg(vol7) + ' kg', 'volume (7 dias)') + tile(prs, 'recordes (PR)');
  const grupos = ['Todos', ...gruposVisiveis().map(g => g.id)];
  if (!grupos.includes(progGrupo)) progGrupo = 'Todos';
  $('prog-grupos').innerHTML = grupos.map(g => `<button class="chip${g === progGrupo ? ' sel' : ''}" data-pg="${esc(g)}">${esc(nomeGrupo(g))}</button>`).join('');
  $('prog-grupos').querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { progGrupo = b.dataset.pg; evoAberto = null; renderProgresso(); });
  renderEvolucao($('prog-evo'), progGrupo);
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
    t.textContent = fmt(v).replace(/ (kg|reps|s)$/, '');
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


// unilateral: qual lado rende menos, em média, nas séries registradas por lado
function ladoFraco(sets) {
  const uni = sets.filter(s => s.repsE != null);
  if (uni.length < 2) return '';
  const dif = uni.reduce((t, s) => t + (s.repsE - s.repsD), 0) / uni.length;
  if (Math.abs(dif) < 0.5) return '<p class="mudo">↔ Lados equilibrados nas séries por lado.</p>';
  return `<p class="mudo">↔ Lado mais fraco: <b class="aviso">${dif < 0 ? 'esquerdo' : 'direito'}</b> (${num(Math.abs(+dif.toFixed(1)))} rep a menos em média) — comece pelo lado mais fraco e iguale as reps do outro.</p>`;
}

// séries efetivas por músculo nos últimos 7 dias × faixa de referência para hipertrofia (10–20/semana)
// série direta (músculo ≥ 40% do exercício) conta 1; indireta (15–40%) conta ½
const FAIXA_SEMANAL = [10, 20];
function volumeMusculos(grupo) {
  const g = gruposVisiveis().find(x => x.id === grupo);
  const lista = g ? g.musculos : MUSCULOS.map(m => m.id);
  const desde = Date.now() - 7 * 864e5, cont = Object.fromEntries(lista.map(m => [m, 0]));
  for (const l of logs) {
    if (l.ts < desde || !exMap[l.ex]) continue;
    for (const [m, f] of Object.entries(exMap[l.ex].musculos)) if (m in cont) cont[m] += l.sets.length * (f >= 0.4 ? 1 : f >= 0.15 ? 0.5 : 0);
  }
  const [lo, hi] = FAIXA_SEMANAL, max = 26, pct = v => Math.min(100, v / max * 100);
  return `<h3 style="margin-top:14px">Séries por músculo <span class="mudo" style="font-weight:400">— últimos 7 dias</span></h3>
    <div class="vm-lista">${lista.map(m => {
      const v = Math.round(cont[m] * 2) / 2;
      const cor = v < lo ? 'var(--atencao)' : v <= hi ? 'var(--bom)' : 'var(--serio)';
      return `<div class="vm"><span class="vm-nome">${esc(nomeCurto(m))}</span>
        <div class="vm-barra"><div class="vm-faixa" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></div><div class="vm-val" style="width:${pct(v)}%;background:${cor}"></div></div>
        <span class="vm-num" style="color:${cor}">${num(v)}</span></div>`;
    }).join('')}</div>
    <p class="mudo" style="font-size:.72rem;margin-top:4px">Faixa clara = ${lo}–${hi} séries/semana, referência comum para hipertrofia. Séries diretas contam 1; as em que o músculo só ajuda contam ½.</p>`;
}
