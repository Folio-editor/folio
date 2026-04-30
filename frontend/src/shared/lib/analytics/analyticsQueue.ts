import type { QueuedAnalyticsEvent } from './analyticsEvents';

const DB_NAME = 'folio-analytics';
const STORE_NAME = 'events';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);
    let result: T | void;

    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function enqueueAnalyticsEvent(event: QueuedAnalyticsEvent): Promise<void> {
  await withStore('readwrite', (store) => store.put(event));
}

export async function readQueuedAnalyticsEvents(limit = 50): Promise<QueuedAnalyticsEvent[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    const request = index.openCursor();
    const events: QueuedAnalyticsEvent[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || events.length >= limit) {
        resolve(events);
        return;
      }
      events.push(cursor.value as QueuedAnalyticsEvent);
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

export async function removeAnalyticsEvents(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withStore('readwrite', (store) => {
    for (const id of ids) {
      store.delete(id);
    }
  });
}

export async function incrementAnalyticsRetry(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const events = await readQueuedAnalyticsEvents(100);
  const targets = new Set(ids);
  await withStore('readwrite', (store) => {
    for (const event of events) {
      if (targets.has(event.id)) {
        store.put({ ...event, retryCount: event.retryCount + 1 });
      }
    }
  });
}

export async function getQueuedAnalyticsCount(): Promise<number> {
  const count = await withStore<number>('readonly', (store) => store.count());
  return count ?? 0;
}
