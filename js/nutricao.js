/* Carga — Nutrição: o dia (o que comeu, macros e água), cardápio da semana, carrinho e estoque. */
'use strict';

// ---------- estado ----------
const LS_DIETA = 'carga.dieta';
// plano[diaDaSemana][refeição] = {op, esc}; diario[dia] = {refs: {ref: registro}, troca: {ref: célula}, agua};
// estoque e fatores na unidade de compra (g cru, un)
const DIETA_PADRAO = () => ({ plano: {}, estoque: {}, diario: {}, fatores: {}, medidas: [], periodo: 'semana' });
let dieta = Object.assign(DIETA_PADRAO(), lerLS(LS_DIETA, {}));
const salvarDieta = () => localStorage.setItem(LS_DIETA, JSON.stringify(dieta));

let nutTela = 'hoje', nutDia = new Date().getDay(), rasc = {}, corpoForm = false;
const refMap = Object.fromEntries(REFEICOES.map(r => [r.id, r]));
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

// ---------- cálculo ----------
const opId = o => typeof o === 'string' ? o : o.a;
const escPadrao = (grupo, ref) => grupo === 'carne' && ref === 'jantar' ? 'patinho' : opId(ESCOLHAS[grupo].ops[0]);
const celPlano = (wd, ref) => (dieta.plano[wd] && dieta.plano[wd][ref]) || { op: 0, esc: {} };
const diaReg = key => dieta.diario[key] || (dieta.diario[key] = { refs: {}, troca: {}, agua: 0 });
function celDoDia(key, ref) {
  const d = dieta.diario[key];
  return (d && d.troca && d.troca[ref]) || celPlano(new Date(key + 'T12:00').getDay(), ref);
}

// itens de uma refeição já resolvidos: [{a, q, av, esc}]
function itensDe(ref, cel) {
  const r = refMap[ref], op = r.ops[cel.op] || r.ops[0];
  return op.itens.map(it => {
    if (!it.esc) return { a: it.a, q: it.q ?? ALIMENTOS[it.a].av ?? 100, av: !!it.av };
    const g = ESCOLHAS[it.esc], id = (cel.esc && cel.esc[it.esc]) || escPadrao(it.esc, ref);
    const o = g.ops.find(x => opId(x) === id) || g.ops[0];
    return { a: opId(o), q: it.q ?? o.q, esc: it.esc };
  });
}

const gramas = (a, q) => ALIMENTOS[a].un === 'un' ? q * ALIMENTOS[a].gUn : q;
function macros(itens) { // [kcal, proteína, carbo, gordura]
  return itens.reduce((t, { a, q }) => {
    const g = gramas(a, q) / 100;
    return t.map((v, i) => v + ALIMENTOS[a].m[i] * g);
  }, [0, 0, 0, 0]);
}
const somaM = (a, b) => a.map((v, i) => v + b[i]);
const unTxt = a => ALIMENTOS[a].un === 'un' ? (ALIMENTOS[a].nu || 'un') : ALIMENTOS[a].un;
const qtdTxt = (a, q) => `${num(q)} ${unTxt(a)}`;
const kcal = v => Math.round(v).toLocaleString('pt-BR');

// quanto se compra por unidade comida (cozido → cru, casca, pó de café)
function fator(a) {
  const al = ALIMENTOS[a];
  return dieta.fatores[a] ?? (al.sec === 'Carnes' ? dieta.fatores.carnes : undefined) ?? al.f ?? 1;
}
const compra = (a, q) => q * fator(a);
const nomeCompra = a => ALIMENTOS[a].nomeCompra || ALIMENTOS[a].nome;
function fmtCompra(a, v, semPac) {
  const al = ALIMENTOS[a];
  if (al.un === 'un') {
    const n = Math.ceil(v - 1e-9);
    if (!al.pac || n <= 0 || semPac) return `${n} ${al.nu || 'un'}`;
    const p = Math.ceil(n / al.pac[0]);
    return `${n} ${al.nu || 'un'} · ${p} ${p === 1 ? al.pac[1] : al.pac[2]}`;
  }
  return v >= 1000 ? `${num(Math.round(v / 100) / 10)} kg` : `${Math.round(v)} g`;
}
const arred = (a, v) => ALIMENTOS[a].un === 'un' ? Math.ceil(v - 1e-9) : Math.ceil(v / 10 - 1e-9) * 10;

// soma do cardápio nos próximos `dias` dias (a partir de hoje, sem o que já foi comido hoje), em unidade de compra
function necessidade(dias) {
  const tot = {}, hoje = new Date(hojeKey() + 'T12:00').getTime();
  for (let i = 0; i < dias; i++) {
    const key = dayKey(hoje + i * 864e5), d = dieta.diario[key];
    for (const r of REFEICOES) {
      if (i === 0 && d && d.refs[r.id]) continue;
      for (const { a, q } of itensDe(r.id, celDoDia(key, r.id))) tot[a] = (tot[a] || 0) + compra(a, q);
    }
  }
  return tot;
}

// ---------- navegação interna ----------
const NUT_TELAS = [['hoje', 'Hoje'], ['cardapio', 'Cardápio'], ['carrinho', 'Carrinho'], ['estoque', 'Estoque']];
function renderNutricao() {
  $('nut-telas').innerHTML = NUT_TELAS.map(([id, nome]) =>
    `<button role="tab" data-nt="${id}" aria-selected="${id === nutTela}" class="${id === nutTela ? 'ativo' : ''}">${nome}</button>`).join('');
  $('nut-telas').querySelectorAll('[data-nt]').forEach(b => b.onclick = () => { nutTela = b.dataset.nt; renderNutricao(); });
  ({ hoje: renderNutHoje, cardapio: renderCardapio, carrinho: renderCarrinho, estoque: renderEstoque })[nutTela]($('nut-corpo'));
}

const tilesMacro = (m, meta) => `<div class="tiles t4">
  ${tile(`${kcal(m[0])}`, meta ? `kcal · de ${kcal(meta[0])}` : 'kcal')}
  ${tile(`${Math.round(m[1])}<small>g</small>`, meta ? `proteína · ${Math.round(meta[1])}` : 'proteína')}
  ${tile(`${Math.round(m[2])}<small>g</small>`, meta ? `carbo · ${Math.round(meta[2])}` : 'carbo')}
  ${tile(`${Math.round(m[3])}<small>g</small>`, meta ? `gordura · ${Math.round(meta[3])}` : 'gordura')}</div>`;
const macroLinha = m => `${kcal(m[0])} kcal · P ${Math.round(m[1])} g · C ${Math.round(m[2])} g · G ${Math.round(m[3])} g`;

// chips das escolhas (carne, pão, fruta) de uma célula
function chipsEscolha(ref, cel) {
  const itens = itensDe(ref, cel).filter(i => i.esc);
  if (!itens.length) return '';
  return `<div class="chips">${itens.map(i => `<button class="chip nut-esc" data-esc="${i.esc}">${esc(ESCOLHAS[i.esc].nome)}: ${esc(ALIMENTOS[i.a].nome)}${ic('caret-down', 'ic-14')}</button>`).join('')}</div>`;
}
function ligaEscolhas(el, ref, cel, aoMudar) {
  el.querySelectorAll('[data-esc]').forEach(b => b.onclick = () => {
    const g = b.dataset.esc, atual = itensDe(ref, cel).find(i => i.esc === g).a;
    abrirFolha(ESCOLHAS[g].nome, ESCOLHAS[g].ops.map(o => ({
      ic: 'fork-knife', txt: ALIMENTOS[opId(o)].nome, sel: opId(o) === atual,
      acao: () => aoMudar({ op: cel.op, esc: { ...cel.esc, [g]: opId(o) } }),
    })));
  });
}
function folhaOpcoes(ref, cel, aoMudar) {
  const r = refMap[ref];
  abrirFolha(r.nome, r.ops.map((o, i) => ({
    ic: 'fork-knife', txt: `${i + 1}. ${o.nome}`, sel: i === cel.op, valor: `${kcal(macros(itensDe(ref, { ...cel, op: i }))[0])} kcal`,
    acao: () => aoMudar({ op: i, esc: cel.esc || {} }),
  })));
}

// ---------- Hoje ----------
function fimDeSemanaKeys() { // sábado e domingo deste fim de semana (só em sáb/dom)
  const d = new Date(hojeKey() + 'T12:00'), wd = d.getDay();
  if (wd !== 0 && wd !== 6) return null;
  const sab = d.getTime() - (wd === 0 ? 864e5 : 0);
  return [dayKey(sab), dayKey(sab + 864e5)];
}
const livresNoFds = ks => ks.reduce((n, k) => n + Object.values((dieta.diario[k] || { refs: {} }).refs).filter(r => r.livre).length, 0);

function renderNutHoje(el) {
  const key = hojeKey(), d = dieta.diario[key] || { refs: {}, agua: 0 };
  let comido = [0, 0, 0, 0], plano = [0, 0, 0, 0];
  for (const r of REFEICOES) {
    const reg = d.refs[r.id];
    const m = reg ? (reg.livre ? [0, 0, 0, 0] : macros(reg.itens)) : macros(itensDe(r.id, celDoDia(key, r.id)));
    plano = somaM(plano, m);
    if (reg) comido = somaM(comido, m);
  }
  const agua = d.agua || 0, fds = fimDeSemanaKeys();
  el.innerHTML = `
    <div class="topo-data"><span>${dataLonga(Date.now())}</span>${fds ? `<span class="tag tag-atencao">Refeição livre: ${livresNoFds(fds)} de 1</span>` : ''}</div>
    <div class="secao"><div class="kicker">Comido hoje</div>${tilesMacro(comido, plano)}</div>
    <div class="card nut-agua">
      <div class="nut-cab"><h3>${ic('drop')}Água</h3><span class="num"><b>${num(agua / 1000)}</b> de ${num(META_AGUA / 1000)} L</span></div>
      <div class="barra"><div style="width:${Math.min(100, agua / META_AGUA * 100)}%;background:var(--acao)"></div></div>
      <div class="linha nut-agua-bts">
        <button class="ghost" data-agua="-250" aria-label="Tirar 250 ml">${ic('minus')}</button>
        <button data-agua="250">+250 ml</button><button data-agua="500">+500 ml</button>
      </div>
    </div>
    ${REFEICOES.map(r => cardRefeicao(key, r, d.refs[r.id])).join('')}`;
  el.querySelectorAll('[data-agua]').forEach(b => b.onclick = () => {
    const dr = diaReg(key);
    dr.agua = Math.max(0, (dr.agua || 0) + +b.dataset.agua);
    salvarDieta(); renderNutHoje(el);
  });
  for (const r of REFEICOES) ligaRefeicao(el.querySelector(`[data-ref="${r.id}"]`), key, r, el);
}

function cardRefeicao(key, r, reg) {
  const cab = (tag) => `<div class="nut-cab"><div><div class="kicker">${esc(r.hora)}</div><h3>${esc(r.nome)}</h3></div>${tag}</div>`;
  if (reg && reg.livre) return `<div class="card nut-ref feito" data-ref="${r.id}">${cab(`<span class="tag tag-atencao">${ic('fire')}Refeição livre</span>`)}
    <button class="btn-texto neutro" data-desfazer>${ic('arrow-counter-clockwise')}Desfazer</button></div>`;
  if (reg) {
    const m = macros(reg.itens);
    return `<div class="card nut-ref feito" data-ref="${r.id}">${cab(`<span class="tag tag-ok">${ic('check-circle-fill')}Comido ${dataHora(reg.ts)}</span>`)}
      <div class="mudo">${esc(r.ops[reg.op] ? r.ops[reg.op].nome : '')}</div>
      <div class="pills">${reg.itens.map(i => `<span class="pill">${esc(ALIMENTOS[i.a].nome)} ${qtdTxt(i.a, i.q)}</span>`).join('')}</div>
      <div class="nut-macro">${macroLinha(m)}</div>
      <button class="btn-texto neutro" data-desfazer>${ic('arrow-counter-clockwise')}Desfazer</button></div>`;
  }
  const cel = celDoDia(key, r.id), itens = itensDe(r.id, cel), qs = rasc[r.id] || {};
  const reais = itens.map((it, i) => ({ ...it, q: qs[i] ?? it.q }));
  return `<div class="card nut-ref" data-ref="${r.id}">${cab(`<span class="tag num" data-kcal>${kcal(macros(reais)[0])} kcal</span>`)}
    ${r.ops.length > 1 ? `<button class="nut-op" data-trocar><span>${cel.op + 1}. ${esc(r.ops[cel.op].nome)}</span>${ic('caret-down', 'ic-18')}</button>` : `<div class="mudo">${esc(r.ops[0].nome)}</div>`}
    ${chipsEscolha(r.id, cel)}
    <div class="nut-itens">${reais.map((it, i) => `<label class="nut-it">
      <span class="nome">${esc(ALIMENTOS[it.a].nome)}${it.av ? '<small>à vontade</small>' : ''}</span>
      <input type="number" inputmode="decimal" min="0" step="any" class="num" data-i="${i}" value="${it.q}" aria-label="${esc(ALIMENTOS[it.a].nome)} em ${unTxt(it.a)}">
      <span class="u">${unTxt(it.a)}</span><span class="k num" data-k="${i}">${kcal(macros([it])[0])}</span></label>`).join('')}</div>
    <div class="nut-macro" data-macro>${macroLinha(macros(reais))}</div>
    <div class="nut-acoes"><button data-comi>${ic('check')}Comi</button><button class="btn-texto neutro" data-livre>Refeição livre</button></div>
  </div>`;
}
const dataHora = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function ligaRefeicao(card, key, r, el) {
  const d = dieta.diario[key], reg = d && d.refs[r.id];
  if (reg) {
    card.querySelector('[data-desfazer]').onclick = () => {
      for (const [a, v] of Object.entries(reg.baixa || {})) dieta.estoque[a] = (dieta.estoque[a] || 0) + v;
      delete d.refs[r.id];
      salvarDieta(); renderNutHoje(el);
    };
    return;
  }
  const cel = celDoDia(key, r.id), itens = itensDe(r.id, cel);
  const trocar = nova => { diaReg(key).troca[r.id] = nova; delete rasc[r.id]; salvarDieta(); renderNutHoje(el); };
  const bt = card.querySelector('[data-trocar]');
  if (bt) bt.onclick = () => folhaOpcoes(r.id, cel, trocar);
  ligaEscolhas(card, r.id, cel, trocar);
  const atuais = () => itens.map((it, i) => ({ ...it, q: (rasc[r.id] || {})[i] ?? it.q }));
  card.querySelectorAll('input[data-i]').forEach(inp => inp.oninput = () => {
    const v = parseFloat(inp.value.replace(',', '.'));
    (rasc[r.id] = rasc[r.id] || {})[inp.dataset.i] = isFinite(v) && v >= 0 ? v : 0;
    const its = atuais();
    card.querySelector(`[data-k="${inp.dataset.i}"]`).textContent = kcal(macros([its[inp.dataset.i]])[0]);
    card.querySelector('[data-kcal]').textContent = `${kcal(macros(its)[0])} kcal`;
    card.querySelector('[data-macro]').textContent = macroLinha(macros(its));
  });
  card.querySelector('[data-comi]').onclick = () => {
    const comidos = atuais().filter(i => i.q > 0).map(({ a, q }) => ({ a, q }));
    const baixa = {};
    for (const { a, q } of comidos) {
      const tem = dieta.estoque[a] || 0, sai = Math.min(tem, compra(a, q));
      if (sai > 0) { dieta.estoque[a] = tem - sai; baixa[a] = (baixa[a] || 0) + sai; }
    }
    diaReg(key).refs[r.id] = { ts: Date.now(), op: cel.op, itens: comidos, baixa };
    delete rasc[r.id];
    salvarDieta(); renderNutHoje(el);
    toast(`${r.nome}: ${kcal(macros(comidos)[0])} kcal`);
  };
  card.querySelector('[data-livre]').onclick = () => {
    const fds = fimDeSemanaKeys();
    if (!fds && !confirm('A refeição livre é para o fim de semana. Marcar mesmo assim?')) return;
    if (fds && livresNoFds(fds) >= 1 && !confirm('Você já usou a refeição livre deste fim de semana. É uma ocasião especial?')) return;
    diaReg(key).refs[r.id] = { ts: Date.now(), livre: true };
    salvarDieta(); renderNutHoje(el);
  };
}

// ---------- Cardápio ----------
function renderCardapio(el) {
  const wd = nutDia, hojeWd = new Date().getDay();
  const tot = REFEICOES.reduce((t, r) => somaM(t, macros(itensDe(r.id, celPlano(wd, r.id)))), [0, 0, 0, 0]);
  el.innerHTML = `
    <p class="mudo">Escolha a opção de cada refeição. O carrinho soma as quantidades a partir daqui.</p>
    <div class="chips rolar" role="radiogroup" aria-label="Dia da semana">${ORDEM_SEMANA.map(i =>
      `<button class="chip" role="radio" aria-checked="${i === wd}" data-wd="${i}">${DIAS[i].slice(0, 3)}${i === hojeWd ? '<small>hoje</small>' : ''}</button>`).join('')}</div>
    ${tilesMacro(tot)}
    ${REFEICOES.map(r => {
      const cel = celPlano(wd, r.id), itens = itensDe(r.id, cel);
      return `<div class="card nut-ref" data-ref="${r.id}">
        <div class="nut-cab"><div><div class="kicker">${esc(r.hora)}</div><h3>${esc(r.nome)}</h3></div><span class="tag num">${kcal(macros(itens)[0])} kcal</span></div>
        ${r.ops.length > 1 ? `<button class="nut-op" data-trocar><span>${cel.op + 1}. ${esc(r.ops[cel.op].nome)}</span>${ic('caret-down', 'ic-18')}</button>` : `<div class="mudo">${esc(r.ops[0].nome)}</div>`}
        ${chipsEscolha(r.id, cel)}
        <div class="nut-resumo">${itens.map(i => `${esc(ALIMENTOS[i.a].nome)} ${i.av ? '<i>à vontade</i>' : qtdTxt(i.a, i.q)}`).join(' · ')}</div>
      </div>`;
    }).join('')}
    <button class="ghost larga" id="bt-repetir-dia">${ic('calendar-blank')}Usar ${DIAS[wd]} em todos os dias</button>`;
  el.querySelectorAll('[data-wd]').forEach(b => b.onclick = () => { nutDia = +b.dataset.wd; renderCardapio(el); });
  for (const r of REFEICOES) {
    const card = el.querySelector(`[data-ref="${r.id}"]`), cel = celPlano(wd, r.id);
    const mudar = nova => { (dieta.plano[wd] = dieta.plano[wd] || {})[r.id] = nova; salvarDieta(); renderCardapio(el); };
    const bt = card.querySelector('[data-trocar]');
    if (bt) bt.onclick = () => folhaOpcoes(r.id, cel, mudar);
    ligaEscolhas(card, r.id, cel, mudar);
  }
  $('bt-repetir-dia').onclick = () => {
    if (!confirm(`Copiar o cardápio de ${DIAS[wd]} para todos os dias da semana?`)) return;
    const base = Object.fromEntries(REFEICOES.map(r => [r.id, JSON.parse(JSON.stringify(celPlano(wd, r.id)))]));
    for (let i = 0; i < 7; i++) dieta.plano[i] = JSON.parse(JSON.stringify(base));
    salvarDieta(); toast('Cardápio copiado para a semana');
  };
}

// ---------- Carrinho ----------
const FATORES_EDIT = [['arroz', 'Arroz'], ['feijao', 'Feijão'], ['macarrao', 'Macarrão'], ['carnes', 'Carnes'], ['mandioca', 'Mandioca (com casca)']];
function listaCompras() {
  const dias = dieta.periodo === 'mes' ? 30 : 7, nec = necessidade(dias);
  return Object.keys(nec).map(a => {
    const tem = dieta.estoque[a] || 0, falta = arred(a, Math.max(0, nec[a] - tem));
    return { a, precisa: nec[a], tem, falta };
  });
}

function renderCarrinho(el) {
  const dias = dieta.periodo === 'mes' ? 30 : 7, lista = listaCompras();
  const ate = dataBr(new Date(hojeKey() + 'T12:00').getTime() + (dias - 1) * 864e5);
  const comprar = lista.filter(l => l.falta > 0), tem = lista.filter(l => l.falta <= 0);
  const linha = l => `<div class="linha-lista com-acao" data-a="${l.a}">
      <div class="ll-txt"><span class="ll-nome">${esc(nomeCompra(l.a))}</span>
      <span class="ll-det">precisa ${fmtCompra(l.a, l.precisa, true)}${l.tem ? ` · tem ${fmtCompra(l.a, l.tem, true)}` : ''}</span></div>
      <b class="num nut-falta">${fmtCompra(l.a, l.falta)}</b>
      <button class="btn-ic" data-comprei="${l.a}" aria-label="Comprei ${esc(nomeCompra(l.a))}">${ic('check-circle')}</button></div>`;
  el.innerHTML = `
    <div class="seg" role="tablist" id="nut-periodo">
      <button role="tab" data-per="semana" class="${dieta.periodo !== 'mes' ? 'ativo' : ''}" aria-selected="${dieta.periodo !== 'mes'}">Semana</button>
      <button role="tab" data-per="mes" class="${dieta.periodo === 'mes' ? 'ativo' : ''}" aria-selected="${dieta.periodo === 'mes'}">Mês (30 dias)</button>
    </div>
    <p class="mudo">Do cardápio de hoje até ${ate}, já em peso cru, menos o que você tem no estoque. Toque em ${ic('check-circle', 'ic-16')} quando comprar: entra no estoque.</p>
    ${comprar.length ? SECOES_NUT.map(s => {
      const ls = comprar.filter(l => ALIMENTOS[l.a].sec === s);
      return ls.length ? `<div class="secao"><div class="kicker">${s}</div><div class="lista">${ls.map(linha).join('')}</div></div>` : '';
    }).join('') : `<div class="vazio">${ic('check-circle')}<span>O estoque cobre o período todo.</span></div>`}
    ${comprar.length ? `<button class="ghost larga" id="bt-copiar-lista">${ic('list-checks')}Copiar lista</button>` : ''}
    ${tem.length ? `<div class="secao"><div class="kicker">Já tem em casa</div><p class="mudo">${tem.map(l => esc(nomeCompra(l.a))).join(', ')}</p></div>` : ''}
    <div class="card">
      <h3>${ic('fork-knife')}Rendimento (cozido → cru)</h3>
      <p class="mudo">A dieta dá o peso cozido. Quanto de cru vira 100 g pronto? Pese uma vez e ajuste.</p>
      <div class="nut-fatores">${FATORES_EDIT.map(([k, nome]) => {
        const v = k === 'carnes' ? fator('patinho') : fator(k);
        return `<label class="nut-it"><span class="nome">${nome}</span><input type="number" inputmode="decimal" min="1" step="1" class="num" data-fator="${k}" value="${Math.round(v * 100)}"><span class="u">g cru</span></label>`;
      }).join('')}</div>
    </div>`;
  el.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { dieta.periodo = b.dataset.per; salvarDieta(); renderCarrinho(el); });
  el.querySelectorAll('[data-comprei]').forEach(b => b.onclick = () => {
    const l = comprar.find(x => x.a === b.dataset.comprei);
    dieta.estoque[l.a] = (dieta.estoque[l.a] || 0) + l.falta;
    salvarDieta(); renderCarrinho(el);
    toast(`${nomeCompra(l.a)} no estoque`);
  });
  el.querySelectorAll('[data-fator]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value.replace(',', '.'));
    if (!(v > 0)) return;
    dieta.fatores[inp.dataset.fator] = v / 100;
    salvarDieta(); renderCarrinho(el);
  });
  const bc = $('bt-copiar-lista');
  if (bc) bc.onclick = () => {
    const txt = SECOES_NUT.map(s => {
      const ls = comprar.filter(l => ALIMENTOS[l.a].sec === s);
      return ls.length ? `${s}\n${ls.map(l => `- ${nomeCompra(l.a)}: ${fmtCompra(l.a, l.falta)}`).join('\n')}` : '';
    }).filter(Boolean).join('\n\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Lista copiada'), () => toast('Não deu para copiar'));
  };
}

// ---------- Estoque ----------
function renderEstoque(el) {
  const nec7 = necessidade(7), usados = new Set(Object.keys(nec7));
  const ids = Object.keys(ALIMENTOS).filter(a => usados.has(a) || dieta.estoque[a] > 0);
  const duracao = a => {
    const dia = (nec7[a] || 0) / 7, tem = dieta.estoque[a] || 0;
    if (!dia) return '';
    const d = Math.floor(tem / dia);
    return d < 3 ? `<span class="tag tag-atencao">${tem ? `acaba em ${plural(d, 'dia', 'dias')}` : 'em falta'}</span>`
      : `<span class="tag tag-ok">${d >= 30 ? '30+ dias' : plural(d, 'dia', 'dias')}</span>`;
  };
  el.innerHTML = `
    <p class="mudo">O que você tem em casa, em peso cru ou unidades. "Comi" desconta daqui e o que você marca como comprado no carrinho soma aqui.</p>
    ${SECOES_NUT.map(s => {
      const ls = ids.filter(a => ALIMENTOS[a].sec === s);
      return ls.length ? `<div class="secao"><div class="kicker">${s}</div><div class="lista">${ls.map(a => `
        <div class="linha-lista nut-est"><div class="ll-txt"><span class="ll-nome">${esc(nomeCompra(a))}</span><span class="ll-det">${duracao(a)}</span></div>
          <input type="number" inputmode="decimal" min="0" step="any" class="num" data-est="${a}" value="${+(dieta.estoque[a] || 0).toFixed(1)}" aria-label="${esc(nomeCompra(a))} em casa">
          <span class="u">${ALIMENTOS[a].un === 'un' ? (ALIMENTOS[a].nu || 'un') : 'g'}</span></div>`).join('')}</div></div>` : '';
    }).join('')}`;
  el.querySelectorAll('[data-est]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value.replace(',', '.'));
    dieta.estoque[inp.dataset.est] = v > 0 ? v : 0;
    salvarDieta(); renderEstoque(el);
  });
}

// ---------- Corpo (peso e medidas, na aba Progresso) ----------
const MEDIDAS = [['peso', 'Peso', 'kg'], ['gordura', 'Gordura', '%'], ['peitoral', 'Peitoral', 'cm'], ['cintura', 'Cintura', 'cm'], ['abdomen', 'Abdômen', 'cm'],
  ['quadril', 'Quadril', 'cm'], ['bracoD', 'Braço contraído D', 'cm'], ['bracoE', 'Braço contraído E', 'cm'], ['coxaD', 'Coxa D', 'cm'], ['coxaE', 'Coxa E', 'cm'],
  ['pantD', 'Panturrilha D', 'cm'], ['pantE', 'Panturrilha E', 'cm']];
function renderCorpo() {
  const el = $('prog-corpo'), ms = dieta.medidas, ult = ms[ms.length - 1], pri = ms[0];
  const delta = k => {
    if (!ult || ult[k] == null || !pri || pri === ult || pri[k] == null) return '';
    const d = Math.round((ult[k] - pri[k]) * 10) / 10;
    return d ? ` · ${d > 0 ? '+' : ''}${num(d)}` : '';
  };
  const resumo = ult ? `<div class="tiles">${['peso', 'gordura', 'bracoD'].map(k => {
    const [, nome, u] = MEDIDAS.find(m => m[0] === k);
    return tile(ult[k] != null ? `${num(ult[k])}<small>${u}</small>` : '–', `${nome.toLowerCase()}${delta(k)}`);
  }).join('')}</div><p class="mudo">Última medição em ${dataBr(ult.ts)}${ms.length > 1 ? `, comparando com ${dataBr(pri.ts)}` : ''}.</p>`
    : `<div class="vazio">${ic('ruler')}<span>Registre peso e medidas para acompanhar a evolução junto com a dieta.</span></div>`;
  const form = corpoForm ? `<div class="card"><div class="nut-medidas">${MEDIDAS.map(([k, nome, u]) => `<label class="nut-it"><span class="nome">${nome}</span>
      <input type="number" inputmode="decimal" step="any" min="0" class="num" data-med="${k}" value="${ult && ult[k] != null ? ult[k] : ''}"><span class="u">${u}</span></label>`).join('')}</div>
      <div class="linha" style="margin-top:16px"><button id="bt-med-salvar">Salvar</button><button class="ghost" id="bt-med-cancelar">Cancelar</button></div></div>` : '';
  el.innerHTML = `<div class="secao-cab"><span class="kicker">Corpo</span>${corpoForm ? '' : `<button class="btn-texto" id="bt-medidas">${ic('plus', 'ic-18')}Registrar</button>`}</div>${form || resumo}`;
  if (!corpoForm) { $('bt-medidas').onclick = () => { corpoForm = true; renderCorpo(); }; return; }
  $('bt-med-cancelar').onclick = () => { corpoForm = false; renderCorpo(); };
  $('bt-med-salvar').onclick = () => {
    const m = { ts: Date.now() };
    el.querySelectorAll('[data-med]').forEach(i => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0) m[i.dataset.med] = v; });
    if (Object.keys(m).length === 1) return toast('Preencha pelo menos o peso');
    dieta.medidas.push(m);
    corpoForm = false;
    salvarDieta(); renderCorpo(); toast('Medidas salvas');
  };
}
