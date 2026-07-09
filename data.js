// Banco de dados de exercícios — frações de envolvimento muscular somam ~1.
// ponytail: frações são heurísticas de literatura de treino, não EMG; ajuste fino é do modelo de recuperação, não daqui.

const MUSCULOS = [
  { id: 'peito',        nome: 'Peitoral' },
  { id: 'costas',       nome: 'Costas (dorsais)' },
  { id: 'trapezio',     nome: 'Trapézio' },
  { id: 'ombros',       nome: 'Ombros (deltoides)' },
  { id: 'biceps',       nome: 'Bíceps' },
  { id: 'triceps',      nome: 'Tríceps' },
  { id: 'antebraco',    nome: 'Antebraço' },
  { id: 'abdomen',      nome: 'Abdômen' },
  { id: 'lombar',       nome: 'Lombar' },
  { id: 'gluteos',      nome: 'Glúteos' },
  { id: 'quadriceps',   nome: 'Quadríceps' },
  { id: 'posteriores',  nome: 'Posteriores de coxa' },
  { id: 'adutores',     nome: 'Adutores' },
  { id: 'panturrilha',  nome: 'Panturrilha' },
];

// Mapa corporal 2D — coordenadas num espaço 0–200 (largura) × 0–330 (altura) por vista.
// `esp: true` = a forma é desenhada também espelhada no eixo x=100. `m: null` = parte neutra (não rastreada).
const CORPO_SVG = {
  f: [ // vista frontal
    { m: null, forma: ['ellipse', { cx: 100, cy: 20, rx: 13, ry: 15 }] },                    // cabeça
    { m: null, forma: ['rect', { x: 92, y: 32, width: 16, height: 12, rx: 4 }] },            // pescoço
    { m: 'trapezio', esp: true, forma: ['path', { d: 'M92,36 L62,50 L92,52 Z' }] },
    { m: 'ombros', esp: true, forma: ['ellipse', { cx: 63, cy: 58, rx: 11, ry: 10 }] },
    { m: 'peito', esp: true, forma: ['path', { d: 'M97,50 C80,51 70,58 69,68 C69,79 81,85 97,84 Z' }] },
    { m: 'abdomen', forma: ['rect', { x: 86, y: 88, width: 28, height: 50, rx: 9 }] },
    { m: 'biceps', esp: true, forma: ['ellipse', { cx: 58, cy: 86, rx: 8, ry: 16 }] },
    { m: 'antebraco', esp: true, forma: ['ellipse', { cx: 51, cy: 122, rx: 6.5, ry: 17 }] },
    { m: null, esp: true, forma: ['ellipse', { cx: 47, cy: 150, rx: 5.5, ry: 7 }] },         // mão
    { m: null, forma: ['rect', { x: 82, y: 142, width: 36, height: 16, rx: 6 }] },           // pelve
    { m: 'quadriceps', esp: true, forma: ['rect', { x: 76, y: 158, width: 20, height: 62, rx: 10 }] },
    { m: 'adutores', forma: ['rect', { x: 96.5, y: 158, width: 7, height: 34, rx: 3.5 }] },
    { m: null, esp: true, forma: ['ellipse', { cx: 86, cy: 228, rx: 6.5, ry: 6.5 }] },       // joelho
    { m: null, esp: true, forma: ['rect', { x: 79, y: 236, width: 14, height: 56, rx: 7 }] },// canela
    { m: null, esp: true, forma: ['ellipse', { cx: 85, cy: 300, rx: 8, ry: 5.5 }] },         // pé
  ],
  c: [ // vista posterior
    { m: null, forma: ['ellipse', { cx: 100, cy: 20, rx: 13, ry: 15 }] },
    { m: null, forma: ['rect', { x: 92, y: 32, width: 16, height: 12, rx: 4 }] },
    { m: 'costas', esp: true, forma: ['path', { d: 'M97,64 C80,68 68,78 67,92 C67,108 80,120 97,124 Z' }] },
    { m: 'trapezio', forma: ['path', { d: 'M100,36 L128,52 L100,84 L72,52 Z' }] },
    { m: 'ombros', esp: true, forma: ['ellipse', { cx: 63, cy: 58, rx: 11, ry: 10 }] },
    { m: 'lombar', forma: ['rect', { x: 89, y: 124, width: 22, height: 30, rx: 6 }] },
    { m: 'triceps', esp: true, forma: ['ellipse', { cx: 58, cy: 86, rx: 8, ry: 16 }] },
    { m: 'antebraco', esp: true, forma: ['ellipse', { cx: 51, cy: 122, rx: 6.5, ry: 17 }] },
    { m: null, esp: true, forma: ['ellipse', { cx: 47, cy: 150, rx: 5.5, ry: 7 }] },
    { m: 'gluteos', esp: true, forma: ['ellipse', { cx: 86.5, cy: 168, rx: 13.5, ry: 15 }] },
    { m: 'posteriores', esp: true, forma: ['rect', { x: 76, y: 188, width: 20, height: 52, rx: 10 }] },
    { m: null, esp: true, forma: ['ellipse', { cx: 86, cy: 247, rx: 6, ry: 6 }] },           // joelho
    { m: 'panturrilha', esp: true, forma: ['ellipse', { cx: 86, cy: 272, rx: 9.5, ry: 20 }] },
    { m: null, esp: true, forma: ['ellipse', { cx: 85, cy: 300, rx: 8, ry: 5.5 }] },
  ],
};

// Regiões de treino (splits clássicos) — usadas para detectar a sessão em andamento e sugerir o que falta
const REGIOES = [
  { id: 'empurrar', nome: 'Empurrar (peito, ombros, tríceps)', musculos: ['peito', 'ombros', 'triceps'] },
  { id: 'puxar',    nome: 'Puxar (costas, bíceps)',            musculos: ['costas', 'trapezio', 'biceps', 'antebraco'] },
  { id: 'pernas',   nome: 'Pernas',                            musculos: ['quadriceps', 'posteriores', 'gluteos', 'adutores', 'panturrilha'] },
  { id: 'core',     nome: 'Core',                              musculos: ['abdomen', 'lombar'] },
];

// Animações ilustrativas — boneco palito em vista lateral, espaço 0–100.
// Juntas: ca(beça) om(bro) co(tovelo) mã(o) qu(adril) jo(elho) pé. Poses A→B em vai-e-vem.
// peso: círculo na mão (ou em pesoEm); banco: [x,y,w,h]; chao/topo/linha/ancora: cenário.
const ANIMS = {
  press:      { peso: 1, banco: [20, 66, 44, 5],
    A: { ca: [24, 59], om: [33, 62], co: [27, 70], ma: [36, 52], qu: [54, 62], jo: [63, 72], pe: [65, 86] },
    B: { ca: [24, 59], om: [33, 62], co: [33, 50], ma: [35, 38], qu: [54, 62], jo: [63, 72], pe: [65, 86] } },
  desenv:     { peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [57, 42], ma: [56, 30], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [50, 23], om: [50, 34], co: [54, 20], ma: [52, 10], qu: [50, 58], jo: [51, 73], pe: [50, 88] } },
  elevacao:   { peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [52, 44], ma: [53, 55], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [50, 23], om: [50, 34], co: [59, 36], ma: [68, 33], qu: [50, 58], jo: [51, 73], pe: [50, 88] } },
  rosca:      { peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [53, 45], ma: [55, 57], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [50, 23], om: [50, 34], co: [53, 45], ma: [58, 33], qu: [50, 58], jo: [51, 73], pe: [50, 88] } },
  triceps:    { peso: 1, ancora: [68, 6], chao: 88,
    A: { ca: [51, 24], om: [50, 35], co: [55, 44], ma: [61, 35], qu: [49, 58], jo: [50, 73], pe: [50, 88] },
    B: { ca: [51, 24], om: [50, 35], co: [55, 44], ma: [63, 58], qu: [49, 58], jo: [50, 73], pe: [50, 88] } },
  puxada:     { peso: 1, ancora: [64, 4], banco: [42, 72, 16, 4],
    A: { ca: [47, 28], om: [47, 40], co: [53, 26], ma: [58, 13], qu: [48, 68], jo: [60, 72], pe: [61, 86] },
    B: { ca: [47, 28], om: [47, 40], co: [50, 48], ma: [57, 38], qu: [48, 68], jo: [60, 72], pe: [61, 86] } },
  remada:     { peso: 1, chao: 88,
    A: { ca: [68, 33], om: [60, 39], co: [63, 49], ma: [65, 60], qu: [44, 57], jo: [49, 71], pe: [50, 88] },
    B: { ca: [68, 33], om: [60, 39], co: [56, 52], ma: [59, 46], qu: [44, 57], jo: [49, 71], pe: [50, 88] } },
  remada_alta:{ peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [52, 46], ma: [53, 57], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [50, 23], om: [50, 34], co: [60, 38], ma: [54, 33], qu: [50, 58], jo: [51, 73], pe: [50, 88] } },
  hinge:      { peso: 1, chao: 88,
    A: { ca: [64, 36], om: [57, 42], co: [59, 52], ma: [60, 63], qu: [42, 58], jo: [48, 71], pe: [50, 88] },
    B: { ca: [50, 23], om: [50, 34], co: [51, 46], ma: [52, 58], qu: [49, 57], jo: [50, 72], pe: [50, 88] } },
  agacha:     { peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [55, 40], ma: [52, 32], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [49, 35], om: [47, 46], co: [52, 50], ma: [49, 44], qu: [43, 68], jo: [57, 72], pe: [50, 88] } },
  afundo:     { peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [52, 45], ma: [53, 56], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [49, 29], om: [48, 40], co: [50, 50], ma: [51, 61], qu: [47, 66], jo: [59, 73], pe: [59, 87] } },
  legpress:   { linha: [66, 34, 80, 54],
    A: { ca: [25, 42], om: [30, 50], co: [36, 60], ma: [43, 64], qu: [42, 64], jo: [50, 50], pe: [62, 42] },
    B: { ca: [25, 42], om: [30, 50], co: [36, 60], ma: [43, 64], qu: [42, 64], jo: [55, 54], pe: [73, 48] } },
  extensora:  { banco: [40, 66, 18, 4],
    A: { ca: [46, 25], om: [46, 36], co: [49, 52], ma: [52, 63], qu: [48, 62], jo: [59, 64], pe: [59, 80] },
    B: { ca: [46, 25], om: [46, 36], co: [49, 52], ma: [52, 63], qu: [48, 62], jo: [59, 64], pe: [75, 62] } },
  flexora:    { banco: [20, 64, 46, 5],
    A: { ca: [25, 58], om: [32, 61], co: [28, 68], ma: [25, 74], qu: [52, 62], jo: [62, 62], pe: [76, 60] },
    B: { ca: [25, 58], om: [32, 61], co: [28, 68], ma: [25, 74], qu: [52, 62], jo: [62, 62], pe: [68, 42] } },
  hipthrust:  { peso: 1, pesoEm: 'qu', banco: [16, 52, 14, 18], chao: 88,
    A: { ca: [22, 46], om: [28, 55], co: [33, 60], ma: [38, 63], qu: [44, 70], jo: [58, 62], pe: [59, 84] },
    B: { ca: [22, 46], om: [28, 55], co: [33, 60], ma: [38, 63], qu: [45, 55], jo: [58, 58], pe: [59, 84] } },
  panturrilha:{ peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [52, 45], ma: [53, 56], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [50, 19], om: [50, 30], co: [52, 41], ma: [53, 52], qu: [50, 54], jo: [51, 69], pe: [50, 84] } },
  crunch:     { chao: 70,
    A: { ca: [25, 63], om: [32, 66], co: [33, 62], ma: [27, 60], qu: [48, 66], jo: [59, 54], pe: [66, 68] },
    B: { ca: [32, 53], om: [37, 58], co: [38, 54], ma: [32, 50], qu: [48, 66], jo: [59, 54], pe: [66, 68] } },
  legraise:   { chao: 70,
    A: { ca: [24, 64], om: [31, 66], co: [38, 68], ma: [44, 68], qu: [50, 66], jo: [61, 66], pe: [73, 66] },
    B: { ca: [24, 64], om: [31, 66], co: [38, 68], ma: [44, 68], qu: [50, 66], jo: [57, 50], pe: [63, 36] } },
  prancha:    { chao: 70,
    A: { ca: [24, 53], om: [31, 55], co: [29, 66], ma: [38, 66], qu: [50, 58], jo: [61, 62], pe: [72, 67] },
    B: { ca: [24, 52], om: [31, 54], co: [29, 66], ma: [38, 66], qu: [50, 56], jo: [61, 61], pe: [72, 67] } },
  encolhe:    { peso: 1, chao: 88,
    A: { ca: [50, 23], om: [50, 34], co: [52, 46], ma: [53, 57], qu: [50, 58], jo: [51, 73], pe: [50, 88] },
    B: { ca: [50, 22], om: [50, 29], co: [52, 42], ma: [53, 53], qu: [50, 58], jo: [51, 73], pe: [50, 88] } },
  barrafixa:  { topo: 1,
    A: { ca: [46, 28], om: [50, 34], co: [50, 22], ma: [50, 10], qu: [50, 57], jo: [53, 70], pe: [54, 82] },
    B: { ca: [47, 13], om: [50, 21], co: [55, 18], ma: [50, 10], qu: [50, 44], jo: [55, 56], pe: [56, 68] } },
  flexao:     { chao: 88,
    A: { ca: [20, 78], om: [29, 80], co: [24, 85], ma: [32, 87], qu: [51, 78], jo: [62, 80], pe: [75, 86] },
    B: { ca: [19, 66], om: [28, 70], co: [26, 79], ma: [32, 87], qu: [51, 72], jo: [62, 76], pe: [75, 86] } },
  // vista frontal: braço reaproveitado como segunda perna (abre/fecha)
  abducao:    { chao: 88,
    A: { ca: [50, 26], om: [50, 38], co: [46, 70], ma: [45, 85], qu: [50, 56], jo: [54, 70], pe: [55, 85] },
    B: { ca: [50, 26], om: [50, 38], co: [39, 68], ma: [36, 82], qu: [50, 56], jo: [61, 68], pe: [64, 82] } },
};
ANIMS.aducao = { chao: 88, A: ANIMS.abducao.B, B: ANIMS.abducao.A };

// exercício → animação (padrões de movimento compartilhados)
const EX_ANIM = {
  supino_reto: 'press', supino_halteres: 'press', supino_inclinado: 'press', supino_declinado: 'press',
  crucifixo: 'press', crossover: 'press', pullover: 'press', flexao: 'flexao', paralelas: 'flexao',
  puxada_frontal: 'puxada', barra_fixa: 'barrafixa',
  remada_curvada: 'remada', remada_baixa: 'remada', remada_maquina: 'remada', serrote: 'remada', crucifixo_inverso: 'remada',
  levantamento_terra: 'hinge', stiff: 'hinge', hiperextensao: 'hinge',
  encolhimento: 'encolhe', desenvolvimento: 'desenv', desenv_maquina: 'desenv',
  elevacao_lateral: 'elevacao', elevacao_frontal: 'elevacao', remada_alta: 'remada_alta',
  rosca_direta: 'rosca', rosca_alternada: 'rosca', rosca_martelo: 'rosca', rosca_scott: 'rosca', rosca_punho: 'rosca',
  triceps_pulley: 'triceps', triceps_testa: 'triceps', triceps_frances: 'triceps',
  agachamento: 'agacha', agachamento_smith: 'agacha', hack: 'agacha', bulgaro: 'afundo', afundo: 'afundo',
  leg_press: 'legpress', extensora: 'extensora', flexora: 'flexora', elevacao_pelvica: 'hipthrust',
  abdutora: 'abducao', adutora: 'aducao', panturrilha_pe: 'panturrilha', panturrilha_sentado: 'panturrilha',
  abdominal: 'crunch', prancha: 'prancha', elevacao_pernas: 'legraise',
};

const EXERCICIOS = [
  // Peito
  { id: 'supino_reto',        cat: 'Peito',  nome: 'Supino reto (barra)',        musculos: { peito: .60, triceps: .25, ombros: .15 } },
  { id: 'supino_halteres',    cat: 'Peito',  nome: 'Supino reto (halteres)',     musculos: { peito: .60, triceps: .20, ombros: .20 } },
  { id: 'supino_inclinado',   cat: 'Peito',  nome: 'Supino inclinado',           musculos: { peito: .55, ombros: .25, triceps: .20 } },
  { id: 'supino_declinado',   cat: 'Peito',  nome: 'Supino declinado',           musculos: { peito: .65, triceps: .25, ombros: .10 } },
  { id: 'crucifixo',          cat: 'Peito',  nome: 'Crucifixo / peck deck',      musculos: { peito: .85, ombros: .15 } },
  { id: 'crossover',          cat: 'Peito',  nome: 'Crossover (polia)',          musculos: { peito: .85, ombros: .15 } },
  { id: 'flexao',             cat: 'Peito',  nome: 'Flexão de braço',            musculos: { peito: .55, triceps: .25, ombros: .15, abdomen: .05 } },
  { id: 'paralelas',          cat: 'Peito',  nome: 'Mergulho nas paralelas',     musculos: { triceps: .50, peito: .35, ombros: .15 } },
  { id: 'pullover',           cat: 'Peito',  nome: 'Pullover',                   musculos: { costas: .45, peito: .40, triceps: .15 } },
  // Costas
  { id: 'puxada_frontal',     cat: 'Costas', nome: 'Puxada frontal (pulley)',    musculos: { costas: .65, biceps: .25, ombros: .10 } },
  { id: 'barra_fixa',         cat: 'Costas', nome: 'Barra fixa',                 musculos: { costas: .60, biceps: .25, antebraco: .10, abdomen: .05 } },
  { id: 'remada_curvada',     cat: 'Costas', nome: 'Remada curvada',             musculos: { costas: .55, biceps: .20, trapezio: .15, lombar: .10 } },
  { id: 'remada_baixa',       cat: 'Costas', nome: 'Remada baixa (polia)',       musculos: { costas: .60, biceps: .25, trapezio: .15 } },
  { id: 'remada_maquina',     cat: 'Costas', nome: 'Remada máquina',             musculos: { costas: .65, biceps: .20, trapezio: .15 } },
  { id: 'serrote',            cat: 'Costas', nome: 'Remada unilateral (serrote)',musculos: { costas: .60, biceps: .20, trapezio: .10, lombar: .10 } },
  { id: 'levantamento_terra', cat: 'Costas', nome: 'Levantamento terra',         musculos: { lombar: .25, gluteos: .25, posteriores: .25, costas: .10, trapezio: .10, quadriceps: .05 } },
  { id: 'hiperextensao',      cat: 'Costas', nome: 'Hiperextensão lombar',       musculos: { lombar: .60, gluteos: .25, posteriores: .15 } },
  { id: 'encolhimento',       cat: 'Costas', nome: 'Encolhimento de ombros',     musculos: { trapezio: .90, antebraco: .10 } },
  // Ombros
  { id: 'desenvolvimento',    cat: 'Ombros', nome: 'Desenvolvimento (militar)',  musculos: { ombros: .65, triceps: .25, trapezio: .10 } },
  { id: 'desenv_maquina',     cat: 'Ombros', nome: 'Desenvolvimento máquina',    musculos: { ombros: .70, triceps: .25, trapezio: .05 } },
  { id: 'elevacao_lateral',   cat: 'Ombros', nome: 'Elevação lateral',           musculos: { ombros: .90, trapezio: .10 } },
  { id: 'elevacao_frontal',   cat: 'Ombros', nome: 'Elevação frontal',           musculos: { ombros: .90, trapezio: .10 } },
  { id: 'crucifixo_inverso',  cat: 'Ombros', nome: 'Crucifixo inverso',          musculos: { ombros: .60, costas: .20, trapezio: .20 } },
  { id: 'remada_alta',        cat: 'Ombros', nome: 'Remada alta',                musculos: { trapezio: .50, ombros: .40, biceps: .10 } },
  // Braços
  { id: 'rosca_direta',       cat: 'Braços', nome: 'Rosca direta (barra)',       musculos: { biceps: .80, antebraco: .20 } },
  { id: 'rosca_alternada',    cat: 'Braços', nome: 'Rosca alternada (halteres)', musculos: { biceps: .80, antebraco: .20 } },
  { id: 'rosca_martelo',      cat: 'Braços', nome: 'Rosca martelo',              musculos: { biceps: .60, antebraco: .40 } },
  { id: 'rosca_scott',        cat: 'Braços', nome: 'Rosca Scott',                musculos: { biceps: .90, antebraco: .10 } },
  { id: 'triceps_pulley',     cat: 'Braços', nome: 'Tríceps pulley / corda',     musculos: { triceps: .95, antebraco: .05 } },
  { id: 'triceps_testa',      cat: 'Braços', nome: 'Tríceps testa',              musculos: { triceps: 1 } },
  { id: 'triceps_frances',    cat: 'Braços', nome: 'Tríceps francês',            musculos: { triceps: 1 } },
  { id: 'rosca_punho',        cat: 'Braços', nome: 'Rosca de punho',             musculos: { antebraco: 1 } },
  // Pernas
  { id: 'agachamento',        cat: 'Pernas', nome: 'Agachamento livre',          musculos: { quadriceps: .45, gluteos: .30, posteriores: .10, lombar: .10, abdomen: .05 } },
  { id: 'agachamento_smith',  cat: 'Pernas', nome: 'Agachamento no Smith',       musculos: { quadriceps: .50, gluteos: .30, posteriores: .10, lombar: .10 } },
  { id: 'hack',               cat: 'Pernas', nome: 'Hack squat',                 musculos: { quadriceps: .55, gluteos: .25, posteriores: .20 } },
  { id: 'leg_press',          cat: 'Pernas', nome: 'Leg press',                  musculos: { quadriceps: .55, gluteos: .30, posteriores: .15 } },
  { id: 'extensora',          cat: 'Pernas', nome: 'Cadeira extensora',          musculos: { quadriceps: 1 } },
  { id: 'flexora',            cat: 'Pernas', nome: 'Cadeira / mesa flexora',     musculos: { posteriores: .90, panturrilha: .10 } },
  { id: 'stiff',              cat: 'Pernas', nome: 'Stiff',                      musculos: { posteriores: .50, gluteos: .30, lombar: .20 } },
  { id: 'afundo',             cat: 'Pernas', nome: 'Afundo / avanço',            musculos: { quadriceps: .40, gluteos: .40, posteriores: .15, panturrilha: .05 } },
  { id: 'bulgaro',            cat: 'Pernas', nome: 'Agachamento búlgaro',        musculos: { quadriceps: .40, gluteos: .40, posteriores: .20 } },
  { id: 'elevacao_pelvica',   cat: 'Pernas', nome: 'Elevação pélvica (hip thrust)', musculos: { gluteos: .70, posteriores: .25, lombar: .05 } },
  { id: 'abdutora',           cat: 'Pernas', nome: 'Cadeira abdutora',           musculos: { gluteos: 1 } },
  { id: 'adutora',            cat: 'Pernas', nome: 'Cadeira adutora',            musculos: { adutores: 1 } },
  { id: 'panturrilha_pe',     cat: 'Pernas', nome: 'Panturrilha em pé',          musculos: { panturrilha: 1 } },
  { id: 'panturrilha_sentado',cat: 'Pernas', nome: 'Panturrilha sentado',        musculos: { panturrilha: 1 } },
  // Core
  { id: 'abdominal',          cat: 'Core',   nome: 'Abdominal (crunch / máquina)', musculos: { abdomen: 1 } },
  { id: 'prancha',            cat: 'Core',   nome: 'Prancha (reps = segundos)',  musculos: { abdomen: .70, lombar: .20, ombros: .10 } },
  { id: 'elevacao_pernas',    cat: 'Core',   nome: 'Elevação de pernas',         musculos: { abdomen: .90, quadriceps: .10 } },
];
