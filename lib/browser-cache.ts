// Persistent, browser-local cache. No student profile or shortlist is sent to providers.
const DB = "fusion-atlas-cache-v2";
type Entry = { key: string; value: unknown; savedAt: number; expires: number };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const store = req.result.objectStoreNames.contains("entries")
        ? req.transaction!.objectStore("entries")
        : req.result.createObjectStore("entries", { keyPath: "key" });
      store.createIndex("savedAt", "savedAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function readCache(key: string): Promise<unknown | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("entries").objectStore("entries").get(key);
      req.onsuccess = () => {
        const row = req.result as Entry | undefined;
        resolve(row && row.expires > Date.now() ? row.value : undefined);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function writeCache(key: string, value: unknown, ttl = 86400000) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      store.put({ key, value, savedAt: Date.now(), expires: Date.now() + ttl });
      const req = store.index("savedAt").openKeyCursor(null, "prev");
      let count = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (++count > 60) store.delete(cursor.primaryKey);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function clearCache() {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      tx.objectStore("entries").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
