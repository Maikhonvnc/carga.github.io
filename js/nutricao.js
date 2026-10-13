/* Carga — Nutrição: o dia (o que comeu, macros e água), cardápio da semana, carrinho e estoque. */
'use strict';

// ---------- estado ----------
const LS_DIETA = 'carga.dieta';
// plano[diaDaSemana][refeição] = {op, esc}; diario[dia] = {refs: {ref: registro}, troca: {ref: célula}, agua};
// estoque e fatores na unidade de compra (g cru, un)
const DIETA_PADRAO = () => ({ plano: {}, estoque: {}, diario: {}, fatores: {}, medidas: [], periodo: 'semana', custom: {}, recentes: [], carrinho: {}, marcas: {} });
let dieta = Object.assign(DIETA_PADRAO(), lerLS(LS_DIETA, {}));
Object.assign(ALIMENTOS, dieta.custom); // alimentos que você cadastrou (rótulo, código de barras)
SECOES_NUT.push('Meus alimentos');
const salvarDieta = () => localStorage.setItem(LS_DIETA, JSON.stringify(dieta));

let nutTela = 'hoje', nutDia = new Date().getDay(), rasc = {}, corpoForm = false, nutAberta = null, avAberto = {};
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
const somaM = (a, b) => a.map((v, i) => v + (b[i] || 0));
const nomeIt = it => it.k ? (it.nome || 'Calorias') : ALIMENTOS[it.a].nome;
function macros(itens) { // [kcal, proteína, carbo, gordura]
  return itens.reduce((t, { a, q, k }) => {
    if (k) return somaM(t, k); // só calorias
    const g = gramas(a, q) / 100;
    return t.map((v, i) => v + ALIMENTOS[a].m[i] * g);
  }, [0, 0, 0, 0]);
}
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
// compra sempre arredonda para cima: pacote fechado (dúzia, pacote) ou peso redondo (50 g, 250 g, 500 g)
function arred(a, v) {
  if (v <= 1e-9) return 0;
  const al = ALIMENTOS[a], passo = al.un === 'un' ? (al.pac ? al.pac[0] : 1) : v <= 250 ? 50 : v <= 1000 ? 250 : 500;
  return Math.ceil(v / passo - 1e-9) * passo;
}

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

// ---------- estoque × cardápio ----------
// só conta o que você controla no estoque (o que já comprou ou anotou em casa); o resto não vira "falta"
const controla = a => ALIMENTOS[a] && a in dieta.estoque;
const faltando = itens => itens.filter(i => !i.k && !i.av && controla(i.a) && dieta.estoque[i.a] + 1e-6 < compra(i.a, i.q));
const minusc = s => s[0].toLowerCase() + s.slice(1);
const listaE = xs => xs.length < 2 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
const nomesFalta = f => listaE(f.map(i => minusc(ALIMENTOS[i.a].nome)));
// troca a carne, o pão ou a fruta por outra que tem em casa, quando a escolhida falta
function comEstoque(ref, cel) {
  const c = { op: cel.op, esc: { ...(cel.esc || {}) } };
  for (const it of itensDe(ref, c)) {
    if (!it.esc || !faltando([it]).length) continue;
    const alt = ESCOLHAS[it.esc].ops.map(opId).find(a => {
      if (a === it.a || !controla(a)) return false;
      const novo = itensDe(ref, { ...c, esc: { ...c.esc, [it.esc]: a } }).find(x => x.esc === it.esc);
      return !faltando([novo]).length;
    });
    if (alt) c.esc[it.esc] = alt;
  }
  return c;
}
// o plano de hoje não fecha com o estoque? devolve o que falta e, se houver, uma versão que dá pra fazer
function sugestaoEstoque(key, ref) {
  const cel = celDoDia(key, ref), f = faltando(itensDe(ref, cel));
  if (!f.length) return null;
  const r = refMap[ref];
  for (const op of [cel.op, ...r.ops.map((_, i) => i).filter(i => i !== cel.op)]) {
    const c = comEstoque(ref, { op, esc: cel.esc || {} });
    if (!faltando(itensDe(ref, c)).length) return { f, cel: c };
  }
  return { f };
}
const estadoEstoque = (ref, cel) => {
  const itens = itensDe(ref, cel), f = faltando(itens);
  if (f.length) return { ok: false, txt: `Falta ${nomesFalta(f)}` };
  const base = itens.filter(i => !i.k && !i.av), n = base.filter(i => controla(i.a)).length;
  return !n ? null : { ok: true, txt: n === base.length ? 'Dá pra fazer com o que tem' : 'Nada em falta no estoque' };
};

// ---------- navegação interna ----------
const NUT_TELAS = [['hoje', 'Hoje'], ['cardapio', 'Cardápio'], ['carrinho', 'Compras'], ['estoque', 'Despensa']];
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
// barras do dia: comido × plano
const barrasMacro = (m, meta) => `<div class="nut-barras">${[['Calorias', 'kcal'], ['Proteína', 'g'], ['Carbo', 'g'], ['Gordura', 'g']].map(([nome, u], i) => {
  const v = i ? Math.round(m[i]) : kcal(m[i]), alvo = i ? Math.round(meta[i]) : kcal(meta[i]), pct = meta[i] ? m[i] / meta[i] * 100 : 0;
  return `<div class="nut-barra"><div class="nut-barra-cab"><span>${nome}</span><span class="num"><b>${v}</b> de ${alvo} ${u}</span></div>
    <div class="barra"><div style="width:${Math.min(100, pct)}%;background:var(${pct > 110 ? '--atencao' : '--acao'})"></div></div></div>`;
}).join('')}</div>`;
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
// opções da refeição com o que dá pra fazer com o estoque; adaptar = já troca a carne/fruta pela que tem em casa (Hoje)
function folhaOpcoes(ref, cel, aoMudar, adaptar) {
  const r = refMap[ref];
  abrirFolha(r.nome, r.ops.map((o, i) => {
    const base = { op: i, esc: cel.esc || {} }, c = adaptar ? comEstoque(ref, base) : base, est = estadoEstoque(ref, c);
    return { ic: est ? (est.ok ? 'check-circle' : 'package') : 'fork-knife', txt: `${i + 1}. ${o.nome}`, sel: i === cel.op,
      det: est && est.txt, detCls: est ? (est.ok ? 'c-ok' : 'c-atencao') : '', valor: `${kcal(macros(itensDe(ref, c))[0])} kcal`, acao: () => aoMudar(c) };
  }));
}

// ---------- Hoje ----------
function fimDeSemanaKeys() { // sábado e domingo deste fim de semana (só em sáb/dom)
  const d = new Date(hojeKey() + 'T12:00'), wd = d.getDay();
  if (wd !== 0 && wd !== 6) return null;
  const sab = d.getTime() - (wd === 0 ? 864e5 : 0);
  return [dayKey(sab), dayKey(sab + 864e5)];
}
const livresNoFds = ks => ks.reduce((n, k) => n + Object.values((dieta.diario[k] || { refs: {} }).refs).filter(r => r.livre).length, 0);
const EXTRA = { id: 'extra', nome: 'Fora do plano', hora: 'lanches e extras' };
const ontemKey = () => dayKey(new Date(hojeKey() + 'T12:00').getTime() - 864e5);

// seguiu a dieta? mesmos alimentos do plano (sem contar os "à vontade") com até 25% de diferença no peso
function seguiuPlano(ref, cel, itens) {
  const plano = itensDe(ref, cel).filter(i => !i.av), comidos = itens.filter(i => !i.k && !(ALIMENTOS[i.a] && ALIMENTOS[i.a].av));
  if (plano.length !== comidos.length) return false;
  return plano.every(p => comidos.some(c => c.a === p.a && Math.abs(c.q - p.q) <= p.q * 0.25));
}
// aderência: refeições do plano registradas que seguiram a dieta (refeição livre conta como seguida)
function aderencia(keys) {
  let feitas = 0, fieis = 0;
  for (const k of keys) for (const [ref, r] of Object.entries((dieta.diario[k] || { refs: {} }).refs)) {
    if (ref === 'extra') continue;
    feitas++;
    if (r.livre || r.fiel) fieis++;
  }
  return { feitas, fieis };
}

function renderNutHoje(el) {
  const key = hojeKey(), d = dieta.diario[key] || { refs: {}, agua: 0 };
  let comido = [0, 0, 0, 0], plano = [0, 0, 0, 0];
  for (const r of REFEICOES) {
    const reg = d.refs[r.id];
    const m = reg ? (reg.livre ? [0, 0, 0, 0] : macros(reg.itens)) : macros(itensDe(r.id, celDoDia(key, r.id)));
    plano = somaM(plano, m);
    if (reg) comido = somaM(comido, m);
  }
  if (d.refs.extra) comido = somaM(comido, macros(d.refs.extra.itens));
  const agua = d.agua || 0, fds = fimDeSemanaKeys();
  const hojeAd = aderencia([key]), sem = aderencia(Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - i * 864e5)));
  const prox = REFEICOES.find(r => !d.refs[r.id]), feitas = REFEICOES.length - REFEICOES.filter(r => !d.refs[r.id]).length;
  if (nutAberta && prox && nutAberta === prox.id) nutAberta = null;
  // demais refeições: linhas recolhidas; a que você abriu vira cartão completo no lugar
  let lista = '', linhas = [];
  const fechaLista = () => { if (linhas.length) lista += `<div class="lista">${linhas.join('')}</div>`; linhas = []; };
  for (const r of REFEICOES) {
    if (prox && r.id === prox.id) continue;
    if (r.id === nutAberta) { fechaLista(); lista += cardRefeicao(key, r, d.refs[r.id], 'aberta'); } else linhas.push(linhaRefeicao(key, r, d.refs[r.id]));
  }
  fechaLista();
  el.innerHTML = `
    <div class="topo-data"><span>${dataLonga(Date.now())}</span><span class="tag${feitas === REFEICOES.length ? ' tag-ok' : ''}">${ic('fork-knife')}${feitas} de ${REFEICOES.length} refeições</span></div>
    ${prox ? cardRefeicao(key, prox, null, 'hero') : `<div class="card hero"><div class="hero-txt"><div class="kicker azul">Dia completo</div>
      <div class="titulo-2">Todas as refeições registradas</div><div class="mudo">${kcal(comido[0])} kcal hoje. Algo a mais entra em "Fora do plano".</div></div></div>`}
    <div class="card nut-dia">
      <div class="nut-cab"><span class="kicker">Comido hoje</span>${fds ? `<span class="tag tag-atencao">${ic('fire')}Livre: ${livresNoFds(fds)} de 1</span>` : ''}</div>
      ${barrasMacro(comido, plano)}
      ${hojeAd.feitas ? `<p class="mudo" id="nut-aderencia">Seguiu a dieta em ${hojeAd.fieis} de ${plural(hojeAd.feitas, 'refeição', 'refeições')} hoje${sem.feitas > hojeAd.feitas ? ` · ${Math.round(sem.fieis / sem.feitas * 100)}% nos últimos 7 dias` : ''}.</p>` : ''}
    </div>
    <div class="card nut-agua">
      <div class="nut-cab"><h3>${ic('drop')}Água</h3><span class="num"><b>${num(agua / 1000)}</b> de ${num(META_AGUA / 1000)} L</span></div>
      <div class="barra"><div style="width:${Math.min(100, agua / META_AGUA * 100)}%;background:var(--acao)"></div></div>
      <div class="linha nut-agua-bts">
        <button class="ghost" data-agua="-250" aria-label="Tirar 250 ml">${ic('minus')}</button>
        <button data-agua="250">+250 ml</button><button data-agua="500">+500 ml</button>
      </div>
    </div>
    <div class="secao"><div class="kicker">Refeições de hoje</div>${lista}</div>
    ${cardExtra(d.refs.extra)}`;
  el.querySelectorAll('[data-agua]').forEach(b => b.onclick = () => {
    const dr = diaReg(key);
    dr.agua = Math.max(0, (dr.agua || 0) + +b.dataset.agua);
    salvarDieta(); renderNutHoje(el);
  });
  el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => { nutAberta = b.dataset.abrir; renderNutHoje(el); });
  for (const r of REFEICOES) {
    const card = el.querySelector(`.nut-ref[data-ref="${r.id}"]`);
    if (card) ligaRefeicao(card, key, r, el);
  }
  ligaExtra(el.querySelector('[data-ref="extra"]'), key, el);
}

// linha recolhida de uma refeição (toque para abrir)
function linhaRefeicao(key, r, reg) {
  const cel = celDoDia(key, r.id), falta = !reg && faltando(itensDe(r.id, cel)).length;
  const det = reg ? (reg.livre ? 'Refeição livre' : `Comido ${dataHora(reg.ts)} · ${kcal(macros(reg.itens)[0])} kcal`)
    : `${r.ops.length > 1 ? `${cel.op + 1}. ` : ''}${r.ops[cel.op].nome} · ${kcal(macros(rascunho(key, r.id))[0])} kcal`;
  return `<button class="linha-lista nut-linha${reg ? ' feito' : ''}" data-abrir="${r.id}">
    <span class="nut-hora num">${/^\d/.test(r.hora) ? esc(r.hora) : ''}</span>
    <span class="ll-txt"><span class="ll-nome">${esc(r.nome)}${/^\d/.test(r.hora) ? '' : ` <small class="c-3">${esc(r.hora)}</small>`}</span><span class="ll-det">${esc(det)}</span></span>
    ${reg ? `<span class="c-ok">${ic(reg.fiel || reg.livre ? 'check-circle-fill' : 'check')}</span>` : falta ? `<span class="tag tag-atencao">${ic('package')}falta</span>` : ''}${ic('caret-down', 'chev')}</button>`;
}

const cabRef = (r, tag, modo) => `<div class="nut-cab"><div><div class="kicker${modo === 'hero' ? ' azul' : ''}">${modo === 'hero' ? `Próxima refeição · ${esc(r.hora)}` : esc(r.hora)}</div>
  <h3${modo === 'hero' ? ' class="titulo-2"' : ''}>${esc(r.nome)}</h3></div><div class="nut-cab-dir">${tag}${modo === 'aberta' ? `<button class="btn-ic" data-fechar aria-label="Recolher">${ic('caret-down', 'ic-18 vira')}</button>` : ''}</div></div>`;
const pillsItens = itens => `<div class="pills">${itens.map(i => `<span class="pill">${esc(nomeIt(i))} ${i.k ? `${kcal(i.k[0])} kcal` : qtdTxt(i.a, i.q)}</span>`).join('')}</div>`;

// linha editável de um item (peso, trocar, remover)
const linhaItem = (it, i) => `<div class="nut-it${it.k || it.av || (ALIMENTOS[it.a] && ALIMENTOS[it.a].av) ? '' : ' pesar'}">
  <button class="nome nut-troca" data-troca="${i}">${esc(nomeIt(it))}${it.k ? '<small>só calorias</small>' : it.av ? '<small>à vontade</small>' : ''}</button>
  ${it.k ? '<span class="nut-q-fixo"></span>' : `<input type="number" inputmode="decimal" min="0" step="any" class="num" data-i="${i}" value="${it.q}" aria-label="${esc(nomeIt(it))} em ${unTxt(it.a)}">
  <span class="u">${unTxt(it.a)}</span>`}<span class="k num" data-k="${i}">${kcal(macros([it])[0])}</span>
  <button class="btn-ic nut-rm" data-rm="${i}" aria-label="Tirar ${esc(nomeIt(it))}">${ic('x', 'ic-18')}</button></div>`;

// o que se pesa vem primeiro; a salada à vontade fica numa linha só (toque para abrir)
function itensPesagem(ref, itens) {
  const idx = itens.map((it, i) => [it, i]), av = idx.filter(([it]) => it.av), pesa = idx.filter(([it]) => !it.av);
  let html = pesa.map(([it, i]) => linhaItem(it, i)).join('');
  if (av.length) {
    const g = av.reduce((t, [it]) => t + gramas(it.a, it.q), 0);
    html += avAberto[ref] || av.length === 1 ? av.map(([it, i]) => linhaItem(it, i)).join('')
      : `<button class="nut-it nut-av" data-av><span class="nome">Salada à vontade<small>${esc(listaE(av.map(([it]) => minusc(ALIMENTOS[it.a].nome))))}</small></span>
        <span class="u num">${Math.round(g)} g</span><span class="k num">${kcal(macros(av.map(([it]) => it))[0])}</span>${ic('caret-down', 'ic-18 chev')}</button>`;
  }
  return html;
}

function cardRefeicao(key, r, reg, modo) {
  const cls = `card nut-ref${modo === 'hero' ? ' hero' : ''}`;
  if (reg && reg.livre) return `<div class="${cls} feito" data-ref="${r.id}">${cabRef(r, `<span class="tag tag-atencao">${ic('fire')}Refeição livre</span>`, modo)}
    <button class="btn-texto neutro" data-desfazer>${ic('arrow-counter-clockwise')}Desfazer</button></div>`;
  if (reg) {
    return `<div class="${cls} feito" data-ref="${r.id}">${cabRef(r, `<span class="tag ${reg.fiel ? 'tag-ok' : ''}">${ic(reg.fiel ? 'check-circle-fill' : 'check')}Comido ${dataHora(reg.ts)}</span>`, modo)}
      <div class="mudo">${reg.fiel ? esc(r.ops[reg.op] ? r.ops[reg.op].nome : '') : 'Diferente do plano'}</div>
      ${pillsItens(reg.itens)}
      <div class="nut-macro">${macroLinha(macros(reg.itens))}</div>
      <button class="btn-texto neutro" data-desfazer>${ic('arrow-counter-clockwise')}Desfazer</button></div>`;
  }
  const cel = celDoDia(key, r.id), itens = rascunho(key, r.id), ontem = (dieta.diario[ontemKey()] || { refs: {} }).refs[r.id];
  const sug = !rasc[r.id] && sugestaoEstoque(key, r.id);
  let aviso = '';
  if (sug) {
    const troca = sug.cel && (sug.cel.op !== cel.op ? `a opção ${sug.cel.op + 1}, ${minusc(r.ops[sug.cel.op].nome)}`
      : `com ${nomesFalta(itensDe(r.id, sug.cel).filter(i => i.esc && !itensDe(r.id, cel).some(x => x.a === i.a)))}`);
    aviso = `<div class="nut-falta-aviso">${ic('package', 'ic-18')}<span>Falta ${esc(nomesFalta(sug.f))} em casa.${troca ? ` Dá pra fazer ${esc(troca)}.` : ''}</span>
      ${troca ? '<button class="btn-texto" data-usar>Trocar</button>' : ''}</div>`;
  }
  return `<div class="${cls}" data-ref="${r.id}">${cabRef(r, `<span class="tag num" data-kcal>${kcal(macros(itens)[0])} kcal</span>`, modo)}
    ${r.ops.length > 1 ? `<button class="nut-op" data-trocar><span>${cel.op + 1}. ${esc(r.ops[cel.op].nome)}</span>${ic('caret-down', 'ic-18')}</button>` : `<div class="mudo">${esc(r.ops[0].nome)}</div>`}
    ${aviso}
    ${rasc[r.id] ? '' : chipsEscolha(r.id, cel)}
    <div class="nut-itens">${itensPesagem(r.id, itens)}</div>
    <div class="nut-mais"><button class="btn-texto" data-add>${ic('plus', 'ic-18')}Adicionar</button>
      ${ontem && ontem.itens ? `<button class="btn-texto neutro" data-ontem>${ic('arrow-counter-clockwise', 'ic-18')}Repetir ontem</button>` : ''}
      ${rasc[r.id] ? `<button class="btn-texto neutro" data-plano>Voltar ao plano</button>` : ''}</div>
    <div class="nut-macro" data-macro>${macroLinha(macros(itens))}</div>
    <div class="nut-acoes"><button class="${modo === 'hero' ? 'grande' : ''}" data-comi>${ic('check')}Comi</button><button class="btn-texto neutro" data-livre>Refeição livre</button></div>
  </div>`;
}
const dataHora = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// o que vai ser registrado: o plano do dia, ou a versão que você editou (rasc)
const rascunho = (key, ref) => rasc[ref] || itensDe(ref, celDoDia(key, ref));
const copiaItens = itens => itens.map(i => ({ ...i, k: i.k && i.k.slice() }));

// liga peso, trocar, remover e adicionar de uma lista de itens; mudou(itens) grava e redesenha
function ligaItens(card, pegar, mudou, aoDigitar) {
  card.querySelectorAll('input[data-i]').forEach(inp => inp.oninput = () => {
    const v = parseFloat(inp.value.replace(',', '.')), its = pegar();
    its[inp.dataset.i].q = isFinite(v) && v >= 0 ? v : 0;
    aoDigitar(its, +inp.dataset.i);
  });
  card.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const its = pegar(); its.splice(+b.dataset.rm, 1); mudou(its); });
  card.querySelectorAll('[data-troca]').forEach(b => b.onclick = () => {
    const i = +b.dataset.troca, its = pegar();
    abrirBusca(`Trocar ${nomeIt(its[i])} por…`, novo => { its[i] = novo; mudou(its); });
  });
  card.querySelector('[data-add]').onclick = () => abrirBusca('Adicionar', novo => { const its = pegar(); its.push(novo); mudou(its); });
}

function ligaRefeicao(card, key, r, el) {
  const d = dieta.diario[key], reg = d && d.refs[r.id];
  const bf = card.querySelector('[data-fechar]');
  if (bf) bf.onclick = () => { nutAberta = null; renderNutHoje(el); };
  if (reg) {
    card.querySelector('[data-desfazer]').onclick = () => {
      for (const [a, v] of Object.entries(reg.baixa || {})) dieta.estoque[a] = (dieta.estoque[a] || 0) + v;
      delete d.refs[r.id];
      salvarDieta(); renderNutHoje(el);
    };
    return;
  }
  const cel = celDoDia(key, r.id);
  const trocar = nova => { diaReg(key).troca[r.id] = nova; delete rasc[r.id]; salvarDieta(); renderNutHoje(el); };
  const bt = card.querySelector('[data-trocar]');
  if (bt) bt.onclick = () => folhaOpcoes(r.id, cel, trocar, true);
  ligaEscolhas(card, r.id, cel, trocar);
  const bu = card.querySelector('[data-usar]');
  if (bu) bu.onclick = () => { const sg = sugestaoEstoque(key, r.id); trocar(sg.cel); toast(`${r.nome}: trocado pelo que tem em casa`); };
  const bav = card.querySelector('[data-av]');
  if (bav) bav.onclick = () => { avAberto[r.id] = true; renderNutHoje(el); };
  // o primeiro toque em qualquer item vira rascunho; a partir daí a refeição é "a sua versão"
  const pegar = () => rasc[r.id] || (rasc[r.id] = copiaItens(itensDe(r.id, cel)));
  ligaItens(card, pegar, its => { rasc[r.id] = its; renderNutHoje(el); }, (its, i) => {
    card.querySelector(`[data-k="${i}"]`).textContent = kcal(macros([its[i]])[0]);
    card.querySelector('[data-kcal]').textContent = `${kcal(macros(its)[0])} kcal`;
    card.querySelector('[data-macro]').textContent = macroLinha(macros(its));
  });
  const bo = card.querySelector('[data-ontem]');
  if (bo) bo.onclick = () => { rasc[r.id] = copiaItens(dieta.diario[ontemKey()].refs[r.id].itens); renderNutHoje(el); };
  const bp = card.querySelector('[data-plano]');
  if (bp) bp.onclick = () => { delete rasc[r.id]; renderNutHoje(el); };
  card.querySelector('[data-comi]').onclick = () => {
    const comidos = rascunho(key, r.id).filter(i => i.k || i.q > 0).map(({ a, q, k, nome }) => k ? { a, q, k, nome } : { a, q });
    diaReg(key).refs[r.id] = { ts: Date.now(), op: cel.op, itens: comidos, baixa: baixaEstoque(comidos), fiel: seguiuPlano(r.id, cel, comidos) };
    lembraRecentes(comidos);
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

// tira do estoque o que foi comido; devolve quanto saiu de cada um (para o "desfazer")
function baixaEstoque(itens, baixa = {}) {
  for (const { a, q, k } of itens) {
    if (k || !ALIMENTOS[a]) continue;
    const tem = dieta.estoque[a] || 0, sai = Math.min(tem, compra(a, q));
    if (sai > 0) { dieta.estoque[a] = tem - sai; baixa[a] = (baixa[a] || 0) + sai; }
  }
  return baixa;
}
function lembraRecentes(itens) {
  for (const { a, k } of itens) if (!k) dieta.recentes = [a, ...dieta.recentes.filter(x => x !== a)].slice(0, 12);
}

// fora do plano: cada item já entra no dia (sem botão "Comi")
function cardExtra(reg) {
  const itens = reg ? reg.itens : [];
  return `<div class="card nut-ref" data-ref="extra">${cabRef(EXTRA, itens.length ? `<span class="tag num">${kcal(macros(itens)[0])} kcal</span>` : '')}
    ${itens.length ? `<div class="nut-itens">${itens.map(linhaItem).join('')}</div><div class="nut-macro">${macroLinha(macros(itens))}</div>` : '<p class="mudo">Comeu algo que não está na dieta? Registre aqui, pela busca, pelo código de barras ou só as calorias.</p>'}
    <div class="nut-mais"><button class="btn-texto" data-add>${ic('plus', 'ic-18')}Adicionar</button></div></div>`;
}
function ligaExtra(card, key, el) {
  const pegar = () => { const dr = diaReg(key); return (dr.refs.extra = dr.refs.extra || { ts: Date.now(), itens: [], baixa: {} }).itens; };
  const mudou = its => {
    const reg = diaReg(key).refs.extra;
    for (const [a, v] of Object.entries(reg.baixa || {})) dieta.estoque[a] = (dieta.estoque[a] || 0) + v; // refaz a baixa do zero
    reg.itens = its; reg.baixa = baixaEstoque(its);
    if (!its.length) delete diaReg(key).refs.extra;
    lembraRecentes(its);
    salvarDieta(); renderNutHoje(el);
  };
  let tDigitar;
  ligaItens(card, pegar, mudou, its => { clearTimeout(tDigitar); tDigitar = setTimeout(() => mudou(its), 600); });
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

// carrinho do mercado: o que você já pegou fica marcado (dá pra desmarcar) e só entra no estoque em "Guardar compras"
// dieta.carrinho[a] = {q (unidade de compra), prod (produto escaneado, opcional)}
const unCompra = a => ALIMENTOS[a].un === 'un' ? (ALIMENTOS[a].nu || 'un') : 'g';
function renderCarrinho(el) {
  const dias = dieta.periodo === 'mes' ? 30 : 7, lista = listaCompras(), cart = dieta.carrinho;
  const ate = dataBr(new Date(hojeKey() + 'T12:00').getTime() + (dias - 1) * 864e5);
  const comprar = lista.filter(l => l.falta > 0 || cart[l.a]), tem = lista.filter(l => l.falta <= 0 && !cart[l.a]);
  const extras = Object.keys(cart).filter(a => ALIMENTOS[a] && !comprar.some(l => l.a === a));
  const pegos = comprar.filter(l => cart[l.a]).length + extras.length, total = comprar.length + extras.length;
  const linha = l => {
    const c = cart[l.a], prod = c && c.prod && ALIMENTOS[c.prod];
    return `<div class="linha-lista com-acao nut-compra${c ? ' pego' : ''}" data-a="${l.a}">
      <button class="btn-ic nut-check" data-comprei="${l.a}" aria-label="${c ? 'Mudar' : 'Peguei'} ${esc(nomeCompra(l.a))}" aria-pressed="${!!c}">${ic(c ? 'check-circle-fill' : 'check-circle')}</button>
      <div class="ll-txt"><span class="ll-nome">${esc(nomeCompra(l.a))}</span>
      <span class="ll-det">${c ? `pegou ${fmtCompra(l.a, c.q, true)}${prod ? ` · ${esc(prod.nome)}` : ''}` : `precisa ${fmtCompra(l.a, l.precisa, true)}${l.tem ? ` · tem ${fmtCompra(l.a, l.tem, true)}` : ''}`}</span></div>
      <b class="num nut-falta">${l.falta > 0 ? fmtCompra(l.a, l.falta) : ''}</b></div>`;
  };
  el.innerHTML = `
    <div class="seg" role="tablist" id="nut-periodo">
      <button role="tab" data-per="semana" class="${dieta.periodo !== 'mes' ? 'ativo' : ''}" aria-selected="${dieta.periodo !== 'mes'}">Semana</button>
      <button role="tab" data-per="mes" class="${dieta.periodo === 'mes' ? 'ativo' : ''}" aria-selected="${dieta.periodo === 'mes'}">Mês (30 dias)</button>
    </div>
    ${total ? `<div class="card nut-mercado">
      <div class="nut-cab"><h3>${ic('shopping-cart')}No carrinho</h3><span class="num" id="nut-pegos"><b>${pegos}</b> de ${total}</span></div>
      <div class="barra"><div style="width:${total ? pegos / total * 100 : 0}%;background:var(--ok)"></div></div>
      <button class="ghost larga" id="bt-escanear-compra">${ic('barcode')}Escanear produto</button>
    </div>` : ''}
    <p class="mudo">Do cardápio de hoje até ${ate}, em peso cru, menos o que tem em casa, arredondado para cima. Toque no círculo quando pegar o item e diga quanto pegou.</p>
    ${total ? SECOES_NUT.map(s => {
      const ls = [...comprar, ...extras.map(a => ({ a, precisa: 0, tem: 0, falta: 0 }))].filter(l => ALIMENTOS[l.a].sec === s);
      return ls.length ? `<div class="secao"><div class="kicker">${s}</div><div class="lista">${ls.map(linha).join('')}</div></div>` : '';
    }).join('') : `<div class="vazio">${ic('check-circle')}<span>O estoque cobre o período todo.</span></div>`}
    ${pegos ? `<button class="grande larga" id="bt-guardar">${ic('package')}Guardar compras (${pegos})</button>` : ''}
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
  const sugerido = a => { const l = lista.find(x => x.a === a); return l ? l.falta : 0; };
  el.querySelectorAll('[data-comprei]').forEach(b => b.onclick = () => {
    const a = b.dataset.comprei;
    painelQtd(a, { sugerido: sugerido(a), atual: cart[a] && cart[a].q, prod: cart[a] && cart[a].prod, noCarrinho: !!cart[a] }, () => renderCarrinho(el));
  });
  const be = $('bt-escanear-compra');
  if (be) be.onclick = () => scannerCodigo(id => ligarProduto(id, comprar.map(l => l.a), a =>
    painelQtd(a, { sugerido: sugerido(a), prod: id, atual: cart[a] && cart[a].q }, () => renderCarrinho(el))));
  const bg = $('bt-guardar');
  if (bg) bg.onclick = () => {
    const n = guardarCarrinho();
    salvarDieta(); renderCarrinho(el);
    toast(`${plural(n, 'item guardado', 'itens guardados')} no estoque`);
  };
  el.querySelectorAll('[data-fator]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value.replace(',', '.'));
    if (!(v > 0)) return;
    dieta.fatores[inp.dataset.fator] = v / 100;
    salvarDieta(); renderCarrinho(el);
  });
  const bc = $('bt-copiar-lista');
  if (bc) bc.onclick = () => {
    const txt = SECOES_NUT.map(s => {
      const ls = comprar.filter(l => ALIMENTOS[l.a].sec === s && l.falta > 0);
      return ls.length ? `${s}\n${ls.map(l => `- ${nomeCompra(l.a)}: ${fmtCompra(l.a, l.falta)}`).join('\n')}` : '';
    }).filter(Boolean).join('\n\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Lista copiada'), () => toast('Não deu para copiar'));
  };
}
function guardarCarrinho() {
  const ents = Object.entries(dieta.carrinho);
  for (const [a, c] of ents) {
    dieta.estoque[a] = (dieta.estoque[a] || 0) + c.q;
    if (c.prod) dieta.marcas[a] = c.prod;
  }
  dieta.carrinho = {};
  return ents.length;
}

// "quanto você pegou?" — já vem com o sugerido (ou o peso da embalagem escaneada)
// o: {sugerido, atual, prod, noCarrinho, direto (vai direto pro estoque, sem carrinho)}
function painelQtd(a, o, depois) {
  const al = ALIMENTOS[a], un = unCompra(a), prod = o.prod && ALIMENTOS[o.prod];
  const doPacote = prod && prod.pacote && al.un !== 'un' ? prod.pacote : null;
  const ini = o.atual ?? doPacote ?? (o.sugerido || (al.un === 'un' ? (al.pac ? al.pac[0] : 1) : 500));
  const atalhos = al.un === 'un' ? (al.pac ? [1, 2, 3].map(n => [n * al.pac[0], `${n} ${n === 1 ? al.pac[1] : al.pac[2]}`]) : [])
    : [[500, '500 g'], [1000, '1 kg'], [2000, '2 kg']];
  if (doPacote && !atalhos.some(x => x[0] === doPacote)) atalhos.unshift([doPacote, `embalagem ${fmtCompra(a, doPacote, true)}`]);
  if (o.sugerido && !atalhos.some(x => x[0] === o.sugerido)) atalhos.unshift([o.sugerido, `lista ${fmtCompra(a, o.sugerido, true)}`]);
  abrirPainel(`<div class="kicker folha-titulo">${o.direto ? 'Guardar no estoque' : 'Quanto você pegou?'}</div>
    <h3 class="nut-ficha-nome">${esc(nomeCompra(a))}</h3>
    ${prod ? `<div class="mudo">${esc(prod.nome)}</div>${prod.info ? resumoProduto(prod.m, prod.info) : ''}` : ''}
    ${o.sugerido ? `<p class="mudo">A lista sugere ${fmtCompra(a, o.sugerido)}.</p>` : ''}
    <div class="linha nut-qtd"><input id="nq-v" type="number" inputmode="decimal" min="0" step="any" class="num" value="${ini}" aria-label="Quantidade em ${un}"><span class="u">${un}</span></div>
    ${atalhos.length ? `<div class="chips">${atalhos.map(([v, t]) => `<button class="chip" data-q="${v}">${esc(t)}</button>`).join('')}</div>` : ''}
    <button class="larga" id="nq-ok">${o.direto ? 'Guardar' : o.noCarrinho ? 'Atualizar' : 'Pôr no carrinho'}</button>
    ${o.noCarrinho ? `<button class="ghost larga" id="nq-tirar">${ic('x')}Tirar do carrinho</button>` : ''}`);
  $('folha').querySelectorAll('[data-q]').forEach(b => b.onclick = () => { $('nq-v').value = b.dataset.q; });
  $('nq-v').select();
  $('nq-ok').onclick = () => {
    const q = parseFloat($('nq-v').value.replace(',', '.'));
    if (!(q > 0)) return toast('Coloque a quantidade');
    if (o.direto) {
      dieta.estoque[a] = (dieta.estoque[a] || 0) + q;
      if (o.prod) dieta.marcas[a] = o.prod;
      toast(`${nomeCompra(a)} no estoque`);
    } else dieta.carrinho[a] = { q, ...(o.prod ? { prod: o.prod } : {}) };
    salvarDieta(); fecharPainel(); depois();
  };
  const bt = $('nq-tirar');
  if (bt) bt.onclick = () => { delete dieta.carrinho[a]; salvarDieta(); fecharPainel(); depois(); };
}

// produto escaneado → qual item da dieta ele é? (fica lembrado para a próxima vez)
function ligarProduto(id, preferidos, pronto) {
  const al = ALIMENTOS[id];
  if (al.sec !== 'Meus alimentos') return pronto(id); // já é um alimento da dieta
  if (al.liga && ALIMENTOS[al.liga]) return pronto(al.liga);
  const daDieta = Object.keys(ALIMENTOS).filter(a => ALIMENTOS[a].sec !== 'Meus alimentos');
  const ordem = [...preferidos.filter(a => daDieta.includes(a)), ...daDieta.filter(a => !preferidos.includes(a))];
  const liga = a => { al.liga = a; if (dieta.custom[id]) dieta.custom[id].liga = a; salvarDieta(); pronto(a); };
  abrirFolha(`${al.nome}: é qual item?`, [
    ...ordem.map(a => ({ ic: preferidos.includes(a) ? 'shopping-cart' : 'fork-knife', txt: nomeCompra(a), acao: () => liga(a) })),
    { ic: 'plus', txt: 'Item à parte (fora da dieta)', acao: () => pronto(id) },
  ]);
}

// ---------- Despensa (estoque + produtos) ----------
// uso nos próximos 7 dias: cru por dia e a porção pronta mais comum
function usoSemana() {
  const uso = {}, hoje = new Date(hojeKey() + 'T12:00').getTime();
  for (let i = 0; i < 7; i++) {
    const key = dayKey(hoje + i * 864e5);
    for (const r of REFEICOES) for (const { a, q } of itensDe(r.id, celDoDia(key, r.id))) {
      const u = uso[a] || (uso[a] = { cru: 0, vezes: 0, q: 0 });
      u.cru += compra(a, q); u.vezes++; u.q += q;
    }
  }
  return uso;
}
// "2 kg cru ≈ 10 porções de 150 g · dá até qui, 22/10"
function previsao(a, uso) {
  const u = uso[a], tem = dieta.estoque[a] || 0;
  if (!u || !u.cru) return null;
  const dias = tem / (u.cru / 7), porcao = u.q / u.vezes, al = ALIMENTOS[a];
  const porcoes = al.un === 'un' ? 0 : Math.floor(tem / fator(a) / porcao + 1e-6);
  return { dias, fim: Date.now() + Math.floor(dias) * 864e5, txt: [porcoes ? `≈ ${plural(porcoes, `porção de ${Math.round(porcao)} g`, `porções de ${Math.round(porcao)} g`)}` : '',
    tem ? (dias >= 30 ? 'dá pra 30+ dias' : `dá até ${dataCurta(Date.now() + Math.floor(dias) * 864e5)}`) : ''].filter(Boolean).join(' · ') };
}
function renderEstoque(el) {
  const uso = usoSemana(), ids = Object.keys(ALIMENTOS).filter(a => uso[a] || dieta.estoque[a] > 0);
  const tag = p => !p ? '' : p.dias < 1 ? `<span class="tag tag-serio">em falta</span>` : p.dias < 3 ? `<span class="tag tag-atencao">${plural(Math.floor(p.dias), 'dia', 'dias')}</span>`
    : `<span class="tag tag-ok">${p.dias >= 30 ? '30+ dias' : plural(Math.floor(p.dias), 'dia', 'dias')}</span>`;
  // próximos furos: o que você controla e acaba nos próximos 7 dias
  const furos = ids.filter(a => controla(a)).map(a => [a, previsao(a, uso)]).filter(([, p]) => p && p.dias < 7).sort((x, y) => x[1].dias - y[1].dias);
  el.innerHTML = `
    ${furos.length ? `<div class="aviso-card">${ic('package')}<div><b>Vai acabar esta semana</b><ul>${furos.slice(0, 5).map(([a, p]) =>
      `<li>${esc(nomeCompra(a))}: ${p.dias < 1 ? 'já acabou' : `até ${dataCurta(p.fim)}`}</li>`).join('')}</ul></div></div>` : ''}
    <p class="mudo">O que você tem em casa, em peso cru ou unidades. "Comi" desconta daqui e "Guardar compras" soma aqui. A previsão usa as porções do seu cardápio.</p>
    ${SECOES_NUT.map(s => {
      const ls = ids.filter(a => ALIMENTOS[a].sec === s);
      return ls.length ? `<div class="secao"><div class="kicker">${s}</div><div class="lista">${ls.map(a => {
        const p = controla(a) ? previsao(a, uso) : null, marca = dieta.marcas[a] && ALIMENTOS[dieta.marcas[a]];
        return `<div class="linha-lista nut-est"><div class="ll-txt"><span class="ll-nome">${esc(nomeCompra(a))} ${tag(p)}</span>
          <span class="ll-det">${[marca ? esc(marca.nome) : '', p ? p.txt : ''].filter(Boolean).join(' · ')}</span></div>
          <input type="number" inputmode="decimal" min="0" step="any" class="num" data-est="${a}" value="${+(dieta.estoque[a] || 0).toFixed(1)}" aria-label="${esc(nomeCompra(a))} em casa">
          <span class="u">${unCompra(a)}</span></div>`;
      }).join('')}</div></div>` : '';
    }).join('')}
    <div class="secao"><div class="kicker">Produtos</div><div class="tela justa" id="nut-produtos"></div></div>`;
  el.querySelectorAll('[data-est]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value.replace(',', '.'));
    dieta.estoque[inp.dataset.est] = v > 0 ? v : 0;
    salvarDieta(); renderEstoque(el);
  });
  renderProdutos($('nut-produtos'));
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
