/* Carga — Sugestão de treino do dia. */
'use strict';

// ---------- sugestão de treino ----------
const GASTO_ALVO = 5; // estímulo diário a partir do qual o músculo conta como "finalizado" (= nível "pesado")
const nivelSti = s => s < 2 ? 'leve' : s < 5 ? 'moderado' : 'pesado';

function sugerirTreino(regiaoDoDia) {
  const hoje = hojeKey();
  const logsHoje = logs.filter(l => dayKey(l.ts) === hoje);
  const stiHoje = {};
  MUSCULOS.forEach(m => { stiHoje[m.id] = logsHoje.reduce((s, l) => s + estimulo(l, m.id), 0); });
  const estados = MUSCULOS.map(m => ({ m, pct: pctRecuperado(m.id), ultimo: ultimoTreino(m.id), sti: stiHoje[m.id] }));
  const emRecuperacao = estados.filter(x => x.pct < 60 && x.sti < 0.5); // fatigado de dias anteriores
  const movsHoje = new Set(logsHoje.map(l => exMap[l.ex] && exMap[l.ex].mov));
  const ultimoUso = {};
  logs.forEach(l => { ultimoUso[l.ex] = Math.max(ultimoUso[l.ex] || 0, l.ts); });

  // por movimento que foca o músculo: a variação usada por último (ou a primeira do catálogo)
  const escolheExs = mId => {
    const porMov = {};
    for (const e of EXERCICIOS) {
      if ((e.musculos[mId] || 0) < 0.5 || movsHoje.has(e.mov)) continue;
      const atual = porMov[e.mov];
      if (!atual || (ultimoUso[e.id] || 0) > (ultimoUso[atual.id] || 0)) porMov[e.mov] = e;
    }
    const cands = Object.values(porMov);
    const conhecidos = cands.filter(e => ultimoUso[e.id]);
    return [...conhecidos, ...cands.filter(e => !ultimoUso[e.id])].slice(0, 2);
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
  } else if (regiaoDoDia) {
    // antes de começar: monta o treino da divisão do dia (ex.: empurrar = peito, ombros, tríceps)
    regiao = regiaoDoDia;
    grupos = regiao.principais.map(id => estados.find(x => x.m.id === id))
      .filter(x => x && !emRecuperacao.includes(x))
      .map(x => ({ m: x.m, sti: 0, exs: escolheExs(x.m.id) }))
      .filter(g => g.exs.length);
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


// ---------- rodízio de grupos ----------
// sem dias fixos: o grupo treinado há mais tempo (e já recuperado) é o sugerido; os outros ficam ao lado
function rodizioGrupos() {
  const ult = {};
  for (const l of logs) { const e = exMap[l.ex]; if (e) ult[e.cat] = Math.max(ult[e.cat] || 0, l.ts); }
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  const hoje = hojeKey();
  return gruposVisiveis().map(g => {
    const pior = g.musculos.length ? g.musculos.reduce((a, m) => recup[m] < a.pct ? { m, pct: recup[m] } : a, { m: null, pct: 101 }) : { m: null, pct: 100 };
    return { g, ult: ult[g.id] || 0, hoje: !!ult[g.id] && dayKey(ult[g.id]) === hoje, pior };
  }).sort((a, b) => a.ult - b.ult);
}

// ---------- rodízio por divisão: empurrar → puxar → pernas ----------
// cada treino registrado conta para a divisão que mais trabalha; core entra como complemento de qualquer dia
const DIVISOES = REGIOES.filter(r => r.id !== 'core').map(r => ({
  ...r, principais: { empurrar: ['peito', 'ombros', 'triceps'], puxar: ['costas', 'biceps'], pernas: ['quadriceps', 'posteriores', 'gluteos', 'panturrilha'] }[r.id],
}));
function divisaoDoExercicio(ex) {
  let melhor = null, top = 0;
  for (const d of DIVISOES) {
    const s = d.musculos.reduce((t, m) => t + (ex.musculos[m] || 0), 0);
    if (s > top) { top = s; melhor = d; }
  }
  return melhor;
}
function rodizioDivisoes() {
  const ult = {};
  for (const l of logs) { const e = exMap[l.ex], d = e && divisaoDoExercicio(e); if (d) ult[d.id] = Math.max(ult[d.id] || 0, l.ts); }
  const hoje = hojeKey();
  return DIVISOES.map(d => {
    const pior = d.principais.reduce((a, m) => { const p = pctRecuperado(m); return p < a.pct ? { m, pct: p } : a; }, { m: null, pct: 101 });
    return { d, ult: ult[d.id] || 0, hoje: !!ult[d.id] && dayKey(ult[d.id]) === hoje, pior };
  }).sort((a, b) => a.ult - b.ult);
}
// grupos da tela inicial que pertencem à divisão (maioria dos músculos do grupo nela)
const nomeDivisao = d => ({ empurrar: 'Empurrar', puxar: 'Puxar', pernas: 'Pernas' })[d.id];
const musculosDivisao = d => d.principais.map(nomeCurto).join(' · ');
const primeiroGrupo = d => (gruposVisiveis().find(g => grupoNaDivisao(g, d)) || {}).id || '';
const grupoNaDivisao = (g, d) => g.musculos.length && g.musculos.filter(m => d.musculos.includes(m)).length / g.musculos.length >= 0.6;

// último treino de uma divisão: exercícios do dia mais recente em que ela foi treinada
function ultimoTreinoDivisao(dId) {
  const daDiv = logs.filter(l => exMap[l.ex] && (divisaoDoExercicio(exMap[l.ex]) || {}).id === dId && dayKey(l.ts) !== hojeKey());
  if (!daDiv.length) return null;
  const dia = dayKey(Math.max(...daDiv.map(l => l.ts)));
  const doDia = logs.filter(l => exMap[l.ex] && dayKey(l.ts) === dia).sort((a, b) => a.ts - b.ts);
  return { ts: doDia[0].ts, itens: [...new Set(doDia.map(l => l.ex))] };
}

function escolheSugerido(rod) {
  const livre = x => !x.hoje && x.pior.pct >= 60;
  return rod.find(x => x.ult && livre(x)) || rod.find(livre) || null; // prioriza quem já faz parte do seu rodízio
}

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
  const div = DIVISOES.find(d => d.id === grupo);
  const u = div ? ultimoTreinoDivisao(grupo) : ultimoTreinoGrupo(grupo);
  if (!u) return;
  const feitos = new Set(logs.filter(l => dayKey(l.ts) === hojeKey()).map(l => l.ex));
  ativo.rotina = 'rep';
  ativo.rotinaTemp = { id: 'rep', nome: `${div ? nomeDivisao(div) : nomeGrupo(grupo)} de ${dataBr(u.ts)}`, itens: u.itens };
  abrirExercicio(u.itens.find(id => !feitos.has(id)) || u.itens[0]);
}

const haQuanto = ts => { if (!ts) return 'nunca'; const q = quando(ts); return q === dataBr(ts) ? `em ${q}` : q; };

function renderSugestoes() {
  const el = $('sugestoes');
  if (!logs.length) {
    el.innerHTML = '<p class="mudo">Sem histórico ainda — escolha um grupo abaixo e registre seu primeiro exercício; as sugestões aparecem aqui.</p>';
    return;
  }
  const rod = rodizioDivisoes();
  const treinouHoje = logs.some(l => dayKey(l.ts) === hojeKey());
  const sug = escolheSugerido(rod);
  const chipsGrupos = grupos => grupos.map(g => {
    const gasto = g.sti > 0.2 ? ` · já ${nivelSti(g.sti)}` : '';
    return `<div class="grupo-sug"><div class="titulo">${esc(g.m.nome)}${gasto}</div><div class="chips">`
      + g.exs.map(e => `<button class="chip" data-ex="${e.id}"><b>+</b> ${esc(e.nome)}</button>`).join('') + '</div></div>';
  }).join('');
  const cartao = (x, rotulo) => `<button class="sug-principal" data-abre-grupo="${esc(primeiroGrupo(x.d))}">
        ${corpoMini(x.d.principais)}
        <span class="sp-txt"><span class="sp-rot">${rotulo}</span>
        <span class="sp-nome">${esc(nomeDivisao(x.d))}</span>
        <span class="sp-mus">${esc(musculosDivisao(x.d))}</span>
        <span class="sp-det">último: ${esc(haQuanto(x.ult))} · ${x.pior.pct >= 85 ? 'recuperado ✅' : `${esc(nomeCurto(x.pior.m))} ${x.pior.pct}%`}</span></span>
        <span class="sp-seta">›</span></button>`;
  let html = '';
  if (treinouHoje) {
    // treino em andamento: o que falta finalizar na divisão do dia (modelo por músculo)
    const { grupos, regiao, completa } = sugerirTreino();
    const div = regiao && DIVISOES.find(d => d.id === regiao.id);
    html += `<p class="ink2" style="margin-bottom:8px">🎯 Hoje: <b>${esc(div ? nomeDivisao(div) : regiao ? regiao.nome : 'treino livre')}</b>${regiao && !completa ? ' — falta finalizar:' : regiao ? ' — divisão finalizada ✅' : ''}</p>`;
    if (regiao && !completa) html += chipsGrupos(grupos);
    if (sug) html += `<div class="sub" style="margin:14px 0 6px">Próximo treino</div>` + cartao(sug, 'No rodízio');
  } else if (sug) {
    const u = ultimoTreinoDivisao(sug.d.id);
    const { grupos } = sugerirTreino(sug.d);
    html += cartao(sug, 'Hoje é dia de');
    if (grupos.length) html += `<div class="sub" style="margin:14px 0 6px">Treino sugerido — toque para começar</div>` + chipsGrupos(grupos);
    if (u) html += `<button class="ghost larga" data-repetir="${esc(sug.d.id)}" style="margin-top:8px">🔁 Repetir o treino de ${dataBr(u.ts)} (${u.itens.length} exercício${u.itens.length > 1 ? 's' : ''})</button>`;
  } else {
    html += '<p class="mudo">Todos os grupos estão em recuperação — descanso também é treino 😴</p>';
  }
  el.innerHTML = html;
  bindChips(el);
  el.querySelectorAll('[data-abre-grupo]').forEach(b => b.onclick = () => {
    if (emSerie()) return toast('Termine ou cancele a série atual primeiro.');
    ativo.grupo = b.dataset.abreGrupo; ativo.ex = null; ativo.vista = 'ex';
    salvaAtivo(); renderTreinar(); rolarPara('card-treinar');
  });
  el.querySelectorAll('[data-repetir]').forEach(b => b.onclick = () => repetirTreino(b.dataset.repetir));
}
