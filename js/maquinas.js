/* Carga — Aba Máquinas: fotos das máquinas (e GIFs de execução do usuário) em IndexedDB. */
'use strict';

// ---------- aba Máquinas (fotos em IndexedDB) ----------
let dbPromise = null;
function db() {
  dbPromise ??= new Promise((res, rej) => {
    const r = indexedDB.open('carga', 2);
    r.onupgradeneeded = () => { // v2: GIFs de execução que o usuário adiciona (um por variação, só neste aparelho)
      if (!r.result.objectStoreNames.contains('fotos')) r.result.createObjectStore('fotos', { keyPath: 'id' });
      if (!r.result.objectStoreNames.contains('gifs')) r.result.createObjectStore('gifs', { keyPath: 'ex' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}
const txFotos = async modo => (await db()).transaction('fotos', modo).objectStore('fotos');
const txGifs = async modo => (await db()).transaction('gifs', modo).objectStore('gifs');
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
