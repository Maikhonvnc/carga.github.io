/* Carga — Alimentos comuns, para registrar o que você comeu fora das opções do plano.
   Cada grupo (Ovo, Arroz, Frango…) tem os preparos mais usados e medidas caseiras em gramas.
   Macros por 100 g como se come (pronto), aproximados da TACO; os que a TACO não traz (ovo mexido,
   omelete, pizza) pela USDA. Valores de referência: o rótulo ou a balança sempre ganham.
   Item: [id, preparo] usa um alimento que já existe em dieta.js; [id, preparo, {m, un?, gUn?, base?}] cria um novo.
   base: alimento do estoque que esse preparo consome (ovo frito tira ovo; arroz integral não tira arroz branco). */
'use strict';

const COMUNS = [
  { id: 'ovo', nome: 'Ovo', itens: [
    ['ovo', 'Cozido'],
    ['ovo_frito', 'Frito', { nome: 'Ovo frito', m: [240, 15.6, 1.2, 18.6], un: 'un', gUn: 50, base: 'ovo' }],
    ['ovo_mexido', 'Mexido', { nome: 'Ovo mexido', m: [149, 10, 1.6, 11], un: 'un', gUn: 50, base: 'ovo' }],
    ['ovo_omelete', 'Omelete', { nome: 'Omelete', m: [154, 10.6, 0.6, 11.7], un: 'un', gUn: 50, base: 'ovo' }],
    ['ovo_poche', 'Pochê', { nome: 'Ovo pochê', m: [143, 12.5, 0.7, 9.5], un: 'un', gUn: 50, base: 'ovo' }],
  ] },
  { id: 'arroz', nome: 'Arroz', medidas: [['1 colher de sopa', 25], ['1 escumadeira', 90]], itens: [
    ['arroz', 'Branco'],
    ['arroz_integral', 'Integral', { nome: 'Arroz integral', m: [124, 2.6, 25.8, 1] }],
  ] },
  { id: 'feijao', nome: 'Feijão', medidas: [['1 concha', 100], ['1 colher de sopa', 20]], itens: [
    ['feijao', 'Carioca'],
    ['feijao_preto', 'Preto', { nome: 'Feijão preto', m: [77, 4.5, 14, 0.5] }],
    ['feijao_tropeiro', 'Tropeiro', { nome: 'Feijão tropeiro', m: [152, 10.2, 19.6, 6.8] }],
    ['feijoada', 'Feijoada', { m: [117, 8.7, 11.6, 6.5] }],
  ] },
  { id: 'massa', nome: 'Macarrão', medidas: [['1 pegador', 110], ['1 prato raso', 220]], itens: [
    ['macarrao', 'Cozido'],
    ['macarrao_molho', 'Ao molho de tomate', { nome: 'Macarrão ao molho', m: [132, 4.4, 24.4, 1.9], base: 'macarrao' }],
    ['lasanha', 'Lasanha', { m: [165, 9.3, 15.8, 7.2] }],
  ] },
  { id: 'frango', nome: 'Frango', medidas: [['1 filé médio', 120], ['1 coxa', 90]], itens: [
    ['frango', 'Peito grelhado'],
    ['frango_cozido', 'Peito cozido/desfiado', { nome: 'Frango cozido/desfiado', m: [163, 31.5, 0, 3.2], base: 'frango' }],
    ['frango_milanesa', 'Empanado (milanesa)', { nome: 'Frango empanado', m: [221, 28.5, 7.5, 7.8], base: 'frango' }],
    ['frango_coxa', 'Coxa assada com pele', { nome: 'Coxa de frango assada', m: [215, 28.5, 0.1, 10.4] }],
  ] },
  { id: 'boi', nome: 'Carne bovina', medidas: [['1 bife médio', 100], ['1 colher de sopa (moída)', 30]], itens: [
    ['patinho', 'Patinho grelhado'],
    ['alcatra', 'Alcatra grelhada'],
    ['acem', 'Moída refogada'],
    ['carne_panela', 'Carne de panela', { m: [194, 31.2, 0, 6.7] }],
    ['picanha', 'Picanha grelhada', { m: [289, 26.4, 0, 19.5] }],
    ['bife_milanesa', 'Bife à milanesa', { m: [352, 20.6, 12.2, 24] }],
  ] },
  { id: 'peixe', nome: 'Peixe', medidas: [['1 filé', 120], ['1 lata (drenada)', 120]], itens: [
    ['tilapia', 'Tilápia grelhada'],
    ['atum', 'Atum em lata', { m: [166, 26.2, 0, 6] }],
    ['sardinha', 'Sardinha em lata', { m: [285, 15.9, 0, 24] }],
  ] },
  { id: 'porco', nome: 'Porco e frios', medidas: [['1 gomo', 60], ['1 fatia', 15]], itens: [
    ['linguica', 'Linguiça grelhada', { m: [296, 23.2, 0, 21.9] }],
    ['presunto', 'Presunto', { m: [94, 14.3, 2.1, 2.7] }],
    ['peito_peru', 'Peito de peru', { m: [100, 18, 2, 2] }],
  ] },
  { id: 'batata', nome: 'Batata e raízes', medidas: [['1 unidade média', 140], ['1 porção de fritas', 100]], itens: [
    ['batata', 'Batata cozida'],
    ['batata_frita', 'Batata frita', { m: [267, 5, 35.6, 13.1] }],
    ['pure', 'Purê de batata', { m: [89, 1.9, 13.5, 3.1] }],
    ['batata_doce', 'Batata doce cozida'],
    ['mandioca', 'Mandioca cozida'],
    ['mandioca_frita', 'Mandioca frita', { m: [300, 1.4, 50.2, 11.2] }],
    ['cuscuz', 'Cuscuz de milho', { m: [113, 2.2, 25.3, 0.7] }],
  ] },
  { id: 'paes', nome: 'Pães', itens: [
    ['pao_frances', 'Francês'],
    ['pao_forma', 'De forma'],
    ['pao_integral', 'Integral', { nome: 'Pão integral', m: [253, 9.4, 49.9, 3.7], un: 'un', gUn: 25, nu: 'fatias' }],
    ['pao_queijo', 'Pão de queijo'],
    ['tapioca', 'Tapioca (goma)'],
    ['rap10', 'Rap10'],
  ] },
  { id: 'leite', nome: 'Leite e queijos', medidas: [['1 copo (200 ml)', 200], ['1 fatia', 20], ['1 pote', 170]], itens: [
    ['leite', 'Leite integral', { m: [61, 2.9, 4.3, 3.3], un: 'ml' }],
    ['leite_desnatado', 'Leite desnatado', { m: [35, 3.4, 4.9, 0.2], un: 'ml' }],
    ['mussarela', 'Queijo mussarela', { m: [330, 22.6, 3, 25.2] }],
    ['minas', 'Queijo minas frescal', { m: [264, 17.4, 3.2, 20.2] }],
    ['requeijao', 'Requeijão light'],
    ['iogurte', 'Iogurte natural', { m: [51, 4.1, 1.9, 3] }],
  ] },
  { id: 'frutas', nome: 'Frutas', itens: [
    ['banana', 'Banana'], ['maca', 'Maçã'], ['mamao', 'Mamão'], ['laranja', 'Laranja'], ['mexerica', 'Mexerica'],
    ['manga', 'Manga', { m: [72, 0.4, 19.4, 0.2], un: 'un', gUn: 200 }],
    ['uva', 'Uva', { m: [53, 0.7, 13.6, 0.2] }],
    ['morango', 'Morango', { m: [30, 0.9, 6.8, 0.3] }],
    ['abacate', 'Abacate', { m: [96, 1.2, 6, 8.4] }],
    ['melancia', 'Melancia'], ['abacaxi', 'Abacaxi'],
  ] },
  { id: 'salada', nome: 'Salada e legumes', medidas: [['1 prato de salada', 80], ['1 colher de sopa', 15]], itens: [
    ['folhas', 'Folhas'], ['tomate', 'Tomate'], ['cenoura', 'Cenoura'], ['brocolis', 'Brócolis'],
    ['chuchu', 'Chuchu'], ['abobrinha', 'Abobrinha'], ['beterraba', 'Beterraba'],
  ] },
  { id: 'gordura', nome: 'Óleos e doces', medidas: [['1 colher de sopa', 10], ['1 colher de chá', 5]], itens: [
    ['azeite', 'Azeite', { m: [884, 0, 0, 100] }],
    ['manteiga', 'Manteiga', { m: [726, 0.4, 0, 82.4] }],
    ['acucar', 'Açúcar', { m: [387, 0.3, 99.5, 0] }],
    ['mel', 'Mel', { m: [309, 0, 84, 0] }],
    ['amendoim', 'Pasta de amendoim'],
    ['chocolate', 'Chocolate ao leite', { m: [540, 7.2, 59.6, 30.3] }],
  ] },
  { id: 'lanches', nome: 'Lanches', medidas: [['1 fatia de pizza', 100], ['1 tigela de açaí', 300]], itens: [
    ['pizza', 'Pizza de mussarela', { m: [266, 11.4, 33, 9.7] }],
    ['coxinha', 'Coxinha', { m: [283, 9.6, 34.5, 11.8], un: 'un', gUn: 80 }],
    ['pastel', 'Pastel de queijo', { m: [422, 8.7, 36.7, 27.2], un: 'un', gUn: 80 }],
    ['hamburguer', 'Hambúrguer (sanduíche)', { m: [254, 13.5, 26, 10.4], un: 'un', gUn: 150 }],
    ['acai', 'Açaí com xarope', { m: [110, 0.7, 21.5, 3.7] }],
  ] },
  { id: 'bebidas', nome: 'Bebidas', medidas: [['1 copo', 250], ['1 lata', 350]], itens: [
    ['suco_laranja', 'Suco de laranja', { m: [37, 0.6, 8.5, 0.1], un: 'ml' }],
    ['refrigerante', 'Refrigerante', { m: [42, 0, 10.6, 0], un: 'ml' }],
    ['refri_zero', 'Refrigerante zero', { m: [0, 0, 0, 0], un: 'ml' }],
    ['cerveja', 'Cerveja', { m: [41, 0.3, 3.3, 0], un: 'ml' }],
    ['cafe', 'Café sem açúcar'],
  ] },
];

// registra os preparos novos na tabela de alimentos e marca o grupo de cada um (a busca abre a escolha de porção)
const comumMap = {};
for (const g of COMUNS) for (const [id, preparo, def] of g.itens) {
  if (def) ALIMENTOS[id] = { nome: preparo, sec: def.base ? ALIMENTOS[def.base].sec : 'Mercearia', un: 'g', ...def, comum: true };
  if (!ALIMENTOS[id]) throw new Error(`alimento comum sem cadastro: ${id}`);
  comumMap[id] = comumMap[id] || { g, preparo };
}
