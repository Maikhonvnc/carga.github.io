/* Carga — Vídeos de execução em pacote: um .zip (ou vários .mp4) que você carrega no aparelho.
   Cada vídeo é ligado ao exercício pelo nome do arquivo e fica só no IndexedDB deste aparelho, como o "Adicionar GIF".
   O .zip é lido aqui mesmo, sem baixar nada (funciona offline).
   Nada disso vai para o site: aqui só há a tabela de nomes. */
'use strict';

const chaveVideo = s => s.split('/').pop().replace(/\.(mp4|webm|mov|gif)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// nome do arquivo (pacote do BeFit, em inglês) → variação do Carga
const VIDEOS_PACOTE = {
  abdominalcrunchmachine: 'abdominal_maq', abductionmachine: 'abdutora', adductionmachine: 'adutora', alternatelegraises: 'elevacao_pernas',
  alternatingbicepscurlseateddumbbells: 'rosca_alternada_sent', backextensionmachine: 'hiperextensao', barbellbenchpress: 'supino_reto',
  barbellbentoverrow: 'remada_curvada', barbellbicepscurl: 'rosca_direta', barbelldeadlift: 'levantamento_terra',
  barbellfrontsquat: 'agachamento_frontal', barbellglutebridge: 'elevacao_pelvica', barbellinclinedbenchpress: 'supino_inclinado_barra',
  barbelllunges: 'afundo', barbelllyingextension: 'triceps_testa', barbellpalmdownwristcurloverabench: 'rosca_punho_inv',
  barbellshrugs: 'encolhimento', barbellsplitsquat: 'bulgaro', barbellsquat: 'agachamento', barbellstifflegdeadlift: 'stiff',
  barbellsumodeadlift: 'terra_sumo', barbellunderhandbentoverrow: 'remada_curvada_sup', barbelluprightrow: 'remada_alta',
  barbellwristcurl: 'rosca_punho', benchtricepsdipstraightlegs: 'paralelas_banco', bentoverreardeltflydumbell: 'crucifixo_inverso',
  bicepscurlcable: 'rosca_polia', bulgariansplitsquat: 'bulgaro_halteres', cablefrontraisesstraightbar: 'elevacao_frontal_polia',
  cableindividualglutekickbacks: 'coice_polia', cablelateralraise: 'elevacao_lateral_polia', cablelowfly: 'crossover_baixa',
  cablemachinehightolow: 'crossover', cablemiddlefly: 'crossover_media', cableoverheadextensionrope: 'triceps_frances_polia',
  cablereversefly: 'crucifixo_inverso_polia', cablestraightarmpulldown: 'pullover_polia', cabletricepspushdownstraightbar: 'triceps_pulley',
  cableuprightrowwithstraightbar: 'remada_alta_polia', cablewidegrippulldown: 'puxada_frontal', calfraiselegpressmachine: 'panturrilha_legpress',
  calfraises: 'panturrilha_pe', captainschairlegraise: 'elevacao_pernas_paralela', chestdip: 'paralelas', chestpressmachine: 'supino_reto_maq',
  closegrippushup: 'flexao_diamante', crunchfloor: 'abdominal', declinepushup: 'flexao_declinada', dumbbellalternatebicepscurl: 'rosca_alternada',
  dumbbellarnoldpress: 'desenv_arnold', dumbbellbenchpress: 'supino_halteres', dumbbelldeclinebenchpress: 'supino_declinado_halt',
  dumbbellfly: 'crucifixo_halteres', dumbbellfrontsquat: 'agachamento_goblet', dumbbellhammercurlsimultaneousarms: 'rosca_martelo',
  dumbbellinclinebenchpress: 'supino_inclinado', dumbbellinclinefly: 'crucifixo_inclinado', dumbbellinclinesimultaneouscurl: 'rosca_inclinada',
  dumbbelllyingtricepsextension: 'triceps_testa_halt', dumbbellpullover: 'pullover', dumbbellseatedpreachercurl: 'rosca_scott_halt',
  dumbbellseatedshoulderpress: 'desenv_halteres', dumbbellstandingonearmextension: 'triceps_frances_uni',
  dumbbellstandingtricepsextension: 'triceps_frances', dumbellcurls: 'rosca_halteres', dumbelllungesonthespot: 'afundo_halteres',
  dumbellshrugs: 'encolhimento_halt', dumbellsinglearmrowright: 'serrote', frontplank: 'prancha', hacksquatmachine: 'hack',
  hammerstrenghtmtsisolateraldeclinepressbotharm: 'supino_declinado_maq', hammerstrengthplateloadedhighrowbotharms: 'remada_maquina_aberta',
  hangingkneeraises: 'elevacao_pernas_barra', highcablekneelingcrunch: 'abdominal_polia', invertedtricepsonpulley: 'triceps_pulley_inv',
  isolateralshoulderpressbotharms: 'desenv_maquina', landminerow: 'remada_cavalinho', lateralraisesdumbell: 'elevacao_lateral',
  legpressmachinenormalstance: 'leg_press', leverhipthrust: 'elevacao_pelvica_maq', lyinglegcurlmachine: 'flexora',
  machinechestpressincline: 'supino_inclinado_maq', machinelateralraise: 'elevacao_lateral_maq', mtsisolateralkneelinglegcurl: 'flexora_pe',
  peckdeckflymachine: 'crucifixo', preachercurlezbar: 'rosca_scott', pullupnormalgrip: 'barra_fixa', pullupreversegrip: 'barra_fixa_supinada',
  pushups: 'flexao', reversegriplatpulldown: 'puxada_supinada', reversemachinefly: 'crucifixo_inverso_maq',
  seatedcablerowvbarmachine: 'remada_baixa', seatedcalfmachine: 'panturrilha_sentado', seatedlegcurlmachine: 'flexora_sentada',
  seatedlegextension: 'extensora', seatedlegextensionsingleleg: 'extensora_uni', seatednormalgriprowmachine: 'remada_maquina',
  seatedshoulderspressbarbell: 'desenvolvimento', sideplank: 'prancha_lateral', singlelegromaniandeadliftdumbbell: 'stiff_uni',
  smithmachinebulgariansplitsquat: 'bulgaro_smith', smithmachinecalfraise: 'panturrilha_smith', smithmachinepressdecline: 'supino_declinado',
  smithmachinepressflat: 'supino_reto_smith', smithmachinepressincline: 'supino_inclinado_smith', standingfrontraisedumbell: 'elevacao_frontal',
  trapbarshrug: 'encolhimento_maq', tricepdipmachine: 'paralelas_maq', tricepropeextension: 'triceps_corda', vbarlatpulldown: 'puxada_triangulo'
};
// também reconhece o id da variação e o nome em inglês do free-exercise-db (ex.: Barbell_Squat.mp4)
function variacaoDoArquivo(nome) {
  const k = chaveVideo(nome);
  if (VIDEOS_PACOTE[k] && exMap[VIDEOS_PACOTE[k]]) return VIDEOS_PACOTE[k];
  return (EXERCICIOS.find(e => chaveVideo(e.id) === k || (e.fe && chaveVideo(e.fe) === k)) || {}).id || null;
}
const tipoVideo = nome => /\.webm$/i.test(nome) ? 'video/webm' : /\.mov$/i.test(nome) ? 'video/quicktime' : /\.gif$/i.test(nome) ? 'image/gif' : 'video/mp4';

// arquivos [{nome, dados: Blob|Uint8Array}] → grava; não troca o GIF que você mesmo escolheu num exercício
async function gravarVideos(arqs) {
  const atuais = await idbReq((await txGifs('readonly')).getAll());
  const meus = new Set(atuais.filter(g => g.origem !== 'pacote').map(g => g.ex));
  const novos = [], sem = [];
  for (const a of arqs) {
    const ex = variacaoDoArquivo(a.nome);
    if (!ex) { sem.push(a.nome); continue; }
    if (meus.has(ex) || novos.some(n => n.ex === ex)) continue;
    novos.push({ ex, blob: a.dados instanceof Blob ? a.dados : new Blob([a.dados], { type: tipoVideo(a.nome) }), ts: Date.now(), origem: 'pacote' });
  }
  const w = await txGifs('readwrite');
  await Promise.all(novos.map(n => idbReq(w.put(n))));
  return { ligados: novos.length, sem: sem.length };
}

// leitor de .zip sem biblioteca: lê o índice no fim do arquivo e descompacta só os vídeos que interessam,
// um por vez, com o DecompressionStream do navegador (o arquivo nunca é carregado inteiro na memória)
async function lerZip(file, quer, aoAvancar = () => {}) {
  const u8 = async (ini, fim) => new Uint8Array(await file.slice(ini, fim).arrayBuffer());
  const fimTam = Math.min(file.size, 65557), fim = await u8(file.size - fimTam, file.size), dvF = new DataView(fim.buffer);
  let e = -1;
  for (let i = fim.length - 22; i >= 0; i--) if (dvF.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('não parece um arquivo .zip');
  const tamIdx = dvF.getUint32(e + 12, true), iniIdx = dvF.getUint32(e + 16, true);
  if (iniIdx === 0xffffffff) throw new Error('.zip grande demais (zip64)');
  const idx = await u8(iniIdx, iniIdx + tamIdx), dv = new DataView(idx.buffer), nomes = new TextDecoder();
  const ents = [];
  for (let p = 0; p + 46 <= idx.length && dv.getUint32(p, true) === 0x02014b50;) {
    const metodo = dv.getUint16(p + 10, true), tamC = dv.getUint32(p + 20, true), n = dv.getUint16(p + 28, true);
    const x = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const nome = nomes.decode(idx.subarray(p + 46, p + 46 + n));
    if (quer(nome)) ents.push({ nome, metodo, tamC, local });
    p += 46 + n + x + c;
  }
  const saida = [];
  for (const [i, en] of ents.entries()) {
    aoAvancar(i + 1, ents.length);
    const h = new DataView((await u8(en.local, en.local + 30)).buffer);
    const ini = en.local + 30 + h.getUint16(26, true) + h.getUint16(28, true), bruto = file.slice(ini, ini + en.tamC);
    let blob;
    if (en.metodo === 0) blob = bruto;
    else if (en.metodo === 8) blob = await new Response(bruto.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    else continue;
    saida.push({ nome: en.nome, dados: new Blob([blob], { type: tipoVideo(en.nome) }) });
  }
  return saida;
}
const ehZip = async f => /\.zip$/i.test(f.name) || new TextDecoder().decode(new Uint8Array(await f.slice(0, 2).arrayBuffer())) === 'PK';

async function importarVideos(input) {
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  const st = $('vid-status');
  st.textContent = 'Lendo os vídeos…';
  let erro = '';
  try {
    const arqs = [];
    for (const f of files) {
      if (!(await ehZip(f))) { arqs.push({ nome: f.name, dados: f }); continue; }
      if (typeof DecompressionStream === 'undefined') throw new Error('este navegador não abre .zip; atualize o Chrome ou escolha os vídeos soltos');
      arqs.push(...await lerZip(f, nome => /\.(mp4|webm|mov|gif)$/i.test(nome) && !!variacaoDoArquivo(nome),
        (i, n) => { st.textContent = `Lendo o vídeo ${i} de ${n}…`; }));
    }
    const r = await gravarVideos(arqs);
    toast(r.ligados ? `${plural(r.ligados, 'vídeo ligado', 'vídeos ligados')} aos exercícios` : 'Nenhum vídeo novo para os exercícios do Carga');
  } catch (err) {
    erro = `Não deu para ler o arquivo: ${err && err.message ? err.message : 'erro desconhecido'}.`;
    toast(erro);
  }
  await renderVideos();
  if (erro) st.textContent = erro;
}

async function renderVideos() {
  const st = $('vid-status');
  if (!st) return;
  let n = 0;
  try { n = (await idbReq((await txGifs('readonly')).getAll())).filter(g => g.origem === 'pacote').length; } catch { /* sem IndexedDB */ }
  st.textContent = n ? `${plural(n, 'exercício', 'exercícios')} com vídeo do pacote neste aparelho.` : 'Nenhum vídeo de pacote carregado.';
  $('bt-vid-apagar').hidden = !n;
}
async function apagarVideos() {
  if (!confirm('Apagar os vídeos importados do pacote? Os GIFs que você escolheu um a um ficam.')) return;
  const todos = await idbReq((await txGifs('readonly')).getAll()), w = await txGifs('readwrite');
  await Promise.all(todos.filter(g => g.origem === 'pacote').map(g => idbReq(w.delete(g.ex))));
  toast('Vídeos do pacote apagados');
  renderVideos();
}

$('input-videos').onchange = e => importarVideos(e.target);
$('bt-vid-apagar').onclick = apagarVideos;
renderVideos();
