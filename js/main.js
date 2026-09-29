/* Carga — Navegação entre abas e inicialização (carregado por último). */
'use strict';

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
