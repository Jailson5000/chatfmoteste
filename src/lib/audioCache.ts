// IndexedDB-based persistent cache for decrypted audio

const DB_NAME = "audio-cache";
const DB_VERSION = 1;
const STORE_NAME = "decrypted-audio";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });

  return dbPromise;
}

export interface CachedAudio {
  id: string; // whatsapp_message_id
  dataUrl: string;
  timestamp: number;
}

export async function getCachedAudio(whatsappMessageId: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(whatsappMessageId);

      request.onsuccess = () => {
        const result = request.result as CachedAudio | undefined;
        resolve(result?.dataUrl || null);
      };

      request.onerror = () => {
        console.error("Failed to get cached audio:", request.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.error("Error accessing IndexedDB:", error);
    return null;
  }
}

export async function setCachedAudio(whatsappMessageId: string, dataUrl: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      
      const data: CachedAudio = {
        id: whatsappMessageId,
        dataUrl,
        timestamp: Date.now(),
      };

      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error("Failed to cache audio:", request.error);
        resolve(); // Don't reject, just log error
      };
    });
  } catch (error) {
    console.error("Error saving to IndexedDB:", error);
  }
}

// Clean up old cache entries (older than 7 days)
export async function cleanupOldCache(): Promise<void> {
  try {
    const db = await openDB();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const range = IDBKeyRange.upperBound(sevenDaysAgo);

      const request = index.openCursor(range);
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => resolve();
    });
  } catch (error) {
    console.error("Error cleaning up cache:", error);
  }
}
