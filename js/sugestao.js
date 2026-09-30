/* Carga — Treino do dia: sugestão por treino (Empurrar, Puxar, Pernas), plano com alvos e estados vazios. */
'use strict';

// ---------- treinos ----------
// os três treinos da divisão; os músculos de cada um vêm de REGIOES (data.js).
// principais = os que definem se o treino está recuperado (antebraço e adutores só ajudam)
const TREINOS = [
  { id: 'empurrar', nome: 'Empurrar', det: 'Peito · Ombros · Tríceps', curto: 'Peito · Ombros · Tríceps', principais: ['peito', 'ombros', 'triceps'] },
  { id: 'puxar', nome: 'Puxar', det: 'Costas · Bíceps', curto: 'Costas · Bíceps', principais: ['costas', 'biceps'] },
  { id: 'pernas', nome: 'Pernas', det: 'Coxas · Glúteos · Panturrilha', curto: 'Coxas · Glúteos', principais: ['quadriceps', 'posteriores', 'gluteos', 'panturrilha'] },
].map(t => ({ ...t, musculos: REGIOES.find(r => r.id === t.id).musculos }));
// grupo da tela inicial que pertence ao treino (a maioria dos músculos do grupo nele)
const grupoNoTreino = (g, t) => g.musculos.length > 0 && g.musculos.filter(m => t.musculos.includes(m)).length / g.musculos.length >= 0.6;
// treino que a tela inicial está mostrando no card do dia (null = descanso ou primeiro uso)
let treinoDoCard = null;
let treinoEscolha = null; // treino que o usuário escolheu no lugar do sugerido (vale até recarregar)

// treino de um dia: o que mais recebeu séries (cada série pesa a fração do músculo no exercício); só core = nenhum
function treinoDoDia(doDia) {
  let melhor = null, max = 0;
  for (const t of TREINOS) {
    const s = doDia.reduce((a, l) => {
      const e = exMap[l.ex];
      return e ? a + l.sets.length * t.musculos.reduce((b, m) => b + (e.musculos[m] || 0), 0) : a;
    }, 0);
    if (s > max) { max = s; melhor = t; }
  }
  return melhor;
}

// treino.id → dias em que ele foi feito, do mais recente ao mais antigo
function diasPorTreino() {
  const porDia = {};
  for (const l of logs) (porDia[dayKey(l.ts)] ||= []).push(l);
  const res = {};
  for (const [dia, ls] of Object.entries(porDia)) {
    const t = treinoDoDia(ls);
    if (t) (res[t.id] ||= []).push({ dia, logs: ls.slice().sort((a, b) => a.ts - b.ts) });
  }
  for (const k in res) res[k].sort((a, b) => (a.dia < b.dia ? 1 : -1));
  return res;
}

// plano: repete o último dia deste treino (exercícios na ordem feita, mesmo nº de séries);
// sem histórico, monta 5 exercícios pelos músculos do treino
function planoTreino(t, dias) {
  const hoje = hojeKey();
  const ant = (dias[t.id] || []).find(d => d.dia !== hoje);
  if (ant) {
    const itens = [...new Set(ant.logs.map(l => l.ex))].filter(id => exMap[id]);
    const series = {};
    for (const l of ant.logs) series[l.ex] = (series[l.ex] || 0) + l.sets.length;
    if (itens.length) return { ts: ant.logs[0].ts, itens, series };
  }
  const ultimoUso = {};
  logs.forEach(l => { ultimoUso[l.ex] = Math.max(ultimoUso[l.ex] || 0, l.ts); });
  const itens = [], usados = new Set();
  t.musculos.forEach((m, i) => {
    const porMov = {};
    for (const e of EXERCICIOS) {
      if ((e.musculos[m] || 0) < 0.5 || usados.has(e.mov) || e.custom) continue;
      const atual = porMov[e.mov];
      if (!atual || (ultimoUso[e.id] || 0) > (ultimoUso[atual.id] || 0)) porMov[e.mov] = e;
    }
    const cands = Object.values(porMov).sort((a, b) => (ultimoUso[b.id] || 0) - (ultimoUso[a.id] || 0));
    for (const e of cands.slice(0, i < 2 ? 2 : 1)) if (itens.length < 5) { itens.push(e.id); usados.add(e.mov); }
  });
  return { ts: 0, itens, series: {} };
}

function estadoTreinos() {
  const dias = diasPorTreino(), hoje = hojeKey();
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  return TREINOS.map(t => {
    const ds = dias[t.id] || [];
    const ult = ds.find(d => d.dia !== hoje);
    const pior = t.principais.reduce((a, m) => (recup[m] < a.pct ? { m, pct: recup[m] } : a), { m: null, pct: 100 });
    return { t, dias, hoje: ds.some(d => d.dia === hoje), ultTs: ult ? ult.logs[ult.logs.length - 1].ts : 0, pct: pior.pct, pior: pior.m };
  });
}

// sugerido: o treino que o dia já começou; senão o feito há mais tempo que já recuperou (≥ 60%)
function treinoSugerido(est) {
  const andamento = est.find(e => e.hoje);
  if (andamento) return andamento;
  const ord = est.slice().sort((a, b) => a.ultTs - b.ultTs);
  const livre = e => e.pct >= 60;
  return ord.find(x => x.ultTs && livre(x)) || ord.find(livre) || null;
}

const horasTreino = e => Math.max(0, ...e.t.principais.filter(m => pctRecuperado(m) < 85).map(m => horasAtePronto(m, 85)));
function txtHoras(h) {
  if (h < 1) return 'pronto em menos de 1 h';
  const quando = new Date(Date.now() + h * 3.6e6);
  return quando.getDate() === new Date().getDate() && quando.getHours() >= 18 ? 'pronto hoje à noite' : `pronto em ~${h} h`;
}
const haQuanto = ts => { if (!ts) return 'nunca'; const q = quando(ts); return q === dataBr(ts) ? `em ${q}` : q; };

// "Supino reto <span>· Barra</span>"
function nomeEx(exId) {
  const ex = exMap[exId], mov = movMap[ex.mov];
  return mov && mov.vars.length > 1 ? `${esc(mov.nome)} <span class="c-3">· ${esc(ex.vnome)}</span>` : esc(ex.nome);
}
function alvoTxt(exId) {
  const d = dicaCarga(exId), ex = exMap[exId];
  return d ? `${carga(d.alvoPeso)} × ${d.alvoReps}${ex.seg ? ' s' : ''}` : 'primeira vez';
}

function comecarTreino(t, itens) {
  if (!itens.length) return toast('Escolha um grupo abaixo para montar o treino.');
  const feitos = new Set(logs.filter(l => dayKey(l.ts) === hojeKey()).map(l => l.ex));
  ativo.rotina = 'rep';
  ativo.rotinaTemp = { id: 'rep', nome: t.nome, itens };
  abrirExercicio(itens.find(id => !feitos.has(id)) || itens[0]);
}

// ---------- tela inicial: o card do dia ----------
function renderDia() {
  const el = $('dia');
  const est = estadoTreinos();
  $('sec-outros').hidden = true;
  treinoDoCard = null;
  if (!logs.length) return renderPrimeiroUso(el, est);
  const escolhido = treinoEscolha && est.find(x => x.t.id === treinoEscolha);
  const e = escolhido || treinoSugerido(est);
  if (!e) return renderDescanso(el, est);
  treinoDoCard = e.t;
  renderHero(el, e);
  renderOutros(est.filter(x => x !== e));
}

function renderHero(el, e) {
  const t = e.t, hoje = hojeKey();
  const plano = planoTreino(t, e.dias);
  const doDia = logs.filter(l => dayKey(l.ts) === hoje);
  const feitos = new Set(doDia.map(l => l.ex));
  const andamento = e.hoje;
  const itens = andamento ? [...plano.itens, ...[...feitos].filter(id => exMap[id] && !plano.itens.includes(id))] : plano.itens;
  const nFeitos = itens.filter(id => feitos.has(id)).length;
  const setsHoje = id => doDia.filter(l => l.ex === id).reduce((s, l) => s + l.sets.length, 0);
  const linhas = itens.map((id, i) => feitos.has(id)
    ? `<div class="plano-it feito"><span class="n">${ic('check-circle-fill')}</span><span class="nome">${nomeEx(id)}</span><span class="alvo">${plural(setsHoje(id), 'série', 'séries')}</span></div>`
    : `<div class="plano-it"><span class="n">${i + 1}</span><span class="nome">${nomeEx(id)}</span><span class="alvo">${esc(alvoTxt(id))}</span></div>`).join('');
  const nSeries = itens.reduce((s, id) => s + (plano.series[id] || 3), 0);
  const min = Math.max(5, Math.round(itens.reduce((s, id) => s + (plano.series[id] || 3) * (40 + descansoDe(id)), 0) / 60 / 5) * 5);
  const prox = itens.find(id => !feitos.has(id));

  let txt, acao;
  if (andamento) {
    txt = `<div class="kicker azul">Em andamento</div><div class="titulo">${esc(t.nome)}</div>
      <div class="ink2">${nFeitos} de ${plural(itens.length, 'exercício', 'exercícios')}</div>`;
    acao = prox
      ? `<button class="grande larga" id="bt-comecar">${ic('play-fill')}Continuar: ${esc(movMap[exMap[prox].mov].nome)}</button>`
      : `<div class="vazio">${ic('flag-checkered', 'ic-24')}<div><div>Treino completo</div><div class="mudo">Salve como rotina ou escolha mais um exercício por grupo.</div></div></div>`;
  } else {
    const rec = e.pct >= 85 ? tagRecup(e.pct, 'Recuperado') : tagRecup(e.pct);
    txt = `<div class="kicker azul">${escolhidoOuSug(e)}</div><div class="titulo">${esc(t.nome)}</div>
      <div class="ink2">${esc(t.det)}</div>
      <div class="hero-meta">${rec}<span class="mudo">${e.ultTs ? `último: ${dataCurta(e.ultTs)}` : 'primeira vez'}</span></div>`;
    acao = `<button class="grande larga" id="bt-comecar">${ic('play-fill')}Começar ${esc(t.nome)}</button>
      <div class="hero-rod">${plural(itens.length, 'exercício', 'exercícios')} · ${nSeries} séries · cerca de ${min} min</div>`;
  }
  el.innerHTML = `<div class="card hero" id="card-dia">
    <div class="hero-top"><div class="hero-txt">${txt}</div><span class="hero-corpo">${corpoMini(t.musculos)}</span></div>
    ${andamento ? tilesHoje() : ''}
    <div class="plano"><div class="plano-cab"><span>${plano.ts ? `Plano · repete ${dataCurta(plano.ts)}` : 'Plano sugerido'}</span><span>${andamento ? 'hoje' : 'alvo de hoje'}</span></div>${linhas}</div>
    <div class="hero-acao">${acao}</div></div>`;
  const bt = $('bt-comecar');
  if (bt) bt.onclick = () => comecarTreino(t, itens);
}
const escolhidoOuSug = e => (treinoEscolha === e.t.id && e.pct < 60 ? 'Treinar mesmo assim' : 'Hoje é dia de');

function tilesHoje() {
  const sets = logs.filter(l => dayKey(l.ts) === hojeKey()).flatMap(l => l.sets);
  const vol = sets.reduce((s, x) => s + x.peso * x.reps, 0);
  let duracao = '–';
  if (sets.length > 1) {
    const ini = Math.min(...sets.map(s => s.ts - (s.dur || 0) * 1000)), fim = Math.max(...sets.map(s => s.ts));
    const min = Math.round((fim - ini) / 6e4);
    duracao = min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${Math.max(1, min)} <small>min</small>`;
  }
  return `<div class="tiles" id="tiles-hoje">${tile(sets.length, 'séries')}${tile(`${kg(vol)} <small>kg</small>`, 'volume')}${tile(duracao, 'duração')}</div>`;
}

function renderOutros(outros) {
  if (!outros.length) return;
  $('sec-outros').hidden = false;
  $('outros-treinos').innerHTML = outros.map(x => `<button class="linha-lista" data-treino="${x.t.id}" style="min-height:68px;padding-left:12px">
      ${corpoMini(x.t.musculos)}
      <span class="ll-txt"><span class="ll-nome" style="font-size:17px">${esc(x.t.nome)}</span><span class="ll-det">${esc(x.t.curto)} · ${x.hoje ? 'hoje' : esc(haQuanto(x.ultTs))}</span></span>
      ${tagRecup(x.pct)}${ic('caret-right', 'chev')}</button>`).join('');
  $('outros-treinos').querySelectorAll('[data-treino]').forEach(b => b.onclick = () => escolherTreino(b.dataset.treino));
}

function escolherTreino(id) {
  treinoEscolha = id;
  renderDia();
  renderGrupos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// E2: nenhum treino recuperado (todos < 60%)
function renderDescanso(el, est) {
  const ord = est.map(e => ({ ...e, h: horasTreino(e) })).sort((a, b) => a.h - b.h);
  const semana = semanaKey(Date.now());
  const daSemana = logs.filter(l => semanaKey(l.ts) === semana);
  const prs = daSemana.filter(l => l.pr || l.sets.some(s => s.pr)).length;
  el.innerHTML = `<div class="tela justa"><div class="card" style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;gap:12px;align-items:flex-start">${ic('moon-fill', 'ic-30 c-azul')}
        <div><div class="titulo-2">Dia de descanso</div><div class="mudo">Os três treinos ainda estão se recuperando. ${esc(ord[0].t.nome)} fica ${esc(txtHoras(ord[0].h))}.</div></div></div>
      <div class="lista" style="background:var(--c-elev)">${ord.map(x => `<button class="linha-lista" data-treino="${x.t.id}">
        ${corpoMini(x.t.musculos)}<span class="ll-txt"><span class="ll-nome">${esc(x.t.nome)}</span><span class="ll-det">${esc(txtHoras(x.h))}${x.ultTs ? ` · ${esc(haQuanto(x.ultTs))}` : ''}</span></span>
        ${tagRecup(x.pct)}</button>`).join('')}</div>
      <button class="ghost" id="bt-mesmo-assim">Treinar mesmo assim</button></div>
    <div class="secao"><div class="kicker">Esta semana</div><div class="tiles">
      ${tile(new Set(daSemana.map(l => dayKey(l.ts))).size, 'treinos')}${tile(daSemana.reduce((s, l) => s + l.sets.length, 0), 'séries')}${tile(`${prs}${ic('trophy-fill')}`, 'recordes')}</div></div></div>`;
  el.querySelectorAll('[data-treino]').forEach(b => b.onclick = () => escolherTreino(b.dataset.treino));
  $('bt-mesmo-assim').onclick = () => escolherTreino(ord[0].t.id);
}

// E1: primeiro uso — escolhe um dos três treinos e explica o fluxo
let primeiroEscolha = 'empurrar';
function renderPrimeiroUso(el) {
  const t = TREINOS.find(x => x.id === primeiroEscolha);
  treinoDoCard = t;
  el.innerHTML = `<div class="tela justa"><div class="card hero">
      <div class="hero-txt"><div class="kicker azul">Primeiro treino</div><div class="titulo-2">Qual é o treino de hoje?</div>
        <div class="mudo">Depois do primeiro registro, o Carga sugere o próximo pela sua recuperação.</div></div>
      <div class="opcoes-treino" role="radiogroup" aria-label="Treino">${TREINOS.map(x => `<button class="op-treino" role="radio" aria-checked="${x.id === t.id}" data-op="${x.id}">
        ${corpoMini(x.musculos)}<span class="ll-txt"><span class="ll-nome" style="font-size:17px">${esc(x.nome)}</span><span class="ll-det">${esc(x.det)}</span></span>${ic('check-circle-fill', 'ic-22')}</button>`).join('')}</div>
      <div class="hero-acao"><button class="grande larga" id="bt-comecar">${ic('play-fill')}Começar ${esc(t.nome)}</button>
        <button class="btn-texto" id="bt-por-grupo">Prefiro escolher por grupo muscular</button></div></div>
    <div class="card como"><div class="kicker">Como funciona</div>
      <div class="como-it">${ic('barbell')}<div><b>Anote carga × repetições</b><span>Cada variação guarda a própria carga e sugere o alvo da próxima vez.</span></div></div>
      <div class="como-it">${ic('timer')}<div><b>O descanso conta sozinho</b><span>Vibra e toca um bipe quando for hora da próxima série.</span></div></div>
      <div class="como-it">${ic('person-arms-spread')}<div><b>Veja o que já recuperou</b><span>A aba Músculos estima a recuperação de cada grupo.</span></div></div></div></div>`;
  el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { primeiroEscolha = b.dataset.op; renderPrimeiroUso(el); renderGrupos(); });
  $('bt-comecar').onclick = () => comecarTreino(t, planoTreino(t, {}).itens);
  $('bt-por-grupo').onclick = () => $('sec-grupos').scrollIntoView({ behavior: 'smooth' });
}

// ---------- repetir o último treino de um grupo (lista do grupo) ----------
// último treino de um grupo: exercícios do dia mais recente, na ordem em que foram feitos
function ultimoTreinoGrupo(grupo) {
  const doGrupo = logs.filter(l => exMap[l.ex] && exMap[l.ex].cat === grupo && dayKey(l.ts) !== hojeKey());
  if (!doGrupo.length) return null;
  const dia = dayKey(Math.max(...doGrupo.map(l => l.ts)));
  const doDia = doGrupo.filter(l => dayKey(l.ts) === dia).sort((a, b) => a.ts - b.ts);
  return { ts: doDia[0].ts, itens: [...new Set(doDia.map(l => l.ex))] };
}

const rotinaAtiva = () => ativo.rotina === 'rep' ? ativo.rotinaTemp : rotinas.find(r => r.id === ativo.rotina);

function repetirTreino(grupo) {
  const u = ultimoTreinoGrupo(grupo);
  if (!u) return;
  const feitos = new Set(logs.filter(l => dayKey(l.ts) === hojeKey()).map(l => l.ex));
  ativo.rotina = 'rep';
  ativo.rotinaTemp = { id: 'rep', nome: `${nomeGrupo(grupo)} de ${dataBr(u.ts)}`, itens: u.itens };
  abrirExercicio(u.itens.find(id => !feitos.has(id)) || u.itens[0]);
}
