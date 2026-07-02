/**
 * Client-only IndexedDB history for the AI Image Studio.
 *
 * Generated images cost credits, so we persist each session's images locally (in the browser) —
 * the seller can revisit a past set and re-download without paying to regenerate. Images are stored
 * as data-URL strings (what the UI already renders), one record per session. IndexedDB (not
 * localStorage) because a full set can be tens of MB. All functions are safe no-ops when IndexedDB
 * is unavailable (SSR / private mode) — they resolve to null/[] rather than throwing.
 */

export interface HistoryShot {
  key: string;
  label: string;
  images: string[]; // data URLs
}

export interface HistorySession {
  id: string;
  createdAt: number; // epoch ms
  productDesc: string;
  style: string;
  size: string;
  background: string | null;
  hero: string | null; // data URL
  shots: HistoryShot[];
}

const DB_NAME = 'vierank-image-studio';
const STORE = 'sessions';
const MAX_SESSIONS = 12;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Newest-first list of saved sessions (capped). */
export async function listSessions(): Promise<HistorySession[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, 'readonly');
    const all = await promisify(tx.objectStore(STORE).getAll() as IDBRequest<HistorySession[]>);
    return (all ?? []).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SESSIONS);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** Insert/update a session, then prune anything past the cap (oldest first). */
export async function saveSession(session: HistorySession): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(session);
    const all = await promisify(store.getAll() as IDBRequest<HistorySession[]>);
    const ordered = (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
    for (const old of ordered.slice(MAX_SESSIONS)) store.delete(old.id);
    await txDone(tx);
  } catch {
    // best-effort persistence
  } finally {
    db.close();
  }
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } catch {
    // ignore
  } finally {
    db.close();
  }
}
