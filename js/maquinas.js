/* Carga — Aba Máquinas: fotos das máquinas em IndexedDB. */
'use strict';

// ---------- aba Máquinas (fotos em IndexedDB) ----------
let dbPromise = null;
function db() {
  dbPromise ??= new Promise((res, rej) => {
    const r = indexedDB.open('carga', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}
const txFotos = async modo => (await db()).transaction('fotos', modo).objectStore('fotos');
const idbReq = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

let fotoPendente = null;
let urlsGaleria = [];

async function renderMaquinas() {
  urlsGaleria.forEach(URL.revokeObjectURL);
  urlsGaleria = [];
  const fotos = (await idbReq((await txFotos('readonly')).getAll())).sort((a, b) => b.ts - a.ts);
  const gal = $('galeria');
  gal.innerHTML = '';
  if (!fotos.length) {
    gal.innerHTML = '<p class="mudo" style="grid-column:1/-1">Nenhuma máquina cadastrada ainda.</p>';
    return;
  }
  for (const f of fotos) {
    const url = URL.createObjectURL(f.blob);
    urlsGaleria.push(url);
    const card = document.createElement('div');
    card.className = 'foto-card';
    card.innerHTML = `<img src="${url}" alt="Máquina" loading="lazy">
      <div class="leg"><div class="ex">${esc(f.ex && exMap[f.ex] ? exMap[f.ex].nome : 'Sem vínculo')}</div>
      ${f.nota ? `<div class="nota">${esc(f.nota)}</div>` : ''}
      <button class="ghost">Excluir</button></div>`;
    card.querySelector('img').onclick = () => abreLightbox(url);
    card.querySelector('button').onclick = async () => {
      if (!confirm('Excluir esta foto?')) return;
      await idbReq((await txFotos('readwrite')).delete(f.id));
      renderMaquinas();
    };
    gal.appendChild(card);
  }
}

function prepararFoto(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  fotoPendente = f;
  $('preview-foto').src = URL.createObjectURL(f);
  $('foto-nota').value = '';
  $('foto-exercicio').value = ativo.ex && exMap[ativo.ex] ? ativo.ex : '';
  $('form-foto').hidden = false;
  $('form-foto').scrollIntoView({ behavior: 'smooth' });
  input.value = '';
}

async function salvarFoto() {
  if (!fotoPendente) return;
  await idbReq((await txFotos('readwrite')).put({
    id: Date.now(), blob: fotoPendente, ex: $('foto-exercicio').value, nota: $('foto-nota').value.trim(), ts: Date.now(),
  }));
  fotoPendente = null;
  $('form-foto').hidden = true;
  toast('Máquina salva 📷');
  renderMaquinas();
}
