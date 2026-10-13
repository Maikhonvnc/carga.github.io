/* Carga — Nutrição: produtos (estilo Desrotulando). Nota 0–100, nível de processamento (NOVA),
   alertas da lupa (RDC 429), aditivos de atenção, comparação lado a lado e alternativas no Open Food Facts.
   Vale para os alimentos que você cadastrou (código de barras, foto da tabela ou à mão). */
'use strict';

const OFF_BUSCA = 'https://world.openfoodfacts.org/api/v2/search';
const OFF_CAMPOS = 'code,product_name,brands,nutriments,serving_quantity,nova_group,additives_tags,ingredients_text_pt,ingredients_text,categories_tags,product_quantity';
const NOVA = { 1: 'In natura ou minimamente processado', 2: 'Ingrediente culinário', 3: 'Processado', 4: 'Ultraprocessado' };
// aditivos que costumam pedir atenção (nome em português); os demais só entram na contagem
const ADITIVOS_ATENCAO = {
  e102: 'tartrazina', e110: 'amarelo crepúsculo', e129: 'vermelho 40', e150d: 'caramelo IV', e171: 'dióxido de titânio',
  e211: 'benzoato de sódio', e220: 'dióxido de enxofre', e250: 'nitrito de sódio', e251: 'nitrato de sódio', e252: 'nitrato de potássio',
  e320: 'BHA', e321: 'BHT', e338: 'ácido fosfórico', e407: 'carragena', e621: 'glutamato monossódico',
  e950: 'acessulfame K', e951: 'aspartame', e954: 'sacarina', e955: 'sucralose',
};

// produto do Open Food Facts → alimento do app (macros e extras por 100 g)
function alimentoDoOFF(p, codigo) {
  const n = p.nutriments || {}, r1 = x => x == null || x === '' || isNaN(x) ? null : Math.round(+x * 10) / 10;
  return {
    codigo: codigo || p.code,
    nome: [p.product_name, p.brands && p.brands.split(',')[0]].filter(Boolean).join(' · '),
    porcao: p.serving_quantity ? r1(p.serving_quantity) : '',
    pacote: p.product_quantity ? r1(p.product_quantity) : null, // peso da embalagem (g)
    kcal: r1(n['energy-kcal_100g']), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), g: r1(n.fat_100g),
    info: {
      nova: p.nova_group || null,
      acucar: r1(n.sugars_100g), satur: r1(n['saturated-fat_100g']), fibra: r1(n.fiber_100g),
      sodio: n.sodium_100g == null ? null : Math.round(n.sodium_100g * 1000),
      aditivos: (p.additives_tags || []).map(t => t.replace(/^en:/, '')),
      ing: p.ingredients_text_pt || p.ingredients_text || '',
      cats: p.categories_tags || [],
    },
  };
}

// nota 0–100 no espírito do Nutri-Score (energia, açúcar, gordura saturada e sódio pesam contra;
// proteína e fibra a favor), ajustada pelo processamento e pelos aditivos de atenção
function notaProduto(m, info = {}) {
  const [kcalV = 0, prot = 0] = m;
  const pts = (v, passo, max) => v == null ? 0 : Math.min(max, Math.floor(v / passo));
  const neg = pts(kcalV * 4.184, 335, 10) + pts(info.acucar, 3.4, 15) + pts(info.satur, 1, 10) + pts(info.sodio == null ? null : info.sodio * 2.5 / 1000, 0.2, 20);
  const pos = pts(prot, 2.4, 7) + pts(info.fibra, 3, 5);
  let nota = 80 - 2 * (neg - pos);
  nota += { 1: 5, 3: -5, 4: -15 }[info.nova] || 0;
  nota -= Math.min(15, 5 * aditivosAtencao(info).length);
  const parcial = info.acucar == null || info.satur == null || info.sodio == null;
  return { nota: Math.max(0, Math.min(100, Math.round(nota))), parcial };
}
const aditivosAtencao = info => (info.aditivos || []).filter(a => ADITIVOS_ATENCAO[a]);
const faixaNota = n => n >= 75 ? { nome: 'Ótimo', cls: 'ok' } : n >= 50 ? { nome: 'Bom', cls: 'atencao' } : n >= 25 ? { nome: 'Ruim', cls: 'serio' } : { nome: 'Evite', cls: 'critico' };
const tagNota = (n, grande) => { const f = faixaNota(n); return `<span class="tag tag-${f.cls}${grande ? ' nut-nota' : ''}">${n}${grande ? ` · ${f.nome}` : ''}</span>`; };

// lupa frontal (RDC 429/2020, alimentos sólidos, por 100 g)
function alertasLupa(info = {}) {
  const a = [];
  if (info.acucar >= 15) a.push('Alto em açúcar');
  if (info.satur >= 6) a.push('Alto em gordura saturada');
  if (info.sodio >= 600) a.push('Alto em sódio');
  return a;
}

const produtosIds = () => Object.keys(dieta.custom).filter(a => ALIMENTOS[a]);
const notaDe = a => notaProduto(ALIMENTOS[a].m, ALIMENTOS[a].info).nota;

// resumo curto (nota, processamento, alertas) para o formulário logo depois de escanear
function resumoProduto(m, info) {
  if (!info) return '';
  const { nota, parcial } = notaProduto(m, info), al = alertasLupa(info), ad = aditivosAtencao(info);
  return `<div class="nut-resumo-prod">${tagNota(nota, true)}${parcial ? '<span class="tag">nota parcial</span>' : ''}
    ${info.nova ? `<span class="tag${info.nova === 4 ? ' tag-serio' : ''}">${NOVA[info.nova]}</span>` : ''}
    ${al.map(x => `<span class="tag tag-critico">${ic('warning-fill')}${x}</span>`).join('')}
    ${ad.length ? `<span class="tag tag-atencao">${plural(ad.length, 'aditivo de atenção', 'aditivos de atenção')}</span>` : ''}</div>`;
}

// ---------- tela Produtos ----------
function renderProdutos(el) {
  const ids = produtosIds().sort((a, b) => notaDe(b) - notaDe(a));
  el.innerHTML = `
    <p class="mudo">Escaneie um produto para ver a nota, o nível de processamento e os alertas. Ele fica salvo aqui e na busca de alimentos.</p>
    <div class="linha"><button id="np-escanear">${ic('barcode')}Escanear</button><button class="ghost" id="np-foto">${ic('camera')}Foto da tabela</button></div>
    ${ids.length ? `<div class="lista">${ids.map(a => {
      const al = ALIMENTOS[a], info = al.info || {}, lupa = alertasLupa(info);
      return `<button class="linha-lista" data-prod="${a}">${tagNota(notaDe(a))}
        <span class="ll-txt"><span class="ll-nome">${esc(al.nome)}</span>
        <span class="ll-det">${[info.nova ? NOVA[info.nova] : '', ...lupa].filter(Boolean).join(' · ') || `${kcal(al.m[0])} kcal por 100 g`}</span></span>${ic('caret-right', 'chev')}</button>`;
    }).join('')}</div>` : `<div class="vazio">${ic('barcode')}<span>Nenhum produto ainda. Os que você escanear ou cadastrar aparecem aqui.</span></div>`}`;
  const abrir = a => { renderProdutos(el); abrirFicha(a); };
  $('np-escanear').onclick = () => scannerCodigo(abrir);
  $('np-foto').onclick = () => fotoTabela(abrir);
  el.querySelectorAll('[data-prod]').forEach(b => b.onclick = () => abrirFicha(b.dataset.prod));
}

const linhaNutri = (rot, v, u, ruim) => v == null ? '' : `<div class="nut-ficha-l"><span>${rot}</span><b class="num${ruim ? ' c-critico' : ''}">${num(v)} ${u}</b></div>`;
function abrirFicha(a) {
  const al = ALIMENTOS[a], info = al.info || {}, { nota, parcial } = notaProduto(al.m, info);
  const lupa = alertasLupa(info), ad = info.aditivos || [];
  abrirPainel(`<div class="kicker folha-titulo">Produto</div>
    <h2 class="nut-ficha-nome">${esc(al.nome)}</h2>
    <div class="nut-resumo-prod">${tagNota(nota, true)}${info.nova ? `<span class="tag${info.nova === 4 ? ' tag-serio' : ''}">${NOVA[info.nova]}</span>` : ''}</div>
    ${parcial ? '<p class="mudo">Nota parcial: faltam açúcar, gordura saturada ou sódio no cadastro.</p>' : ''}
    ${lupa.length ? `<div class="nut-lupa">${lupa.map(x => `<span class="nut-lupa-it">${ic('warning-fill')}${x}</span>`).join('')}</div>` : ''}
    <div class="kicker">Por 100 g</div>
    <div class="nut-ficha">
      ${linhaNutri('Calorias', al.m[0], 'kcal')}${linhaNutri('Proteína', al.m[1], 'g')}${linhaNutri('Carboidratos', al.m[2], 'g')}
      ${linhaNutri('Açúcares', info.acucar, 'g', info.acucar >= 15)}${linhaNutri('Gorduras', al.m[3], 'g')}
      ${linhaNutri('Gordura saturada', info.satur, 'g', info.satur >= 6)}${linhaNutri('Fibras', info.fibra, 'g')}${linhaNutri('Sódio', info.sodio, 'mg', info.sodio >= 600)}
    </div>
    ${ad.length ? `<div class="kicker">Aditivos (${ad.length})</div><div class="pills">${ad.map(x => `<span class="pill${ADITIVOS_ATENCAO[x] ? ' nut-ad-atencao' : ''}">${x.toUpperCase()}${ADITIVOS_ATENCAO[x] ? ` · ${ADITIVOS_ATENCAO[x]}` : ''}</span>`).join('')}</div>` : ''}
    ${info.ing ? `<details class="nut-ing"><summary>Ingredientes</summary><p>${esc(info.ing)}</p></details>` : ''}
    <div class="linha"><button class="ghost" id="nf-comparar">Comparar</button><button class="ghost" id="nf-alt">Alternativas</button></div>
    <button class="larga" id="nf-estoque">${ic('package')}Guardar no estoque</button>`);
  $('nf-estoque').onclick = () => ligarProduto(a, [], x => painelQtd(x, { prod: a, direto: true }, renderNutricao));
  $('nf-comparar').onclick = () => escolherComparar(a);
  $('nf-alt').onclick = () => alternativas(a);
}

// ---------- comparar ----------
function escolherComparar(a) {
  const outros = produtosIds().filter(x => x !== a);
  if (!outros.length) return toast('Cadastre outro produto para comparar');
  abrirFolha('Comparar com…', outros.map(x => ({ ic: 'barcode', txt: ALIMENTOS[x].nome, valor: `nota ${notaDe(x)}`, acao: () => comparar(a, x) })));
}
function comparar(a, b) {
  const A = ALIMENTOS[a], B = ALIMENTOS[b], ia = A.info || {}, ib = B.info || {};
  // [rótulo, valor A, valor B, unidade, maior é melhor?]
  const linhas = [
    ['Nota', notaDe(a), notaDe(b), '', true],
    ['Calorias', A.m[0], B.m[0], 'kcal', null], ['Proteína', A.m[1], B.m[1], 'g', true], ['Carboidratos', A.m[2], B.m[2], 'g', null],
    ['Açúcares', ia.acucar, ib.acucar, 'g', false], ['Gorduras', A.m[3], B.m[3], 'g', null], ['Gordura saturada', ia.satur, ib.satur, 'g', false],
    ['Fibras', ia.fibra, ib.fibra, 'g', true], ['Sódio', ia.sodio, ib.sodio, 'mg', false],
    ['Aditivos de atenção', aditivosAtencao(ia).length, aditivosAtencao(ib).length, '', false],
  ];
  const cel = (v, o, u, melhor) => {
    if (v == null) return '<td class="c-3">–</td>';
    const ganha = melhor != null && o != null && v !== o && (melhor ? v > o : v < o);
    return `<td class="num${ganha ? ' c-ok' : ''}">${num(v)}${u ? ` ${u}` : ''}${ganha ? ic('check', 'ic-14') : ''}</td>`;
  };
  abrirPainel(`<div class="kicker folha-titulo">Comparação · por 100 g</div>
    <table class="nut-comp"><thead><tr><th></th><th>${esc(A.nome)}</th><th>${esc(B.nome)}</th></tr></thead><tbody>
    ${linhas.map(([r, va, vb, u, m]) => `<tr><th>${r}</th>${cel(va, vb, u, m)}${cel(vb, va, u, m)}</tr>`).join('')}
    <tr><th>Processamento</th><td>${ia.nova ? NOVA[ia.nova] : '–'}</td><td>${ib.nova ? NOVA[ib.nova] : '–'}</td></tr>
    </tbody></table>
    <button class="ghost larga" id="nc-voltar">Voltar ao ${esc(A.nome)}</button>`);
  $('nc-voltar').onclick = () => abrirFicha(a);
}

// ---------- alternativas (mesma categoria no Open Food Facts, com nota maior) ----------
async function alternativas(a) {
  const al = ALIMENTOS[a], cats = (al.info && al.info.cats) || [], cat = cats[cats.length - 1];
  if (!cat) return abrirPainel(`<div class="kicker folha-titulo">Alternativas</div><p class="mudo">Este produto não tem categoria no Open Food Facts (só os escaneados têm). Escaneie produtos parecidos e use "Comparar".</p>`);
  abrirPainel(`<div class="kicker folha-titulo">Alternativas</div><p class="mudo">Procurando produtos parecidos…</p>`);
  const busca = async pais => {
    const r = await fetch(`${OFF_BUSCA}?categories_tags=${encodeURIComponent(cat)}${pais ? '&countries_tags=en:brazil' : ''}&fields=${OFF_CAMPOS}&page_size=40`);
    return (await r.json()).products || [];
  };
  try {
    let prods = await busca(true);
    if (prods.length < 5) prods = prods.concat(await busca(false));
    const minha = notaDe(a), vistos = new Set([al.codigo]);
    const melhores = prods.map(p => alimentoDoOFF(p)).filter(p => {
      if (p.kcal == null || !p.nome || vistos.has(p.codigo)) return false;
      vistos.add(p.codigo);
      return true;
    }).map(p => ({ ...p, nota: notaProduto([p.kcal, p.p || 0, p.c || 0, p.g || 0], p.info).nota }))
      .filter(p => p.nota > minha).sort((x, y) => y.nota - x.nota).slice(0, 6);
    abrirPainel(`<div class="kicker folha-titulo">Alternativas · nota maior que ${minha}</div>
      ${melhores.length ? `<div class="nut-resultados">${melhores.map((p, i) => `<button class="ll-linha" data-i="${i}"><span>${esc(p.nome)}</span>${tagNota(p.nota)}</button>`).join('')}</div>
        <p class="mudo">Toque para ver o produto e salvar nos seus produtos.</p>` : '<p class="mudo">Não achei nada melhor na mesma categoria. Este já é uma boa escolha entre os cadastrados.</p>'}
      <button class="ghost larga" id="na-voltar">Voltar</button>`);
    $('na-voltar').onclick = () => abrirFicha(a);
    document.querySelectorAll('.nut-resultados [data-i]').forEach(b => b.onclick = () => {
      const p = melhores[+b.dataset.i];
      const ja = porCodigo(p.codigo);
      if (ja) return abrirFicha(ja);
      formAlimento({ ...p, base: '100', aviso: 'Do Open Food Facts. Confira com o rótulo antes de salvar.' }, id => { renderNutricao(); abrirFicha(id); });
    });
  } catch {
    abrirPainel(`<div class="kicker folha-titulo">Alternativas</div><p class="mudo">Não deu para buscar agora. Tente de novo com internet.</p>`);
  }
}
