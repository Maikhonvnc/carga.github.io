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
    await pg.click('[data-grupo="Peito"]');
    await pg.click('.mov .chip[data-ex="supino_reto"]');
    await pg.click('#bt-iniciar');
    await pg.waitForTimeout(1200);
    await pg.click('#bt-parar');
    await pg.click('[data-rir="2"]');
    await pg.click('#bt-salvar-serie');
    const s = await pg.evaluate(() => logHoje('supino_reto').sets[0]);
    ok(s.dur >= 1 && s.rir === 2 && s.reps === 11, 'salva série com duração, esforço e alvo (+1 rep)');
    ok(await pg.isVisible('#barra-treino'), 'descanso começa sozinho');
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
    ok((await pg.textContent('.sug-principal')).includes('Pernas'), 'sugere o grupo treinado há mais tempo (Pernas)');
    ok(await pg.locator('#sugestoes .chip[data-abre-grupo]').count() >= 3, 'mostra os outros grupos ao lado');
    await pg.click('[data-repetir="Pernas"]');
    await pg.waitForTimeout(200);
    ok(await pg.evaluate(() => ativo.ex === 'agachamento' && ativo.rotinaTemp.itens.join() === 'agachamento,leg_press'), 'repetir treino abre o 1º exercício daquele dia');
    ok((await pg.textContent('#p-fim')).includes('Leg press'), 'oferece o próximo exercício do treino repetido');
    ok(!pg.erros.length, 'sem erros de página (rodízio) ' + pg.erros.join(' | '));
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
    await pg.click('.mov .chip[data-ex="bulgaro_halteres"]');
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

  await browser.close();
  servidor.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo ✔');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
