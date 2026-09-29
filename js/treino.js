/* Carga — Aba Treino: grupos → exercícios → painel de execução (séries, esforço, rotinas). */
'use strict';

// ---------- aba Treino ----------
// fluxo: grupo → exercício/variação → painel de execução (séries cronometradas + esforço + descanso)
const ATIVO_PADRAO = { grupo: null, vista: 'ex', ex: null, rotina: null, rotinaTemp: null, estado: 'pronto', serieIni: 0, pend: null, descFim: 0, descDur: 0, descAvisado: false, ts: 0 };
let ativo = Object.assign({}, ATIVO_PADRAO, lerLS(LS_ATIVO, {}));
const salvaAtivo = () => { ativo.ts = Date.now(); localStorage.setItem(LS_ATIVO, JSON.stringify(ativo)); };
const emSerie = () => ativo.estado === 'contagem' || ativo.estado === 'rodando' || ativo.estado === 'anotando';
let form = { ex: null, peso: 20, reps: 10, rir: null }; // formulário da próxima série

function renderTreino() {
  $('hoje-data').textContent = '— ' + new Date().toLocaleDateString('pt-BR');
  renderTilesHoje();
  renderSugestoes();
  renderRotinas();
  renderTreinar();
  renderLogHoje();
}

function semanaKey(ts) { // segunda-feira da semana, como YYYY-MM-DD
  const d = new Date(ts);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return dayKey(d.getTime());
}

function renderTilesHoje() {
  const hoje = hojeKey();
  const sets = logs.filter(l => dayKey(l.ts) === hoje).flatMap(l => l.sets);
  const volHoje = sets.reduce((s, x) => s + x.peso * x.reps, 0);
  let duracao = '–';
  if (sets.length > 1) {
    const ini = Math.min(...sets.map(s => s.ts - (s.dur || 0) * 1000)), fim = Math.max(...sets.map(s => s.ts));
    const min = Math.round((fim - ini) / 6e4);
    duracao = min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : min < 1 ? '<1 min' : `${min} min`;
  }
  const semanas = new Set(logs.map(l => semanaKey(l.ts)));
  const estaSemana = new Set(logs.filter(l => semanaKey(l.ts) === semanaKey(Date.now())).map(l => dayKey(l.ts))).size;
  let streak = 0;
  let cursor = semanaKey(Date.now());
  if (!semanas.has(cursor)) cursor = semanaKey(Date.now() - 7 * 864e5); // semana atual ainda sem treino não quebra a sequência
  while (semanas.has(cursor)) {
    streak++;
    cursor = semanaKey(new Date(cursor + 'T12:00').getTime() - 7 * 864e5);
  }
  $('tiles-hoje').innerHTML =
    tile(sets.length, 'séries hoje') +
    tile(kg(volHoje) + ' kg', 'volume hoje') +
    tile(duracao, 'duração') +
    tile(estaSemana + '×', `na semana${streak > 1 ? ` · ${streak} seguidas` : ''}`);
}

function bindChips(cont, rotinaId) {
  cont.querySelectorAll('.chip[data-ex]').forEach(c => c.onclick = () => abrirExercicio(c.dataset.ex, rotinaId));
}

// cartão principal: mostra grupos, exercícios do grupo ou o painel do exercício aberto
function renderTreinar() {
  const foco = !!ativo.ex; // exercício aberto: esconde sugestões/rotinas para focar na execução
  $('card-sugestoes').hidden = foco;
  $('card-rotinas').hidden = foco;
  const el = $('card-treinar');
  el.classList.remove('em-serie');
  if (ativo.ex) return renderPainel(el);
  pararAnim();
  if (ativo.grupo) renderListaGrupo(el);
  else renderGrupos(el);
}

function renderGrupos(el) {
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  const hoje = hojeKey();
  const feitos = {};
  logs.forEach(l => { if (dayKey(l.ts) === hoje && exMap[l.ex]) feitos[exMap[l.ex].cat] = (feitos[exMap[l.ex].cat] || 0) + 1; });
  el.innerHTML = '<h3>🏋️ O que vamos treinar?</h3><div class="grupos">' + gruposVisiveis().map(g => {
    const pior = g.musculos.map(m => ({ m, pct: recup[m] })).sort((a, b) => a.pct - b.pct)[0];
    const status = !pior ? '' : pior.pct >= 85 ? '<span style="color:var(--bom)">pronto</span>'
      : `<span style="color:${corPct(pior.pct)}">${esc(nomeCurto(pior.m))} ${pior.pct}%</span>`;
    return `<button class="grupo" data-grupo="${esc(g.id)}">${corpoMini(g.musculos)}
      <span class="g-nome">${esc(nomeGrupo(g.id))}</span>
      <span class="g-status">${feitos[g.id] ? `✓${feitos[g.id]} · ` : ''}${status}</span></button>`;
  }).join('') + '</div>';
  el.querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => {
    ativo.grupo = b.dataset.grupo;
    salvaAtivo();
    renderTreinar();
    rolarPara('card-treinar');
  });
}

function renderListaGrupo(el) {
  const lista = movs.filter(m => m.cat === ativo.grupo);
  if (!lista.length) { ativo.grupo = null; return renderGrupos(el); }
  el.innerHTML = `<div class="nav-treino"><button class="voltar" id="bt-voltar">‹ Grupos</button><h3>${esc(nomeGrupo(ativo.grupo))}</h3></div>
    <div class="seg vista"><button data-vista="ex" class="${ativo.vista !== 'evo' ? 'ativo' : ''}">🏋️ Exercícios</button><button data-vista="evo" class="${ativo.vista === 'evo' ? 'ativo' : ''}">📈 Evolução</button></div>
    <div id="grupo-corpo"></div>`;
  $('bt-voltar').onclick = () => { ativo.grupo = null; salvaAtivo(); renderTreinar(); };
  el.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => { ativo.vista = b.dataset.vista; salvaAtivo(); renderListaGrupo(el); });
  const corpo = $('grupo-corpo');
  if (ativo.vista === 'evo') return renderEvolucao(corpo, ativo.grupo);

  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  const hoje = hojeKey();
  const ultimo = {}, feitosHoje = new Set();
  for (const l of logs) {
    if (!ultimo[l.ex] || l.ts > ultimo[l.ex].ts) ultimo[l.ex] = l;
    if (dayKey(l.ts) === hoje) feitosHoje.add(l.ex);
  }
  const u = ultimoTreinoGrupo(ativo.grupo);
  let html = u ? `<button class="ghost larga" id="bt-repetir" style="margin:4px 0 6px">🔁 Repetir o treino de ${dataBr(u.ts)}
      <small class="rep-lista">${esc(u.itens.map(id => exMap[id] ? exMap[id].nome : id).join(' · '))}</small></button>` : '';
  html += '<p class="mudo" style="margin:6px 0 4px">O desenho mostra a parte do músculo que cada exercício trabalha. Toque na variação que vai usar — cada uma guarda sua própria carga.</p>';
  let subAtual;
  const temSub = lista.some(m => m.sub);
  for (const m of lista) {
    const sub = m.sub || (temSub ? 'Personalizados' : null); // personalizado não "herda" o subgrupo de cima
    if (sub && sub !== subAtual) html += `<div class="sub">${esc(sub)}</div>`;
    subAtual = sub;
    const vars = m.vars.map(v => exMap[v.id]);
    const recente = vars.filter(v => ultimo[v.id]).sort((a, b) => ultimo[b.id].ts - ultimo[a.id].ts)[0];
    const ult = recente ? ultimo[recente.id].ts : 0;
    const tend = recente ? setaTend(tendencia(pontosEx(recente.id).pts)) : '';
    const fi = focoInfo({ musculos: m.musculos, foco: m.foco || [] });
    const alerta = Object.entries(m.musculos).filter(([id, f]) => f >= 0.5 && recup[id] < 60).map(([id]) => `${nomeCurto(id)} ${recup[id]}%`);
    html += `<div class="mov">
      <div class="mov-top">
        <div class="mov-mapa">${mapaFoco({ musculos: m.musculos, foco: m.foco || [] }, 68)}</div>
        <div class="mov-txt">
          <div class="mov-cab"><span class="mov-nome">${esc(m.nome)}</span>${ult ? `<span class="mudo">${quando(ult)}</span>` : ''}</div>
          <div class="mov-foco">Foco: <b>${esc(fi.foco.map(x => x.nome).join(', '))}</b></div>
          <div class="mov-musc">${fi.aux.length ? 'Auxiliares: ' + esc(fi.aux.map(x => x.nome).join(', ')) : ''}${tend ? `${fi.aux.length ? ' · ' : ''}${tend}` : ''}${alerta.length ? ` <span class="aviso">· ⚠️ ${esc(alerta.join(', '))}</span>` : ''}</div>
        </div>
      </div>
      <div class="chips">${vars.map(v => {
        const u = ultimo[v.id], feito = feitosHoje.has(v.id);
        const top = u && melhorSerie(u.sets);
        const info = top ? (top.peso > 0 ? `${num(top.peso)} kg` : `${top.reps}${v.seg ? ' s' : ' reps'}`) : '';
        return `<button class="chip${feito ? ' hoje' : ''}" data-ex="${v.id}">${feito ? '✓ ' : ''}${esc(v.vnome)}${info ? ` <small>${esc(info)}</small>` : ''}</button>`;
      }).join('')}<button class="chip chip-mais" data-novavar="${m.id}" aria-label="Adicionar variação de ${esc(m.nome)}">＋</button></div>
    </div>`;
  }
  corpo.innerHTML = html;
  if (u) $('bt-repetir').onclick = () => repetirTreino(ativo.grupo);
  bindChips(corpo);
  corpo.querySelectorAll('[data-novavar]').forEach(b => b.onclick = () => novaVariacao(b.dataset.novavar));
}

function abrirExercicio(exId, rotinaId) {
  const ex = exMap[exId];
  if (!ex) return;
  if (emSerie()) return exId === ativo.ex ? irParaPainel() : toast('Termine ou cancele a série atual primeiro.');
  ativo.grupo = ex.cat;
  ativo.ex = exId;
  if (rotinaId !== undefined) ativo.rotina = rotinaId;
  salvaAtivo();
  preencheForm(ex);
  if (tabAtual !== 'treino') mostrarTab('treino');
  else renderTreinar();
  atualizaTela();
  rolarPara('card-treinar');
}

function fecharExercicio() {
  if (emSerie()) return toast('Termine ou cancele a série atual primeiro.');
  ativo.ex = null;
  salvaAtivo();
  renderTreino();
  atualizaTela();
  rolarPara('card-treinar');
}

function novaVariacao(movId) {
  const mov = movMap[movId];
  if (!mov) return;
  const nome = prompt(`Nova variação de "${mov.nome}" — ex.: a máquina da sua academia, outra pegada:`);
  if (!nome || !nome.trim()) return;
  const c = { id: 'custom_' + Date.now(), mov: movId, vnome: nome.trim(), eq: 'maquina' };
  customExs.push(c);
  aplicaCustom();
  toast('Variação criada ➕');
  abrirExercicio(c.id);
}

// ---------- painel do exercício ----------
function renderPainel(el) {
  const ex = exMap[ativo.ex], mov = movMap[ex.mov];
  if (form.ex !== ex.id) preencheForm(ex);
  const fi = focoInfo(ex);
  el.innerHTML = `
    <div class="nav-treino"><button class="voltar" id="bt-voltar">‹ ${esc(nomeGrupo(ex.cat))}</button></div>
    <h2 class="p-titulo">${esc(mov.nome)}</h2>
    <div class="chips p-vars">${mov.vars.length > 1 ? mov.vars.map(v =>
      `<button class="chip${v.id === ex.id ? ' sel' : ''}" data-var="${v.id}">${esc(v.nome)}</button>`).join('') : ''}
      <button class="chip chip-mais" data-novavar="${mov.id}">＋ variação</button></div>
    <div class="midia">
      <div id="anim-ex" hidden></div>
      <div class="p-mapa">${mapaFoco(ex, 100)}</div>
    </div>
    <div class="p-foco">${fi.foco.map(x => `<div class="it"><span><b>${esc(x.nome)}</b>${x.info ? ` — ${esc(x.info)}` : ''}</span></div>`).join('')}
      ${fi.aux.length ? `<div class="aux">Auxiliares: ${esc(fi.aux.map(x => x.nome).join(', '))}</div>` : ''}</div>
    <div class="fotos-maq" id="fotos-maq"></div>
    ${ex.dicas.length ? `<details class="dicas" id="dicas"${prefs.dicasFechadas ? '' : ' open'}><summary>🎯 Pontos de atenção</summary>
      <ul>${ex.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
    <div id="nota"></div>
    <p class="ref" id="ref"></p>
    <details class="hist" id="hist"><summary>📈 Histórico e evolução desta variação</summary><div id="hist-corpo"></div></details>
    <ul id="series"></ul>
    <div id="esforco"></div>
    <div class="ctl" id="ctl"></div>
    <div class="desc-pre" id="desc-pre"></div>
    <div id="p-fim"></div>`;
  $('bt-voltar').onclick = fecharExercicio;
  el.querySelectorAll('[data-var]').forEach(b => b.onclick = () => abrirExercicio(b.dataset.var));
  el.querySelector('[data-novavar]').onclick = () => novaVariacao(mov.id);
  if ($('dicas')) $('dicas').ontoggle = () => { prefs.dicasFechadas = !$('dicas').open; salvarPrefs(); };
  $('hist').ontoggle = () => { if ($('hist').open) detalheExercicio($('hist-corpo'), ex.id, false); }; // gráfico precisa da largura visível
  mostraAnim(ex.id);
  renderFotosPainel();
  renderNota();
  renderSeriesPainel();
}

// unilateral: padrão do catálogo, mas o usuário pode ligar/desligar por variação
const porLado = ex => prefs.lados && ex.id in prefs.lados ? prefs.lados[ex.id] : ex.uni;

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
  return `<div class="estag"><b>⏸ ${e.sessoes} sessões sem bater seu recorde</b> (${dataBr(e.melhor.x)}). Algumas saídas:
    <ul>${e.muitaFalha ? '<li>Você tem ido à falha com frequência — deixe 1–2 reps na reserva por umas semanas</li>' : ''}
    ${deload ? `<li>Reduza ~10% (≈ ${deload}) e volte a progredir a partir daí</li>` : ''}
    ${outra ? `<li>Troque por outra variação por 3–4 semanas (ex.: ${esc(outra)})</li>` : ''}
    <li>Mude a faixa de repetições (ex.: ${ex.faixa[0] - 2}–${ex.faixa[0]} com mais carga)</li>
    <li>Confira sono, alimentação e descanso entre as séries</li></ul></div>`;
}

function renderNota() {
  const el = $('nota');
  if (!el) return;
  const t = notas[ativo.ex] || '';
  el.innerHTML = `<button class="nota${t ? '' : ' vazia'}" id="bt-nota">📝 ${t ? esc(t) : 'Minha anotação: ajuste do banco, pegada, o que sentir…'}</button>`;
  $('bt-nota').onclick = () => {
    el.innerHTML = `<textarea id="in-nota" rows="3" placeholder="ex.: banco no furo 4 · pegada 2 dedos após a marca · sentir o peito alongar">${esc(t)}</textarea>
      <div class="linha" style="margin-top:6px"><button id="ok-nota">Salvar</button><button class="ghost" id="cx-nota">Cancelar</button></div>`;
    $('in-nota').focus();
    $('ok-nota').onclick = () => {
      const v = $('in-nota').value.trim();
      if (v) notas[ativo.ex] = v; else delete notas[ativo.ex];
      salvarNotas();
      renderNota();
    };
    $('cx-nota').onclick = renderNota;
  };
}

// séries de hoje + referência da última sessão + controles da próxima série
function renderSeriesPainel() {
  if (!$('series')) return;
  const ex = exMap[ativo.ex];
  const l = logHoje(ex.id);
  const sets = l ? l.sets : [];
  const d = dicaCarga(ex.id);
  const u = ex.seg ? ' s' : '';
  $('ref').innerHTML = d
    ? `Última vez (${quando(d.u.ts)}): <b>${esc(resumoSeries(d.u.sets, ex.seg))}</b><br>Alvo hoje: <span class="alvo">${esc(carga(d.alvoPeso))} × ${d.alvoReps}${u}</span>
       <span class="motivo">${esc(d.motivo)}</span>${avisoEstagnacao(ex)}`
    : '<span>Primeira vez nesta variação — comece com uma carga confortável e anote o esforço.</span>';

  const ul = $('series');
  ul.innerHTML = sets.map((s, i) => itemSerie(ex, sets, i)).join('');
  ul.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editarSerie(l, +b.dataset.editar, b.closest('li')));
  ul.querySelectorAll('[data-apagar]').forEach(b => b.onclick = () => {
    if (!confirm('Excluir esta série?')) return;
    l.sets.splice(+b.dataset.apagar, 1);
    if (!l.sets.length) logs = logs.filter(x => x !== l);
    salvarLogs();
    renderSeriesPainel();
    renderTilesHoje();
    renderLogHoje();
  });

  // leitura do esforço pelo ritmo: o tempo por repetição cresce conforme se aproxima da falha
  const crono = sets.filter(s => s.dur && s.reps);
  let esf = '';
  if (crono.length) {
    const tut = crono.reduce((t, s) => t + s.dur, 0);
    esf = `⏱ Tempo total em execução: <b>${mmss(tut)}</b>`;
    if (!ex.seg && crono.length >= 2) {
      const q = queda(crono[0], crono[crono.length - 1]);
      const leitura = q > 25 ? 'caiu bastante — sinal de que você está perto da falha.'
        : q >= 10 ? 'caindo — a fadiga está acumulando, bom esforço.'
          : 'estável — ainda sobra gás (ou o descanso está longo).';
      esf += `<br>📉 Ritmo da última série vs. a 1ª: <b>${q >= 0 ? '+' : ''}${q}%</b> — ${leitura}`;
    }
  }
  $('esforco').innerHTML = esf ? `<p class="esforco">${esf}</p>` : '';
  renderCtl();
  renderDescPre();
  renderFimPainel();
}

const ritmo = s => s.dur / s.reps; // segundos por repetição
const queda = (base, s) => Math.round((ritmo(s) / ritmo(base) - 1) * 100);

function itemSerie(ex, sets, i) {
  const s = sets[i];
  const base = sets.find(x => x.dur && x.reps); // 1ª série cronometrada = referência de ritmo
  const det = [];
  if (s.dur) {
    det.push(`⏱ ${mmss(s.dur)}`);
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
  return `<li class="serie"><span class="n">${i + 1}</span>
    <div class="info"><div class="nome">${esc(carga(s.peso))} × ${esc(repsTxt(s, ex.seg))}${s.pr ? '<span class="badge-pr">PR 🏆</span>' : ''}</div>
    ${det.length ? `<div class="det">${det.join(' · ')}</div>` : ''}</div>
    <button class="bt-x" data-editar="${i}" aria-label="Editar série">✎</button>
    <button class="bt-x" data-apagar="${i}" aria-label="Excluir série">✕</button></li>`;
}

function editarSerie(l, i, li) {
  const s = l.sets[i];
  const info = li.querySelector('.info');
  const uni = s.repsE != null;
  info.innerHTML = `<input type="number" inputmode="decimal" step="any" min="0" value="${s.peso}" aria-label="Carga"> kg ×
    ${uni ? `E <input type="number" inputmode="numeric" min="1" value="${s.repsE}" aria-label="Repetições lado esquerdo">
      D <input type="number" inputmode="numeric" min="1" value="${s.repsD}" aria-label="Repetições lado direito">`
    : `<input type="number" inputmode="numeric" min="1" value="${s.reps}" aria-label="Repetições">`}
    <select aria-label="Repetições na reserva"><option value="">esforço —</option>${[0, 1, 2, 3, 4].map(r =>
      `<option value="${r}"${s.rir === r ? ' selected' : ''}>${rirTxt(r)}</option>`).join('')}</select>
    <button class="bt-ok">✓</button>`;
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
    renderTilesHoje();
    renderLogHoje();
  };
}

// controles da série: pronto → (contagem) → rodando → anotando → salva e inicia o descanso
function renderCtl() {
  const el = $('ctl');
  if (!el) return;
  const ex = exMap[ativo.ex];
  const l = logHoje(ex.id);
  const n = (l ? l.sets.length : 0) + 1;
  const est = ativo.estado;
  $('card-treinar').classList.toggle('em-serie', est === 'contagem' || est === 'rodando');

  if (est === 'contagem' || est === 'rodando') {
    const txt = est === 'contagem' ? Math.max(1, Math.ceil((ativo.serieIni - Date.now()) / 1000)) : mmss((Date.now() - ativo.serieIni) / 1000);
    el.innerHTML = `<div class="crono-wrap ${est}">
      <div class="crono-rot">${est === 'contagem' ? 'Prepare-se…' : `Série ${n} · ${esc(carga(parseFloat(form.peso) || 0))} × ${esc(porLado(ex) ? `${form.repsE}/${form.repsD}` : form.reps)}${ex.seg ? ' s' : ''}`}</div>
      <div class="crono" id="crono">${txt}</div>
      <button class="larga grande" id="bt-parar" style="margin-top:0">${est === 'contagem' ? 'Começar agora' : '■ Terminar série'}</button>
      ${est === 'rodando' && ex.dicas.length ? `<ul class="dicas-foco">${ex.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      <button class="ghost larga" id="bt-cancelar">Cancelar</button></div>`;
    $('bt-parar').onclick = terminarSerie;
    $('bt-cancelar').onclick = cancelarSerie;
    return;
  }

  if (est === 'anotando') {
    el.innerHTML = `<div class="serie-cab">Série ${n}${ativo.pend && ativo.pend.dur ? ` · ⏱ ${mmss(ativo.pend.dur)}` : ''}</div>
      ${steppers(ex)}
      <div class="pergunta">Quantas repetições ainda conseguiria fazer com boa forma?</div>
      <div class="rir-op">${[0, 1, 2, 3, 4].map(r => `<button class="${form.rir === r ? 'sel' : ''}" data-rir="${r}">${r === 4 ? '4+' : r}${r === 0 ? '<small>falha</small>' : ''}</button>`).join('')}</div>
      <button class="larga grande" id="bt-salvar-serie">Salvar série</button>
      <button class="ghost larga" id="bt-descartar">Descartar</button>`;
    bindSteppers(ex);
    el.querySelectorAll('[data-rir]').forEach(b => b.onclick = () => {
      form.rir = form.rir === +b.dataset.rir ? null : +b.dataset.rir;
      el.querySelectorAll('[data-rir]').forEach(x => x.classList.toggle('sel', +x.dataset.rir === form.rir));
    });
    $('bt-salvar-serie').onclick = salvarSerie;
    $('bt-descartar').onclick = cancelarSerie;
    return;
  }

  el.innerHTML = `<div class="serie-cab">Série ${n}</div>
    ${steppers(ex)}
    <button class="larga grande" id="bt-iniciar">▶ Iniciar série</button>
    <button class="ghost larga" id="bt-sem-crono">Anotar sem cronometrar</button>
    <button class="link-lados" id="bt-lados">↔ Registrar cada lado separado: <b>${porLado(ex) ? 'sim' : 'não'}</b></button>`;
  bindSteppers(ex);
  $('bt-iniciar').onclick = iniciarSerie;
  $('bt-lados').onclick = () => {
    prefs.lados = prefs.lados || {};
    prefs.lados[ex.id] = !porLado(ex);
    salvarPrefs();
    renderCtl();
  };
  $('bt-sem-crono').onclick = () => {
    ativo.pend = { dur: null, ini: null, fim: null };
    ativo.estado = 'anotando';
    form.rir = null;
    salvaAtivo();
    renderCtl();
  };
}

function steppers(ex) {
  const st = (campo, rotulo, dec) => `<div class="stepper st-${campo}"><span class="st-rot">${rotulo}</span>
    <div class="st-ctl"><button data-st="${campo}" data-d="-1" aria-label="Diminuir ${rotulo}">−</button><input id="f-${campo}" type="number" inputmode="${dec ? 'decimal' : 'numeric'}" min="${dec ? 0 : 1}" step="${dec ? 'any' : 1}" value="${esc(form[campo])}"><button data-st="${campo}" data-d="1" aria-label="Aumentar ${rotulo}">+</button></div></div>`;
  const un = ex.seg ? 'Segundos' : 'Repetições';
  return `<div class="steppers${porLado(ex) ? ' lados' : ''}">${st('peso', `Carga (kg${ex.corpo ? ', 0 = corporal' : ''})`, true)}
    ${porLado(ex) ? st('repsE', `Esquerdo (${un.toLowerCase()})`) + st('repsD', `Direito (${un.toLowerCase()})`) : st('reps', un)}</div>`;
}

function bindSteppers(ex) {
  $('ctl').querySelectorAll('.st-ctl input').forEach(i => i.oninput = () => { form[i.id.slice(2)] = i.value; });
  $('ctl').querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    const d = +b.dataset.d, campo = b.dataset.st;
    form[campo] = campo === 'peso'
      ? Math.max(0, +((parseFloat(form.peso) || 0) + d * ex.inc).toFixed(2))
      : Math.max(1, (parseInt(form[campo], 10) || 0) + d * (ex.seg ? 5 : 1));
    $('f-' + campo).value = form[campo];
  });
}

function iniciarSerie() {
  garanteAudio();
  const c = prefs.contagem | 0;
  ativo.serieIni = Date.now() + c * 1000;
  ativo.estado = c ? 'contagem' : 'rodando';
  ativo.pend = null;
  ativo.descFim = 0; // começar a série encerra o descanso (o tempo real de descanso fica registrado na série)
  salvaAtivo();
  renderCtl();
  atualizaTela();
  garanteRelogio();
  rolarPara('ctl');
}

function terminarSerie() {
  const agora = Date.now();
  if (ativo.estado === 'contagem') { // "começar agora" pula o resto da contagem
    ativo.serieIni = agora;
    ativo.estado = 'rodando';
    salvaAtivo();
    bip(1046, 1, 0.3);
    return renderCtl();
  }
  const dur = Math.max(1, Math.round((agora - ativo.serieIni) / 1000));
  ativo.pend = { dur, ini: ativo.serieIni, fim: agora };
  ativo.estado = 'anotando';
  if (exMap[ativo.ex].seg) form.reps = form.repsE = form.repsD = dur; // isometria: o tempo é a própria "repetição"
  form.rir = null;
  salvaAtivo();
  renderCtl();
  rolarPara('ctl', 'center');
}

function cancelarSerie() {
  ativo.estado = 'pronto';
  ativo.pend = null;
  ativo.serieIni = 0;
  salvaAtivo();
  renderCtl();
  atualizaBarra();
}

// recorde: só conta se já havia histórico de dias anteriores (1º registro não é PR)
function ehRecorde(exId, peso, reps) {
  const hoje = hojeKey();
  const ant = logs.filter(l => l.ex === exId && dayKey(l.ts) !== hoje).flatMap(l => l.sets);
  if (!ant.length) return false;
  const l = logHoje(exId);
  const ref = ant.concat(l ? l.sets : []);
  if (peso > 0) return e1rm(peso, reps) > Math.max(...ref.map(s => e1rm(s.peso, s.reps)));
  const corp = ref.filter(s => !s.peso);
  return corp.length > 0 && reps > Math.max(...corp.map(s => s.reps));
}

function salvarSerie() {
  const ex = exMap[ativo.ex];
  const lados = porLado(ex);
  const rE = parseInt(form.repsE, 10), rD = parseInt(form.repsD, 10);
  const peso = parseFloat(form.peso), reps = lados ? Math.min(rE, rD) : parseInt(form.reps, 10); // unilateral: vale o lado mais fraco
  if (isNaN(peso) || peso < 0 || !reps || reps < 1) return toast('Confira carga e repetições.');
  const agora = Date.now();
  const pend = ativo.pend || {};
  let l = logHoje(ex.id);
  const anterior = l && l.sets[l.sets.length - 1];
  const set = { peso, reps, ts: pend.fim || agora };
  if (lados) { set.repsE = rE; set.repsD = rD; }
  if (pend.dur) set.dur = pend.dur;
  if (form.rir != null) set.rir = form.rir;
  if (anterior && pend.ini) { // descanso real = início desta série − fim da anterior
    const d = Math.round((pend.ini - anterior.ts) / 1000);
    if (d > 0 && d < 1800) set.desc = d;
  }
  const pr = ehRecorde(ex.id, peso, reps);
  if (pr) set.pr = true;
  if (!l) {
    l = { id: agora + Math.random(), ex: ex.id, ts: set.ts, sets: [] };
    logs.push(l);
  }
  l.sets.push(set);
  if (pr) l.pr = true;
  salvarLogs();
  ativo.estado = 'pronto';
  ativo.pend = null;
  salvaAtivo();
  preencheForm(ex);
  iniciarDescanso(descansoDe(ex.id));
  toast(pr ? '🏆 Novo recorde!' : `Série ${l.sets.length} anotada — descansa! ⏱️`);
  renderSeriesPainel();
  renderTilesHoje();
  renderLogHoje();
}

const descansoDe = exId => prefs.descansos[exId] || (exMap[exId] ? exMap[exId].desc : 90);

function renderDescPre() {
  const el = $('desc-pre');
  if (!el) return;
  const atual = descansoDe(ativo.ex);
  const ops = [60, 90, 120, 180];
  if (!ops.includes(atual)) ops.push(atual), ops.sort((a, b) => a - b);
  el.innerHTML = 'Descanso entre séries: ' + ops.map(s =>
    `<button class="${s === atual ? 'sel' : ''}" data-desc="${s}">${s < 120 || s % 60 ? s + 's' : s / 60 + ' min'}</button>`).join('');
  el.querySelectorAll('[data-desc]').forEach(b => b.onclick = () => {
    prefs.descansos[ativo.ex] = +b.dataset.desc;
    salvarPrefs();
    if (ativo.descFim && Date.now() < ativo.descFim) iniciarDescanso(+b.dataset.desc); // reajusta o que está correndo
    renderDescPre();
  });
}

function renderFimPainel() {
  const el = $('p-fim');
  if (!el) return;
  let prox = null;
  const rot = rotinaAtiva();
  if (rot) { // veio de uma rotina: oferece o próximo exercício dela que ainda não foi feito hoje
    const hoje = hojeKey();
    const feitos = new Set(logs.filter(l => dayKey(l.ts) === hoje).map(l => l.ex));
    prox = rot.itens.find(id => exMap[id] && !feitos.has(id) && id !== ativo.ex);
  }
  el.innerHTML = (prox ? `<button class="larga" id="bt-prox">Próximo de "${esc(rot.nome)}": ${esc(exMap[prox].nome)} →</button>` : '')
    + '<button class="ghost larga" id="bt-concluir">✓ Concluir exercício</button>';
  if (prox) $('bt-prox').onclick = () => abrirExercicio(prox);
  $('bt-concluir').onclick = fecharExercicio;
}

// fotos das máquinas vinculadas à variação aberta (cadastradas na aba Máquinas ou aqui)
let urlsPainel = [], fotoToken = 0;
async function renderFotosPainel() {
  const exId = ativo.ex, tk = ++fotoToken;
  let fotos = [], gif = null;
  try { fotos = (await idbReq((await txFotos('readonly')).getAll())).filter(f => f.ex === exId); } catch { /* sem IndexedDB */ }
  try { gif = await idbReq((await txGifs('readonly')).get(exId)); } catch { /* sem IndexedDB */ }
  const el = $('fotos-maq');
  if (!el || tk !== fotoToken || ativo.ex !== exId) return;
  urlsPainel.forEach(URL.revokeObjectURL);
  urlsPainel = [];
  el.innerHTML = fotos.map(f => {
    const u = URL.createObjectURL(f.blob);
    urlsPainel.push(u);
    return `<figure><img src="${u}" alt="Sua máquina">${f.nota ? `<figcaption>${esc(f.nota)}</figcaption>` : ''}</figure>`;
  }).join('') + `<button class="chip" id="bt-foto-painel">📷 ${fotos.length ? 'Outra foto' : 'Fotografar a máquina'}</button>`
    + `<button class="chip" id="bt-gif-painel">🎬 ${gif ? 'Trocar GIF' : 'Adicionar GIF'}</button>`
    + (gif ? '<button class="chip" id="bt-gif-remover">Remover GIF</button>' : '');
  el.querySelectorAll('img').forEach(img => img.onclick = () => abreLightbox(img.src));
  $('bt-foto-painel').onclick = () => $('input-foto-painel').click();
  $('bt-gif-painel').onclick = () => $('input-gif-painel').click();
  if (gif) $('bt-gif-remover').onclick = async () => {
    if (!confirm('Remover o GIF desta variação?')) return;
    await idbReq((await txGifs('readwrite')).delete(exId));
    mostraAnim(exId);
    renderFotosPainel();
  };
}

// GIF/vídeo de execução escolhido pelo usuário: um por variação, guardado só neste aparelho
async function gifDoPainel(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f || !ativo.ex) return;
  await idbReq((await txGifs('readwrite')).put({ ex: ativo.ex, blob: f, ts: Date.now() }));
  toast('GIF salvo nesta variação 🎬');
  mostraAnim(ativo.ex);
  renderFotosPainel();
}

async function fotoDoPainel(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f || !ativo.ex) return;
  await idbReq((await txFotos('readwrite')).put({ id: Date.now(), blob: f, ex: ativo.ex, nota: '', ts: Date.now() }));
  toast('Foto salva nesta variação 📷');
  renderFotosPainel();
}

// ---------- registrado hoje ----------
function renderLogHoje() {
  const hoje = hojeKey();
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
    const vol = volumeLog(l);
    const tut = l.sets.reduce((t, s) => t + (s.dur || 0), 0);
    const pr = l.pr || l.sets.some(s => s.pr);
    li.innerHTML =
      `<div class="info"><div class="nome">${esc(ex ? ex.nome : l.ex)}${pr ? '<span class="badge-pr">PR 🏆</span>' : ''}</div>
       <div class="det">${l.sets.length} série${l.sets.length > 1 ? 's' : ''} · ${esc(resumoSeries(l.sets, ex && ex.seg))}${vol ? ` · ${kg(vol)} kg` : ''}${tut ? ` · ⏱ ${mmss(tut)}` : ''}</div></div>
       <button class="bt-x" aria-label="Excluir registro">✕</button>`;
    if (ex) li.querySelector('.info').onclick = () => abrirExercicio(l.ex);
    li.querySelector('.bt-x').onclick = () => {
      if (!confirm('Excluir este exercício (todas as séries de hoje)?')) return;
      logs = logs.filter(x => x.id !== l.id);
      salvarLogs();
      if (ativo.ex === l.ex && emSerie()) cancelarSerie();
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
    return `<div class="musculo"><div class="cab"><span class="nome">${esc(muscMap[mId].nome)}</span><span class="estado ink2">${nivelSti(s)}</span></div>
      <div class="barra"><div style="width:${pctBar}%;background:var(--azul)"></div></div></div>`;
  }).join('');
  $('gasto-hoje').innerHTML = `<h3 style="margin-top:14px">Gasto por músculo hoje</h3>${linhas}`;
}

// ---------- rotinas ----------
function renderRotinas() {
  const el = $('rotinas-lista');
  if (!rotinas.length) {
    el.innerHTML = '<p class="mudo">Nenhuma rotina salva — registre um treino e salve como rotina para repetir com um toque.</p>';
    return;
  }
  const hoje = hojeKey();
  const feitos = new Set(logs.filter(l => dayKey(l.ts) === hoje).map(l => l.ex));
  el.innerHTML = rotinas.map(r =>
    `<div class="grupo-sug" data-rotina="${r.id}"><div class="titulo">${esc(r.nome)}<button class="x-rot" data-rot="${r.id}" aria-label="Excluir rotina">✕</button></div><div class="chips">`
    + r.itens.filter(id => exMap[id]).map(id =>
      `<button class="chip${feitos.has(id) ? ' feito' : ''}" data-ex="${id}">${feitos.has(id) ? '✓' : '<b>+</b>'} ${esc(exMap[id].nome)}</button>`).join('')
    + '</div></div>').join('');
  el.querySelectorAll('[data-rotina]').forEach(g => bindChips(g, +g.dataset.rotina));
  el.querySelectorAll('.x-rot').forEach(b => b.onclick = () => {
    if (!confirm('Excluir esta rotina?')) return;
    rotinas = rotinas.filter(r => String(r.id) !== b.dataset.rot);
    salvarRotinas();
    renderRotinas();
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
  toast('Rotina salva 📋');
  renderRotinas();
}
