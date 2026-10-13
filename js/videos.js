/* Carga — Vídeos de execução em pacote: um .zip (ou vários .mp4) que você carrega no aparelho.
   Cada vídeo é ligado ao exercício pelo nome do arquivo e fica só no IndexedDB deste aparelho, como o "Adicionar GIF".
   Nada disso vai para o site: aqui só há a tabela de nomes. */
'use strict';

const CDN_FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';
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

async function importarVideos(input) {
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  const st = $('vid-status');
  st.textContent = 'Lendo os vídeos…';
  try {
    const arqs = [];
    for (const f of files) {
      if (!/\.zip$/i.test(f.name)) { arqs.push({ nome: f.name, dados: f }); continue; }
      const { unzipSync } = await import(CDN_FFLATE);
      // só descompacta os vídeos que têm exercício correspondente
      const zip = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: z => /\.(mp4|webm|mov|gif)$/i.test(z.name) && !!variacaoDoArquivo(z.name) });
      for (const [nome, dados] of Object.entries(zip)) arqs.push({ nome, dados });
    }
    const r = await gravarVideos(arqs);
    toast(r.ligados ? `${plural(r.ligados, 'vídeo ligado', 'vídeos ligados')} aos exercícios` : 'Nenhum vídeo novo para os exercícios do Carga');
  } catch {
    toast('Não deu para ler o arquivo. Tente de novo com internet (o leitor de .zip é baixado na hora).');
  }
  renderVideos();
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
