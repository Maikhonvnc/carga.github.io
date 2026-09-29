/* Carga — Cronômetros: contagem, série e descanso; barra fixa; bip; tela ligada. */
'use strict';

// ---------- cronômetros: contagem, série e descanso ----------
let relogio = null, ultimaContagem = null, audioCtx = null, barraModo = null;
function garanteAudio() { // criado no gesto do usuário (exigência dos navegadores)
  try { audioCtx ??= new (window.AudioContext || window.webkitAudioContext)(); } catch { /* sem áudio */ }
}
const vibra = p => { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); };

function garanteRelogio() {
  if (!relogio) relogio = setInterval(tick, 200);
  tick();
}

function tick() {
  const agora = Date.now();
  if (ativo.estado === 'contagem') {
    const r = Math.ceil((ativo.serieIni - agora) / 1000);
    if (r <= 0) {
      ativo.estado = 'rodando';
      ultimaContagem = null;
      salvaAtivo();
      bip(1046, 1, 0.3);
      vibra(150);
      renderCtl();
    } else {
      if (r !== ultimaContagem) { ultimaContagem = r; bip(660, 1, 0.1); }
      if ($('crono')) $('crono').textContent = r;
    }
  }
  if (ativo.estado === 'rodando' && $('crono')) $('crono').textContent = mmss((agora - ativo.serieIni) / 1000);
  if (ativo.descFim && !ativo.descAvisado && agora >= ativo.descFim) {
    ativo.descAvisado = true;
    salvaAtivo();
    vibra([200, 100, 200]);
    bip(880, 3, 0.18);
    toast('Descanso concluído — próxima série! 💪');
  }
  if (ativo.descFim && agora > ativo.descFim + 8000) { ativo.descFim = 0; salvaAtivo(); } // some 8 s depois de acabar
  atualizaBarra();
  const rodando = ativo.estado === 'contagem' || ativo.estado === 'rodando' || ativo.descFim;
  if (!rodando) { clearInterval(relogio); relogio = null; atualizaTela(); }
}

function iniciarDescanso(seg) {
  garanteAudio();
  ativo.descDur = seg;
  ativo.descFim = Date.now() + seg * 1000;
  ativo.descAvisado = false;
  salvaAtivo();
  garanteRelogio();
  atualizaTela();
}

function ajustaDescanso(d) {
  if (!ativo.descFim) return;
  const resta = Math.max(0, ativo.descFim - Date.now());
  const novo = Math.max(0, resta + d * 1000);
  ativo.descFim = Date.now() + novo;
  ativo.descDur = Math.max(1, ativo.descDur + d);
  if (novo > 0) ativo.descAvisado = false;
  salvaAtivo();
  tick();
}

// barra fixa acima da navegação: descanso sempre; série em andamento só fora da aba Treino
function atualizaBarra() {
  const bar = $('barra-treino');
  const agora = Date.now();
  const serie = (ativo.estado === 'contagem' || ativo.estado === 'rodando') && tabAtual !== 'treino';
  const modo = serie ? 'serie' : ativo.descFim ? 'desc' : null;
  bar.hidden = !modo;
  document.body.classList.toggle('com-barra', !!modo);
  if (!modo) { barraModo = null; return; }
  if (modo !== barraModo) {
    barraModo = modo;
    $('bt-acoes').innerHTML = modo === 'serie'
      ? '<button class="pri" data-acao="ver">Ver série</button>'
      : '<button data-acao="-15" aria-label="Menos 15 segundos">−15</button><button data-acao="15" aria-label="Mais 15 segundos">+15</button><button data-acao="x" aria-label="Encerrar descanso">✕</button>';
    $('bt-acoes').querySelectorAll('[data-acao]').forEach(b => b.onclick = () => {
      const a = b.dataset.acao;
      if (a === 'ver') irParaPainel();
      else if (a === 'x') { ativo.descFim = 0; salvaAtivo(); tick(); }
      else ajustaDescanso(+a);
    });
  }
  if (modo === 'serie') {
    $('bt-rot').textContent = ativo.estado === 'contagem' ? 'Prepare-se' : 'Série em andamento';
    $('bt-tempo').textContent = ativo.estado === 'contagem'
      ? Math.max(1, Math.ceil((ativo.serieIni - agora) / 1000)) : mmss((agora - ativo.serieIni) / 1000);
    $('bt-prog').style.width = '0';
    bar.classList.remove('fim');
  } else {
    const r = Math.max(0, Math.ceil((ativo.descFim - agora) / 1000));
    $('bt-rot').textContent = r ? 'Descanso' : 'Bora, próxima série!';
    $('bt-tempo').textContent = mmss(r);
    $('bt-prog').style.width = Math.min(100, 100 * (1 - r / ativo.descDur)) + '%';
    bar.classList.toggle('fim', !r);
  }
}

function irParaPainel() {
  if (tabAtual !== 'treino') mostrarTab('treino');
  if (ativo.ex) rolarPara($('ctl') ? 'ctl' : 'card-treinar', 'center');
}

function bip(freq = 880, vezes = 3, dur = 0.18) {
  if (!audioCtx) return;
  audioCtx.resume();
  for (let i = 0; i < vezes; i++) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + i * 0.25;
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }
}

// tela ligada enquanto há exercício aberto ou cronômetro correndo (celular apoiado no banco não apaga)
let wakeLock = null;
async function atualizaTela() {
  const quer = prefs.telaLigada && document.visibilityState === 'visible'
    && (!!ativo.ex || ativo.estado === 'rodando' || !!ativo.descFim);
  try {
    if (quer && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!quer && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
