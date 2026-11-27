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
const CORE = REGIOES.find(r => r.id === 'core').musculos; // fora do rodízio: entra em qualquer treino
// grupo da tela inicial que tem algum músculo principal do treino (Braços entra em Empurrar pelo tríceps e em Puxar pelo bíceps)
const grupoNoTreino = (g, t) => g.musculos.some(m => t.principais.includes(m));
// exercício que cabe no treino: o treino do músculo principal (data.js, CLASSIFICA), ou core, que entra em qualquer um.
// Face pull e crucifixo inverso (deltoide posterior) são de Puxar; terra e hiperextensão são de Pernas.
// (aceita também um movimento: vale o da 1ª variação)
const exNoTreino = (e, t) => { const x = e && e.vars ? exMap[e.vars[0].id] : e; return !x || !x.treino || x.treino === t.id || x.treino === 'core'; };
// treino que a tela inicial está mostrando no card do dia (null = descanso ou primeiro uso)
let treinoDoCard = null;
let treinoEscolha = null; // treino que o usuário tocou para ver no lugar do sugerido (vale até recarregar)

// treino do dia: fica escolhido do momento em que começa até o dia acabar (sobrevive a recarregar e a voltar para o início)
const LS_TREINO_DIA = 'carga.treinoDia';
function lerTreinoDia() {
  const d = lerLS(LS_TREINO_DIA, null);
  return d && d.dia === hojeKey() ? d : null;
}
function treinoFixo() {
  const d = lerTreinoDia();
  return d ? TREINOS.find(t => t.id === d.id) || null : null;
}
// guarda o treino e a versão (A/B) de hoje
function fixaTreino(t, v) {
  if (!t) return;
  const d = lerTreinoDia();
  v ||= d && d.id === t.id ? d.v : null;
  localStorage.setItem(LS_TREINO_DIA, JSON.stringify({ dia: hojeKey(), id: t.id, ...(v ? { v } : {}) }));
}
// treino de hoje para quem está fora da tela inicial (lista do grupo, próximo exercício)
const treinoDeHoje = () => treinoFixo() || treinoDoCard;

// treino de um dia: o que mais recebeu séries de trabalho pelo treino de cada exercício; só core = nenhum
function treinoDoDia(doDia) {
  let melhor = null, max = 0;
  for (const t of TREINOS) {
    const s = doDia.reduce((a, l) => { const e = exMap[l.ex]; return e && e.treino === t.id ? a + trab(l.sets).length : a; }, 0);
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

// ---------- rotinas A/B ----------
const outraVersao = v => (v === 'A' ? 'B' : 'A');
// versão de um dia já feito: a rotina com mais movimentos em comum com ele
function versaoDoDia(t, dia) {
  const movsDia = new Set(dia.logs.map(l => exMap[l.ex] && exMap[l.ex].mov));
  const comum = v => ROTINAS_PPL[t.id][v].itens.filter(([id]) => exMap[id] && movsDia.has(exMap[id].mov)).length;
  return comum('B') > comum('A') ? 'B' : 'A';
}
// versão de hoje: a guardada ao começar; senão a que não foi feita da última vez (sem histórico, A)
function versaoTreino(t, dias) {
  const d = lerTreinoDia();
  if (d && d.id === t.id && d.v) return d.v;
  const ant = (dias[t.id] || []).find(x => x.dia !== hojeKey());
  return ant ? outraVersao(versaoDoDia(t, ant)) : 'A';
}

// A rotina foi montada para cada treino 2x por semana. Se o mesmo treino não foi feito nos últimos 6 dias
// (ritmo de 1x por semana, como quem treina 3 dias), cada exercício ganha +1 série de trabalho (até 5)
// para o músculo ainda chegar perto da meta semanal. Treinando 4 ou 5 dias, isso vale só para o treino que ficou para trás.
const SERIE_EXTRA_DIAS = 6;
function diasDesde(t, dias) {
  const ant = (dias[t.id] || []).find(x => x.dia !== hojeKey());
  return ant ? Math.round((new Date(hojeKey() + 'T12:00') - new Date(ant.dia + 'T12:00')) / 864e5) : null;
}

// plano: a rotina da versão de hoje, com preparatórias e séries de trabalho. Se da última vez nesta versão
// você fez outra variação do mesmo movimento, ou trocou o exercício por outro do mesmo músculo principal, a troca fica.
function planoTreino(t, dias) {
  const v = versaoTreino(t, dias), rot = ROTINAS_PPL[t.id][v];
  const ultMesma = (dias[t.id] || []).find(x => x.dia !== hojeKey() && versaoDoDia(t, x) === v);
  const feitosAnt = ultMesma ? [...new Set(ultMesma.logs.map(l => l.ex))].filter(id => exMap[id]) : [];
  const naRotina = new Set(rot.itens.map(([id]) => id));
  const usados = new Set();
  const desde = diasDesde(t, dias), extra = desde != null && desde >= SERIE_EXTRA_DIAS ? 1 : 0;
  const itens = [], series = {}, prep = {};
  for (const [id0, p, n] of rot.itens) {
    const base = exMap[id0];
    if (!base) continue;
    let id = id0;
    if (feitosAnt.length && !feitosAnt.includes(id0)) {
      const mesmoMov = feitosAnt.find(x => exMap[x].mov === base.mov);
      const troca = mesmoMov || feitosAnt.find(x => !naRotina.has(x) && !usados.has(x) && exMap[x].pri === base.pri && exMap[x].mov !== base.mov
        && !rot.itens.some(([r]) => exMap[r] && exMap[r].mov === exMap[x].mov));
      if (troca) id = troca;
    }
    if (usados.has(id)) continue;
    usados.add(id);
    itens.push(id); series[id] = Math.min(5, n + extra); prep[id] = p;
  }
  return { ts: ultMesma ? ultMesma.logs[0].ts : 0, itens, series, prep, v, foco: rot.foco, extra };
}
// plano de hoje para um exercício (preparatórias e séries de trabalho), se ele está no treino do dia
function planoDoExercicio(exId) {
  const t = treinoFixo();
  if (!t) return null;
  const pl = planoTreino(t, diasPorTreino());
  return pl.itens.includes(exId) ? { prep: pl.prep[exId] || 0, trab: pl.series[exId] || 3 } : null;
}

// exercícios do card do dia: o plano e, com o treino em andamento, também o que já foi feito hoje fora do plano
function itensDoDia(t, plano, andamento) {
  if (!andamento) return plano.itens;
  const feitos = [...new Set(logs.filter(l => dayKey(l.ts) === hojeKey()).map(l => l.ex))];
  return [...plano.itens, ...feitos.filter(id => exMap[id] && !plano.itens.includes(id))];
}
// rotina implícita do treino de hoje: dá o "Próximo" mesmo quando o exercício foi aberto pela grade
function rotinaDoDia() {
  const t = treinoFixo();
  if (!t || (ativo.ex && exMap[ativo.ex] && !exNoTreino(exMap[ativo.ex], t))) return null;
  return { id: 'dia', nome: t.nome, itens: itensDoDia(t, planoTreino(t, diasPorTreino()), true) };
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

// sugerido: o treino que o dia já começou (o escolhido ao começar, ou o dos registros de hoje); senão o feito há mais tempo que já recuperou (≥ 60%)
function treinoSugerido(est) {
  const fixo = treinoFixo();
  const andamento = (fixo && est.find(e => e.t === fixo)) || est.find(e => e.hoje);
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
  fixaTreino(t, versaoTreino(t, diasPorTreino()));
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
  // treinou hoje sem tocar em "Começar" (pela grade): o treino dos registros de hoje fica escolhido até o dia acabar
  if (!treinoFixo()) { const h = est.find(x => x.hoje); if (h) fixaTreino(h.t); }
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
  const andamento = e.hoje || treinoFixo() === t;
  const itens = itensDoDia(t, plano, andamento);
  const nFeitos = itens.filter(id => feitos.has(id)).length;
  const setsHoje = id => doDia.filter(l => l.ex === id).reduce((s, l) => s + trab(l.sets).length, 0);
  const prepHoje = id => doDia.filter(l => l.ex === id).reduce((s, l) => s + preps(l.sets).length, 0);
  // "1 prep. + 3 séries": preparatórias e de trabalho previstas para o exercício
  const seriesTxt = id => plano.series[id] ? `<small class="plano-series">${plano.prep[id] ? `${plano.prep[id]} prep. + ` : ''}${plural(plano.series[id], 'série', 'séries')}</small>` : '';
  const feitoTxt = id => `${plural(setsHoje(id), 'série', 'séries')}${prepHoje(id) ? ` + ${prepHoje(id)} prep.` : ''}`;
  const linhas = itens.map((id, i) => feitos.has(id)
    ? `<div class="plano-it feito"><span class="n">${ic('check-circle-fill')}</span><span class="nome">${nomeEx(id)}</span><span class="alvo">${feitoTxt(id)}</span></div>`
    : `<div class="plano-it"><span class="n">${i + 1}</span><span class="nome">${nomeEx(id)}${seriesTxt(id)}</span><span class="alvo">${esc(alvoTxt(id))}</span></div>`).join('');
  const nSeries = itens.reduce((s, id) => s + (plano.series[id] || 3), 0);
  const nPrep = itens.reduce((s, id) => s + (plano.prep[id] || 0), 0);
  const min = Math.max(5, Math.round(itens.reduce((s, id) => s + (plano.series[id] || 3) * (40 + descansoDe(id)) + (plano.prep[id] || 0) * 80, 0) / 60 / 5) * 5);
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
      <div class="hero-rod">${plural(itens.length, 'exercício', 'exercícios')} · ${nSeries} séries${nPrep ? ` + ${nPrep} prep.` : ''} · cerca de ${min} min</div>`;
  }
  el.innerHTML = `<div class="card hero" id="card-dia">
    <div class="hero-top"><div class="hero-txt">${txt}</div><span class="hero-corpo">${corpoMini(t.musculos)}</span></div>
    ${andamento ? tilesHoje() : ''}
    <div class="plano"><div class="plano-cab"><span id="plano-versao">${esc(t.nome)} ${plano.v} · ${esc(plano.foco)}${plano.extra ? ' · +1 série (1x na semana)' : ''}</span><span>${andamento ? 'hoje' : 'alvo de hoje'}</span></div>${linhas}</div>
    <div class="hero-acao">${acao}</div></div>`;
  const bt = $('bt-comecar');
  if (bt) bt.onclick = () => comecarTreino(t, itens);
}
const escolhidoOuSug = e => (treinoEscolha === e.t.id && e.pct < 60 ? 'Treinar mesmo assim' : 'Hoje é dia de');

function tilesHoje() {
  const sets = logs.filter(l => dayKey(l.ts) === hojeKey()).flatMap(l => l.sets), nPrep = preps(sets).length;
  const vol = sets.reduce((s, x) => s + x.peso * x.reps, 0);
  let duracao = '–';
  if (sets.length > 1) {
    const ini = Math.min(...sets.map(s => s.ts - (s.dur || 0) * 1000)), fim = Math.max(...sets.map(s => s.ts));
    const min = Math.round((fim - ini) / 6e4);
    duracao = min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${Math.max(1, min)} <small>min</small>`;
  }
  return `<div class="tiles" id="tiles-hoje">${tile(sets.length - nPrep, nPrep ? `séries + ${nPrep} prep.` : 'séries')}${tile(`${kg(vol)} <small>kg</small>`, 'volume')}${tile(duracao, 'duração')}</div>`;
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
// (com um treino escolhido hoje, só os que cabem nele: em dia de Puxar, Braços repete o bíceps, não o tríceps)
function ultimoTreinoGrupo(grupo) {
  const g = gruposVisiveis().find(x => x.id === grupo);
  const tDia = g && treinoDeHoje() && grupoNoTreino(g, treinoDeHoje()) ? treinoDeHoje() : null;
  const doGrupo = logs.filter(l => exMap[l.ex] && exMap[l.ex].cat === grupo && dayKey(l.ts) !== hojeKey() && (!tDia || exNoTreino(exMap[l.ex], tDia)));
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
