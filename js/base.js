/* Carga — Estado, catálogo (movimento → variações), métricas, modelo de recuperação e utilitários. */
'use strict';

// ---------- estado ----------
const LS_LOGS = 'carga.logs', LS_PERFIL = 'carga.perfil', LS_ROTINAS = 'carga.rotinas',
  LS_CUSTOM = 'carga.exercicios', LS_OVER = 'carga.overrides', LS_TIMER = 'carga.timer',
  LS_NOTAS = 'carga.notas', LS_PREFS = 'carga.prefs', LS_ATIVO = 'carga.ativo';
const PERFIL_PADRAO = { experiencia: 'intermediario', sono: 'media', fator: 1 };
const PREFS_PADRAO = { contagem: 3, telaLigada: true, dicasFechadas: false, descansos: {}, lados: {} };
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

// ícone do sprite Phosphor (icones.svg); cls extra define o tamanho (ic-14…ic-30)
const ic = (nome, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="icones.svg#${nome}"/></svg>`;
// status de recuperação: sempre com ícone + palavra, nunca só cor
const statusRecup = p => p >= 85 ? { nome: 'Pronto', cls: 'ok', ic: 'check-circle-fill' }
  : p >= 60 ? { nome: 'Recuperando', cls: 'atencao', ic: 'hourglass-medium-fill' }
    : p >= 35 ? { nome: 'Fatigado', cls: 'serio', ic: 'warning-fill' } : { nome: 'Muito fatigado', cls: 'critico', ic: 'warning-fill' };
const tagRecup = (p, texto) => { const s = statusRecup(p); return `<span class="tag tag-${s.cls}">${ic(s.ic)}${esc(texto ?? (p >= 85 ? s.nome : p + '%'))}</span>`; };
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataLonga = ts => { const d = new Date(ts), s = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; return s[0].toUpperCase() + s.slice(1); };
const dataCurta = ts => `${DIAS[new Date(ts).getDay()].slice(0, 3)}, ${dataBr(ts)}`; // "sáb, 26/09"
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// folha de opções na base da tela: itens {ic, txt, valor?, sel?, acao}
function abrirFolha(titulo, itens) {
  const f = $('folha');
  f.innerHTML = `<div class="folha-corpo" role="menu" aria-label="${esc(titulo)}"><div class="kicker folha-titulo">${esc(titulo)}</div>
    ${itens.map((it, i) => `<button class="ll-linha${it.sel ? ' sel' : ''}" role="menuitem" data-i="${i}">${ic(it.ic || 'caret-right')}<span>${esc(it.txt)}</span>${it.valor ? `<span class="valor">${esc(it.valor)}</span>` : ''}</button>`).join('')}</div>`;
  f.hidden = false;
  f.onclick = e => { if (e.target === f) fecharFolha(); };
  f.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { fecharFolha(); itens[+b.dataset.i].acao(); });
  const primeiro = f.querySelector('button');
  if (primeiro) primeiro.focus();
}
function fecharFolha() { $('folha').hidden = true; $('folha').innerHTML = ''; }

// repetições de uma série; unilateral mostra os dois lados ("E 10 / D 9")
const repsTxt = (s, seg) => (s.repsE != null ? `E ${s.repsE} / D ${s.repsD}` : String(s.reps)) + (seg ? ' s' : '');
const repsCurto = (s, seg) => (s.repsE != null ? `${s.repsE}/${s.repsD}` : String(s.reps)) + (seg ? ' s' : '');

// "60 kg × 10, 9, 8" (mesma carga) ou "60 kg × 10 · 62,5 kg × 8"
function resumoSeries(sets, seg) {
  if (!sets.length) return '';
  if (sets.every(s => s.peso === sets[0].peso)) return `${carga(sets[0].peso)} × ${sets.map(s => repsCurto(s, seg)).join(', ')}`;
  return sets.map(s => `${carga(s.peso)} × ${repsCurto(s, seg)}`).join(' · ');
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
    musculos: v.musculos || m.musculos, foco: v.foco || m.foco || [],
    // foto: a local da própria variação; senão a do banco aberto (fe); senão a do movimento; senão o boneco
    anim: m.anim, img: 'img' in v ? v.img : (m.img === v.id || !v.fe ? m.img : null), fe: v.fe || null,
    dicas: [...(m.dicas || []), ...(v.dica ? [v.dica] : [])],
    inc: v.inc || INC_EQ[v.eq] || 2.5, corpo: v.eq === 'corpo', seg: !!m.seg, uni: !!v.uni,
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

function horasAtePronto(muscId, alvo = 90) { // horas até ficar >= alvo% recuperado
  const agora = Date.now();
  for (let h = 0; h <= 168; h++) if (pctRecuperado(muscId, agora + h * 3.6e6) >= alvo) return h;
  return 168;
}

function ultimoTreino(muscId) {
  return logs.reduce((m, l) => {
    const frac = (exMap[l.ex] && exMap[l.ex].musculos[muscId]) || 0;
    return frac >= 0.15 ? Math.max(m, l.ts) : m;
  }, 0);
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
