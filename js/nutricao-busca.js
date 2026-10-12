/* Carga — Nutrição: busca de alimentos, alimento novo, só calorias e scanner de rótulo
   (código de barras → Open Food Facts; foto da tabela nutricional → OCR). */
'use strict';

const CDN_BARCODE = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/es/ponyfill.js';
const CDN_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const CDN_TESS_POR = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int';
const OFF_API = 'https://world.openfoodfacts.org/api/v2/product/';

const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const qPadrao = a => ALIMENTOS[a].q0 ?? (ALIMENTOS[a].un === 'un' ? 1 : 100);
const novoItem = a => ({ a, q: qPadrao(a) });
let pararCamera = null; // fecharFolha (base.js) desliga a câmera

function abrirPainel(html) {
  const f = $('folha');
  f.innerHTML = `<div class="folha-corpo nut-painel" role="dialog">${html}</div>`;
  f.hidden = false;
  f.onclick = e => { if (e.target === f) fecharPainel(); };
  return f.firstElementChild;
}
const fecharPainel = () => fecharFolha();

// ---------- busca ----------
function abrirBusca(titulo, escolher) {
  const p = abrirPainel(`<div class="kicker folha-titulo">${esc(titulo)}</div>
    <input type="search" id="nut-busca" placeholder="Buscar alimento" autocomplete="off">
    <div class="nut-fontes">
      <button class="ghost" id="nb-codigo">${ic('barcode', 'ic-18')}Código de barras</button>
      <button class="ghost" id="nb-foto">${ic('camera', 'ic-18')}Foto da tabela</button>
      <button class="ghost" id="nb-novo">${ic('plus', 'ic-18')}Alimento novo</button>
      <button class="ghost" id="nb-kcal">${ic('fire', 'ic-18')}Só calorias</button>
    </div>
    <div class="nut-resultados" id="nut-resultados"></div>`);
  const pega = item => { fecharPainel(); escolher(item); };
  const lista = () => {
    const q = semAcento($('nut-busca').value.trim());
    const todos = Object.keys(ALIMENTOS);
    const ids = q ? todos.filter(a => semAcento(ALIMENTOS[a].nome).includes(q))
      : [...dieta.recentes.filter(a => ALIMENTOS[a]), ...todos.filter(a => !dieta.recentes.includes(a))];
    $('nut-resultados').innerHTML = (!q && dieta.recentes.length ? '<div class="kicker">Recentes primeiro</div>' : '') +
      (ids.length ? ids.slice(0, 40).map(a => `<button class="ll-linha" data-a="${a}"><span>${esc(ALIMENTOS[a].nome)}</span>
        <span class="valor">${kcal(macros([novoItem(a)])[0])} kcal · ${qtdTxt(a, qPadrao(a))}</span></button>`).join('')
        : `<p class="mudo">Nada com "${esc($('nut-busca').value)}". Cadastre como alimento novo.</p>`);
    $('nut-resultados').querySelectorAll('[data-a]').forEach(b => b.onclick = () => pega(novoItem(b.dataset.a)));
  };
  $('nut-busca').oninput = lista;
  lista();
  $('nb-novo').onclick = () => formAlimento({ nome: $('nut-busca').value.trim() }, a => pega(novoItem(a)));
  $('nb-kcal').onclick = () => formCalorias(pega);
  $('nb-codigo').onclick = () => scannerCodigo(a => pega(novoItem(a)));
  $('nb-foto').onclick = () => fotoTabela(a => pega(novoItem(a)));
}

// ---------- só calorias ----------
function formCalorias(pronto) {
  abrirPainel(`<div class="kicker folha-titulo">Só calorias</div>
    <label for="nk-nome">O que foi</label><input id="nk-nome" type="text" placeholder="ex.: lanche na rua" value="">
    <div class="linha"><div><label for="nk-kcal">Calorias</label><input id="nk-kcal" type="number" inputmode="decimal" placeholder="kcal"></div>
      <div><label for="nk-p">Proteína (g)</label><input id="nk-p" type="number" inputmode="decimal" placeholder="opcional"></div></div>
    <div class="linha"><div><label for="nk-c">Carbo (g)</label><input id="nk-c" type="number" inputmode="decimal" placeholder="opcional"></div>
      <div><label for="nk-g">Gordura (g)</label><input id="nk-g" type="number" inputmode="decimal" placeholder="opcional"></div></div>
    <button class="larga" id="nk-ok">Adicionar</button>`);
  $('nk-kcal').focus();
  $('nk-ok').onclick = () => {
    const v = id => parseFloat($(id).value.replace(',', '.')) || 0;
    if (!(v('nk-kcal') > 0)) return toast('Coloque as calorias');
    pronto({ a: '_k', q: 1, k: [v('nk-kcal'), v('nk-p'), v('nk-c'), v('nk-g')], nome: $('nk-nome').value.trim() || 'Calorias' });
  };
}

// ---------- alimento novo (manual, código de barras ou foto) ----------
// pre: {nome, codigo, porcao, base: '100'|'porcao', kcal, p, c, g, aviso}
function formAlimento(pre, pronto) {
  const base = pre.base || '100';
  const campo = (id, rot, v, ph = '') => `<div><label for="${id}">${rot}</label><input id="${id}" type="number" inputmode="decimal" step="any" min="0" value="${v ?? ''}" placeholder="${ph}"></div>`;
  abrirPainel(`<div class="kicker folha-titulo">Alimento novo</div>
    ${pre.aviso ? `<div class="aviso-card nut-aviso">${ic('info')}<span>${esc(pre.aviso)}</span></div>` : ''}
    <label for="na-nome">Nome</label><input id="na-nome" type="text" value="${esc(pre.nome || '')}" placeholder="ex.: Iogurte natural">
    <div class="seg" id="na-base" style="margin-top:12px;background:var(--c-elev)">
      <button data-base="100" class="${base === '100' ? 'ativo' : ''}">Valores por 100 g</button>
      <button data-base="porcao" class="${base === 'porcao' ? 'ativo' : ''}">Por porção</button>
    </div>
    <div class="linha">${campo('na-porcao', 'Porção (g)', pre.porcao, 'ex.: 30')}${campo('na-kcal', 'Calorias (kcal)', pre.kcal)}</div>
    <div class="linha">${campo('na-c', 'Carbo (g)', pre.c)}${campo('na-p', 'Proteína (g)', pre.p)}${campo('na-g', 'Gordura (g)', pre.g)}</div>
    <button class="larga" id="na-ok">Salvar e adicionar</button>`);
  let b = base;
  $('na-base').querySelectorAll('[data-base]').forEach(x => x.onclick = () => {
    b = x.dataset.base;
    $('na-base').querySelectorAll('[data-base]').forEach(y => y.classList.toggle('ativo', y === x));
  });
  $('na-ok').onclick = () => {
    const v = id => parseFloat($(id).value.replace(',', '.'));
    const nome = $('na-nome').value.trim(), porcao = v('na-porcao') > 0 ? v('na-porcao') : null;
    if (!nome) return toast('Dê um nome ao alimento');
    if (!(v('na-kcal') >= 0)) return toast('Coloque as calorias');
    if (b === 'porcao' && !porcao) return toast('Coloque o peso da porção');
    const f = b === 'porcao' ? 100 / porcao : 1, r1 = x => Math.round((x || 0) * f * 10) / 10;
    const id = 'c' + Date.now().toString(36);
    const al = { nome, sec: 'Meus alimentos', un: 'g', m: [r1(v('na-kcal')), r1(v('na-p')), r1(v('na-c')), r1(v('na-g'))], q0: porcao || 100 };
    if (pre.codigo) al.codigo = pre.codigo;
    dieta.custom[id] = ALIMENTOS[id] = al;
    salvarDieta();
    pronto(id);
  };
}

// ---------- código de barras ----------
const porCodigo = codigo => Object.keys(ALIMENTOS).find(a => ALIMENTOS[a].codigo === codigo);

async function detectorDeCodigo() {
  const formatos = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  if ('BarcodeDetector' in window) {
    try {
      const ok = await BarcodeDetector.getSupportedFormats();
      if (formatos.some(f => ok.includes(f))) return new BarcodeDetector({ formats: formatos });
    } catch { /* cai no leitor em wasm */ }
  }
  const { BarcodeDetector: Leitor } = await import(CDN_BARCODE);
  return new Leitor({ formats: formatos });
}

function scannerCodigo(pronto) {
  abrirPainel(`<div class="kicker folha-titulo">Código de barras</div>
    <div class="nut-camera"><video id="nc-video" playsinline muted></video><div class="nut-mira"></div></div>
    <p class="mudo" id="nc-msg">Aponte a câmera para o código de barras.</p>
    <label for="nc-num">Ou digite os números</label>
    <div class="linha"><input id="nc-num" type="text" inputmode="numeric" placeholder="789…"><button id="nc-ok" style="flex:0 0 auto">Buscar</button></div>`);
  let achou = false;
  const usar = codigo => { if (achou) return; achou = true; if (pararCamera) { pararCamera(); pararCamera = null; } buscarCodigo(codigo, pronto); };
  $('nc-ok').onclick = () => { const c = $('nc-num').value.replace(/\D/g, ''); if (c.length >= 8) usar(c); else toast('Código incompleto'); };
  (async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('nc-msg').textContent = 'Este navegador não abre a câmera aqui. Digite os números.'; return; }
    let stream, vivo = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch { if ($('nc-msg')) $('nc-msg').textContent = 'Sem acesso à câmera. Digite os números do código.'; return; }
    pararCamera = () => { vivo = false; stream.getTracks().forEach(t => t.stop()); };
    const v = $('nc-video');
    if (!v) return pararCamera();
    v.srcObject = stream;
    await v.play().catch(() => {});
    let det;
    try { det = await detectorDeCodigo(); } catch { if ($('nc-msg')) $('nc-msg').textContent = 'Não deu para carregar o leitor. Digite os números.'; return; }
    while (vivo && !achou) {
      try {
        const r = await det.detect(v);
        if (r.length) return usar(r[0].rawValue);
      } catch { /* quadro sem imagem ainda */ }
      await new Promise(ok => setTimeout(ok, 250));
    }
  })();
}

async function buscarCodigo(codigo, pronto) {
  const local = porCodigo(codigo);
  if (local) { fecharPainel(); return pronto(local); }
  abrirPainel(`<div class="kicker folha-titulo">Código ${esc(codigo)}</div><p class="mudo">Procurando o produto…</p>`);
  try {
    const r = await fetch(`${OFF_API}${codigo}.json?fields=product_name,brands,nutriments,serving_quantity`);
    const d = await r.json();
    const n = d.product && d.product.nutriments;
    if (d.status !== 1 || !n || n['energy-kcal_100g'] == null) throw new Error('sem dados');
    const r1 = x => x == null ? '' : Math.round(x * 10) / 10;
    formAlimento({
      codigo, base: '100', nome: [d.product.product_name, d.product.brands && d.product.brands.split(',')[0]].filter(Boolean).join(' · '),
      porcao: d.product.serving_quantity ? r1(+d.product.serving_quantity) : '',
      kcal: r1(n['energy-kcal_100g']), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), g: r1(n.fat_100g),
      aviso: 'Achei no Open Food Facts. Confira com o rótulo antes de salvar.',
    }, pronto);
  } catch {
    formAlimento({ codigo, aviso: 'Não achei este produto. Use "Foto da tabela" ou preencha com o rótulo; da próxima vez o código já é reconhecido.' }, pronto);
  }
}

// ---------- foto da tabela nutricional (OCR) ----------
let tesseractCarregando = null;
function carregaTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return tesseractCarregando || (tesseractCarregando = new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = CDN_TESSERACT;
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => { tesseractCarregando = null; erro(new Error('falhou')); };
    document.head.appendChild(s);
  }));
}

function fotoTabela(pronto) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    abrirPainel(`<div class="kicker folha-titulo">Lendo a tabela</div><p class="mudo" id="nf-msg">Preparando o leitor… (a primeira vez baixa uns 5 MB)</p>`);
    try {
      const T = await carregaTesseract();
      const w = await T.createWorker('por', 1, {
        langPath: CDN_TESS_POR,
        logger: m => { if (m.status === 'recognizing text' && $('nf-msg')) $('nf-msg').textContent = `Lendo… ${Math.round(m.progress * 100)}%`; },
      });
      const { data } = await w.recognize(f);
      await w.terminate();
      const lido = lerRotulo(data.text);
      const achou = ['kcal', 'p', 'c', 'g'].filter(k => lido[k] != null).length;
      formAlimento({ ...lido, aviso: achou >= 3 ? 'Li a tabela. Confira os números com o rótulo antes de salvar.'
        : 'Não consegui ler tudo. Complete com o rótulo (uma foto reta e com luz ajuda).' }, pronto);
    } catch {
      formAlimento({ aviso: 'Não deu para ler a foto agora. Preencha com o rótulo.' }, pronto);
    }
  };
  inp.click();
}

// texto da tabela nutricional (RDC 429: colunas 100 g | porção | %VD; modelo antigo: só porção) → valores
function lerRotulo(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const nums = l => (semAcento(l)
    .replace(/\d+[.,]?\d*\s*kj/g, ' ')                 // energia em kJ
    .replace(/\d+[.,]?\d*\s*%/g, ' ')                  // %VD
    .replace(/\((kcal|g|mg)\)/g, ' ')
    .match(/\d+(?:[.,]\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.')));
  const todo = semAcento(texto);
  const mPorcao = todo.match(/porcao[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*(g|ml)\b/);
  const porcao = mPorcao ? parseFloat(mPorcao[1].replace(',', '.')) : null;
  const tem100 = /\b100\s*(g|ml)\b/.test(todo.replace(/porcao[^\n]*/g, ''));
  const r1 = x => Math.round(x * 10) / 10;
  // o OCR às vezes perde a vírgula ("8,5" → "85"): as colunas 100 g e porção têm de bater entre si,
  // e o que sobrar de dúvida se resolve pelas calorias (4 kcal/g de carbo e proteína, 9 de gordura)
  const ESC = [1, 0.1, 0.01];
  const candidatos = (re, excl, max) => {
    const l = linhas.find(x => re.test(semAcento(x)) && !(excl && excl.test(semAcento(x))));
    const n = l ? nums(l) : [];
    if (!n.length) return [];
    if (!tem100) return [porcao ? r1(n[0] * 100 / porcao) : n[0]]; // modelo antigo: só a coluna da porção
    if (!porcao || n.length < 2) return [n[0]];
    const ok = [];
    for (const a of ESC) for (const b of ESC) {
      const v100 = n[0] * a, vp = n[1] * b;
      if (v100 <= max && Math.abs(vp - v100 * porcao / 100) <= Math.max(vp * 0.15, 0.02) && !ok.includes(r1(v100))) ok.push(r1(v100));
    }
    if (ok.length) return ok;
    if (n.length === 2) for (const a of ESC) { const v = n[0] * a * 100 / porcao; if (v <= max) return [r1(v)]; } // sumiu a coluna 100 g
    return n[0] <= max ? [n[0]] : [];
  };
  const cand = {
    kcal: candidatos(/valor energ|energia|caloria/, null, 900),
    c: candidatos(/carboidrat/, null, 100),
    p: candidatos(/protein/, null, 100),
    g: candidatos(/gorduras? totais|gorduras?\b|lipidio/, /satur|trans|mono|poli/, 100),
  };
  const ou = l => l.length ? l : [null];
  let melhor = null;
  for (const kcal of ou(cand.kcal)) for (const c of ou(cand.c)) for (const p of ou(cand.p)) for (const g of ou(cand.g)) {
    const erro = kcal == null ? 0 : Math.abs(4 * (c || 0) + 4 * (p || 0) + 9 * (g || 0) - kcal);
    if (!melhor || erro < melhor.erro - 1e-9) melhor = { erro, kcal, c, p, g };
  }
  const r = { kcal: melhor.kcal, c: melhor.c, p: melhor.p, g: melhor.g, base: '100' };
  if (porcao) r.porcao = porcao;
  if (!tem100 && !porcao) r.base = 'porcao';
  return r;
}
