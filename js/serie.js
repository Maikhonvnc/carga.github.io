/* Carga — Série: controles da próxima série fixos no painel (dock) e a série em tela cheia
   (executando → registrando → descansando). Estados em ativo.estado: pronto → contagem → rodando → anotando → pronto + descanso. */
'use strict';

// unilateral: padrão do catálogo, mas o usuário pode ligar/desligar por variação
const porLado = ex => prefs.lados && ex.id in prefs.lados ? prefs.lados[ex.id] : ex.uni;
const descansoDe = exId => prefs.descansos[exId] || (exMap[exId] ? exMap[exId].desc : 90);
const fmtDesc = s => (s < 120 || s % 60 ? `${s} s` : `${s / 60} min`);
const nSerie = ex => { const l = logHoje(ex.id); return (l ? l.sets.length : 0) + 1; };
// séries planejadas: as da última sessão desta variação (ou 3)
const seriesPlano = ex => { const d = dicaCarga(ex.id); return d ? Math.max(1, d.u.sets.length) : 3; };
const deSeries = (ex, n) => (n <= seriesPlano(ex) ? ` de ${seriesPlano(ex)}` : '');
const telaSerieAberta = () => !!ativo.ex && !ativo.minimizado && (emSerie() || ativo.telaDesc);
const alvoForm = ex => `${carga(parseFloat(form.peso) || 0)} × ${porLado(ex) ? `${form.repsE}/${form.repsD}` : form.reps}${ex.seg ? ' s' : ''}`;

// chamado a cada mudança de estado da série
function renderCtl() {
  renderDock();
  renderSerieTela();
  atualizaBarra();
}

// próximo exercício da rotina/treino em andamento que ainda não foi feito hoje
function proximoDaRotina() {
  const rot = rotinaAtiva();
  if (!rot) return null;
  const feitos = new Set(logs.filter(l => dayKey(l.ts) === hojeKey()).map(l => l.ex));
  return rot.itens.find(id => exMap[id] && !feitos.has(id) && id !== ativo.ex) || null;
}
const nomeMov = exId => movMap[exMap[exId].mov].nome;

// ---------- dock do painel ----------
function renderDock() {
  const dock = $('dock');
  const visivel = tabAtual === 'treino' && !!ativo.ex && !$('card-treinar').hidden && !emSerie();
  dock.hidden = !visivel;
  document.body.classList.toggle('com-dock', visivel);
  if (!visivel) { dock.innerHTML = ''; return; } // sem ids repetidos com a tela de série
  const ex = exMap[ativo.ex], n = nSerie(ex);
  const prox = proximoDaRotina();
  const fim = prox ? `<button class="btn-texto" id="bt-prox">Próximo: ${esc(nomeMov(prox))}</button>`
    : n > 1 ? '<button class="btn-texto neutro" id="bt-concluir">Concluir exercício</button>' : '';
  dock.innerHTML = `<div class="dock-cab"><b>Série ${n}<span class="c-3" style="font-weight:500">${deSeries(ex, n)}</span></b><span class="mudo">toque no número para digitar</span></div>
    ${steppers(ex)}
    <button class="grande larga" id="bt-iniciar">${ic('play-fill')}Iniciar série ${n}</button>
    <div class="dock-links"><button class="btn-texto" id="bt-sem-crono">Anotar sem cronometrar</button>${fim ? `<span id="p-fim">${fim}</span>` : ''}</div>`;
  bindSteppers(dock, ex);
  $('bt-iniciar').onclick = iniciarSerie;
  $('bt-sem-crono').onclick = () => {
    ativo.pend = { dur: null, ini: null, fim: null };
    ativo.estado = 'anotando';
    ativo.minimizado = false;
    form.rir = null;
    salvaAtivo();
    renderCtl();
  };
  if ($('bt-prox')) $('bt-prox').onclick = () => abrirExercicio(prox);
  if ($('bt-concluir')) $('bt-concluir').onclick = () => fecharExercicio(true);
  document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px');
}

// stepper compacto (dock) ou grande (tela de série); o número é um campo: toque para digitar
function steppers(ex, grande) {
  const un = ex.seg ? 's' : 'reps';
  const d = dicaCarga(ex.id);
  const st = (campo, rot, uni, dica) => {
    const dec = campo === 'peso';
    const inp = `<input id="f-${campo}" type="number" inputmode="${dec ? 'decimal' : 'numeric'}" min="${dec ? 0 : 1}" step="${dec ? 'any' : 1}" value="${esc(form[campo])}" aria-label="${rot}">`;
    const bt = (dd, nome) => `<button data-st="${campo}" data-d="${dd}" aria-label="${dd < 0 ? 'Diminuir' : 'Aumentar'} ${nome}">${ic(dd < 0 ? 'minus' : 'plus')}</button>`;
    return grande
      ? `<div class="fs-bloco"><div class="fs-bloco-cab"><span>${rot}</span><span class="mudo">${dica}</span></div>
          <div class="st-grande">${bt(-1, rot.toLowerCase())}<span class="st-num">${inp}<span class="un">${uni}</span></span>${bt(1, rot.toLowerCase())}</div></div>`
      : `<div class="stepper st-${campo}"><div class="st-ctl">${bt(-1, rot.toLowerCase())}<span class="st-val">${inp}<span>${uni}</span></span>${bt(1, rot.toLowerCase())}</div></div>`;
  };
  const alvo = d ? `alvo ${d.alvoReps}` : `faixa ${ex.faixa[0]}–${ex.faixa[1]}`;
  const campos = [st('peso', 'Carga', 'kg', ex.corpo ? '0 = peso corporal' : `passo de ${num(ex.inc)} kg`)];
  if (porLado(ex)) campos.push(st('repsE', 'Lado esquerdo', grande ? un : 'esq.', alvo), st('repsD', 'Lado direito', grande ? un : 'dir.', alvo));
  else campos.push(st('reps', ex.seg ? 'Segundos' : 'Repetições', un, ex.seg ? '' : alvo));
  return grande ? campos.join('') : `<div class="steppers${porLado(ex) ? ' lados' : ''}">${campos.join('')}</div>`;
}

// número grande: o campo acompanha a largura do valor, para número + unidade ficarem centralizados juntos
const ajustaLargura = i => { if (i.closest('.st-grande')) i.style.width = `${Math.max(1, String(i.value).length) + 0.2}ch`; };
function bindSteppers(cont, ex) {
  cont.querySelectorAll('input[id^="f-"]').forEach(i => { ajustaLargura(i); i.oninput = () => { form[i.id.slice(2)] = i.value; ajustaLargura(i); }; });
  cont.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    const d = +b.dataset.d, campo = b.dataset.st;
    form[campo] = campo === 'peso'
      ? Math.max(0, +((parseFloat(form.peso) || 0) + d * ex.inc).toFixed(2))
      : Math.max(1, (parseInt(form[campo], 10) || 0) + d * (ex.seg ? 5 : 1));
    const inp = cont.querySelector('#f-' + campo);
    inp.value = form[campo];
    ajustaLargura(inp);
  });
}

// ---------- série em tela cheia ----------
function renderSerieTela() {
  const tela = $('serie-tela');
  const aberta = telaSerieAberta();
  tela.hidden = !aberta;
  document.body.classList.toggle('tela-cheia', aberta);
  if (!aberta) { tela.innerHTML = ''; return; }
  const ex = exMap[ativo.ex], est = ativo.estado, n = nSerie(ex);
  const topo = `<div class="fs-topo"><button class="btn-ic" id="bt-minimizar" aria-label="Minimizar">${ic('caret-down', 'ic-24')}</button>
    <div class="fs-titulo">${esc(ex.nome)}</div><span class="esp"></span></div>`;

  if (est === 'contagem' || est === 'rodando') {
    const cont = est === 'contagem';
    const txt = cont ? Math.max(1, Math.ceil((ativo.serieIni - Date.now()) / 1000)) : mmss((Date.now() - ativo.serieIni) / 1000);
    tela.innerHTML = `${topo}<div class="fs-corpo centro ${est}">
        <div class="kicker azul" style="font-size:13px;font-weight:600;letter-spacing:.08em">${cont ? 'Prepare-se' : `Série ${n}${deSeries(ex, n)}`}</div>
        <div class="crono" id="crono" role="timer">${txt}</div>
        <div class="fs-status"><span class="ponto"></span>${cont ? `a série ${n} vai começar` : 'cronometrando a série'}</div>
        <div class="fs-alvo"><span class="mudo">alvo</span><b>${esc(alvoForm(ex))}</b></div>
        ${ex.dicas.length ? `<div class="card dicas-card"><div class="kicker">${ic('target', 'ic-14')}Pontos de atenção</div>${ex.dicas.slice(0, 3).map(d => `<p>${esc(d)}</p>`).join('')}</div>` : ''}
      </div>
      <div class="fs-base"><button class="xl larga" id="bt-parar">${ic(cont ? 'play-fill' : 'stop-fill', 'ic-24')}${cont ? 'Começar agora' : 'Terminar série'}</button>
        <button class="btn-texto neutro" id="bt-cancelar">Cancelar série</button></div>`;
    $('bt-parar').onclick = terminarSerie;
    $('bt-cancelar').onclick = cancelarSerie;
  } else if (est === 'anotando') {
    const dur = ativo.pend && ativo.pend.dur;
    tela.innerHTML = `${topo}<div class="fs-corpo">
        <div class="fs-cab"><span class="fs-pergunta">Como foi a série ${n}?</span>${dur ? `<span class="mudo">${ic('timer', 'ic-14')}${mmss(dur)}</span>` : ''}</div>
        <div class="fs-grupo">${steppers(ex, true)}
          <div class="fs-bloco"><div><div style="font-weight:500;color:var(--t-2)">Quantas repetições ainda sobravam?</div><div class="mudo">com boa forma — opcional</div></div>
            <div class="rir-op" role="radiogroup" aria-label="Repetições na reserva">${[0, 1, 2, 3, 4].map(r =>
              `<button role="radio" aria-checked="${form.rir === r}" class="${form.rir === r ? 'sel' : ''}" data-rir="${r}">${r === 4 ? '4+' : r}${r === 0 ? '<small>falha</small>' : ''}${ic('check-circle-fill')}</button>`).join('')}</div></div>
        </div></div>
      <div class="fs-base"><button class="xl larga" id="bt-salvar-serie">${ic('check', 'ic-24')}Salvar série</button>
        <button class="btn-texto neutro" id="bt-descartar">Descartar</button></div>`;
    bindSteppers(tela, ex);
    tela.querySelectorAll('[data-rir]').forEach(b => b.onclick = () => {
      form.rir = form.rir === +b.dataset.rir ? null : +b.dataset.rir;
      tela.querySelectorAll('[data-rir]').forEach(x => {
        const sel = +x.dataset.rir === form.rir;
        x.classList.toggle('sel', sel);
        x.setAttribute('aria-checked', sel);
      });
    });
    $('bt-salvar-serie').onclick = salvarSerie;
    $('bt-descartar').onclick = cancelarSerie;
  } else {
    renderTelaDescanso(tela, topo, ex);
  }
  $('bt-minimizar').onclick = minimizarSerie;
}

const C_ANEL = 2 * Math.PI * 112;
function estadoDescanso(ex) {
  const resta = ativo.descFim ? Math.max(0, Math.ceil((ativo.descFim - Date.now()) / 1000)) : 0;
  const dur = ativo.descDur || descansoDe(ex.id);
  return { resta, dur, fim: !resta, frac: resta ? Math.min(1, resta / dur) : 1 };
}

function renderTelaDescanso(tela, topo, ex) {
  const l = logHoje(ex.id), sets = l ? l.sets : [], n = sets.length + 1;
  const plano = Math.max(seriesPlano(ex), sets.length);
  const d = estadoDescanso(ex);
  const pr = ativo.prUlt && ativo.prUlt.ex === ex.id && ativo.prUlt.n === sets.length ? ativo.prUlt : null;
  // últimas feitas + próxima + planejadas (até 4 linhas)
  const linhas = [];
  sets.slice(-2).forEach((s, i, arr) => {
    const num_ = sets.length - arr.length + i + 1;
    const extra = [s.rir != null ? rirTxt(s.rir) : '', s.dur ? mmss(s.dur) : ''].filter(Boolean).join(' · ');
    linhas.push(`<div class="serie"><span class="n">${num_}</span><span class="info nome">${esc(carga(s.peso))} × ${esc(repsTxt(s, ex.seg))}</span>
      ${extra ? `<span class="lado">${extra}</span>` : ''}${s.pr ? `<span aria-label="Recorde" style="display:flex">${ic('trophy-fill', 'ic-16 ic-pr')}</span>` : ''}</div>`);
  });
  linhas.push(`<div class="serie prox"><span class="n prox">${n}</span><span class="info nome">${esc(alvoForm(ex))}</span><span class="lado">próxima</span></div>`);
  for (let k = n + 1; k <= plano && linhas.length < 4; k++) linhas.push(`<div class="serie plan"><span class="n plan">${k}</span><span class="info nome">${esc(alvoForm(ex))}</span><span class="lado">planejada</span></div>`);
  const prox = proximoDaRotina();
  tela.innerHTML = `${topo}<div class="fs-corpo desc">
      ${pr ? `<div class="pr-card" role="status">${ic('trophy-fill', 'ic-30')}<div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:600">Novo recorde</div>
        <div class="mudo num" style="color:var(--t-2)">${esc(pr.txt)}</div></div></div>` : ''}
      <div class="anel${d.fim ? ' fim' : ''}" id="anel"><svg width="248" height="248" viewBox="0 0 248 248" aria-hidden="true">
          <circle cx="124" cy="124" r="112" fill="none" stroke="var(--c-elev)" stroke-width="10"/>
          <circle id="anel-prog" cx="124" cy="124" r="112" fill="none" stroke="${d.fim ? 'var(--ok)' : 'var(--acao)'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(d.frac * C_ANEL).toFixed(1)} ${C_ANEL.toFixed(1)}"/></svg>
        <div class="anel-txt"><div class="kicker" id="anel-rot">${d.fim ? 'Descanso concluído' : 'Descanso'}</div>
          <div class="tempo" id="anel-tempo" role="timer">${mmss(d.resta)}</div><div class="mudo" id="anel-sub">${d.fim ? 'hora da próxima série' : `de ${mmss(d.dur)}`}</div></div></div>
      <div class="desc-bts"><button class="ghost" data-desc-aj="-15">−15 s</button><button class="ghost" data-desc-aj="15">+15 s</button>
        <button class="ghost" id="bt-pular">${ic('skip-forward', 'ic-18')}Pular</button></div>
    </div>
    <div class="fs-base"><div class="lista series-lista">${linhas.join('')}</div>
      <button class="xl larga" id="bt-iniciar-fs">${ic('play-fill', 'ic-22')}Iniciar série ${n}</button>
      <button class="btn-texto neutro" id="bt-fim-fs">${prox ? `Próximo: ${esc(nomeMov(prox))}` : 'Concluir exercício'}</button></div>`;
  tela.querySelectorAll('[data-desc-aj]').forEach(b => b.onclick = () => {
    const dd = +b.dataset.descAj;
    if (ativo.descFim && Date.now() < ativo.descFim) ajustaDescanso(dd);
    else if (dd > 0) iniciarDescanso(dd);
    renderSerieTela();
  });
  $('bt-pular').onclick = () => { ativo.descFim = 0; salvaAtivo(); renderCtl(); };
  $('bt-iniciar-fs').onclick = iniciarSerie;
  $('bt-fim-fs').onclick = () => {
    ativo.telaDesc = false;
    salvaAtivo();
    if (prox) abrirExercicio(prox);
    else fecharExercicio(true);
  };
}

// atualização leve a cada tick (sem refazer a tela)
function atualizaTelaSerie() {
  if ($('serie-tela').hidden) return;
  if (ativo.estado === 'rodando' && $('crono')) $('crono').textContent = mmss((Date.now() - ativo.serieIni) / 1000);
  if (ativo.estado === 'contagem' && $('crono')) $('crono').textContent = Math.max(1, Math.ceil((ativo.serieIni - Date.now()) / 1000));
  if (!emSerie() && $('anel')) {
    const d = estadoDescanso(exMap[ativo.ex]);
    if (d.fim !== $('anel').classList.contains('fim')) return renderSerieTela();
    $('anel-tempo').textContent = mmss(d.resta);
    $('anel-prog').setAttribute('stroke-dasharray', `${(d.frac * C_ANEL).toFixed(1)} ${C_ANEL.toFixed(1)}`);
  }
}

function minimizarSerie() {
  ativo.minimizado = true;
  if (!emSerie()) ativo.telaDesc = false;
  salvaAtivo();
  if (tabAtual === 'treino' && !$('card-treinar').hidden) renderSeriesPainel();
  else renderCtl();
}

// volta para a série (ou para o descanso) a partir da barra
function abrirTelaSerie() {
  if (!ativo.ex) return;
  if (tabAtual !== 'treino') mostrarTab('treino');
  if (ativo.grupo !== exMap[ativo.ex].cat || $('card-treinar').hidden) { ativo.grupo = exMap[ativo.ex].cat; renderTreinar(); }
  ativo.minimizado = false;
  if (!emSerie()) ativo.telaDesc = true;
  salvaAtivo();
  renderCtl();
}

// ---------- ações ----------
function iniciarSerie() {
  garanteAudio();
  const c = prefs.contagem | 0;
  ativo.serieIni = Date.now() + c * 1000;
  ativo.estado = c ? 'contagem' : 'rodando';
  ativo.pend = null;
  ativo.descFim = 0; // começar a série encerra o descanso (o tempo real de descanso fica registrado na série)
  ativo.telaDesc = false;
  ativo.minimizado = false;
  salvaAtivo();
  renderCtl();
  atualizaTela();
  garanteRelogio();
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
}

function cancelarSerie() {
  ativo.estado = 'pronto';
  ativo.pend = null;
  ativo.serieIni = 0;
  ativo.telaDesc = false;
  salvaAtivo();
  renderCtl();
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

// texto do cartão de recorde: "62,5 kg × 9 · força estimada 81 kg (+2 kg)"
function textoRecorde(exId, peso, reps, seg) {
  const ref = logs.filter(l => l.ex === exId).flatMap(l => l.sets);
  if (peso > 0) {
    const antes = Math.max(...ref.map(s => e1rm(s.peso, s.reps))), agora = e1rm(peso, reps);
    return `${carga(peso)} × ${reps} · força estimada ${kg(agora)} kg (+${kg(Math.max(1, agora - antes))} kg)`;
  }
  const antes = Math.max(...ref.filter(s => !s.peso).map(s => s.reps));
  return `${reps}${seg ? ' s' : ' reps'} · ${reps - antes} a mais que o recorde anterior`;
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
  const prTxt = pr ? textoRecorde(ex.id, peso, reps, ex.seg) : '';
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
  ativo.telaDesc = true;
  ativo.prUlt = pr ? { ex: ex.id, n: l.sets.length, txt: prTxt } : null;
  preencheForm(ex);
  iniciarDescanso(descansoDe(ex.id));
  if (ativo.minimizado) toast(pr ? 'Novo recorde!' : `Série ${l.sets.length} salva`);
  renderSeriesPainel();
}
