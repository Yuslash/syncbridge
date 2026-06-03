import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  User,
  onAuthStateChanged
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  setDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  onSnapshot
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { LocalPlaylist } from "./db";

// Operation types for the mandatory Skill debugger
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

/**
 * Handles errors matching the mandatory skill debug contract.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth ? auth.currentUser : null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('[Firestore Exception Caught]', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Lazy initialization checking to prevent boot-up crashes before keys are configured
export const isFirebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let app;
let db: any = null;
let auth: any = null;
const googleProvider = new GoogleAuthProvider();

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId); // Critical Database definition
    auth = getAuth(app);

    // Connection verification as mandated by Skill
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (error) {
        if (error instanceof Error && error.message.includes("the client is offline")) {
          console.warn("[Firebase Connection Warn] The client appears to be offline.");
        }
      }
    };
    testConnection();
  } catch (err) {
    console.error("[Firebase Setup Error] Failed to launch Firebase SDK:", err);
  }
}

export { db, auth };

/**
 * Initiates Google Single Sign-On pop-up.
 */
export async function loginWithGoogle(): Promise<User | null> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error("Firebase is not fully initialized. Please finalize setup in the right panel.");
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    console.error("[Google Login PopUp Error]", err);
    throw err;
  }
}

/**
 * Logs out the current Firebase user.
 */
export async function logoutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

/**
 * Synchronizes an offline playlist to the active cloud Firestore.
 */
export async function syncPlaylistToCloud(playlist: LocalPlaylist): Promise<void> {
  if (!isFirebaseConfigured || !db || !auth || !auth.currentUser) return;

  const playlistId = playlist.id;
  const path = `playlists/${playlistId}`;
  
  try {
    // Standard ABAC user ownership mapping
    const payload = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || "",
      spotifyUrl: playlist.spotifyUrl,
      userId: auth.currentUser.uid,
      tracks: playlist.tracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album || "",
        durationMs: t.durationMs || 0,
        artworkUrl: t.artworkUrl || "",
        videoId: t.videoId || null,
        videoTitle: t.videoTitle || "",
        videoUrl: t.videoUrl || "",
        thumbnailUrl: t.thumbnailUrl || "",
        isManual: !!t.isManual,
        status: t.status
      })),
      updatedAt: new Date().toISOString()
    };

    const docRef = doc(db, "playlists", playlistId);
    await setDoc(docRef, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Synchronously deletes a playlist from the cloud.
 */
export async function deletePlaylistFromCloud(id: string): Promise<void> {
  if (!isFirebaseConfigured || !db || !auth || !auth.currentUser) return;
  const path = `playlists/${id}`;
  try {
    const docRef = doc(db, "playlists", id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Fetches all of the current authenticated user's remote playlists.
 */
export async function fetchCloudPlaylists(): Promise<LocalPlaylist[]> {
  if (!isFirebaseConfigured || !db || !auth || !auth.currentUser) return [];
  const path = "playlists";
  try {
    const q = query(collection(db, "playlists"), where("userId", "==", auth.currentUser.uid));
    const querySnapshot = await getDocs(q);
    const results: LocalPlaylist[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      results.push({
        id: data.id,
        name: data.name,
        description: data.description,
        spotifyUrl: data.spotifyUrl,
        tracks: data.tracks,
        convertedAt: data.updatedAt,
        updatedAt: data.updatedAt,
        userId: data.userId,
        isSynced: true
      });
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
}
