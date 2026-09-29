/* Carga — diário de treino. Vanilla JS, dados no aparelho (localStorage + IndexedDB). */
'use strict';

// ---------- estado ----------
const LS_LOGS = 'carga.logs', LS_PERFIL = 'carga.perfil', LS_ROTINAS = 'carga.rotinas',
  LS_CUSTOM = 'carga.exercicios', LS_OVER = 'carga.overrides', LS_TIMER = 'carga.timer',
  LS_NOTAS = 'carga.notas', LS_PREFS = 'carga.prefs', LS_ATIVO = 'carga.ativo';
const PERFIL_PADRAO = { experiencia: 'intermediario', sono: 'media', fator: 1 };
const PREFS_PADRAO = { contagem: 3, telaLigada: true, dicasFechadas: false, descansos: {} };
const lerLS = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };

// v1/v2 guardavam peso × reps × séries num registro só; v3 guarda cada série (tempo, esforço, descanso)
function migraLog(l) {
  if (Array.isArray(l.sets)) return l;
  const { peso = 0, reps = 0, series = 1, ...resto } = l;
  return { ...resto, sets: Array.from({ length: Math.max(1, series | 0) }, () => ({ peso, reps, ts: l.ts })) };
}

let logs = lerLS(LS_LOGS, []).map(migraLog);
let perfil = Object.assign({}, PERFIL_PADRAO, lerLS(LS_PERFIL, {}));
let prefs = Object.assign({}, PREFS_PADRAO, lerLS(LS_PREFS, {}));
let rotinas = lerLS(LS_ROTINAS, []);
let overrides = lerLS(LS_OVER, {}); // feedback do usuário sobre recuperação
let customExs = lerLS(LS_CUSTOM, []);
let notas = lerLS(LS_NOTAS, {});    // anotação pessoal por variação (ajuste do banco, pegada, sensação…)

const $ = id => document.getElementById(id);
const muscMap = Object.fromEntries(MUSCULOS.map(m => [m.id, m]));
let cacheMelhor = null;
const salvarLogs = () => { cacheMelhor = null; localStorage.setItem(LS_LOGS, JSON.stringify(logs)); };
const salvarPerfil = () => localStorage.setItem(LS_PERFIL, JSON.stringify(perfil));
const salvarPrefs = () => localStorage.setItem(LS_PREFS, JSON.stringify(prefs));
const salvarRotinas = () => localStorage.setItem(LS_ROTINAS, JSON.stringify(rotinas));
const salvarOverrides = () => localStorage.setItem(LS_OVER, JSON.stringify(overrides));
const salvarCustom = () => localStorage.setItem(LS_CUSTOM, JSON.stringify(customExs));
const salvarNotas = () => localStorage.setItem(LS_NOTAS, JSON.stringify(notas));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hojeKey = () => dayKey(Date.now());
const dataBr = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
function quando(ts) {
  const dias = Math.round((new Date(dayKey(Date.now()) + 'T12:00') - new Date(dayKey(ts) + 'T12:00')) / 864e5);
  return dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : dias < 7 ? `há ${dias} dias` : dataBr(ts);
}
const kg = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const num = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const carga = p => p > 0 ? `${num(p)} kg` : 'corporal';
// exercícios personalizados antigos (v2) ficavam na categoria "Personalizados"
const nomeGrupo = id => id === 'Personalizados' ? 'Outros' : id;
const nomeCurto = mId => muscMap[mId].nome.split(' (')[0].replace(' de coxa', '');
const corPct = pct => pct >= 85 ? 'var(--bom)' : pct >= 60 ? 'var(--atencao)' : pct >= 35 ? 'var(--serio)' : 'var(--critico)';
const rirTxt = r => r === 0 ? 'falha' : r >= 4 ? 'sobravam 4+' : r === 1 ? 'sobrava 1' : `sobravam ${r}`;

// "60 kg × 10, 9, 8" (mesma carga) ou "60 kg × 10 · 62,5 kg × 8"
function resumoSeries(sets, seg) {
  if (!sets.length) return '';
  const u = seg ? ' s' : '';
  if (sets.every(s => s.peso === sets[0].peso)) return `${carga(sets[0].peso)} × ${sets.map(s => s.reps + u).join(', ')}`;
  return sets.map(s => `${carga(s.peso)} × ${s.reps}${u}`).join(' · ');
}

// ---------- catálogo: movimento → variações (cada variação é um "exercício" com histórico próprio) ----------
const INC_EQ = { barra: 2.5, smith: 2.5, halteres: 2, maquina: 5, polia: 2.5, corpo: 2.5 };
let EXERCICIOS = [], exMap = {}, movs = [], movMap = {};

function montaCatalogo() {
  movs = MOVIMENTOS.map(m => ({ ...m, vars: m.vars.slice() }));
  // personalizados: {cat, nome, musculos} = exercício novo; {mov, vnome} = variação de um movimento existente
  for (const c of customExs) if (!c.mov) {
    movs.push({ id: c.id, cat: c.cat || 'Personalizados', nome: c.nome, tipo: 'isolado', musculos: c.musculos, dicas: [], custom: true,
      vars: [{ id: c.id, nome: 'Padrão', eq: c.eq || 'maquina', custom: true }] });
  }
  movMap = Object.fromEntries(movs.map(m => [m.id, m]));
  for (const c of customExs) if (c.mov && movMap[c.mov]) movMap[c.mov].vars.push({ id: c.id, nome: c.vnome, eq: c.eq || 'maquina', custom: true });
  EXERCICIOS = movs.flatMap(m => m.vars.map(v => ({
    id: v.id, mov: m.id, cat: m.cat, vnome: v.nome,
    nome: m.vars.length > 1 ? `${m.nome} · ${v.nome}` : m.nome,
    musculos: v.musculos || m.musculos,
    anim: m.anim, img: 'img' in v ? v.img : m.img,
    dicas: [...(m.dicas || []), ...(v.dica ? [v.dica] : [])],
    inc: v.inc || INC_EQ[v.eq] || 2.5, corpo: v.eq === 'corpo', seg: !!m.seg,
    faixa: m.faixa || [8, 12], desc: m.desc || (m.tipo === 'composto' ? 120 : 75),
    custom: !!v.custom,
  })));
  exMap = Object.fromEntries(EXERCICIOS.map(e => [e.id, e]));
}
montaCatalogo();

function gruposVisiveis() {
  const extras = [...new Set(movs.map(m => m.cat))].filter(c => !GRUPOS.some(g => g.id === c)).map(c => ({
    id: c,
    musculos: [...new Set(movs.filter(m => m.cat === c).flatMap(m => Object.keys(m.musculos).filter(k => m.musculos[k] >= 0.5)))],
  }));
  return [...GRUPOS, ...extras];
}

// ---------- métricas ----------
const e1rm = (peso, reps) => peso > 0 ? peso * (1 + reps / 30) : 0;
const volumeLog = l => l.sets.reduce((t, s) => t + s.peso * s.reps, 0);
const melhorSerie = sets => sets.reduce((m, s) =>
  e1rm(s.peso, s.reps) > e1rm(m.peso, m.reps) || (!m.peso && !s.peso && s.reps > m.reps) ? s : m);

function melhorE1rm(exId) {
  if (!cacheMelhor) {
    cacheMelhor = {};
    for (const l of logs) for (const s of l.sets) cacheMelhor[l.ex] = Math.max(cacheMelhor[l.ex] || 0, e1rm(s.peso, s.reps));
  }
  return cacheMelhor[exId] || 0;
}

function logHoje(exId) {
  const hoje = hojeKey();
  for (let i = logs.length - 1; i >= 0; i--) if (logs[i].ex === exId && dayKey(logs[i].ts) === hoje) return logs[i];
  return null;
}

// ---------- modelo de recuperação ----------
// ponytail: modelo heurístico (volume × intensidade relativa × esforço → horas de recuperação),
// não fisiologia exata; o ajuste fino vem do perfil do usuário em Ajustes.
const FATOR_EXP = { iniciante: 1.15, intermediario: 1, avancado: 0.9 };
const FATOR_SONO = { ruim: 1.2, media: 1, boa: 0.9 };
// séries perto da falha estimulam (e cansam) mais; muita folga conta menos. Sem esforço anotado = 1 (como antes)
const fatorEsforco = rir => rir == null ? 1 : rir <= 1 ? 1 : rir <= 3 ? 0.85 : 0.65;

// estímulo de um registro sobre um músculo (unidade arbitrária: Σ séries × fração × intensidade × esforço)
function estimulo(l, muscId) {
  const frac = (exMap[l.ex] && exMap[l.ex].musculos[muscId]) || 0;
  if (!frac) return 0;
  const best = melhorE1rm(l.ex);
  return frac * l.sets.reduce((t, s) => {
    const e = e1rm(s.peso, s.reps);
    const int = best && e ? Math.min(1, Math.max(0.5, e / best)) : 1;
    return t + int * fatorEsforco(s.rir);
  }, 0);
}

function fadigaEm(muscId, t) {
  const ov = overrides[muscId];
  let fat = 0;
  for (const l of logs) {
    if (ov && ov.tipo === 'pronto' && l.ts <= ov.ts) continue; // usuário declarou-se recuperado: zera fadiga anterior
    const horas = (t - l.ts) / 3.6e6;
    if (horas < 0 || horas > 240) continue;
    const sti = estimulo(l, muscId);
    if (!sti) continue;
    const precisa = Math.min(96, 24 + sti * 6) * FATOR_EXP[perfil.experiencia] * FATOR_SONO[perfil.sono] * perfil.fator;
    fat += sti * Math.max(0, 1 - horas / precisa);
  }
  if (ov && ov.tipo === 'mais') {
    const h = (t - ov.ts) / 3.6e6;
    if (h >= 0 && h < 24) fat += 2 * (1 - h / 24); // usuário pediu mais tempo: ~-24 pts decaindo ao longo de 24h
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
let tabAtual = 'treino';
function mostrarTab(nome) {
  tabAtual = nome;
  document.querySelectorAll('main > section, body > section').forEach(s => s.hidden = true);
  $('tab-' + nome).hidden = false;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('ativo', b.dataset.tab === nome));
  if (nome !== 'treino') pararAnim();
  TABS[nome]();
  atualizaBarra();
}
const rolarPara = (id, block = 'start') => { const el = $(id); if (el) el.scrollIntoView({ behavior: 'smooth', block }); };

// ---------- aba Treino ----------
// fluxo: grupo → exercício/variação → painel de execução (séries cronometradas + esforço + descanso)
const ATIVO_PADRAO = { grupo: null, ex: null, rotina: null, estado: 'pronto', serieIni: 0, pend: null, descFim: 0, descDur: 0, descAvisado: false, ts: 0 };
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

function renderSugestoes() {
  const el = $('sugestoes');
  if (!logs.length) {
    el.innerHTML = '<p class="mudo">Sem histórico ainda — escolha um grupo abaixo e registre seu primeiro exercício; as sugestões aparecem aqui.</p>';
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
  bindChips(el);
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
  const recup = {};
  MUSCULOS.forEach(m => { recup[m.id] = pctRecuperado(m.id); });
  const hoje = hojeKey();
  const ultimo = {}, feitosHoje = new Set();
  for (const l of logs) {
    if (!ultimo[l.ex] || l.ts > ultimo[l.ex].ts) ultimo[l.ex] = l;
    if (dayKey(l.ts) === hoje) feitosHoje.add(l.ex);
  }
  let html = `<div class="nav-treino"><button class="voltar" id="bt-voltar">‹ Grupos</button><h3>${esc(nomeGrupo(ativo.grupo))}</h3></div>
    <p class="mudo" style="margin-bottom:4px">Toque na variação que vai usar — cada uma guarda sua própria carga.</p>`;
  let subAtual;
  const temSub = lista.some(m => m.sub);
  for (const m of lista) {
    const sub = m.sub || (temSub ? 'Personalizados' : null); // personalizado não "herda" o subgrupo de cima
    if (sub && sub !== subAtual) html += `<div class="sub">${esc(sub)}</div>`;
    subAtual = sub;
    const vars = m.vars.map(v => exMap[v.id]);
    const ult = Math.max(0, ...vars.map(v => ultimo[v.id] ? ultimo[v.id].ts : 0));
    const princ = Object.entries(m.musculos).sort((a, b) => b[1] - a[1]).filter(([, f]) => f >= 0.15);
    const alerta = princ.filter(([id, f]) => f >= 0.5 && recup[id] < 60).map(([id]) => `${nomeCurto(id)} ${recup[id]}%`);
    html += `<div class="mov">
      <div class="mov-cab"><span class="mov-nome">${esc(m.nome)}</span>${ult ? `<span class="mudo">${quando(ult)}</span>` : ''}</div>
      <div class="mov-musc">${princ.map(([id]) => esc(nomeCurto(id))).join(' · ')}${alerta.length ? ` <span class="aviso">· ⚠️ ${esc(alerta.join(', '))}</span>` : ''}</div>
      <div class="chips">${vars.map(v => {
        const u = ultimo[v.id], feito = feitosHoje.has(v.id);
        const top = u && melhorSerie(u.sets);
        const info = top ? (top.peso > 0 ? `${num(top.peso)} kg` : `${top.reps}${v.seg ? ' s' : ' reps'}`) : '';
        return `<button class="chip${feito ? ' hoje' : ''}" data-ex="${v.id}">${feito ? '✓ ' : ''}${esc(v.vnome)}${info ? ` <small>${esc(info)}</small>` : ''}</button>`;
      }).join('')}<button class="chip chip-mais" data-novavar="${m.id}" aria-label="Adicionar variação de ${esc(m.nome)}">＋</button></div>
    </div>`;
  }
  el.innerHTML = html;
  $('bt-voltar').onclick = () => { ativo.grupo = null; salvaAtivo(); renderTreinar(); };
  bindChips(el);
  el.querySelectorAll('[data-novavar]').forEach(b => b.onclick = () => novaVariacao(b.dataset.novavar));
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
  const musc = Object.entries(ex.musculos).sort((a, b) => b[1] - a[1]).slice(0, 4);
  el.innerHTML = `
    <div class="nav-treino"><button class="voltar" id="bt-voltar">‹ ${esc(nomeGrupo(ex.cat))}</button></div>
    <h2 class="p-titulo">${esc(mov.nome)}</h2>
    <div class="chips p-vars">${mov.vars.length > 1 ? mov.vars.map(v =>
      `<button class="chip${v.id === ex.id ? ' sel' : ''}" data-var="${v.id}">${esc(v.nome)}</button>`).join('') : ''}
      <button class="chip chip-mais" data-novavar="${mov.id}">＋ variação</button></div>
    <div class="midia">
      <div id="anim-ex" hidden></div>
      <div class="p-musc">${musc.map(([id, f]) => `<div class="p-m">${esc(nomeCurto(id))}
        <div class="barra"><div style="width:${Math.round(f * 100)}%;background:var(--azul)"></div></div></div>`).join('')}</div>
    </div>
    <div class="fotos-maq" id="fotos-maq"></div>
    ${ex.dicas.length ? `<details class="dicas" id="dicas"${prefs.dicasFechadas ? '' : ' open'}><summary>🎯 Pontos de atenção</summary>
      <ul>${ex.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
    <div id="nota"></div>
    <p class="ref" id="ref"></p>
    <ul id="series"></ul>
    <div id="esforco"></div>
    <div class="ctl" id="ctl"></div>
    <div class="desc-pre" id="desc-pre"></div>
    <div id="p-fim"></div>`;
  $('bt-voltar').onclick = fecharExercicio;
  el.querySelectorAll('[data-var]').forEach(b => b.onclick = () => abrirExercicio(b.dataset.var));
  el.querySelector('[data-novavar]').onclick = () => novaVariacao(mov.id);
  if ($('dicas')) $('dicas').ontoggle = () => { prefs.dicasFechadas = !$('dicas').open; salvarPrefs(); };
  mostraAnim(ex.id);
  renderFotosPainel();
  renderNota();
  renderSeriesPainel();
}

function preencheForm(ex) {
  const l = logHoje(ex.id);
  form = { ex: ex.id, rir: null, peso: 20, reps: 10 };
  if (l && l.sets.length) { // continua de onde parou hoje
    const u = l.sets[l.sets.length - 1];
    form.peso = u.peso; form.reps = u.reps;
  } else {
    const d = dicaCarga(ex.id);
    form.peso = d ? d.alvoPeso : ex.corpo ? 0 : 20;
    form.reps = d ? d.alvoReps : ex.seg ? 30 : Math.round((ex.faixa[0] + ex.faixa[1]) / 2);
  }
  if (ativo.estado === 'anotando' && ativo.pend && ativo.pend.dur && ex.seg) form.reps = ativo.pend.dur;
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
  let alvoPeso = top.peso, alvoReps = top.reps + (top.rir >= 3 ? 2 : 1); // sobrou muito na reserva → pula 2 reps
  if (ex && ex.seg) alvoReps = top.reps + 5; // isometria: +5 s
  else if (top.peso > 0 && top.reps >= hi) { alvoPeso = +(top.peso + (ex ? ex.inc : 2.5)).toFixed(2); alvoReps = lo; }
  else if (top.peso > 0) alvoReps = Math.min(alvoReps, hi);
  return { u, top, alvoPeso, alvoReps };
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
    ? `Última vez (${quando(d.u.ts)}): <b>${esc(resumoSeries(d.u.sets, ex.seg))}</b><br>Alvo hoje: <span class="alvo">${esc(carga(d.alvoPeso))} × ${d.alvoReps}${u}</span>`
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
    <div class="info"><div class="nome">${esc(carga(s.peso))} × ${s.reps}${ex.seg ? ' s' : ''}${s.pr ? '<span class="badge-pr">PR 🏆</span>' : ''}</div>
    ${det.length ? `<div class="det">${det.join(' · ')}</div>` : ''}</div>
    <button class="bt-x" data-editar="${i}" aria-label="Editar série">✎</button>
    <button class="bt-x" data-apagar="${i}" aria-label="Excluir série">✕</button></li>`;
}

function editarSerie(l, i, li) {
  const s = l.sets[i];
  const info = li.querySelector('.info');
  info.innerHTML = `<input type="number" inputmode="decimal" step="any" min="0" value="${s.peso}" aria-label="Carga"> kg ×
    <input type="number" inputmode="numeric" min="1" value="${s.reps}" aria-label="Repetições">
    <select aria-label="Repetições na reserva"><option value="">esforço —</option>${[0, 1, 2, 3, 4].map(r =>
      `<option value="${r}"${s.rir === r ? ' selected' : ''}>${rirTxt(r)}</option>`).join('')}</select>
    <button class="bt-ok">✓</button>`;
  const [iP, iR] = info.querySelectorAll('input');
  info.querySelector('.bt-ok').onclick = () => {
    const p = parseFloat(iP.value), r = parseInt(iR.value, 10), rir = info.querySelector('select').value;
    if (isNaN(p) || p < 0 || !r || r < 1) return toast('Confira os valores.');
    s.peso = p; s.reps = r;
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
      <div class="crono-rot">${est === 'contagem' ? 'Prepare-se…' : `Série ${n} · ${esc(carga(parseFloat(form.peso) || 0))} × ${esc(form.reps)}${ex.seg ? ' s' : ''}`}</div>
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
    <button class="ghost larga" id="bt-sem-crono">Anotar sem cronometrar</button>`;
  bindSteppers(ex);
  $('bt-iniciar').onclick = iniciarSerie;
  $('bt-sem-crono').onclick = () => {
    ativo.pend = { dur: null, ini: null, fim: null };
    ativo.estado = 'anotando';
    form.rir = null;
    salvaAtivo();
    renderCtl();
  };
}

function steppers(ex) {
  return `<div class="steppers">
    <div class="stepper"><span class="st-rot">Carga (kg${ex.corpo ? ', 0 = corporal' : ''})</span>
      <div class="st-ctl"><button data-st="peso" data-d="-1" aria-label="Diminuir carga">−</button><input id="f-peso" type="number" inputmode="decimal" min="0" step="any" value="${esc(form.peso)}"><button data-st="peso" data-d="1" aria-label="Aumentar carga">+</button></div></div>
    <div class="stepper"><span class="st-rot">${ex.seg ? 'Segundos' : 'Repetições'}</span>
      <div class="st-ctl"><button data-st="reps" data-d="-1" aria-label="Diminuir">−</button><input id="f-reps" type="number" inputmode="numeric" min="1" step="1" value="${esc(form.reps)}"><button data-st="reps" data-d="1" aria-label="Aumentar">+</button></div></div>
  </div>`;
}

function bindSteppers(ex) {
  const iP = $('f-peso'), iR = $('f-reps');
  iP.oninput = () => { form.peso = iP.value; };
  iR.oninput = () => { form.reps = iR.value; };
  $('ctl').querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    const d = +b.dataset.d;
    if (b.dataset.st === 'peso') {
      form.peso = Math.max(0, +((parseFloat(form.peso) || 0) + d * ex.inc).toFixed(2));
      iP.value = form.peso;
    } else {
      form.reps = Math.max(1, (parseInt(form.reps, 10) || 0) + d * (ex.seg ? 5 : 1));
      iR.value = form.reps;
    }
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
  if (exMap[ativo.ex].seg) form.reps = dur; // isometria: o tempo é a própria "repetição"
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
  const peso = parseFloat(form.peso), reps = parseInt(form.reps, 10);
  if (isNaN(peso) || peso < 0 || !reps || reps < 1) return toast('Confira carga e repetições.');
  const agora = Date.now();
  const pend = ativo.pend || {};
  let l = logHoje(ex.id);
  const anterior = l && l.sets[l.sets.length - 1];
  const set = { peso, reps, ts: pend.fim || agora };
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
  const rot = ativo.rotina != null && rotinas.find(r => r.id === ativo.rotina);
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
  let fotos = [];
  try { fotos = (await idbReq((await txFotos('readonly')).getAll())).filter(f => f.ex === exId); } catch { /* sem IndexedDB */ }
  const el = $('fotos-maq');
  if (!el || tk !== fotoToken || ativo.ex !== exId) return;
  urlsPainel.forEach(URL.revokeObjectURL);
  urlsPainel = [];
  el.innerHTML = fotos.map(f => {
    const u = URL.createObjectURL(f.blob);
    urlsPainel.push(u);
    return `<figure><img src="${u}" alt="Sua máquina">${f.nota ? `<figcaption>${esc(f.nota)}</figcaption>` : ''}</figure>`;
  }).join('') + `<button class="chip" id="bt-foto-painel">📷 ${fotos.length ? 'Outra foto' : 'Fotografar a máquina'}</button>`;
  el.querySelectorAll('img').forEach(img => img.onclick = () => abreLightbox(img.src));
  $('bt-foto-painel').onclick = () => $('input-foto-painel').click();
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

// ---------- animação ilustrativa do exercício ----------
// ponytail: boneco palito com 2 poses interpoladas cobre os movimentos sem foto com ~23 padrões;
// GIFs reais = licença + megabytes + quebra o offline. Trocar por vídeo/GIF se um dia fizer sentido.
let animRAF = null, animInterval = null, animToken = 0;
function pararAnim() {
  cancelAnimationFrame(animRAF);
  clearInterval(animInterval);
  animToken++;
}

function mostraAnim(exId) {
  pararAnim();
  const box = $('anim-ex'), ex = exMap[exId];
  if (!box) return;
  if (!ex || (!ex.img && !ANIMS[ex.anim])) { box.hidden = true; return; }
  if (ex.img) montaFotos(box, ex);
  else montaBoneco(box, ex.anim);
}

// dois quadros alternados = efeito GIF (fotos do dataset aberto free-exercise-db); sem foto, cai no boneco
function montaFotos(box, ex) {
  const token = animToken;
  box.hidden = false;
  box.innerHTML = `<img src="imgs/${ex.img}_0.jpg" alt="Execução: ${esc(ex.nome)}">`;
  const img = box.querySelector('img');
  img.onerror = () => { if (token === animToken) { pararAnim(); montaBoneco(box, ex.anim); } };
  img.onclick = () => abreLightbox(img.src);
  new Image().src = `imgs/${ex.img}_1.jpg`; // pré-carrega o 2º quadro
  let quadro = 0;
  animInterval = setInterval(() => { quadro = 1 - quadro; img.src = `imgs/${ex.img}_${quadro}.jpg`; }, 700);
}

function montaBoneco(box, animId) {
  const an = ANIMS[animId];
  if (!an) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<svg viewBox="0 0 100 100" width="92" height="92"></svg>';
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

function abreLightbox(src) {
  $('lightbox').querySelector('img').src = src;
  $('lightbox').classList.add('aberto');
}

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

// ---------- aba Músculos ----------
// mapa corporal 2D reaproveitado: grande (fadiga em vermelho) e mini (músculos do grupo em azul)
function corpoSvg({ cor, titulo, rotulos = true, estilo = '' }) {
  const espelha = ([tag, at]) => {
    const a = { ...at };
    if (tag === 'ellipse') a.cx = 200 - a.cx;
    else if (tag === 'rect') a.x = 200 - a.x - a.width;
    else a.d = a.d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (s, x, y) => `${200 - parseFloat(x)},${y}`);
    return [tag, a];
  };
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

function renderProgresso() {
  // tiles gerais
  const agora = Date.now(), d7 = agora - 7 * 864e5, d30 = agora - 30 * 864e5;
  const dias30 = new Set(logs.filter(l => l.ts >= d30).map(l => dayKey(l.ts))).size;
  const vol7 = logs.filter(l => l.ts >= d7).reduce((s, l) => s + volumeLog(l), 0);
  const prs = logs.filter(l => l.pr || l.sets.some(s => s.pr)).length;
  $('tiles-gerais').innerHTML =
    tile(dias30, 'treinos (30 dias)') + tile(kg(vol7) + ' kg', 'volume (7 dias)') + tile(prs, 'recordes (PR)');

  // select agrupado por movimento: cada variação tem sua própria curva
  const sel = $('sel-progresso');
  const comLog = new Set(logs.map(l => l.ex).filter(id => exMap[id]));
  const atual = sel.value;
  const cats = [...new Set(movs.map(m => m.cat))];
  sel.innerHTML = comLog.size
    ? cats.map(c => [c, EXERCICIOS.filter(e => e.cat === c && comLog.has(e.id))]).filter(([, es]) => es.length).map(([c, es]) =>
      `<optgroup label="${esc(nomeGrupo(c))}">${es.map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</optgroup>`).join('')
    : '<option value="">— sem histórico ainda —</option>';
  if (comLog.has(atual)) sel.value = atual;
  else if (comLog.size) { // padrão: o último exercício registrado
    const ult = logs.filter(l => exMap[l.ex]).reduce((a, b) => b.ts > a.ts ? b : a);
    sel.value = ult.ex;
  }

  const exId = sel.value;
  if (!exId) {
    $('tiles-ex').innerHTML = '';
    $('graf-e1rm').innerHTML = $('graf-volume').innerHTML = '<p class="mudo">Registre treinos para ver sua progressão.</p>';
    $('hist-sessoes').innerHTML = '';
    return;
  }
  const ex = exMap[exId];
  const doEx = logs.filter(l => l.ex === exId);
  const sets = doEx.flatMap(l => l.sets);
  const melhorPeso = Math.max(...sets.map(s => s.peso));
  const sessoes = new Set(doEx.map(l => dayKey(l.ts))).size;
  const pts = seriesPorDia(exId);
  const corporal = melhorPeso === 0; // sem carga: acompanha repetições (ou segundos)
  const un = ex.seg ? ' s' : ' reps';
  $('tiles-ex').innerHTML = corporal
    ? tile(Math.max(...sets.map(s => s.reps)) + un, 'melhor série') + tile(sets.length, 'séries') + tile(sessoes, 'sessões')
    : tile(num(melhorPeso) + ' kg', 'melhor carga') + tile(kg(melhorE1rm(exId)) + ' kg', 'melhor e1RM') + tile(sessoes, 'sessões');

  $('tit-graf1').textContent = corporal ? `Melhor série (${un.trim()})` : 'Força estimada (e1RM, kg)';
  $('tit-graf2').textContent = corporal ? `Total por treino (${un.trim()})` : 'Volume por treino (kg)';
  graficoLinha($('graf-e1rm'), pts.map(p => ({ x: p.x, y: corporal ? p.reps : p.e1 })), 'var(--azul)', corporal ? v => kg(v) + un : v => kg(v) + ' kg');
  graficoLinha($('graf-volume'), pts.map(p => ({ x: p.x, y: corporal ? p.totReps : p.vol })), 'var(--aqua)', corporal ? v => kg(v) + un : v => kg(v) + ' kg');

  // detalhe das últimas sessões: carga × reps, tempo da série e esforço
  $('hist-sessoes').innerHTML = doEx.slice().sort((a, b) => b.ts - a.ts).slice(0, 8).map(l => {
    const tut = l.sets.reduce((t, s) => t + (s.dur || 0), 0);
    return `<div class="sessao"><div class="cab"><b>${dataBr(l.ts)}</b> <span class="mudo">· ${quando(l.ts)} · ${l.sets.length} série${l.sets.length > 1 ? 's' : ''}${tut ? ` · ⏱ ${mmss(tut)}` : ''}</span></div>
      <div class="pills">${l.sets.map(s => `<span class="pill">${esc(carga(s.peso))} × ${s.reps}${ex.seg ? ' s' : ''}${s.dur && !ex.seg ? ` · ${mmss(s.dur)}` : ''}${s.rir != null ? ` · <span class="rir r${Math.min(s.rir, 4)}">${rirTxt(s.rir)}</span>` : ''}</span>`).join('')}</div></div>`;
  }).join('');
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
    card.querySelector('img').onclick = () => abreLightbox(url);
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
  $('foto-exercicio').value = ativo.ex && exMap[ativo.ex] ? ativo.ex : '';
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
  $('aj-contagem').value = String(prefs.contagem);
  $('aj-tela').checked = !!prefs.telaLigada;
  atualizaFatorTxt();
  renderPexLista();
}

// ---------- exercícios personalizados ----------
function aplicaCustom() { // sincroniza customExs → catálogo/selects
  salvarCustom();
  montaCatalogo();
  popularSelects();
}

let pexTipo = 'var';
function adicionarExPersonalizado() {
  const eq = $('pex-eq').value;
  if (pexTipo === 'var') {
    const mov = $('pex-mov').value, vnome = $('pex-vnome').value.trim();
    if (!vnome) return toast('Dê um nome à variação.');
    customExs.push({ id: 'custom_' + Date.now(), mov, vnome, eq });
    $('pex-vnome').value = '';
  } else {
    const nome = $('pex-nome').value.trim();
    const m1 = $('pex-m1').value, m2 = $('pex-m2').value;
    if (!nome) return toast('Dê um nome ao exercício.');
    const musculos = m2 && m2 !== m1 ? { [m1]: 0.7, [m2]: 0.3 } : { [m1]: 1 };
    customExs.push({ id: 'custom_' + Date.now(), cat: $('pex-cat').value, nome, musculos, eq });
    $('pex-nome').value = '';
  }
  aplicaCustom();
  toast('Adicionado ➕ — aparece no grupo do exercício');
  renderPexLista();
}

function renderPexLista() {
  const el = $('pex-lista');
  el.innerHTML = customExs.map(e => {
    const mov = e.mov && movMap[e.mov];
    const titulo = e.mov ? `${mov ? mov.nome : '?'} · ${e.vnome}` : e.nome;
    const det = e.mov ? 'variação' : `${esc(nomeGrupo(e.cat || 'Personalizados'))} · ${Object.keys(e.musculos).map(m => muscMap[m] ? muscMap[m].nome : m).join(' + ')}`;
    return `<div class="musculo"><div class="cab"><span class="nome">${esc(titulo)}</span>
      <button class="x-rot" data-pex="${e.id}" aria-label="Excluir">✕</button></div>
      <div class="rodape">${det}</div></div>`;
  }).join('');
  el.querySelectorAll('[data-pex]').forEach(b => b.onclick = () => {
    if (!confirm('Excluir? Registros antigos continuam no histórico.')) return;
    // apagar um exercício personalizado leva junto as variações criadas para ele
    customExs = customExs.filter(e => e.id !== b.dataset.pex && e.mov !== b.dataset.pex);
    aplicaCustom();
    if (ativo.ex && !exMap[ativo.ex]) { ativo.ex = null; ativo.estado = 'pronto'; salvaAtivo(); }
    renderPexLista();
  });
}

function atualizaFatorTxt() {
  const v = parseFloat($('aj-fator').value);
  $('aj-fator-txt').textContent = v < 0.95 ? `rápido (×${v})` : v <= 1.05 ? 'na média' : `devagar (×${v})`;
}

function exportar() {
  const blob = new Blob([JSON.stringify({ versao: 3, perfil, prefs, logs, rotinas, overrides, exercicios: customExs, notas })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `carga-backup-${hojeKey()}.json`;
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
    const novos = d.logs.filter(l => l && l.ex && l.ts).map(migraLog);
    if (!confirm(`Substituir os dados atuais por ${novos.length} registros do backup?`)) return;
    logs = novos;
    perfil = Object.assign({}, PERFIL_PADRAO, d.perfil);
    prefs = Object.assign({}, PREFS_PADRAO, d.prefs);
    rotinas = d.rotinas || [];
    overrides = d.overrides || {};
    customExs = d.exercicios || [];
    notas = d.notas || {};
    ativo = { ...ATIVO_PADRAO };
    salvarLogs(); salvarPerfil(); salvarPrefs(); salvarRotinas(); salvarOverrides(); salvarNotas(); salvaAtivo();
    aplicaCustom();
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
  prefs = Object.assign({}, PREFS_PADRAO, { descansos: {} });
  rotinas = [];
  overrides = {};
  customExs = [];
  notas = {};
  ativo = { ...ATIVO_PADRAO };
  cacheMelhor = null;
  [LS_LOGS, LS_PERFIL, LS_ROTINAS, LS_OVER, LS_CUSTOM, LS_TIMER, LS_NOTAS, LS_PREFS, LS_ATIVO].forEach(k => localStorage.removeItem(k));
  aplicaCustom();
  await idbReq((await txFotos('readwrite')).clear());
  toast('Dados apagados.');
  mostrarTab('treino');
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
  const cats = [...new Set(movs.map(m => m.cat))];
  const opts = cats.map(c =>
    `<optgroup label="${esc(nomeGrupo(c))}">${EXERCICIOS.filter(e => e.cat === c).map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</optgroup>`
  ).join('');
  $('foto-exercicio').innerHTML = '<option value="">(sem vínculo)</option>' + opts;
  $('pex-mov').innerHTML = cats.map(c =>
    `<optgroup label="${esc(nomeGrupo(c))}">${movs.filter(m => m.cat === c).map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</optgroup>`).join('');
}

// sessão guardada: volta pro mesmo exercício se o app for recarregado no meio do treino
(function validaAtivo() {
  const agora = Date.now();
  if (agora - ativo.ts > 6 * 3.6e6) ativo = { ...ATIVO_PADRAO }; // treino de outro dia: começa pelos grupos
  if (ativo.ex && !exMap[ativo.ex]) ativo.ex = null;
  if (ativo.grupo && !gruposVisiveis().some(g => g.id === ativo.grupo)) ativo.grupo = null;
  if ((ativo.estado === 'contagem' || ativo.estado === 'rodando') && agora - ativo.serieIni > 30 * 6e4) ativo.estado = 'pronto';
  if (ativo.estado === 'anotando' && !ativo.pend) ativo.estado = 'pronto';
  if (!ativo.ex) ativo.estado = 'pronto';
  if (ativo.descFim && agora > ativo.descFim + 8000) ativo.descFim = 0;
})();

popularSelects();
document.querySelectorAll('nav button').forEach(b => b.onclick = () => mostrarTab(b.dataset.tab));
$('bt-salvar-rotina').onclick = salvarRotinaDeHoje;
$('bt-add-ex').onclick = adicionarExPersonalizado;
const muscOpts = MUSCULOS.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
$('pex-m1').innerHTML = muscOpts;
$('pex-m2').innerHTML = '<option value="">— nenhum —</option>' + muscOpts;
$('pex-cat').innerHTML = GRUPOS.map(g => `<option>${esc(g.id)}</option>`).join('');
$('pex-tipo').querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
  pexTipo = b.dataset.tipo;
  $('pex-tipo').querySelectorAll('[data-tipo]').forEach(x => x.classList.toggle('ativo', x === b));
  $('pex-var').hidden = pexTipo !== 'var';
  $('pex-ex').hidden = pexTipo !== 'ex';
});

// armazenamento persistente (impede o Android de apagar os dados do site) + backup automático semanal
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
(function backupAuto() {
  const ULT = 'carga.backup_ts';
  const ult = parseInt(localStorage.getItem(ULT), 10) || 0;
  if (logs.length && Date.now() - ult > 7 * 864e5) {
    if (ult) { exportar(); toast('Backup automático salvo em Downloads 💾'); }
    localStorage.setItem(ULT, Date.now()); // na 1ª visita só marca a data, sem baixar arquivo do nada
  }
})();
$('sel-progresso').onchange = renderProgresso;
$('input-foto').onchange = e => prepararFoto(e.target);
$('input-foto-painel').onchange = e => fotoDoPainel(e.target);
$('bt-salvar-foto').onclick = salvarFoto;
$('bt-cancelar-foto').onclick = () => { fotoPendente = null; $('form-foto').hidden = true; };
$('lightbox').onclick = () => $('lightbox').classList.remove('aberto');
$('bt-info').onclick = irParaPainel;
$('aj-exp').onchange = e => { perfil.experiencia = e.target.value; salvarPerfil(); };
$('aj-sono').onchange = e => { perfil.sono = e.target.value; salvarPerfil(); };
$('aj-fator').oninput = e => { perfil.fator = parseFloat(e.target.value); salvarPerfil(); atualizaFatorTxt(); };
$('aj-contagem').onchange = e => { prefs.contagem = +e.target.value; salvarPrefs(); };
$('aj-tela').onchange = e => { prefs.telaLigada = e.target.checked; salvarPrefs(); atualizaTela(); };
$('bt-exportar').onclick = exportar;
$('input-importar').onchange = e => importar(e.target);
$('bt-apagar').onclick = apagarTudo;
// o navegador solta o wake lock ao trocar de app; pede de novo ao voltar e atualiza os cronômetros
document.addEventListener('visibilitychange', () => {
  atualizaTela();
  if (document.visibilityState === 'visible' && (ativo.descFim || ativo.estado === 'rodando' || ativo.estado === 'contagem')) garanteRelogio();
});
mostrarTab('treino');
if (ativo.descFim || ativo.estado === 'rodando' || ativo.estado === 'contagem') garanteRelogio();
atualizaTela();
