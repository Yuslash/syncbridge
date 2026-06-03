import { ConvertedPlaylist, MatchedTrack } from "../types";

export interface LocalPlaylist {
  id: string; // The playlist ID (matching Spotify url suffix or generated target)
  name: string;
  description: string;
  spotifyUrl: string;
  tracks: MatchedTrack[];
  convertedAt: string;
  updatedAt: string;
  userId?: string | null; // Associated Firebase user ID, if logged in
  isSynced?: boolean;     // Indicates whether changes are fully flushed online
}

const DB_NAME = "SyncBridgeLocalDB";
const STORE_NAME = "playlists";
const DB_VERSION = 1;

/**
 * Native IndexedDB Wrapper class to preserve Spotify-to-YouTube conversions locally.
 */
class IndexedDBHelper {
  private getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // id is keyPath
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };

      request.onerror = (event: any) => {
        reject(event.target.error || new Error("Failed to open IndexedDB database."));
      };
    });
  }

  /**
   * Retrieves all playlists stored in IndexedDB.
   */
  public async getAllPlaylists(): Promise<LocalPlaylist[]> {
    try {
      const db = await this.getDB();
      return new Promise<LocalPlaylist[]>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = () => {
          reject(request.error || new Error("Failed to read playlists from IndexedDB."));
        };
      });
    } catch (err) {
      console.error("[IndexedDB Error]", err);
      return [];
    }
  }

  /**
   * Saves or updates a playlist in IndexedDB.
   */
  public async savePlaylist(playlist: LocalPlaylist): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(playlist);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error || new Error("Failed to write playlist to IndexedDB."));
        };
      });
    } catch (err) {
      console.error("[IndexedDB Save Error]", err);
    }
  }

  /**
   * Deletes a playlist from IndexedDB.
   */
  public async deletePlaylist(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error || new Error("Failed to delete playlist from IndexedDB."));
        };
      });
    } catch (err) {
      console.error("[IndexedDB Delete Error]", err);
    }
  }
}

export const localDB = new IndexedDBHelper();
