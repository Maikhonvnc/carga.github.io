/* Carga — Aba Ajustes: perfil, exercícios personalizados, backup. */
'use strict';

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
  prefs = Object.assign({}, PREFS_PADRAO, { descansos: {}, lados: {} });
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
