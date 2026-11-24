// 資料存在這台裝置的瀏覽器裡（IndexedDB 為主，localStorage 再存一份）
const DB = 'chuanshun-tracker', STORE = 'kv', KEY = 'state', LS_KEY = 'chuanshun-state-copy';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet() {
  const db = await openDb();
  return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbPut(v) {
  const db = await openDb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

export async function loadState() {
  let s = null;
  try { s = await idbGet(); } catch (e) { console.warn('IndexedDB 讀取失敗', e); }
  if (!s) { try { const t = localStorage.getItem(LS_KEY); if (t) s = JSON.parse(t); } catch { /* ignore */ } }
  return s || null;
}

let pending = null;
export async function saveState(state) {
  state.meta = { ...(state.meta || {}), savedAt: Date.now() };
  const copy = JSON.parse(JSON.stringify(state));
  pending = (async () => {
    try { await idbPut(copy); } catch (e) { console.warn('IndexedDB 寫入失敗', e); }
    try { localStorage.setItem(LS_KEY, JSON.stringify(copy)); } catch { /* 空間不足時忽略，IndexedDB 仍有 */ }
  })();
  return pending;
}

/** 請瀏覽器把資料標為「持久保存」，避免空間不足時被清掉 */
export async function requestPersist() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}
