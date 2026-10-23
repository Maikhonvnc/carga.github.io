// Testes de ponta a ponta do app (navegador real, tela de celular).
// Uso:  node tests/e2e.js          (precisa do Playwright: npm i -g playwright, ou NODE_PATH apontando para ele)
// Sobe um servidor estático próprio, roda os cenários e sai com código 1 se algo falhar.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const servidor = http.createServer((req, res) => {
  const f = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const D = 864e5;
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✔' : '✘'} ${msg}`); if (!cond) falhas++; };

async function novaPagina(browser, base, dados) {
  const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true })).newPage();
  pg.erros = [];
  pg.on('pageerror', e => pg.erros.push(e.message));
  pg.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Teste' : undefined));
  await pg.goto(base);
  await pg.evaluate(d => {
    localStorage.clear();
    localStorage.setItem('carga.backup_ts', String(Date.now()));
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(typeof v === 'function' ? v() : v));
  }, dados);
  await pg.reload();
  await pg.waitForTimeout(300);
  return pg;
}

(async () => {
  await new Promise(r => servidor.listen(0, r));
  const base = `http://localhost:${servidor.address().port}/index.html`;
  const browser = await chromium.launch();
  const agora = Date.now();

  // 1) migração de dados antigos (v2: peso × reps × séries num registro só)
  {
    const pg = await novaPagina(browser, base, {
      'carga.logs': [{ id: 1, ex: 'supino_reto', peso: 60, reps: 10, series: 3, ts: agora - 3 * D }],
      'carga.prefs': { contagem: 0 },
    });
    const l = await pg.evaluate(() => logs[0]);
    ok(l.sets.length === 3 && l.sets[0].peso === 60, 'migra registro antigo para 3 séries');
    // 2) série cronometrada com esforço → descanso automático
    ok(await pg.locator('[data-grupo="Peito"] .corpo-mini image').count() === 2 && await pg.locator('[data-grupo="Peito"] .corpo-mini path').count() > 0, 'ícones dos grupos no desenho realista');
    await pg.click('[data-grupo="Peito"]');
    await pg.click('.mov[data-ex="supino_reto"]');
    const mapa = await pg.evaluate(() => ({ imgs: document.querySelectorAll('.p-mapa .mapa-foco image').length, acesos: document.querySelectorAll('.p-mapa .mapa-foco path[fill="#ff1a1a"]').length }));
    ok(mapa.imgs === 2 && mapa.acesos > 0, 'desenho realista acende o foco em vermelho');
    await pg.click('#bt-iniciar');
    ok(await pg.isVisible('#serie-tela #crono') && !(await pg.isVisible('#dock')), 'série abre em tela cheia com o cronômetro');
    await pg.waitForTimeout(1200);
    await pg.click('#bt-parar');
    await pg.click('[data-rir="2"]');
    await pg.click('#bt-salvar-serie');
    const s = await pg.evaluate(() => logHoje('supino_reto').sets[0]);
    ok(s.dur >= 1 && s.rir === 2 && s.reps === 11, 'salva série com duração, esforço e alvo (+1 rep)');
    ok(await pg.isVisible('#anel') && (await pg.textContent('#bt-iniciar-fs')).includes('série 2'), 'descanso começa sozinho, com a próxima série na base');
    await pg.click('#bt-minimizar');
    ok(await pg.isVisible('#barra-treino') && await pg.isVisible('#dock'), 'minimizar volta ao painel com o descanso na barra');
    ok(!pg.erros.length, 'sem erros de página (fluxo de série) ' + pg.erros.join(' | '));
  }

  // 3) sugestão por rodízio + repetir o último treino do grupo
  {
    const pg = await novaPagina(browser, base, {
      'carga.logs': [
        { id: 1, ex: 'agachamento', ts: agora - 8 * D, sets: [{ peso: 80, reps: 8, ts: agora - 8 * D }] },
        { id: 2, ex: 'leg_press', ts: agora - 8 * D + 6e5, sets: [{ peso: 150, reps: 10, ts: agora - 8 * D + 6e5 }] },
        { id: 3, ex: 'supino_reto', ts: agora - 3 * D, sets: [{ peso: 60, reps: 10, ts: agora - 3 * D }] },
        { id: 4, ex: 'puxada_frontal', ts: agora - 2 * D, sets: [{ peso: 50, reps: 10, ts: agora - 2 * D }] },
      ],
    });
    ok((await pg.textContent('#card-dia')).includes('Pernas'), 'sugere o treino feito há mais tempo (Pernas)');
    ok(await pg.locator('#outros-treinos [data-treino]').count() === 2, 'mostra os outros dois treinos');
    await pg.click('#bt-comecar');
    await pg.waitForTimeout(200);
    ok(await pg.evaluate(() => ativo.ex === 'agachamento' && ativo.rotinaTemp.itens.join() === 'agachamento,leg_press'), 'começar o treino abre o 1º exercício do plano');
    ok((await pg.textContent('#p-fim')).includes('Leg press'), 'oferece o próximo exercício do treino');
    await pg.click('#bt-voltar');
    await pg.click('#bt-voltar');
    await pg.click('[data-grupo="Peito"]');
    await pg.click('#bt-repetir');
    ok(await pg.evaluate(() => ativo.ex === 'supino_reto'), 'repetir o treino do grupo abre o exercício daquele dia');
    ok(!pg.erros.length, 'sem erros de página (rodízio) ' + pg.erros.join(' | '));
  }

  // 3b) dia de empurrar: o plano traz peito, ombros e tríceps, e a grade marca os grupos do dia
  {
    const pg = await novaPagina(browser, base, {
      'carga.logs': [
        { id: 1, ex: 'supino_reto', ts: agora - 5 * D, sets: [{ peso: 60, reps: 10, ts: agora - 5 * D }] },
        { id: 2, ex: 'puxada_frontal', ts: agora - 3 * D, sets: [{ peso: 50, reps: 10, ts: agora - 3 * D }] },
        { id: 3, ex: 'agachamento', ts: agora - 2 * D, sets: [{ peso: 80, reps: 8, ts: agora - 2 * D }] },
      ],
    });
    ok((await pg.textContent('#card-dia .titulo')).includes('Empurrar'), 'sugere Empurrar depois de puxar e pernas');
    ok(await pg.locator('.grupo.sugerido[data-grupo="Peito"]').count() === 1 && await pg.locator('.grupo.sugerido[data-grupo="Ombros"]').count() === 1
      && await pg.locator('.grupo.sugerido[data-grupo="Pernas"]').count() === 0, 'grade marca os grupos do treino do dia');
    ok((await pg.textContent('[data-grupo="Peito"] .g-quando')).includes('5 dias'), 'grade mostra há quanto tempo cada grupo foi treinado');
    ok(await pg.isHidden('#bt-salvar-rotina'), '"Nova" rotina só aparece depois de treinar no dia');
    ok(!pg.erros.length, 'sem erros de página (divisão) ' + pg.erros.join(' | '));
  }

  // 4) unilateral, progressão pelo esforço e estagnação
  {
    const sess = (ex, dias, sets) => ({ id: Math.random(), ex, ts: agora - dias * D, sets: sets.map(s => ({ ts: agora - dias * D, ...s })) });
    const pg = await novaPagina(browser, base, {
      'carga.prefs': { contagem: 0 },
      'carga.logs': [
        sess('supino_reto', 12, [{ peso: 60, reps: 10 }]), sess('supino_reto', 9, [{ peso: 60, reps: 9 }]),
        sess('supino_reto', 6, [{ peso: 60, reps: 9 }]), sess('supino_reto', 3, [{ peso: 60, reps: 8, rir: 0 }]),
        sess('crucifixo', 3, [{ peso: 40, reps: 10, rir: 3 }, { peso: 40, reps: 10, rir: 4 }]),
        sess('supino_inclinado', 3, [{ peso: 30, reps: 6, rir: 0 }]),
      ],
    });
    const d = await pg.evaluate(() => [dicaCarga('supino_reto'), dicaCarga('crucifixo'), !!estagnacao('supino_reto'), dicaCarga('supino_inclinado')]);
    ok(d[0].alvoPeso === 60 && d[0].alvoReps === 9 && d[0].motivo, 'progressão dupla: +1 rep com motivo');
    ok(d[3].alvoPeso < 30 && /reduza/.test(d[3].motivo), 'abaixo da faixa indo à falha → reduz a carga');
    ok(d[1].alvoReps === 12, 'sobraram reps na reserva → +2 reps');
    ok(d[2], 'detecta estagnação após 3 sessões sem recorde');
    await pg.click('[data-grupo="Pernas"]');
    await pg.click('.mov[data-mov="bulgaro"]');
    await pg.click('[data-var="bulgaro_halteres"]');
    ok(await pg.isVisible('#f-repsE') && await pg.isVisible('#f-repsD'), 'variação unilateral mostra reps por lado');
    await pg.fill('#f-repsE', '8');
    await pg.dispatchEvent('#f-repsE', 'input');
    await pg.click('#bt-sem-crono');
    await pg.click('#bt-salvar-serie');
    const s = await pg.evaluate(() => logHoje('bulgaro_halteres').sets[0]);
    ok(s.repsE === 8 && s.reps === Math.min(s.repsE, s.repsD), 'salva lados e usa o mais fraco como reps');
    ok(!pg.erros.length, 'sem erros de página (unilateral) ' + pg.erros.join(' | '));
  }

  // 5) evolução por grupo, volume por músculo, abas e backup
  {
    const pg = await novaPagina(browser, base, {
      'carga.logs': [0, 7, 14].map((d, i) => ({ id: i, ex: 'elevacao_lateral', ts: agora - d * D - 3600e3, sets: [{ peso: 8 + i, reps: 12, ts: agora - d * D - 3600e3 }] })),
    });
    await pg.click('nav [data-tab="progresso"]');
    await pg.click('[data-pg="Ombros"]');
    ok(await pg.locator('.vm').count() === 1, 'volume por músculo do grupo');
    await pg.click('[data-evo="elevacao_lateral"]');
    ok(await pg.locator('.evo-det .grafico svg').count() === 2, 'detalhe com gráficos');
    await pg.click('nav [data-tab="musculos"]');
    ok(await pg.locator('#mapa-corpo .mapa-fadiga image').count() === 2 && await pg.locator('#mapa-corpo .mapa-fadiga path').count() > 0, 'aba Músculos mostra a fadiga no desenho realista');
    for (const aba of ['musculos', 'maquinas', 'ajustes', 'treino']) await pg.click(`nav [data-tab="${aba}"]`);
    await pg.click('nav [data-tab="ajustes"]');
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#bt-exportar')]);
    const bk = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok(bk.versao === 3 && bk.logs.length === 3, 'backup exporta os dados');
    ok(!pg.erros.length, 'sem erros de página (abas/backup) ' + pg.erros.join(' | '));
  }

  // 6) prévia do corpo carrega
  {
    const pg = await (await browser.newContext()).newPage();
    const erros = [];
    pg.on('pageerror', e => erros.push(e.message));
    await pg.goto(base.replace('index.html', 'previa.html'));
    await pg.waitForTimeout(500);
    ok(await pg.locator('#op-c path').count() > 50 && !erros.length, 'previa.html desenha as opções ' + erros.join(' | '));
  }

  // 7) GIF do próprio usuário: salva por variação no aparelho, aparece no painel e pode ser removido
  {
    const pg = await novaPagina(browser, base, {});
    ok(await pg.locator('.op-treino').count() === 3 && await pg.isVisible('#bt-comecar'), 'primeiro uso oferece os três treinos');
    await pg.click('[data-grupo="Ombros"]');
    await pg.click('.mov[data-ex="elevacao_lateral"]');
    const gif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
    await pg.setInputFiles('#input-gif-painel', { name: 'teste.gif', mimeType: 'image/gif', buffer: gif });
    await pg.waitForSelector('#anim-ex.gif img[src^="blob:"]');
    await pg.click('#bt-mais');
    ok(await pg.locator('#folha button', { hasText: 'Remover GIF' }).count() === 1, 'GIF do usuário aparece no painel');
    await pg.keyboard.press('Escape');
    await pg.reload();
    await pg.waitForTimeout(300);
    if (!(await pg.locator('#anim-ex').isVisible())) await pg.click('.mov[data-ex="elevacao_lateral"]').catch(() => {});
    await pg.waitForSelector('#anim-ex.gif img', { timeout: 3000 }).catch(() => {});
    ok(await pg.locator('#anim-ex.gif img').count() === 1, 'GIF continua salvo depois de recarregar');
    await pg.click('#bt-mais');
    await pg.click('#folha button:has-text("Remover GIF")');
    await pg.waitForTimeout(300);
    await pg.click('#bt-mais');
    ok(await pg.locator('#anim-ex.gif').count() === 0 && await pg.locator('#folha button', { hasText: 'Remover GIF' }).count() === 0, 'remove o GIF');
    ok(!pg.erros.length, 'sem erros de página (GIF) ' + pg.erros.join(' | '));
  }

  // 8) nutrição: comer desconta do estoque, macros do dia, cardápio e carrinho semanal/mensal
  {
    const pg = await novaPagina(browser, base, { 'carga.dieta': { estoque: { ovo: 12, arroz: 100 } } });
    await pg.click('[data-tab="nutricao"]');
    ok(await pg.locator('.nut-ref.hero[data-ref="cafe"]').count() === 1 && await pg.locator('[data-abrir]').count() === 5 && await pg.locator('[data-ref="extra"]').count() === 1, 'Hoje: próxima refeição em destaque, as outras 5 recolhidas e o fora do plano');
    await pg.fill('[data-ref="cafe"] input[data-i="1"]', '3');
    await pg.dispatchEvent('[data-ref="cafe"] input[data-i="1"]', 'input');
    await pg.click('[data-ref="cafe"] [data-comi]');
    const reg = await pg.evaluate(() => dieta.diario[hojeKey()].refs.cafe);
    ok(reg.itens.find(i => i.a === 'ovo').q === 3 && await pg.evaluate(() => dieta.estoque.ovo) === 9, 'Comi salva o peso digitado e tira do estoque');
    ok(await pg.textContent('.nut-barra b') === '432' && await pg.locator('.nut-ref.hero[data-ref="colacao"]').count() === 1, 'calorias do dia somam o que foi comido e a próxima refeição vira o destaque');
    await pg.click('[data-agua="500"]');
    ok(await pg.evaluate(() => dieta.diario[hojeKey()].agua) === 500, 'conta a água');
    await pg.click('[data-abrir="cafe"]');
    await pg.click('[data-ref="cafe"] [data-desfazer]');
    ok(await pg.evaluate(() => dieta.estoque.ovo) === 12 && !(await pg.evaluate(() => dieta.diario[hojeKey()].refs.cafe)), 'desfazer devolve ao estoque');
    // cardápio: almoço opção 3 (macarrão) na semana toda
    await pg.click('[data-nt="cardapio"]');
    await pg.click('[data-ref="almoco"] [data-trocar]');
    await pg.click('#folha [data-i="2"]');
    await pg.click('#bt-repetir-dia');
    ok(await pg.evaluate(() => [0, 1, 2, 3, 4, 5, 6].every(d => dieta.plano[d].almoco.op === 2)), 'cardápio copia o dia para a semana');
    await pg.click('[data-nt="carrinho"]');
    const sem = await pg.evaluate(() => Object.fromEntries(listaCompras().map(l => [l.a, l.falta])));
    // macarrão: 180 g cozido × 7 almoços × 0,44 = 554 g cru → 750 (passo de 250 g); patinho (moída no almoço + jantar) 3,07 kg → 3,5 kg; ovos 14 − 12 → 1 dúzia
    ok(sem.macarrao === 750 && sem.patinho === 3500 && !sem.arroz && sem.ovo === 12, 'carrinho da semana converte cozido → cru e desconta o estoque');
    await pg.click('[data-per="mes"]');
    const mes = await pg.evaluate(() => Object.fromEntries(listaCompras().map(l => [l.a, l.falta])));
    ok(mes.rap10 === 60 && (await pg.textContent('#nut-corpo')).includes('60 un · 6 pacotes'), 'carrinho do mês: 30 dias, com pacotes');
    await pg.click('[data-comprei="whey"]');
    await pg.click('#nq-ok');
    ok(await pg.evaluate(() => dieta.carrinho.whey.q === 2000 && !dieta.estoque.whey), 'pegou vai para o carrinho, ainda não para o estoque');
    await pg.click('#bt-guardar');
    ok(await pg.evaluate(() => dieta.estoque.whey) === 2000, 'guardar compras soma no estoque');
    ok(!pg.erros.length, 'sem erros de página (nutrição) ' + pg.erros.join(' | '));
  }

  // 9) comida flexível: trocar/remover/adicionar, alimento por código de barras, só calorias, repetir ontem, aderência e leitura do rótulo
  {
    const ontem = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const pg = await novaPagina(browser, base, { 'carga.dieta': { diario: { [ontem]: { refs: { colacao: { ts: agora - D, itens: [{ a: 'whey', q: 40 }], fiel: false } }, troca: {}, agua: 0 } } } });
    await pg.route('https://world.openfoodfacts.org/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 1, product: {
      product_name: 'Iogurte natural', brands: 'Marca', serving_quantity: 170, nutriments: { 'energy-kcal_100g': 63, proteins_100g: 3.8, carbohydrates_100g: 5, fat_100g: 3 } } }) }));
    await pg.click('[data-tab="nutricao"]');
    // café: tira o mamão e troca o pão francês por pão de forma (busca)
    await pg.click('[data-ref="cafe"] [data-rm="2"]');
    await pg.click('[data-ref="cafe"] [data-troca="0"]');
    await pg.fill('#nut-busca', 'pao de forma');
    await pg.click('#nut-resultados [data-a="pao_forma"]');
    await pg.click('#np-ok');
    await pg.click('[data-ref="cafe"] [data-comi]');
    const cafe = await pg.evaluate(() => dieta.diario[hojeKey()].refs.cafe);
    ok(cafe.itens.map(i => i.a).join() === 'pao_forma,ovo,cafe' && cafe.fiel === false, 'troca e remove itens antes de registrar (fora do plano)');
    // colação igual ao plano conta como seguida; repetir ontem copia o que foi comido
    await pg.click('[data-ref="colacao"] [data-comi]');
    ok((await pg.textContent('#nut-aderencia')).includes('1 de 2 refeições'), 'mostra a aderência do dia');
    await pg.click('[data-abrir="colacao"]');
    await pg.click('[data-ref="colacao"] [data-desfazer]');
    await pg.click('[data-ref="colacao"] [data-ontem]');
    ok(await pg.inputValue('[data-ref="colacao"] input[data-i="0"]') === '40', 'repetir ontem traz o que foi comido ontem');
    // fora do plano: só calorias e produto pelo código de barras (Open Food Facts)
    await pg.click('[data-ref="extra"] [data-add]');
    await pg.click('#nb-kcal');
    await pg.fill('#nk-nome', 'Coxinha');
    await pg.fill('#nk-kcal', '300');
    await pg.click('#nk-ok');
    await pg.click('[data-ref="extra"] [data-add]');
    await pg.click('#nb-codigo');
    await pg.fill('#nc-num', '7891234567895');
    await pg.click('#nc-ok');
    await pg.waitForSelector('#na-kcal');
    ok(await pg.inputValue('#na-kcal') === '63' && (await pg.inputValue('#na-nome')).includes('Iogurte') && await pg.inputValue('#na-porcao') === '170', 'código de barras preenche o alimento pelo Open Food Facts');
    await pg.click('#na-ok');
    const extra = await pg.evaluate(() => dieta.diario[hojeKey()].refs.extra.itens);
    ok(extra.length === 2 && extra[0].k[0] === 300 && extra[1].q === 170, 'fora do plano soma calorias rápidas e o produto na porção do rótulo');
    await pg.click('[data-ref="extra"] [data-add]');
    await pg.click('#nb-codigo');
    await pg.fill('#nc-num', '7891234567895');
    await pg.click('#nc-ok');
    ok(await pg.evaluate(() => dieta.diario[hojeKey()].refs.extra.itens.length) === 3 && await pg.isHidden('#folha'), 'mesmo código já é reconhecido sem buscar de novo');
    ok(await pg.evaluate(() => dieta.recentes[0].startsWith('c')), 'alimento novo vai para os recentes');
    // leitura da tabela nutricional (texto como o OCR devolve, com vírgulas perdidas)
    const r = await pg.evaluate(() => [
      lerRotulo('INFORMAÇÃO NUTRICIONAL\nPorção: 30 g (2 colheres de sopa)\n100g 30g %vVD*\nValor energético (kcal) 394 18 6\nCarboidratos totais (g) 66 20 7\nProteínas (g) uU 42 8\nGorduras totais (g) 85 26 4\nGorduras saturadas (g) 15 05 2'),
      lerRotulo('Quantidade por porção de 25 g\nValor energético 100 kcal = 420 kJ 5%\nCarboidratos 15 g 5%\nProteínas 2,5 g 3%\nGorduras totais 3,5 g 6%\nGorduras saturadas 1 g'),
    ]);
    ok(r[0].kcal === 394 && r[0].c === 66 && r[0].p === 14 && r[0].g === 8.5 && r[0].porcao === 30, 'lê a tabela nova (100 g | porção) mesmo sem vírgulas');
    ok(r[1].kcal === 400 && r[1].c === 60 && r[1].p === 10 && r[1].g === 14, 'lê a tabela antiga (só porção) e converte para 100 g');
    ok(!pg.erros.length, 'sem erros de página (comida flexível) ' + pg.erros.join(' | '));
  }

  // 10) produtos (estilo Desrotulando): nota, processamento, alertas, comparar e alternativas
  {
    const prod = (code, nome, n, nova, ad, cats) => ({ code, product_name: nome, brands: 'Marca', serving_quantity: 30, nova_group: nova,
      additives_tags: ad, ingredients_text_pt: 'farinha de trigo, açúcar…', categories_tags: cats, nutriments: n });
    const recheado = prod('7890000000017', 'Biscoito recheado', { 'energy-kcal_100g': 480, proteins_100g: 5, carbohydrates_100g: 70, fat_100g: 20,
      sugars_100g: 35, 'saturated-fat_100g': 9, sodium_100g: 0.3, fiber_100g: 1.5 }, 4, ['en:e322', 'en:e471', 'en:e150d'], ['en:snacks', 'en:biscuits']);
    const integral = prod('7890000000024', 'Biscoito integral', { 'energy-kcal_100g': 420, proteins_100g: 9, carbohydrates_100g: 65, fat_100g: 12,
      sugars_100g: 12, 'saturated-fat_100g': 3, sodium_100g: 0.35, fiber_100g: 7 }, 3, [], ['en:snacks', 'en:biscuits']);
    const pg = await novaPagina(browser, base, {});
    await pg.route('https://world.openfoodfacts.org/**', r => {
      const u = r.request().url();
      if (u.includes('/search')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ products: [recheado, integral] }) });
      const p = [recheado, integral].find(x => u.includes(x.code));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(p ? { status: 1, product: p } : { status: 0 }) });
    });
    await pg.click('[data-tab="nutricao"]');
    await pg.click('[data-nt="estoque"]');
    const escanear = async code => {
      await pg.click('#np-escanear');
      await pg.fill('#nc-num', code);
      await pg.click('#nc-ok');
      await pg.waitForSelector('#na-ok');
    };
    await escanear('7890000000017');
    const resumo = await pg.textContent('.nut-resumo-prod');
    ok(/Evite/.test(resumo) && resumo.includes('Ultraprocessado') && resumo.includes('Alto em açúcar') && resumo.includes('1 aditivo de atenção'), 'escanear mostra nota, processamento e alertas antes de salvar');
    await pg.click('#na-ok');
    await pg.waitForSelector('.nut-ficha');
    const ficha = await pg.textContent('#folha');
    ok(ficha.includes('Alto em gordura saturada') && ficha.includes('E150D · caramelo IV') && ficha.includes('Ingredientes'), 'ficha do produto com lupa, aditivos e ingredientes');
    // alternativas: acha o integral (nota maior) e salva
    await pg.click('#nf-alt');
    await pg.waitForSelector('.nut-resultados [data-i]');
    ok((await pg.textContent('.nut-resultados')).includes('Biscoito integral') && !(await pg.textContent('.nut-resultados')).includes('recheado'), 'alternativas trazem só produtos com nota maior');
    await pg.click('.nut-resultados [data-i="0"]');
    await pg.click('#na-ok');
    await pg.waitForSelector('.nut-ficha');
    ok(await pg.locator('#nut-corpo [data-prod]').count() === 2, 'alternativa salva entra nos produtos');
    await pg.click('#nf-comparar');
    await pg.click('#folha [data-i="0"]');
    const comp = await pg.textContent('.nut-comp');
    ok(comp.includes('Biscoito recheado') && comp.includes('Ultraprocessado') && await pg.locator('.nut-comp td.c-ok').count() >= 5, 'compara dois produtos lado a lado e marca o melhor');
    const notas = await pg.evaluate(() => [notaProduto([159, 32, 0, 2.5], { nova: 1, acucar: 0, satur: 0.8, sodio: 60, fibra: 0 }).nota, notaProduto([480, 5, 70, 20], { acucar: 35 }).parcial]);
    ok(notas[0] >= 90 && notas[1] === true, 'nota alta para frango grelhado e aviso de nota parcial sem sódio');
    ok(!pg.erros.length, 'sem erros de página (produtos) ' + pg.erros.join(' | '));
  }

  // 11) uso no mercado e em casa: escolher pelo estoque, carrinho com quantidade real, scanner ligado ao plano, pesagem e previsão
  {
    const whey = { code: '7898000000001', product_name: 'Whey Concentrado', brands: 'Growth', serving_quantity: 30, product_quantity: 900, nova_group: 4,
      additives_tags: ['en:e955'], categories_tags: [], nutriments: { 'energy-kcal_100g': 400, proteins_100g: 80, carbohydrates_100g: 8, fat_100g: 6, sugars_100g: 5, 'saturated-fat_100g': 3, sodium_100g: 0.2 } };
    const pg = await novaPagina(browser, base, { 'carga.dieta': { estoque: { frango: 0, patinho: 2000, arroz: 1000, feijao: 1000, macarrao: 0 } } });
    await pg.route('https://world.openfoodfacts.org/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(r.request().url().includes(whey.code) ? { status: 1, product: whey } : { status: 0 }) }));
    await pg.click('[data-tab="nutricao"]');
    ok(await pg.locator('[data-abrir="almoco"] .tag-atencao').count() === 1, 'refeição sem ingrediente em casa aparece com "falta" na lista');
    await pg.click('[data-abrir="almoco"]');
    const aviso = await pg.textContent('[data-ref="almoco"] .nut-falta-aviso');
    ok(aviso.includes('Falta filé de frango') && aviso.includes('patinho'), 'avisa o que falta e sugere o que dá pra fazer com o estoque');
    await pg.click('[data-ref="almoco"] [data-usar]');
    ok(await pg.evaluate(() => dieta.diario[hojeKey()].troca.almoco.esc.carne) === 'patinho' && await pg.locator('[data-ref="almoco"] .nut-falta-aviso').count() === 0, 'um toque troca pelo que tem em casa');
    await pg.click('[data-ref="almoco"] [data-trocar]');
    const ops = await pg.textContent('#folha');
    ok(ops.includes('Dá pra fazer com o que tem') && ops.includes('Falta macarrão'), 'opções mostram o que dá pra fazer e o que falta');
    await pg.evaluate(() => fecharFolha());
    const itens = await pg.$$eval('[data-ref="almoco"] .nut-itens > *', els => els.map(e => e.className));
    ok(itens[0].includes('pesar') && itens[itens.length - 1].includes('nut-av'), 'na pesagem o que se pesa vem primeiro e a salada fica numa linha só');
    await pg.click('[data-ref="almoco"] [data-av]');
    ok(await pg.locator('[data-ref="almoco"] .nut-it:not(.pesar)').count() >= 3, 'a linha da salada abre os itens');
    // mercado
    await pg.click('[data-nt="carrinho"]');
    await pg.click('[data-comprei="frango"]');
    await pg.fill('#nq-v', '1100');
    await pg.click('#nq-ok');
    ok(await pg.evaluate(() => dieta.carrinho.frango.q === 1100 && dieta.estoque.frango === 0) && await pg.locator('.nut-compra.pego[data-a="frango"]').count() === 1, 'marca o frango com o peso real da bandeja');
    await pg.click('[data-comprei="frango"]');
    await pg.click('#nq-tirar');
    ok(await pg.evaluate(() => !dieta.carrinho.frango), 'dá para desmarcar um toque errado');
    await pg.click('[data-comprei="frango"]');
    await pg.fill('#nq-v', '1100');
    await pg.click('#nq-ok');
    await pg.click('#bt-escanear-compra');
    await pg.fill('#nc-num', whey.code);
    await pg.click('#nc-ok');
    await pg.click('#na-ok');
    await pg.click('#folha .ll-linha:has-text("Whey protein")');
    ok(await pg.inputValue('#nq-v') === '900' && (await pg.textContent('#folha')).includes('Growth'), 'produto escaneado é ligado ao whey do plano, com o peso da embalagem e a nota');
    await pg.click('#nq-ok');
    ok((await pg.textContent('#nut-pegos')).startsWith('2'), 'contador do carrinho');
    await pg.click('#bt-guardar');
    ok(await pg.evaluate(() => dieta.estoque.frango === 1100 && dieta.estoque.whey === 900 && !Object.keys(dieta.carrinho).length && !!dieta.marcas.whey), 'guardar compras leva tudo ao estoque');
    await pg.click('#bt-escanear-compra').catch(() => {});
    if (await pg.isVisible('#nc-num')) {
      await pg.fill('#nc-num', whey.code);
      await pg.click('#nc-ok');
      ok(await pg.isVisible('#nq-v'), 'na segunda vez o código já cai direto no whey');
      await pg.evaluate(() => fecharFolha());
    }
    // despensa: previsão de quando acaba
    await pg.click('[data-nt="estoque"]');
    const desp = await pg.textContent('#nut-corpo');
    ok(/porç(ão|ões) de \d+ g/.test(desp) && desp.includes('dá até') && desp.includes('Growth'), 'despensa mostra porções, até quando dá e a marca');
    ok(await pg.locator('#nut-produtos [data-prod]').count() === 1, 'produtos ficam na despensa');
    ok(!pg.erros.length, 'sem erros de página (mercado e casa) ' + pg.erros.join(' | '));
  }

  // 12) vídeos de execução em pacote: ligados ao exercício pelo nome do arquivo, só no aparelho, sem trocar o GIF escolhido
  {
    const pg = await novaPagina(browser, base, {});
    const mp4 = Buffer.from('00000018667479706d703432', 'hex');
    await pg.evaluate(async () => { await idbReq((await txGifs('readwrite')).put({ ex: 'agachamento', blob: new Blob(['meu']), ts: 1 })); });
    await pg.click('[data-tab="ajustes"]');
    await pg.setInputFiles('#input-videos', [
      { name: 'Barbell_Bench_Press.mp4', mimeType: 'video/mp4', buffer: mp4 },
      { name: 'Seated_leg_extension.mp4', mimeType: 'video/mp4', buffer: mp4 },
      { name: 'Barbell_squat.mp4', mimeType: 'video/mp4', buffer: mp4 },
      { name: 'Jumping_Jack.mp4', mimeType: 'video/mp4', buffer: mp4 },
    ]);
    await pg.waitForFunction(() => /2 exercícios/.test(document.getElementById('vid-status').textContent));
    const g = await pg.evaluate(async () => Object.fromEntries((await idbReq((await txGifs('readonly')).getAll())).map(x => [x.ex, x.origem || 'meu'])));
    ok(g.supino_reto === 'pacote' && g.extensora === 'pacote' && g.agachamento === 'meu' && Object.keys(g).length === 3, 'vídeos do pacote vão para o exercício certo e não trocam o GIF escolhido');
    // .zip (deflate) lido no próprio navegador, sem biblioteca: só os vídeos com exercício entram
    const zlib = require('zlib'), partes = [], idx = [];
    let pos = 0;
    for (const [nome, dados, comprime] of [['videos/Seated_leg_curl_machine.mp4', mp4, true], ['videos/Calf_raises.mp4', mp4, false], ['svgs/logo.svg', Buffer.from('<svg/>'), true]]) {
      const n = Buffer.from(nome), c = comprime ? zlib.deflateRawSync(dados) : dados, h = Buffer.alloc(30), e = Buffer.alloc(46);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(comprime ? 8 : 0, 8); h.writeUInt32LE(c.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(n.length, 26);
      e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(comprime ? 8 : 0, 10); e.writeUInt32LE(c.length, 20); e.writeUInt32LE(dados.length, 24); e.writeUInt16LE(n.length, 28); e.writeUInt32LE(pos, 42);
      partes.push(h, n, c); idx.push(e, n); pos += 30 + n.length + c.length;
    }
    const cd = Buffer.concat(idx), fimZip = Buffer.alloc(22);
    fimZip.writeUInt32LE(0x06054b50, 0); fimZip.writeUInt16LE(3, 8); fimZip.writeUInt16LE(3, 10); fimZip.writeUInt32LE(cd.length, 12); fimZip.writeUInt32LE(pos, 16);
    await pg.setInputFiles('#input-videos', { name: 'pacote', mimeType: 'application/octet-stream', buffer: Buffer.concat([...partes, cd, fimZip]) });
    await pg.waitForFunction(() => /4 exercícios/.test(document.getElementById('vid-status').textContent));
    const doZip = await pg.evaluate(async () => { const g = await idbReq((await txGifs('readonly')).get('flexora_sentada')); return g && [g.blob.size, g.blob.type]; });
    ok(doZip && doZip[0] === 12 && doZip[1] === 'video/mp4', 'lê o .zip no aparelho (mesmo sem extensão no nome) e descompacta os vídeos');
    ok(await pg.evaluate(() => variacaoDoArquivo('exercicios/Barbell_Squat.mp4') === 'agachamento' && variacaoDoArquivo('Cable_Crossover.mp4') === 'crossover'), 'reconhece também o nome do free-exercise-db');
    await pg.click('#bt-vid-apagar');
    await pg.waitForFunction(() => /Nenhum/.test(document.getElementById('vid-status').textContent));
    ok(await pg.evaluate(async () => (await idbReq((await txGifs('readonly')).getAll())).map(x => x.ex).join()) === 'agachamento', 'apagar tira só os vídeos do pacote');
    ok(!pg.erros.length, 'sem erros de página (vídeos) ' + pg.erros.join(' | '));
  }

  // 13) alimentos comuns: grupo → preparo → unidade, medida caseira ou gramas; preparo tira do estoque o alimento de base
  {
    const pg = await novaPagina(browser, base, { 'carga.dieta': { estoque: { ovo: 12 } } });
    await pg.click('[data-tab="nutricao"]');
    await pg.click('[data-ref="extra"] [data-add]');
    ok(await pg.locator('#nut-resultados [data-g]').count() >= 15, 'busca mostra os grupos de alimentos comuns');
    await pg.click('#nut-resultados [data-g="ovo"]');
    await pg.click('[data-prep="ovo_frito"]');
    await pg.click('[data-med="un:2"]');
    ok((await pg.textContent('#np-macro')).startsWith('240 kcal'), 'dois ovos fritos: 240 kcal');
    await pg.click('#np-ok');
    await pg.click('[data-ref="extra"] [data-add]');
    await pg.fill('#nut-busca', 'arroz');
    await pg.click('#nut-resultados [data-g="arroz"]');
    await pg.click('[data-prep="arroz_integral"]');
    await pg.click('[data-med="g:90"]');
    await pg.click('#np-ok');
    await pg.click('[data-ref="extra"] [data-add]');
    await pg.click('#nut-resultados [data-g="paes"]');
    await pg.click('[data-modo="g"]');
    await pg.fill('#np-v', '75');
    await pg.dispatchEvent('#np-v', 'input');
    await pg.click('#np-ok');
    const its = await pg.evaluate(() => dieta.diario[hojeKey()].refs.extra.itens);
    ok(its[0].a === 'ovo_frito' && its[0].q === 2 && its[1].a === 'arroz_integral' && its[1].q === 90 && its[2].a === 'pao_frances' && its[2].q === 1.5,
      'registra preparo e quantidade (unidades, medida caseira e gramas convertidas em unidades)');
    ok(await pg.evaluate(() => dieta.estoque.ovo) === 10, 'ovo frito tira ovos do estoque');
    ok(await pg.evaluate(() => seguiuPlano('cafe', { op: 0, esc: {} }, [{ a: 'pao_frances', q: 1 }, { a: 'ovo_mexido', q: 2 }, { a: 'mamao', q: 100 }, { a: 'cafe', q: 200 }])), 'ovo mexido no lugar do cozido ainda conta como seguir o plano');
    ok(!pg.erros.length, 'sem erros de página (alimentos comuns) ' + pg.erros.join(' | '));
  }

  await browser.close();
  servidor.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo ✔');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
