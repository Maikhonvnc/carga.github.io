/* Carga — Plano alimentar (do PDF da nutricionista) e tabela de alimentos.
   Macros por 100 g como o alimento é comido (cozido/pronto), da TACO; whey, pasta de amendoim,
   Rap10, goma de tapioca e requeijão light pela média dos rótulos; macarrão e tilápia pela USDA.
   un: 'g' (gramas), 'ml' ou 'un' (unidades de gUn gramas).
   f: quanto se compra por unidade comida (arroz 0,4 = 100 g cozido sai de 40 g cru; carne 1,33 = perde 25%;
      fruta com casca > 1). Sem f = 1. */
'use strict';

const META_AGUA = 2100; // ml por dia
const SECOES_NUT = ['Hortifruti', 'Frutas', 'Carnes', 'Padaria', 'Mercearia', 'Ovos e laticínios', 'Suplementos'];

const ALIMENTOS = {
  arroz:      { nome: 'Arroz branco', sec: 'Mercearia', un: 'g', m: [128, 2.5, 28.1, 0.2], f: 0.4 },
  feijao:     { nome: 'Feijão carioca', sec: 'Mercearia', un: 'g', m: [76, 4.8, 13.6, 0.5], f: 0.42 },
  macarrao:   { nome: 'Macarrão', sec: 'Mercearia', un: 'g', m: [158, 5.8, 30.9, 0.9], f: 0.44 },
  milho:      { nome: 'Milho verde', sec: 'Mercearia', un: 'g', m: [98, 3.2, 17.1, 2.4] },
  tapioca:    { nome: 'Goma de tapioca', sec: 'Mercearia', un: 'g', m: [240, 0, 59, 0] },
  aveia:      { nome: 'Aveia em flocos', sec: 'Mercearia', un: 'g', m: [394, 13.9, 66.6, 8.5] },
  amendoim:   { nome: 'Pasta de amendoim', sec: 'Mercearia', un: 'g', m: [588, 25, 20, 50] },
  cafe:       { nome: 'Café', nomeCompra: 'Café em pó', sec: 'Mercearia', un: 'ml', m: [9, 0.7, 1.5, 0.1], f: 0.05 },

  frango:     { nome: 'Filé de frango', sec: 'Carnes', un: 'g', m: [159, 32, 0, 2.5], f: 1.33 },
  patinho:    { nome: 'Patinho', sec: 'Carnes', un: 'g', m: [219, 35.9, 0, 7.3], f: 1.33 },
  alcatra:    { nome: 'Alcatra', sec: 'Carnes', un: 'g', m: [241, 31.9, 0, 11.6], f: 1.33 },
  coxao:      { nome: 'Coxão mole', sec: 'Carnes', un: 'g', m: [219, 32.4, 0, 8.9], f: 1.33 },
  mignon:     { nome: 'Filé mignon', sec: 'Carnes', un: 'g', m: [220, 32.8, 0, 8.8], f: 1.33 },
  tilapia:    { nome: 'Filé de tilápia', sec: 'Carnes', un: 'g', m: [128, 26.2, 0, 2.7], f: 1.33 },
  figado:     { nome: 'Fígado bovino', sec: 'Carnes', un: 'g', m: [225, 29.9, 4.2, 9], f: 1.33 },
  acem:       { nome: 'Acém', sec: 'Carnes', un: 'g', m: [212, 26.7, 0, 10.9], f: 1.33 },

  pao_frances:{ nome: 'Pão francês', sec: 'Padaria', un: 'un', gUn: 50, m: [300, 8, 58.6, 3.1] },
  pao_forma:  { nome: 'Pão de forma', sec: 'Padaria', un: 'un', gUn: 20, nu: 'fatias', m: [253, 12, 44.1, 2.7] },
  pao_queijo: { nome: 'Pão de queijo pequeno', sec: 'Padaria', un: 'un', gUn: 20, m: [363, 5.1, 34.2, 24.6] },
  rap10:      { nome: 'Rap10', sec: 'Padaria', un: 'un', gUn: 40, m: [290, 7.8, 52.5, 5.5], pac: [10, 'pacote', 'pacotes'] },

  ovo:        { nome: 'Ovo', sec: 'Ovos e laticínios', un: 'un', gUn: 50, m: [146, 13.3, 0.6, 9.5], pac: [12, 'dúzia', 'dúzias'] },
  requeijao:  { nome: 'Requeijão light', sec: 'Ovos e laticínios', un: 'g', m: [185, 11, 3.5, 14] },

  whey:       { nome: 'Whey protein', sec: 'Suplementos', un: 'g', m: [400, 80, 10, 5] },

  banana:     { nome: 'Banana nanica', sec: 'Frutas', un: 'un', gUn: 60, m: [92, 1.4, 23.8, 0.1] },
  mamao:      { nome: 'Mamão formosa', sec: 'Frutas', un: 'g', m: [45, 0.8, 11.6, 0.1], f: 1.4 },
  melao:      { nome: 'Melão', sec: 'Frutas', un: 'g', m: [29, 0.7, 7.5, 0], f: 1.5 },
  melancia:   { nome: 'Melancia', sec: 'Frutas', un: 'g', m: [33, 0.9, 8.1, 0], f: 1.6 },
  abacaxi:    { nome: 'Abacaxi', sec: 'Frutas', un: 'g', m: [48, 0.9, 12.3, 0.1], f: 1.7 },
  ameixa:     { nome: 'Ameixa', sec: 'Frutas', un: 'un', gUn: 35, m: [53, 0.8, 13.9, 0] },
  laranja:    { nome: 'Laranja', sec: 'Frutas', un: 'un', gUn: 150, m: [37, 1, 8.9, 0.1] },
  maca:       { nome: 'Maçã', sec: 'Frutas', un: 'un', gUn: 130, m: [56, 0.3, 15.2, 0] },
  pera:       { nome: 'Pêra', sec: 'Frutas', un: 'un', gUn: 150, m: [53, 0.6, 14, 0.1] },
  mexerica:   { nome: 'Mexerica', sec: 'Frutas', un: 'un', gUn: 120, m: [38, 0.8, 9.6, 0.1] },

  // à vontade: av = quantidade estimada por refeição (você corrige pesando)
  folhas:     { nome: 'Folhas (alface, rúcula…)', sec: 'Hortifruti', un: 'g', m: [11, 1.3, 1.7, 0.2], av: 40 },
  tomate:     { nome: 'Tomate', sec: 'Hortifruti', un: 'g', m: [15, 1.1, 3.1, 0.2], av: 60 },
  cenoura:    { nome: 'Cenoura', sec: 'Hortifruti', un: 'g', m: [30, 0.8, 6.7, 0.2], av: 60 },
  chuchu:     { nome: 'Chuchu', sec: 'Hortifruti', un: 'g', m: [19, 0.4, 4.8, 0], av: 60 },
  brocolis:   { nome: 'Brócolis', sec: 'Hortifruti', un: 'g', m: [25, 2.1, 4.4, 0.5], av: 80 },
  couve_flor: { nome: 'Couve-flor', sec: 'Hortifruti', un: 'g', m: [19, 1.2, 3.9, 0.3], av: 80 },
  abobrinha:  { nome: 'Abobrinha', sec: 'Hortifruti', un: 'g', m: [15, 1.1, 3, 0.2], av: 80 },
  beterraba:  { nome: 'Beterraba', sec: 'Hortifruti', un: 'g', m: [32, 1.3, 7.2, 0.1], av: 60 },
  batata_doce:{ nome: 'Batata doce', sec: 'Hortifruti', un: 'g', m: [77, 0.6, 18.4, 0.1] },
  batata:     { nome: 'Batata inglesa', sec: 'Hortifruti', un: 'g', m: [52, 1.2, 11.9, 0] },
  mandioca:   { nome: 'Mandioca', sec: 'Hortifruti', un: 'g', m: [125, 0.6, 30.1, 0.3], f: 1.1 },
};

// itens com escolha: a opção diz o grupo, você escolhe qual alimento (q do item vale para todos)
const ESCOLHAS = {
  carne: { nome: 'Carne', ops: ['frango', 'patinho', 'alcatra', 'coxao', 'mignon', 'tilapia', 'figado'] },
  moida: { nome: 'Carne moída', ops: ['patinho', 'coxao', 'acem'] },
  pao:   { nome: 'Pão', ops: [{ a: 'pao_frances', q: 1 }, { a: 'pao_forma', q: 2 }] },
  fruta: { nome: 'Fruta', ops: [{ a: 'maca', q: 1 }, { a: 'pera', q: 1 }, { a: 'laranja', q: 1 }, { a: 'mexerica', q: 1 }, { a: 'ameixa', q: 3 },
    { a: 'melancia', q: 100 }, { a: 'melao', q: 100 }, { a: 'mamao', q: 100 }, { a: 'abacaxi', q: 100 }] },
};

const av = a => ({ a, av: true });
const REFEICOES = [
  { id: 'cafe', nome: 'Café da manhã', hora: '08:30', ops: [
    { nome: 'Pão com ovos mexidos', itens: [{ esc: 'pao' }, { a: 'ovo', q: 2 }, { a: 'mamao', q: 100 }, { a: 'cafe', q: 200 }] },
    { nome: 'Crepioca com requeijão', itens: [{ a: 'tapioca', q: 30 }, { a: 'ovo', q: 2 }, { a: 'requeijao', q: 15 }, { a: 'melao', q: 100 }, { a: 'cafe', q: 200 }] },
    { nome: 'Pão com frango desfiado', itens: [{ esc: 'pao' }, { a: 'frango', q: 50 }, { a: 'ameixa', q: 3 }, { a: 'cafe', q: 200 }] },
    { nome: 'Pão de queijo com ovos', itens: [{ a: 'pao_queijo', q: 3 }, { a: 'ovo', q: 2 }, { a: 'pera', q: 1 }, { a: 'cafe', q: 200 }] },
  ] },
  { id: 'colacao', nome: 'Colação', hora: '10:00', ops: [
    { nome: 'Whey com banana', itens: [{ a: 'whey', q: 30 }, { a: 'banana', q: 1 }] },
  ] },
  { id: 'almoco', nome: 'Almoço', hora: '13:00', ops: [
    { nome: 'Arroz, feijão e carne', itens: [av('folhas'), av('tomate'), av('cenoura'), av('chuchu'), { a: 'arroz', q: 180 }, { a: 'feijao', q: 80 }, { esc: 'carne', q: 150 }] },
    { nome: 'Batata doce e carne', itens: [av('folhas'), av('tomate'), av('brocolis'), av('couve_flor'), { a: 'batata_doce', q: 180 }, { esc: 'carne', q: 150 }] },
    { nome: 'Macarrão com carne moída', itens: [av('folhas'), av('tomate'), av('abobrinha'), { a: 'macarrao', q: 180 }, { esc: 'moida', q: 150 }] },
    { nome: 'Batata, milho e carne', itens: [av('folhas'), av('tomate'), av('beterraba'), { a: 'milho', q: 100 }, { a: 'batata', q: 210 }, { esc: 'carne', q: 150 }] },
  ] },
  { id: 'sobremesa', nome: 'Sobremesa', hora: 'após o almoço', ops: [
    { nome: 'Fruta', itens: [{ esc: 'fruta' }] },
  ] },
  { id: 'pre', nome: 'Pré-treino', hora: '1 h antes do treino', ops: [
    { nome: 'Whey com banana, aveia e pasta de amendoim', itens: [{ a: 'whey', q: 30 }, { a: 'banana', q: 1 }, { a: 'aveia', q: 30 }, { a: 'amendoim', q: 25 }] },
  ] },
  { id: 'jantar', nome: 'Jantar', hora: '20:30', ops: [
    { nome: 'Sanduíche de Rap10', itens: [{ a: 'rap10', q: 2 }, { esc: 'carne', q: 180 }, av('folhas'), av('tomate')] },
    { nome: 'Mandioca e carne', itens: [av('folhas'), av('tomate'), { a: 'mandioca', q: 180 }, { esc: 'carne', q: 180 }] },
    { nome: 'Arroz, feijão e carne', itens: [av('folhas'), av('tomate'), { a: 'arroz', q: 180 }, { a: 'feijao', q: 80 }, { esc: 'carne', q: 180 }] },
    { nome: 'Macarrão com carne moída', itens: [av('folhas'), av('tomate'), { a: 'macarrao', q: 180 }, { esc: 'moida', q: 180 }] },
  ] },
];
