/* Carga — Aba Treino: início (treino do dia, grupos, rotinas, registrado hoje) → lista do grupo → painel do exercício. */
'use strict';

// ---------- aba Treino ----------
// fluxo: treino do dia ou grupo → exercício → painel (a série em si abre em tela cheia, ver serie.js)
const ATIVO_PADRAO = { grupo: null, vista: 'ex', ex: null, rotina: null, rotinaTemp: null, estado: 'pronto', serieIni: 0, pend: null,
  descFim: 0, descDur: 0, descAvisado: false, telaDesc: false, minimizado: false, prUlt: null, ts: 0 };
let ativo = Object.assign({}, ATIVO_PADRAO, lerLS(LS_ATIVO, {}));
const salvaAtivo = () => { ativo.ts = Date.now(); localStorage.setItem(LS_ATIVO, JSON.stringify(ativo)); };
const emSerie = () => ativo.estado === 'contagem' || ativo.estado === 'rodando' || ativo.estado === 'anotando';
let form = { ex: null, peso: 20, reps: 10, rir: null }; // formulário da próxima série

function renderTreino() {
  $('hoje-data').textContent = dataLonga(Date.now());
  const semana = semanaKey(Date.now());
  const n = new Set(logs.filter(l => semanaKey(l.ts) === semana).map(l => dayKey(l.ts))).size;
  $('tag-semana').innerHTML = `${ic('calendar-blank')}${n ? `${plural(n, 'treino', 'treinos')} na semana` : 'nenhum treino na semana'}`;
  renderTreinar();
}

function semanaKey(ts) { // segunda-feira da semana, como YYYY-MM-DD
  const d = new Date(ts);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return dayKey(d.getTime());
}

// mostra o início, a lista do grupo ou o painel do exercício aberto
function renderTreinar() {
  const sub = !!(ativo.ex || ativo.grupo);
  $('treino-inicio').hidden = sub;
  const el = $('card-treinar');
  el.hidden = !sub;
  if (ativo.ex) return renderPainel(el);
  pararAnim();
  renderCtl();
  if (ativo.grupo) return renderListaGrupo(el);
  renderDia();
  renderGrupos();
  renderRotinas();
  renderLogHoje();
}

const irParaTopo = () => window.scrollTo(0, 0);

function abrirGrupo(grupo) {
  ativo.grupo = grupo;
  ativo.ex = null;
  ativo.vista = 'ex';
  salvaAtivo();
  renderTreinar();
  irParaTopo();
}

function renderGrupos() {
  const recup = {}, ult = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  for (const l of logs) { const e = exMap[l.ex]; if (e) ult[e.cat] = Math.max(ult[e.cat] || 0, l.ts); }
  $('grupos').innerHTML = gruposVisiveis().map(g => {
    const pct = g.musculos.length ? Math.min(...g.musculos.map(m => recup[m])) : 100;
    const s = statusRecup(pct);
    return `<button class="grupo" data-grupo="${esc(g.id)}">${corpoMini(g.musculos)}
      <span class="g-nome">${esc(nomeGrupo(g.id))}</span>
      <span class="g-status c-${s.cls}">${ic(s.ic)}${pct >= 85 ? s.nome : pct + '%'}</span>
      <span class="g-quando">${ult[g.id] ? esc(quando(ult[g.id])) : 'nunca'}</span></button>`;
  }).join('');
  $('grupos').querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => abrirGrupo(b.dataset.grupo));
}

// ---------- lista do grupo ----------
function renderListaGrupo(el) {
  const g = gruposVisiveis().find(x => x.id === ativo.grupo);
  const lista = movs.filter(m => m.cat === ativo.grupo);
  if (!g || !lista.length) { ativo.grupo = null; salvaAtivo(); return renderTreinar(); }
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  const pior = g.musculos.reduce((a, m) => (recup[m] < a.pct ? { m, pct: recup[m] } : a), { m: null, pct: 100 });
  const ultG = logs.reduce((a, l) => (exMap[l.ex] && exMap[l.ex].cat === g.id ? Math.max(a, l.ts) : a), 0);
  const s = statusRecup(pior.pct);
  el.innerHTML = `<div class="barra-topo"><button class="btn-voltar" id="bt-voltar">${ic('caret-left', 'ic-22')}Treino</button></div>
    <div class="titulo-meta"><h1>${esc(nomeGrupo(g.id))}</h1>
      <div class="meta">${tagRecup(pior.pct, `${s.nome} · ${pior.pct}%`)}<span class="mudo">${ultG ? `último treino ${esc(haQuanto(ultG))}` : 'ainda não treinado'}</span></div></div>
    ${pior.pct < 60 ? avisoRecuperacao(pior) : ''}
    <div class="seg" role="tablist"><button role="tab" data-vista="ex" aria-selected="${ativo.vista !== 'evo'}">Exercícios</button><button role="tab" data-vista="evo" aria-selected="${ativo.vista === 'evo'}">Evolução</button></div>
    <div class="tela justa" id="grupo-corpo"></div>`;
  $('bt-voltar').onclick = () => { ativo.grupo = null; salvaAtivo(); renderTreinar(); irParaTopo(); };
  el.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => { ativo.vista = b.dataset.vista; salvaAtivo(); renderListaGrupo(el); });
  const bp = $('bt-ver-pronto');
  if (bp) bp.onclick = () => { ativo.grupo = null; salvaAtivo(); renderTreinar(); escolherTreino(bp.dataset.treino); };
  const corpo = $('grupo-corpo');
  if (ativo.vista === 'evo') return renderEvolucao(corpo, ativo.grupo);

  const ultimo = {};
  for (const l of logs) if (!ultimo[l.ex] || l.ts > ultimo[l.ex].ts) ultimo[l.ex] = l;
  const u = ultimoTreinoGrupo(ativo.grupo);
  let html = u ? `<button class="ghost bt-repetir" id="bt-repetir">${ic('arrow-counter-clockwise', 'ic-22')}
      <span class="ll-txt"><span class="ll-nome">Repetir treino de ${dataCurta(u.ts)}</span>
      <span class="ll-det">${esc([...new Set(u.itens.filter(id => exMap[id]).map(id => movMap[exMap[id].mov].nome))].join(', '))}</span></span>${ic('caret-right')}</button>` : '';
  html += `<div class="secao"><div class="secao-cab"><span class="kicker">${plural(lista.length, 'exercício', 'exercícios')}</span>
    <span class="legenda-foco"><span><span class="ponto"></span>foco</span><span><span class="ponto aux"></span>auxiliar</span></span></div>`;
  // subgrupos (ex.: Quadríceps, Posteriores); personalizado não "herda" o subgrupo de cima
  const temSub = lista.some(m => m.sub);
  const secoes = [];
  for (const m of lista) {
    const sub = m.sub || (temSub ? 'Personalizados' : null);
    if (!secoes.length || secoes[secoes.length - 1].sub !== sub) secoes.push({ sub, movs: [] });
    secoes[secoes.length - 1].movs.push(m);
  }
  html += secoes.map((sc, i) => `${sc.sub ? `<div class="kicker" style="padding:${i ? '10px' : '0'} 4px 0">${esc(sc.sub)}</div>` : ''}
    <div class="lista">${sc.movs.map(m => linhaMov(m, ultimo, recup)).join('')}</div>`).join('');
  corpo.innerHTML = html + '</div>';
  if (u) $('bt-repetir').onclick = () => repetirTreino(ativo.grupo);
  corpo.querySelectorAll('.mov[data-ex]').forEach(b => b.onclick = () => abrirExercicio(b.dataset.ex));
}

function linhaMov(m, ultimo, recup) {
  const vars = m.vars.map(v => exMap[v.id]);
  const recente = vars.filter(v => ultimo[v.id]).sort((a, b) => ultimo[b.id].ts - ultimo[a.id].ts)[0];
  const abre = recente || vars[0];
  const fi = focoInfo({ musculos: m.musculos, foco: m.foco || [] });
  let det;
  if (recente) {
    const l = ultimo[recente.id], top = melhorSerie(l.sets);
    det = `${vars.length > 1 ? `${esc(recente.vnome)} · ` : ''}${esc(carga(top.peso))} × ${esc(repsCurto(top, recente.seg))} · ${esc(quando(l.ts))}`;
  } else det = vars.length > 1 ? `${vars.length} variações · ainda não feito` : 'ainda não feito';
  const tend = recente ? tendHtml(tendencia(pontosEx(recente.id).pts), !!estagnacao(recente.id)) : '';
  const cansado = Object.entries(m.musculos).filter(([id, f]) => f >= 0.4 && recup[id] < 60).sort((a, b) => recup[a[0]] - recup[b[0]])[0];
  return `<button class="linha-lista mov" data-ex="${abre.id}" data-mov="${m.id}">
    <span class="mov-mapa">${mapaFoco({ musculos: m.musculos, foco: m.foco || [] }, 76)}</span>
    <span class="mov-txt"><span class="mov-nome">${esc(m.nome)}</span>
      <span class="mov-foco"><span class="ponto"></span>${esc(fi.foco.map(x => x.nome).join(', '))}</span>
      <span class="mov-det">${det}</span>${tend}
      ${cansado ? tagRecup(recup[cansado[0]], `${nomeCurto(cansado[0])} ${recup[cansado[0]]}%`) : ''}</span>
    ${ic('caret-right', 'chev')}</button>`;
}

// E3: grupo ainda em recuperação — quanto falta e qual treino está pronto
function avisoRecuperacao(pior) {
  const h = horasAtePronto(pior.m, 85);
  const pronto = treinoSugerido(estadoTreinos());
  return `<div class="aviso-card" role="note">${ic('warning-fill')}<div><b>${esc(nomeCurto(pior.m))} ainda em recuperação</b>
    ${pior.pct}% recuperado, pronto em ~${h} h. Treinar agora soma fadiga e costuma travar a progressão.
    ${pronto && !pronto.hoje ? `<br><button class="btn-texto" id="bt-ver-pronto" data-treino="${pronto.t.id}">Ver treino pronto: ${esc(pronto.t.nome)}${ic('caret-right', 'ic-16')}</button>` : ''}</div></div>`;
}

function abrirExercicio(exId, rotinaId) {
  const ex = exMap[exId];
  if (!ex) return;
  if (emSerie()) return exId === ativo.ex ? abrirTelaSerie() : toast('Termine ou cancele a série atual primeiro.');
  if (ativo.ex !== exId) { ativo.telaDesc = false; ativo.minimizado = false; }
  ativo.grupo = ex.cat;
  ativo.ex = exId;
  if (rotinaId !== undefined) ativo.rotina = rotinaId;
  salvaAtivo();
  preencheForm(ex);
  if (tabAtual !== 'treino') mostrarTab('treino');
  else renderTreinar();
  atualizaTela();
  irParaTopo();
}

// volta para a lista do grupo; concluir dentro de um treino/rotina volta para o início
function fecharExercicio(concluir) {
  if (emSerie()) return toast('Termine ou cancele a série atual primeiro.');
  ativo.ex = null;
  ativo.telaDesc = false;
  if (concluir && ativo.rotina != null) ativo.grupo = null;
  salvaAtivo();
  renderTreino();
  atualizaTela();
  irParaTopo();
}

function novaVariacao(movId) {
  const mov = movMap[movId];
  if (!mov) return;
  const nome = prompt(`Nova variação de "${mov.nome}" — ex.: a máquina da sua academia, outra pegada:`);
  if (!nome || !nome.trim()) return;
  const c = { id: 'custom_' + Date.now(), mov: movId, vnome: nome.trim(), eq: 'maquina' };
  customExs.push(c);
  aplicaCustom();
  toast('Variação criada');
  abrirExercicio(c.id);
}

// ---------- painel do exercício ----------
function renderPainel(el) {
  const ex = exMap[ativo.ex], mov = movMap[ex.mov];
  if (form.ex !== ex.id) preencheForm(ex);
  const fi = focoInfo(ex);
  el.innerHTML = `
    <div class="barra-topo"><button class="btn-voltar" id="bt-voltar">${ic('caret-left', 'ic-22')}${esc(nomeGrupo(ex.cat))}</button>
      <span><button class="btn-ic" id="bt-nota-ic" aria-label="Anotação">${ic('note-pencil', 'ic-22')}</button><button class="btn-ic" id="bt-mais" aria-label="Mais opções">${ic('dots-three', 'ic-22')}</button></span></div>
    <h1 class="p-titulo">${esc(mov.nome)}</h1>
    <div class="chips rolar p-vars" role="radiogroup" aria-label="Variação">${mov.vars.map(v =>
      `<button class="chip" role="radio" aria-checked="${v.id === ex.id}" data-var="${v.id}">${esc(v.nome)}</button>`).join('')}
      <button class="chip chip-mais" data-novavar="${mov.id}" aria-label="Nova variação">${ic('plus', 'ic-16')}</button></div>
    <div class="card alvo-card" id="ref"></div>
    <div class="secao" id="sec-series" hidden><div class="kicker">Séries de hoje</div><div class="lista series-lista" id="series"></div><div id="esforco"></div></div>
    <div class="midia">
      <div id="anim-ex" hidden></div>
      <div class="p-mapa">${mapaFoco(ex, 104)}</div>
    </div>
    <div class="p-foco">${fi.foco.map(x => `<div class="it"><span class="ponto"></span><span><b>${esc(x.nome)}</b>${x.info ? ` — ${esc(x.info)}` : ''}</span></div>`).join('')}
      ${fi.aux.length ? `<div class="it aux"><span class="ponto aux"></span><span>Auxiliares: ${esc(fi.aux.map(x => x.nome).join(', '))}</span></div>` : ''}</div>
    <div id="nota"></div>
    <div class="fotos-maq" id="fotos-maq"></div>
    <div class="lista">
      ${ex.dicas.length ? `<details id="dicas"${prefs.dicasAbertas ? ' open' : ''}><summary class="ll-linha">${ic('target')}<span>Pontos de atenção</span><span class="valor">${ex.dicas.length}</span>${ic('caret-down', 'ic-18 ic-caret')}</summary>
        <ul class="dicas-lista">${ex.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
      <button class="ll-linha" id="bt-desc">${ic('timer')}<span>Descanso entre séries</span><span class="valor" id="desc-valor"></span>${ic('caret-right', 'ic-18 chev')}</button>
      <details id="hist"><summary class="ll-linha">${ic('chart-line-up')}<span>Histórico desta variação</span>${ic('caret-down', 'ic-18 ic-caret')}</summary><div class="hist-corpo" id="hist-corpo"></div></details>
    </div>`;
  $('bt-voltar').onclick = () => fecharExercicio(false);
  el.querySelectorAll('[data-var]').forEach(b => b.onclick = () => abrirExercicio(b.dataset.var));
  el.querySelector('[data-novavar]').onclick = () => novaVariacao(mov.id);
  $('bt-nota-ic').onclick = editarNota;
  $('bt-mais').onclick = () => menuPainel(ex);
  $('bt-desc').onclick = () => escolherDescanso(ex);
  if ($('dicas')) $('dicas').ontoggle = () => { prefs.dicasAbertas = $('dicas').open; salvarPrefs(); };
  $('hist').ontoggle = () => { if ($('hist').open) detalheExercicio($('hist-corpo'), ex.id, false); }; // gráfico precisa da largura visível
  $('desc-valor').textContent = fmtDesc(descansoDe(ex.id));
  mostraAnim(ex.id);
  renderFotosPainel();
  renderNota();
  renderSeriesPainel();
}

// menu "Mais": foto da máquina, GIF de execução, registrar por lado
function menuPainel(ex) {
  const itens = [
    { ic: 'camera', txt: 'Fotografar a máquina', acao: () => $('input-foto-painel').click() },
    { ic: 'image', txt: painelGif ? 'Trocar GIF de execução' : 'Adicionar GIF de execução', acao: () => $('input-gif-painel').click() },
  ];
  if (painelGif) itens.push({ ic: 'trash', txt: 'Remover GIF', acao: removerGif });
  itens.push({ ic: 'arrow-right', txt: 'Registrar cada lado separado', valor: porLado(ex) ? 'sim' : 'não', acao: () => {
    prefs.lados = prefs.lados || {};
    prefs.lados[ex.id] = !porLado(ex);
    salvarPrefs();
    preencheForm(ex);
    renderCtl();
  } });
  itens.push({ ic: 'note-pencil', txt: notas[ex.id] ? 'Editar anotação' : 'Escrever anotação', acao: editarNota });
  abrirFolha('Mais opções', itens);
}

function escolherDescanso(ex) {
  const atual = descansoDe(ex.id);
  const ops = [60, 90, 120, 180];
  if (!ops.includes(atual)) ops.push(atual), ops.sort((a, b) => a - b);
  abrirFolha('Descanso entre séries', ops.map(s => ({ ic: 'timer', txt: fmtDesc(s), sel: s === atual, acao: () => {
    prefs.descansos[ex.id] = s;
    salvarPrefs();
    if (ativo.descFim && Date.now() < ativo.descFim) iniciarDescanso(s); // reajusta o que está correndo
    if ($('desc-valor')) $('desc-valor').textContent = fmtDesc(s);
  } })));
}

function preencheForm(ex) {
  const l = logHoje(ex.id);
  form = { ex: ex.id, rir: null, peso: 20, reps: 10 };
  if (l && l.sets.length) { // continua de onde parou hoje
    const u = l.sets[l.sets.length - 1];
    form.peso = u.peso; form.reps = u.reps;
    if (u.repsE != null) { form.repsE = u.repsE; form.repsD = u.repsD; }
  } else {
    const d = dicaCarga(ex.id);
    form.peso = d ? d.alvoPeso : ex.corpo ? 0 : 20;
    form.reps = d ? d.alvoReps : ex.seg ? 30 : Math.round((ex.faixa[0] + ex.faixa[1]) / 2);
  }
  form.repsE ??= form.reps; form.repsD ??= form.reps;
  if (ativo.estado === 'anotando' && ativo.pend && ativo.pend.dur && ex.seg) form.reps = form.repsE = form.repsD = ativo.pend.dur;
}

// dica de progressão (progressão dupla: sobe reps até o teto da faixa, depois sobe carga)
function dicaCarga(exId) {
  const hoje = hojeKey();
  const ant = logs.filter(l => l.ex === exId && l.sets.length && dayKey(l.ts) !== hoje);
  if (!ant.length) return null;
  const ex = exMap[exId];
  const u = ant.reduce((a, b) => b.ts > a.ts ? b : a);
  const top = melhorSerie(u.sets);
  const [lo, hi] = ex ? ex.faixa : [8, 12];
  const inc = ex ? ex.inc : 2.5;
  // esforço anotado na última sessão ajusta o ritmo da progressão
  const comRir = u.sets.filter(s => s.rir != null);
  const falhaCedo = u.sets.length > 1 && u.sets[0].rir === 0;
  const folga = comRir.length > 0 && comRir.every(s => s.rir >= 3);
  let alvoPeso = top.peso, alvoReps = top.reps + 1, motivo = 'progressão dupla: +1 repetição';
  if (ex && ex.seg) { alvoReps = top.reps + (folga ? 10 : 5); motivo = folga ? 'sobrou fôlego: +10 s' : '+5 s'; }
  else if (top.peso > 0 && top.rir === 0 && top.reps < lo) {
    alvoPeso = Math.max(0, +(top.peso - Math.max(inc, Math.round(top.peso * 0.07 / inc) * inc)).toFixed(2));
    alvoReps = lo; motivo = `não chegou a ${lo} reps mesmo indo à falha — reduza um pouco a carga`;
  } else if (falhaCedo) { alvoReps = top.reps; motivo = 'foi à falha já na 1ª série — repita e tente sobrar 1–2 reps'; }
  else if (top.peso > 0 && top.reps >= hi) {
    alvoPeso = +(top.peso + inc * (folga ? 2 : 1)).toFixed(2); alvoReps = lo;
    motivo = folga ? `topo da faixa com reps sobrando — suba ${num(inc * 2)} kg` : `chegou a ${hi} reps — suba a carga`;
  } else if (folga) { alvoReps = top.reps + 2; motivo = 'sobraram reps na reserva — pode subir mais rápido'; }
  if (top.peso > 0 && !(ex && ex.seg)) alvoReps = Math.min(alvoReps, hi);
  return { u, top, alvoPeso, alvoReps, motivo };
}

// estagnação: 3+ sessões seguidas sem superar o melhor e1RM (ou melhor série, se corporal)
function estagnacao(exId) {
  const { pts } = pontosEx(exId);
  if (pts.length < 4) return null;
  let rec = 0;
  pts.forEach((p, i) => { if (p.y > pts[rec].y) rec = i; });
  const sessoes = pts.length - 1 - rec;
  if (sessoes < 3) return null;
  const recentes = logs.filter(l => l.ex === exId).sort((a, b) => b.ts - a.ts).slice(0, 3).flatMap(l => l.sets);
  const falhas = recentes.filter(s => s.rir === 0).length;
  return { sessoes, melhor: pts[rec], muitaFalha: falhas >= recentes.length / 2 && falhas > 0 };
}

function avisoEstagnacao(ex) {
  const e = estagnacao(ex.id);
  if (!e) return '';
  const mov = movMap[ex.mov];
  const outra = mov.vars.filter(v => v.id !== ex.id).map(v => v.nome)[0];
  const top = melhorSerie(logs.filter(l => l.ex === ex.id).flatMap(l => l.sets));
  const deload = top.peso > 0 ? `${num(Math.round(top.peso * 0.9 / ex.inc) * ex.inc)} kg` : '';
  return `<div class="aviso-card" role="note">${ic('warning-fill')}<div><b>${e.sessoes} sessões sem bater seu recorde (${dataBr(e.melhor.x)})</b>Algumas saídas:
    <ul>${e.muitaFalha ? '<li>Você tem ido à falha com frequência — deixe 1–2 reps na reserva por umas semanas</li>' : ''}
    ${deload ? `<li>Reduza ~10% (≈ ${deload}) e volte a progredir a partir daí</li>` : ''}
    ${outra ? `<li>Troque por outra variação por 3–4 semanas (ex.: ${esc(outra)})</li>` : ''}
    <li>Mude a faixa de repetições (ex.: ${ex.faixa[0] - 2}–${ex.faixa[0]} com mais carga)</li>
    <li>Confira sono, alimentação e descanso entre as séries</li></ul></div></div>`;
}

function renderNota(editando) {
  const el = $('nota');
  if (!el) return;
  const t = notas[ativo.ex] || '';
  if (!editando) {
    el.innerHTML = t ? `<button class="nota" id="bt-nota">${ic('note-pencil')}<span>${esc(t)}</span></button>` : '';
    if (t) $('bt-nota').onclick = editarNota;
    return;
  }
  el.innerHTML = `<div class="nota-edit"><textarea id="in-nota" rows="3" aria-label="Anotação" placeholder="ex.: banco no furo 4 · pegada 2 dedos após a marca · sentir o peito alongar">${esc(t)}</textarea>
    <div class="linha"><button id="ok-nota">Salvar anotação</button><button class="ghost" id="cx-nota">Cancelar</button></div></div>`;
  $('in-nota').focus();
  $('ok-nota').onclick = () => {
    const v = $('in-nota').value.trim();
    if (v) notas[ativo.ex] = v; else delete notas[ativo.ex];
    salvarNotas();
    renderNota();
  };
  $('cx-nota').onclick = () => renderNota();
}
const editarNota = () => renderNota(true);

// alvo de hoje + séries de hoje + controles da próxima série
function renderSeriesPainel() {
  if (!$('ref')) return renderCtl();
  const ex = exMap[ativo.ex];
  const l = logHoje(ex.id);
  const sets = l ? l.sets : [];
  const d = dicaCarga(ex.id);
  const un = ex.seg ? 's' : 'reps';
  $('ref').innerHTML = d
    ? `<div class="kicker azul">${ic('target', 'ic-14')}Alvo de hoje</div>
       <div class="alvo-num">${d.alvoPeso > 0 ? `${num(d.alvoPeso)} <small>kg</small> × ` : ''}${d.alvoReps} <small>${un}</small></div>
       <div class="motivo">${esc(d.motivo[0].toUpperCase() + d.motivo.slice(1))}</div>
       <div class="ult">Última vez, ${dataCurta(d.u.ts).replace(',', '')}: ${esc(resumoSeries(d.u.sets, ex.seg))}</div>${avisoEstagnacao(ex)}`
    : `<div class="kicker azul">${ic('target', 'ic-14')}Primeira vez</div>
       <div class="motivo">Comece com uma carga confortável e anote o esforço. Na próxima vez o Carga sugere o alvo.</div>`;

  $('sec-series').hidden = !sets.length;
  const cont = $('series');
  cont.innerHTML = sets.map((s, i) => itemSerie(ex, sets, i)).join('');
  cont.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editarSerie(l, +b.dataset.editar, b.closest('.serie')));
  cont.querySelectorAll('[data-apagar]').forEach(b => b.onclick = () => {
    if (!confirm('Excluir esta série?')) return;
    l.sets.splice(+b.dataset.apagar, 1);
    if (!l.sets.length) logs = logs.filter(x => x !== l);
    salvarLogs();
    renderSeriesPainel();
  });

  // leitura do esforço pelo ritmo: o tempo por repetição cresce conforme se aproxima da falha
  const crono = sets.filter(s => s.dur && s.reps);
  let esf = '';
  if (crono.length) {
    const tut = crono.reduce((t, s) => t + s.dur, 0);
    esf = `Tempo total em execução: <b>${mmss(tut)}</b>`;
    if (!ex.seg && crono.length >= 2) {
      const q = queda(crono[0], crono[crono.length - 1]);
      const leitura = q > 25 ? 'caiu bastante — sinal de que você está perto da falha.'
        : q >= 10 ? 'caindo — a fadiga está acumulando, bom esforço.'
          : 'estável — ainda sobra gás (ou o descanso está longo).';
      esf += `<br>Ritmo da última série vs. a 1ª: <b>${q >= 0 ? '+' : ''}${q}%</b> — ${leitura}`;
    }
  }
  $('esforco').innerHTML = esf ? `<p class="esforco">${esf}</p>` : '';
  renderCtl();
}

const ritmo = s => s.dur / s.reps; // segundos por repetição
const queda = (base, s) => Math.round((ritmo(s) / ritmo(base) - 1) * 100);

function itemSerie(ex, sets, i) {
  const s = sets[i];
  const base = sets.find(x => x.dur && x.reps); // 1ª série cronometrada = referência de ritmo
  const det = [];
  if (s.dur) {
    det.push(`tempo ${mmss(s.dur)}`);
    if (!ex.seg && s.reps) {
      det.push(`${num(+ritmo(s).toFixed(1))} s/rep`);
      if (base && base !== s) {
        const q = queda(base, s);
        det.push(Math.abs(q) < 3 ? 'mesmo ritmo'
          : `<span class="${q > 25 ? 'q-alta' : q >= 10 ? 'q-media' : ''}">${Math.abs(q)}% mais ${q > 0 ? 'lento' : 'rápido'}</span>`);
      }
    }
  }
  if (s.rir != null) det.push(`<span class="rir r${Math.min(s.rir, 4)}">${rirTxt(s.rir)}</span>`);
  if (s.desc) det.push(`descanso ${mmss(s.desc)}`);
  return `<div class="serie"><span class="n">${i + 1}</span>
    <div class="info"><div class="nome">${esc(carga(s.peso))} × ${esc(repsTxt(s, ex.seg))}${s.pr ? `<span class="badge-pr">${ic('trophy-fill')}PR</span>` : ''}</div>
    ${det.length ? `<div class="det">${det.join(' · ')}</div>` : ''}</div>
    <button class="btn-ic" data-editar="${i}" aria-label="Editar série ${i + 1}">${ic('pencil-simple', 'ic-18')}</button>
    <button class="btn-ic" data-apagar="${i}" aria-label="Excluir série ${i + 1}">${ic('trash', 'ic-18')}</button></div>`;
}

function editarSerie(l, i, linha) {
  const s = l.sets[i];
  const info = linha.querySelector('.info');
  linha.querySelectorAll('.btn-ic').forEach(b => b.hidden = true);
  const uni = s.repsE != null;
  info.innerHTML = `<div class="serie-edit"><input type="number" inputmode="decimal" step="any" min="0" value="${s.peso}" aria-label="Carga"> kg ×
    ${uni ? `E <input type="number" inputmode="numeric" min="1" value="${s.repsE}" aria-label="Repetições lado esquerdo">
      D <input type="number" inputmode="numeric" min="1" value="${s.repsD}" aria-label="Repetições lado direito">`
    : `<input type="number" inputmode="numeric" min="1" value="${s.reps}" aria-label="Repetições">`}
    <select aria-label="Repetições na reserva"><option value="">esforço —</option>${[0, 1, 2, 3, 4].map(r =>
      `<option value="${r}"${s.rir === r ? ' selected' : ''}>${rirTxt(r)}</option>`).join('')}</select>
    <button class="bt-ok">Salvar</button></div>`;
  const [iP, iR, iD] = info.querySelectorAll('input');
  info.querySelector('.bt-ok').onclick = () => {
    const p = parseFloat(iP.value), rir = info.querySelector('select').value;
    const rE = parseInt(iR.value, 10), rD = uni ? parseInt(iD.value, 10) : rE, r = Math.min(rE, rD);
    if (isNaN(p) || p < 0 || !r || r < 1) return toast('Confira os valores.');
    s.peso = p; s.reps = r;
    if (uni) { s.repsE = rE; s.repsD = rD; }
    if (rir === '') delete s.rir; else s.rir = +rir;
    salvarLogs();
    renderSeriesPainel();
  };
}

// fotos das máquinas vinculadas à variação aberta (cadastradas na aba Máquinas ou pelo menu "Mais")
let urlsPainel = [], fotoToken = 0, painelGif = false;
async function renderFotosPainel() {
  const exId = ativo.ex, tk = ++fotoToken;
  let fotos = [], gif = null;
  try { fotos = (await idbReq((await txFotos('readonly')).getAll())).filter(f => f.ex === exId); } catch { /* sem IndexedDB */ }
  try { gif = await idbReq((await txGifs('readonly')).get(exId)); } catch { /* sem IndexedDB */ }
  const el = $('fotos-maq');
  if (!el || tk !== fotoToken || ativo.ex !== exId) return;
  painelGif = !!gif;
  urlsPainel.forEach(URL.revokeObjectURL);
  urlsPainel = [];
  el.innerHTML = fotos.map(f => {
    const u = URL.createObjectURL(f.blob);
    urlsPainel.push(u);
    return `<figure><img src="${u}" alt="Sua máquina">${f.nota ? `<figcaption>${esc(f.nota)}</figcaption>` : ''}</figure>`;
  }).join('');
  el.querySelectorAll('img').forEach(img => img.onclick = () => abreLightbox(img.src));
}

async function removerGif() {
  if (!confirm('Remover o GIF desta variação?')) return;
  await idbReq((await txGifs('readwrite')).delete(ativo.ex));
  mostraAnim(ativo.ex);
  renderFotosPainel();
}

// GIF/vídeo de execução escolhido pelo usuário: um por variação, guardado só neste aparelho
async function gifDoPainel(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f || !ativo.ex) return;
  await idbReq((await txGifs('readwrite')).put({ ex: ativo.ex, blob: f, ts: Date.now() }));
  toast('GIF salvo nesta variação');
  mostraAnim(ativo.ex);
  renderFotosPainel();
}

async function fotoDoPainel(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f || !ativo.ex) return;
  await idbReq((await txFotos('readwrite')).put({ id: Date.now(), blob: f, ex: ativo.ex, nota: '', ts: Date.now() }));
  toast('Foto salva nesta variação');
  renderFotosPainel();
}

// ---------- registrado hoje ----------
function renderLogHoje() {
  const hoje = hojeKey();
  const doDia = logs.filter(l => dayKey(l.ts) === hoje);
  const el = $('log-hoje');
  if (!doDia.length) {
    el.innerHTML = `<div class="vazio">${ic('clock-counter-clockwise', 'ic-24')}<div><div>Nada registrado hoje</div>
      <div class="mudo">As séries aparecem aqui assim que você começar.</div></div></div>`;
    return;
  }
  el.innerHTML = `<div class="lista">${doDia.slice().reverse().map(l => {
    const ex = exMap[l.ex];
    const vol = volumeLog(l);
    const pr = l.pr || l.sets.some(s => s.pr);
    return `<div class="linha-lista com-acao"><button class="ll-toque" data-abrir="${esc(l.ex)}"><span class="ll-txt">
        <span class="ll-nome">${ex ? nomeEx(l.ex) : esc(l.ex)}${pr ? `<span class="badge-pr">${ic('trophy-fill')}PR</span>` : ''}</span>
        <span class="ll-det">${esc(resumoSeries(l.sets, ex && ex.seg))}${vol ? ` · ${kg(vol)} kg` : ''}</span></span></button>
      <button class="btn-ic" data-del="${l.id}" aria-label="Excluir ${esc(ex ? ex.nome : l.ex)} de hoje">${ic('trash', 'ic-18')}</button></div>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirExercicio(b.dataset.abrir));
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!confirm('Excluir este exercício (todas as séries de hoje)?')) return;
    const l = logs.find(x => String(x.id) === b.dataset.del);
    logs = logs.filter(x => x !== l);
    salvarLogs();
    if (l && ativo.ex === l.ex && emSerie()) cancelarSerie();
    renderTreino();
  });
}

// ---------- rotinas ----------
function renderRotinas() {
  const el = $('rotinas-lista');
  if (!rotinas.length) {
    el.innerHTML = `<div class="vazio">${ic('list-checks', 'ic-24')}<div><div>Nenhuma rotina salva</div>
      <div class="mudo">Depois de treinar, toque em Nova para guardar o treino de hoje.</div></div></div>`;
    return;
  }
  const feitos = new Set(logs.filter(l => dayKey(l.ts) === hojeKey()).map(l => l.ex));
  el.innerHTML = `<div class="lista">${rotinas.map(r => {
    const itens = r.itens.filter(id => exMap[id]), f = itens.filter(id => feitos.has(id)).length;
    return `<div class="linha-lista com-acao"><button class="ll-toque" data-rotina="${r.id}">${ic('list-checks', 'ic-22')}
        <span class="ll-txt"><span class="ll-nome">${esc(r.nome)}</span><span class="ll-det">${plural(itens.length, 'exercício', 'exercícios')}${f ? ` · ${f} feito${f > 1 ? 's' : ''} hoje` : ''}</span></span></button>
      <button class="btn-ic" data-rot="${r.id}" aria-label="Opções da rotina ${esc(r.nome)}">${ic('dots-three', 'ic-22')}</button></div>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-rotina]').forEach(b => b.onclick = () => {
    const r = rotinas.find(x => String(x.id) === b.dataset.rotina);
    const itens = r.itens.filter(id => exMap[id]);
    if (itens.length) abrirExercicio(itens.find(id => !feitos.has(id)) || itens[0], r.id);
  });
  el.querySelectorAll('[data-rot]').forEach(b => b.onclick = () => {
    const r = rotinas.find(x => String(x.id) === b.dataset.rot);
    abrirFolha(r.nome, [
      { ic: 'play', txt: 'Começar rotina', acao: () => el.querySelector(`[data-rotina="${r.id}"]`).click() },
      { ic: 'trash', txt: 'Excluir rotina', acao: () => {
        if (!confirm('Excluir esta rotina?')) return;
        rotinas = rotinas.filter(x => x !== r);
        salvarRotinas();
        renderRotinas();
      } },
    ]);
  });
}

function salvarRotinaDeHoje() {
  const hoje = hojeKey();
  const itens = [...new Set(logs.filter(l => dayKey(l.ts) === hoje).map(l => l.ex))];
  if (!itens.length) return toast('Registre o treino de hoje primeiro.');
  const nome = prompt('Nome da rotina (ex.: Empurrar A):');
  if (!nome || !nome.trim()) return;
  rotinas.push({ id: Date.now(), nome: nome.trim(), itens });
  salvarRotinas();
  toast('Rotina salva');
  renderRotinas();
}
