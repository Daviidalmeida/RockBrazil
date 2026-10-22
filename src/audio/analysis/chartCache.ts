import { BeatmapByDifficulty } from '../../types';

export class ChartCache {
  private static DB_NAME = 'RockBrazilChartsDB';
  private static STORE_NAME = 'charts';

  private static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async get(hash: string): Promise<BeatmapByDifficulty | null> {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_NAME, 'readonly');
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.get(hash);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      // Fallback to localStorage
      try {
        const local = localStorage.getItem(`rb_chart_${hash}`);
        return local ? JSON.parse(local) : null;
      } catch {
        return null;
      }
    }
  }

  static async set(hash: string, charts: BeatmapByDifficulty): Promise<void> {
    try {
      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.put(charts, hash);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      try {
        localStorage.setItem(`rb_chart_${hash}`, JSON.stringify(charts));
      } catch {
        // Ignore quota limits
      }
    }
  }
}
