import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { TrackRow } from "./components/TrackRow";
import { SpotifyTrack, MatchedTrack, ConvertedPlaylist } from "./types";
import { 
  Music, 
  Youtube, 
  Link2, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  FileCheck, 
  Share2, 
  RefreshCw, 
  ClipboardCopy, 
  Trash2, 
  Info,
  Layers,
  Sparkles,
  ArrowRight,
  ListRestart,
  ExternalLink,
  Search,
  Database,
  Cloud,
  CloudOff,
  FolderLock,
  Save,
  LogIn,
  Layers3,
  Lightbulb,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Local Persistence & Firebase Cloud Sync Modules
import { localDB, LocalPlaylist } from "./lib/db";
import { 
  auth, 
  isFirebaseConfigured, 
  loginWithGoogle, 
  logoutUser, 
  syncPlaylistToCloud, 
  deletePlaylistFromCloud, 
  fetchCloudPlaylists 
} from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

const SAMPLE_PLAYLISTS = [
  {
    name: "Acoustic Hits",
    url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGsy3985",
    description: "Unplugged hits and favorite singer-songwriters."
  },
  {
    name: "Chill Lofi Beats",
    url: "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn",
    description: "The perfect lofi soundtrack to study, work or relax."
  },
  {
    name: "Classic Rock Anthem",
    url: "https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe",
    description: "Generations of classic tracks that shaped rock & roll history."
  }
];

function extractPlaylistId(url: string): string {
  if (!url) return `playlist_${Date.now()}`;
  const match = url.match(/\/playlist\/([a-zA-Z0-9_\-]+)/);
  return match ? match[1] : `playlist_${Date.now()}`;
}

export default function App() {
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"none" | "fetching" | "extracting" | "searching">("none");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Loaded state
  const [playlistMeta, setPlaylistMeta] = useState<{name: string, description: string} | null>(null);
  const [tracks, setTracks] = useState<MatchedTrack[]>([]);
  const [searchIndicesInProgress, setSearchIndicesInProgress] = useState<Record<string, boolean>>({});

  // Active playlist ID
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(null);

  // Filters state
  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'unresolved'>('all');

  // Action Modals State
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveCustomName, setSaveCustomName] = useState("");
  const [saveCustomDesc, setSaveCustomDesc] = useState("");
  const [deletePlaylistId, setDeletePlaylistId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<{ message: string, type: "success" | "error" } | null>(null);

  // New Search Options
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState("");
  const [conversionMode, setConversionMode] = useState<"fast" | "research">("fast");

  // Firebase auth & Library Sync states
  const [user, setUser] = useState<User | null>(null);
  const [savedPlaylists, setSavedPlaylists] = useState<LocalPlaylist[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Subscribe to Auth State Changes
  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        loadPlaylistsAndSync(firebaseUser);
      });
      return () => unsubscribe();
    } else {
      loadPlaylistsAndSync(null);
    }
  }, []);

  // Recover last active playlist session on page refresh
  useEffect(() => {
    const savedMeta = localStorage.getItem("syncify_playlist_meta");
    const savedTracks = localStorage.getItem("syncify_tracks");
    const savedUrl = localStorage.getItem("syncify_spotify_url");
    const savedId = localStorage.getItem("syncify_playlist_id");
    
    if (savedMeta && savedTracks) {
      try {
        setPlaylistMeta(JSON.parse(savedMeta));
        setTracks(JSON.parse(savedTracks));
        if (savedUrl) setSpotifyUrl(savedUrl);
        if (savedId) setCurrentPlaylistId(savedId);
      } catch (err) {
        console.error("Corrupted session cache cleared:", err);
      }
    }
  }, []);

  // Sync and Merge local IndexedDB playlists with cloud Firebase playlists
  const loadPlaylistsAndSync = async (currentUser: User | null) => {
    setIsSyncing(true);
    try {
      const locals = await localDB.getAllPlaylists();
      
      if (currentUser && isFirebaseConfigured) {
        // Fetch Cloud Playlists
        const clouds = await fetchCloudPlaylists();
        const mergedPlaylists: LocalPlaylist[] = [...locals];

        // 1. If local playlist is missing on the cloud, upload it (auto-sync)
        for (const localPl of locals) {
          const cloudMatch = clouds.find(c => c.id === localPl.id);
          if (!cloudMatch) {
            const updatedLocal = { ...localPl, userId: currentUser.uid, isSynced: true, updatedAt: new Date().toISOString() };
            await syncPlaylistToCloud(updatedLocal);
            await localDB.savePlaylist(updatedLocal);
          }
        }

        // 2. Load cloud playlists into IndexedDB cache if missing or outdated locally
        for (const cloudPl of clouds) {
          const localMatch = locals.find(l => l.id === cloudPl.id);
          if (!localMatch) {
            await localDB.savePlaylist(cloudPl);
          } else {
            const localTime = new Date(localMatch.updatedAt || localMatch.convertedAt).getTime();
            const cloudTime = new Date(cloudPl.updatedAt || cloudPl.convertedAt).getTime();
            if (cloudTime > localTime) {
              await localDB.savePlaylist(cloudPl);
            }
          }
        }

        // Refetch latest merged set from local IndexedDB
        const finalizedList = await localDB.getAllPlaylists();
        setSavedPlaylists(finalizedList);
      } else {
        setSavedPlaylists(locals);
      }
    } catch (e) {
      console.error("[Merging Sync Failed]", e);
      // fallback to offline lists
      const locals = await localDB.getAllPlaylists();
      setSavedPlaylists(locals);
    } finally {
      setIsSyncing(false);
    }
  };

  // Google Login popup action handler
  const handleLogin = async () => {
    try {
      const loggedUser = await loginWithGoogle();
      if (loggedUser) {
        setUser(loggedUser);
        await loadPlaylistsAndSync(loggedUser);
      }
    } catch (err: any) {
      alert(`Google Login failed: ${err.message || err}`);
    }
  };

  // Log out action handler
  const handleLogout = async () => {
    try {
      await logoutUser();
      setUser(null);
      // reload lists as offline-only
      await loadPlaylistsAndSync(null);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Save changes to localStorage AND local IndexedDB / Firebase Cloud for instant absolute continuous state
  const saveCurrentState = async (meta: typeof playlistMeta, tracksList: MatchedTrack[], url: string, customId?: string) => {
    const playlistId = customId || currentPlaylistId || extractPlaylistId(url);
    
    if (meta) {
      // 1. Standard localStorage caches for simple recovery
      localStorage.setItem("syncify_playlist_meta", JSON.stringify(meta));
      localStorage.setItem("syncify_tracks", JSON.stringify(tracksList));
      localStorage.setItem("syncify_spotify_url", url);
      localStorage.setItem("syncify_playlist_id", playlistId);

      // 2. Structured IndexedDB object store save
      const localRecord: LocalPlaylist = {
        id: playlistId,
        name: meta.name,
        description: meta.description,
        spotifyUrl: url,
        tracks: tracksList,
        convertedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: user ? user.uid : null,
        isSynced: !!user
      };

      await localDB.savePlaylist(localRecord);

      // 3. Sync to Firestore in real-time if logged in
      if (user && isFirebaseConfigured) {
        await syncPlaylistToCloud(localRecord);
      }

      // Refresh list sidebar
      await loadPlaylistsAndSync(user);
    } else {
      localStorage.removeItem("syncify_playlist_meta");
      localStorage.removeItem("syncify_tracks");
      localStorage.removeItem("syncify_spotify_url");
      localStorage.removeItem("syncify_playlist_id");
    }
  };

  const handleUpdateTrack = (trackId: string, updates: Partial<MatchedTrack>) => {
    const updated = tracks.map(t => {
      if (t.id === trackId) {
        return { ...t, ...updates };
      }
      return t;
    });
    setTracks(updated);
    saveCurrentState(playlistMeta, updated, spotifyUrl);
  };

  // Convert/Search specific track row individually or manually trigger re-match
  const triggerSearchForTrack = async (trackId: string) => {
    setSearchIndicesInProgress(prev => ({ ...prev, [trackId]: true }));
    const targetTrack = tracks.find(t => t.id === trackId);
    if (!targetTrack) return;

    try {
      const searchRes = await fetch("/api/search-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: targetTrack.title, artist: targetTrack.artist, mode: conversionMode })
      });

      if (!searchRes.ok) throw new Error("Search search failed");
      const result = await searchRes.json();

      if (result.videoId) {
        handleUpdateTrack(trackId, {
          videoId: result.videoId,
          videoTitle: result.videoTitle,
          videoUrl: result.videoUrl,
          thumbnailUrl: result.thumbnailUrl,
          isManual: false,
          status: "matched"
        });
      } else {
        handleUpdateTrack(trackId, {
          videoId: null,
          status: "not_found"
        });
      }
    } catch (e) {
      console.error(e);
      handleUpdateTrack(trackId, { status: "not_found" });
    } finally {
      setSearchIndicesInProgress(prev => ({ ...prev, [trackId]: false }));
    }
  };

  // Re-scan and search all currently unmatched or unresolved tracks using the improved pattern matching
  const handleRetryAllUnresolved = async () => {
    const unresolved = tracks.filter(t => !t.videoId || t.status === "not_found");
    if (unresolved.length === 0) return;

    // Put them in loading states instantly
    setTracks(prev => prev.map(t => {
      if (!t.videoId || t.status === "not_found") {
        return { ...t, status: "searching" };
      }
      return t;
    }));

    for (const track of unresolved) {
      setSearchIndicesInProgress(prev => ({ ...prev, [track.id]: true }));
      try {
        const searchRes = await fetch("/api/search-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: track.title, artist: track.artist, mode: conversionMode })
        });

        if (searchRes.ok) {
          const result = await searchRes.json();
          setTracks(prev => {
            const nextTracks = prev.map(t => {
              if (t.id === track.id) {
                if (result.videoId) {
                  return {
                    ...t,
                    videoId: result.videoId,
                    videoTitle: result.videoTitle,
                    videoUrl: result.videoUrl,
                    thumbnailUrl: result.thumbnailUrl,
                    isManual: false,
                    status: "matched" as const
                  };
                } else {
                  return { ...t, videoId: null, status: "not_found" as const };
                }
              }
              return t;
            });
            saveCurrentState(playlistMeta, nextTracks, spotifyUrl);
            return nextTracks;
          });
        } else {
          setTracks(prev => {
            const nextTracks = prev.map(t => (t.id === track.id ? { ...t, status: "not_found" as const } : t));
            saveCurrentState(playlistMeta, nextTracks, spotifyUrl);
            return nextTracks;
          });
        }
      } catch (e) {
        console.error(e);
        setTracks(prev => {
          const nextTracks = prev.map(t => (t.id === track.id ? { ...t, status: "not_found" as const } : t));
          saveCurrentState(playlistMeta, nextTracks, spotifyUrl);
          return nextTracks;
        });
      } finally {
        setSearchIndicesInProgress(prev => ({ ...prev, [track.id]: false }));
      }
    }
  };

  const startConversion = async (targetUrl: string) => {
    if (!targetUrl.trim()) {
      setErrorMsg("Please paste a valid Spotify playlist URL first.");
      return;
    }

    setIsLoading(true);
    setPlaylistMeta(null);
    setTracks([]);
    setErrorMsg("");
    
    try {
      // Step 1: Spotify Embed URL Fetch
      setLoadingStep("fetching");
      setLoadingMessage("Connecting to Spotify public portal...");
      
      const spotifyRes = await fetch("/api/parse-spotify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      });

      if (!spotifyRes.ok) {
        const errJson = await spotifyRes.json();
        throw new Error(errJson.error || "Failed to process Spotify link. Verify it is public.");
      }

      // Step 2: Extraction completed via Gemini
      setLoadingStep("extracting");
      setLoadingMessage("Parsing track lists seamlessly with Gemini AI metadata mapping...");
      
      const playlistDetails = await spotifyRes.json();
      const rawTracks: SpotifyTrack[] = playlistDetails.tracks;

      if (!rawTracks || rawTracks.length === 0) {
        throw new Error("No tracks detected inside the public Spotify playlist. Please ensure playlist is public.");
      }

      setPlaylistMeta({
        name: playlistDetails.playlistName,
        description: playlistDetails.playlistDescription
      });

      // Prepare initial state lists
      const matchedInitialList: MatchedTrack[] = rawTracks.map((rt, i) => ({
        id: `track_${Date.now()}_${i}`,
        title: rt.title,
        artist: rt.artist,
        album: rt.album,
        durationMs: rt.durationMs,
        artworkUrl: rt.artworkUrl,
        videoId: null,
        status: "searching"
      }));

      setTracks(matchedInitialList);
      setLoadingStep("searching");

      // Step 3: Search YouTube in concurrent batches
      const updatedList = [...matchedInitialList];
      const concurrencyLevel = conversionMode === "fast" ? 5 : 2;

      for (let i = 0; i < matchedInitialList.length; i += concurrencyLevel) {
        const batch = matchedInitialList.slice(i, i + concurrencyLevel);
        
        setLoadingMessage(`Searching matches for: "${batch[0].artist} - ${batch[0].title}" (${Math.min(i + concurrencyLevel, matchedInitialList.length)}/${matchedInitialList.length})`);
        
        await Promise.all(batch.map(async (item, batchOffset) => {
          const index = i + batchOffset;
          try {
            const ytSearchResponse = await fetch("/api/search-youtube", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: item.title, artist: item.artist, mode: conversionMode })
            });

            if (ytSearchResponse.ok) {
              const ytResult = await ytSearchResponse.json();
              if (ytResult.videoId) {
                updatedList[index] = {
                  ...item,
                  videoId: ytResult.videoId,
                  videoTitle: ytResult.videoTitle,
                  videoUrl: ytResult.videoUrl,
                  thumbnailUrl: ytResult.thumbnailUrl,
                  status: "matched"
                };
              } else {
                updatedList[index] = { ...item, videoId: null, status: "not_found" };
              }
            } else {
              updatedList[index] = { ...item, videoId: null, status: "not_found" };
            }
          } catch (searchError) {
            updatedList[index] = { ...item, videoId: null, status: "not_found" };
          }
        }));

        // Instant state feedback to make the UI look alive and interactive!
        setTracks([...updatedList]);
        
        // Add a slight delay between batches to prevent YouTube's rate limiting
        if (i + concurrencyLevel < matchedInitialList.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const customId = extractPlaylistId(targetUrl);
      setCurrentPlaylistId(customId);

      // Converted successfully, save to persistent storage
      saveCurrentState(
        { name: playlistDetails.playlistName, description: playlistDetails.playlistDescription },
        updatedList,
        targetUrl,
        customId
      );

    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || "An unexpected error occurred during converter process.");
      setPlaylistMeta(null);
      setTracks([]);
    } finally {
      setIsLoading(false);
      setLoadingStep("none");
      setLoadingMessage("");
    }
  };

  const handleClearAllConfirm = () => {
    setShowResetConfirm(true);
  };

  const handleClearAll = () => {
    setPlaylistMeta(null);
    setTracks([]);
    setSpotifyUrl("");
    setErrorMsg("");
    setCurrentPlaylistId(null);
    saveCurrentState(null, [], "");
    setShowResetConfirm(false);
  };

  const handleLoadSavedPlaylist = (savedPl: LocalPlaylist) => {
    setPlaylistMeta({
      name: savedPl.name,
      description: savedPl.description || ""
    });
    setTracks(savedPl.tracks);
    setSpotifyUrl(savedPl.spotifyUrl);
    setCurrentPlaylistId(savedPl.id);
    setActiveFilter('all');
    setSongSearchQuery("");
    
    // update localStorage
    localStorage.setItem("syncify_playlist_meta", JSON.stringify({ name: savedPl.name, description: savedPl.description }));
    localStorage.setItem("syncify_tracks", JSON.stringify(savedPl.tracks));
    localStorage.setItem("syncify_spotify_url", savedPl.spotifyUrl);
    localStorage.setItem("syncify_playlist_id", savedPl.id);
  };

  const handleDeleteConfirmDialog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletePlaylistId(id);
  };

  const executeDeletePlaylist = async () => {
    if (!deletePlaylistId) return;
    
    // 1. Delete from local IndexedDB
    await localDB.deletePlaylist(deletePlaylistId);
    
    // 2. Delete from Firebase Firestore if logged in
    if (user && isFirebaseConfigured) {
      await deletePlaylistFromCloud(deletePlaylistId);
    }
    
    // If active loaded playlist is this one, clear the workspace too!
    if (currentPlaylistId === deletePlaylistId) {
      handleClearAll();
    } else {
      // Reload lists
      await loadPlaylistsAndSync(user);
    }
    setDeletePlaylistId(null);
  };

  const handleManualSaveTrigger = () => {
    if (!playlistMeta) return;
    setSaveCustomName(playlistMeta.name);
    setSaveCustomDesc(playlistMeta.description || "");
    setShowSaveModal(true);
  };

  const executeManualSave = async () => {
    if (!playlistMeta) return;
    const newMeta = { name: saveCustomName || playlistMeta.name, description: saveCustomDesc || playlistMeta.description };
    setPlaylistMeta(newMeta);
    await saveCurrentState(newMeta, tracks, spotifyUrl);
    setShowSaveModal(false);
    
    setShowToast({ message: "Playlist saved successfully to your library!", type: "success" });
    setTimeout(() => setShowToast(null), 3000);
  };

  // YouTube Playlist compilation logic
  // Returns Watch video compiled link: watch_videos?video_ids=ID1,ID2...
  const getCompiledYouTubeUrl = () => {
    const validIds = tracks
      .filter(t => t.videoId && t.status !== "not_found")
      .map(t => t.videoId);
    
    if (validIds.length === 0) return "";
    return `https://www.youtube.com/watch_videos?video_ids=${validIds.join(",")}`;
  };

  const handleCreatePlaylistLink = () => {
    const streamUrl = getCompiledYouTubeUrl();
    if (!streamUrl) {
      setShowToast({ message: "No songs have been linked with video IDs yet. Please add manually or auto-match.", type: "error" });
      setTimeout(() => setShowToast(null), 4000);
      return;
    }
    window.open(streamUrl, "_blank");
  };

  const matchedCount = tracks.filter(t => t.videoId && t.status !== "not_found").length;
  const unresolvedCount = tracks.length - matchedCount;
  const matchRate = tracks.length > 0 ? Math.round((matchedCount / tracks.length) * 100) : 0;

  // Filtered tracks matching both category tab and search option keyword input
  const filteredTracks = tracks.filter(t => {
    // 1. Matches active filter tabs
    if (activeFilter === 'matched') {
      if (!t.videoId || t.status === "not_found") return false;
    } else if (activeFilter === 'unresolved') {
      if (t.videoId && t.status !== "not_found") return false;
    }

    // 2. Matches the dynamic song query (title, artist, or album)
    if (songSearchQuery.trim()) {
      const q = songSearchQuery.toLowerCase();
      const titleMatch = t.title.toLowerCase().includes(q);
      const artistMatch = t.artist.toLowerCase().includes(q);
      const albumMatch = t.album ? t.album.toLowerCase().includes(q) : false;
      return titleMatch || artistMatch || albumMatch;
    }

    return true;
  });

  return (
    <div className="font-sans text-[#fafafa] min-h-screen flex flex-col pb-24 bg-[#09090b]">
      <Header 
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
        isCloudActive={isFirebaseConfigured && !!auth}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 pt-8">
        <AnimatePresence mode="wait">
          {!playlistMeta && !isLoading ? (
            /* INTRO HERO / CARD IMPORTER VIEW */
            <motion.div 
              key="intro"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto flex flex-col gap-8 py-4"
            >
              <div className="text-center flex flex-col gap-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.2rem] text-[#1DB954] bg-[#1DB954]/10 px-3.5 py-1 rounded border border-[#1DB954]/25 self-center">
                  ✨ Instant Conversion Engine
                </span>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                  No More Manual Re-ordering
                </h2>
                <p className="text-base text-[#a1a1aa] max-w-lg mx-auto">
                  Paste any public Spotify playlist. We'll map each song to its YouTube matches in the exact original sequence. Watch instantly in a single aggregated queue.
                </p>
              </div>

              {/* Paste Entry Card */}
              <div className="bg-[#111113] border border-[#27272a] rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute right-0 top-0 w-80 h-80 bg-[#1DB954]/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute left-0 bottom-0 w-80 h-80 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />

                <label className="text-xs font-bold uppercase tracking-[0.2em] text-[#52525b] block mb-3">
                  Paste Spotify Playlist Link
                </label>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                      <input 
                        type="text"
                        className="w-full h-14 bg-[#18181b] border border-[#27272a] rounded-xl px-5 pl-12 text-sm text-[#fafafa] placeholder-[#52525b] font-medium focus:outline-none focus:border-[#1DB954] transition-colors shadow-inner"
                        placeholder="e.g. https://open.spotify.com/playlist/37i9dQZF1DXcBWIGsy3985"
                        value={spotifyUrl}
                        onChange={(e) => {
                          setSpotifyUrl(e.target.value);
                          setErrorMsg("");
                        }}
                        onKeyDown={(e) => e.key === "Enter" && startConversion(spotifyUrl)}
                      />
                      <Music className="absolute left-4 top-[17px] w-5 h-5 text-[#1DB954]" />
                      <div className="absolute right-4 top-4 text-xs font-mono text-[#52525b] uppercase tracking-widest hidden md:block">Spotify URL</div>
                    </div>

                    <button 
                      onClick={() => startConversion(spotifyUrl)}
                      className="h-14 px-6 md:px-8 bg-[#fafafa] text-[#09090b] font-bold rounded-xl hover:bg-white active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)] flex items-center justify-center gap-2 flex-shrink-0 cursor-pointer"
                    >
                      Convert Playlist <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Conversion Mode Selection */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                    <button 
                      onClick={() => setConversionMode("fast")}
                      className={`relative flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${conversionMode === "fast" ? "border-[#1DB954] bg-[#1DB954]/5 shadow-[0_0_15px_rgba(29,185,84,0.1)]" : "border-[#27272a] bg-[#121214] hover:bg-[#18181b]"} cursor-pointer group`}
                    >
                      <div className={`p-2 rounded-lg transition-colors ${conversionMode === "fast" ? "bg-[#1DB954]/20 text-[#1DB954]" : "bg-[#18181b] text-gray-400 group-hover:text-gray-300 border border-[#27272a]"}`}>
                        <Zap className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`text-sm font-bold ${conversionMode === "fast" ? "text-white" : "text-gray-300"}`}>Fast Match</h4>
                          {conversionMode === "fast" && <CheckCircle2 className="w-4 h-4 text-[#1DB954]" />}
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium">Prioritizes speed. Automatically matches the first relevant YouTube search result.</p>
                      </div>
                    </button>

                    <button 
                      onClick={() => setConversionMode("research")}
                      className={`relative flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${conversionMode === "research" ? "border-indigo-500 bg-indigo-500/5 shadow-[0_0_15px_rgba(99,102,241,0.1)]" : "border-[#27272a] bg-[#121214] hover:bg-[#18181b]"} cursor-pointer group`}
                    >
                      <div className={`p-2 rounded-lg transition-colors ${conversionMode === "research" ? "bg-indigo-500/20 text-indigo-400" : "bg-[#18181b] text-gray-400 group-hover:text-gray-300 border border-[#27272a]"}`}>
                        <Lightbulb className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`text-sm font-bold ${conversionMode === "research" ? "text-white" : "text-gray-300"}`}>Deep Research API</h4>
                          {conversionMode === "research" && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium">Uses Gemini AI to intelligently analyze candidate videos for the official best match.</p>
                      </div>
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-300">Conversion issue:</p>
                      <p className="mt-0.5">{errorMsg}</p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Sample playlists */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest text-center md:text-left">
                  Or test with a popular playlist:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {SAMPLE_PLAYLISTS.map((sample, idx) => (
                    <button 
                      key={idx}
                      onClick={() => {
                        setSpotifyUrl(sample.url);
                        setErrorMsg("");
                        startConversion(sample.url);
                      }}
                      className="bg-[#0c0c0e] hover:bg-[#18181b] border border-[#18181b] hover:border-[#27272a] rounded-2xl p-5 text-left transition-all group flex flex-col justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="p-1 bg-[#1DB954]/15 rounded-md text-[#1DB954] flex items-center justify-center">
                            <Music className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-sm font-bold text-white group-hover:text-[#1DB954] transition-colors">
                            {sample.name}
                          </span>
                        </div>
                        <p className="text-xs text-[#a1a1aa] line-clamp-2 leading-relaxed font-normal">
                          {sample.description}
                        </p>
                      </div>
                      <div className="flex items-center justify-end text-[11px] text-[#1DB954] font-bold mt-4 self-stretch">
                        <span>Load Playlist</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* SAVED & CLOUD PLAYLISTS USER LIBRARY */}
              <div className="border-t border-[#1a1a1e] pt-8 flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Database className="w-5 h-5 text-[#1DB954]" /> Your Saved Library
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Organize, search, and recall saved playlists from your local database and connected cloud workspace.
                    </p>
                  </div>

                  {/* Playlist Search Filter Panel */}
                  {savedPlaylists.length > 0 && (
                    <div className="relative w-full sm:w-64">
                      <input 
                        type="text"
                        className="w-full h-9 bg-[#111113] border border-[#27272a] rounded-lg pl-9 pr-4 text-xs text-[#fafafa] placeholder-gray-500 font-medium focus:outline-none focus:border-[#1DB954] transition-colors"
                        placeholder="Search saved playlists..."
                        value={playlistSearchQuery}
                        onChange={(e) => setPlaylistSearchQuery(e.target.value)}
                      />
                      <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" />
                    </div>
                  )}
                </div>

                {/* Library Playlists Grid */}
                {savedPlaylists.length > 0 ? (
                  (() => {
                    const filteredSaved = savedPlaylists.filter(pl => {
                      if (!playlistSearchQuery.trim()) return true;
                      const q = playlistSearchQuery.toLowerCase();
                      return pl.name.toLowerCase().includes(q) || (pl.description && pl.description.toLowerCase().includes(q));
                    });

                    if (filteredSaved.length === 0) {
                      return (
                        <div className="py-12 bg-[#0c0c0e] border border-[#18181b] rounded-2xl flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                          <Search className="w-6 h-6 text-gray-600 animate-pulse" />
                          <p className="text-xs font-semibold">No playlist matches "{playlistSearchQuery}"</p>
                          <p className="text-[11px] text-gray-650">Verify your spelling or terms and search again.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredSaved.map((pl) => {
                          const plMatchedCount = pl.tracks.filter(t => t.videoId && t.status !== "not_found").length;
                          const plMatchRate = pl.tracks.length > 0 ? Math.round((plMatchedCount / pl.tracks.length) * 100) : 0;
                          
                          return (
                            <div 
                              key={pl.id}
                              onClick={() => handleLoadSavedPlaylist(pl)}
                              className="bg-[#111113] hover:bg-[#151518] border border-[#27272a] hover:border-[#3e3e42] rounded-2xl p-5 text-left transition-all relative flex flex-col justify-between cursor-pointer group shadow-lg"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h4 className="text-sm font-bold text-white group-hover:text-[#1DB954] transition-colors line-clamp-1">
                                    {pl.name}
                                  </h4>
                                  {pl.isSynced && user ? (
                                    <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                      <Cloud className="w-2.5 h-2.5" /> Synced
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                      <CloudOff className="w-2.5 h-2.5" /> Local
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#a1a1aa] line-clamp-2 leading-relaxed mb-4" dangerouslySetInnerHTML={{ __html: pl.description || "No description provided." }} />
                              </div>

                              <div className="flex items-center justify-between border-t border-[#1c1c20] pt-3.5 mt-2">
                                <div className="text-[10px] font-medium text-[#71717a] flex flex-col gap-0.5 font-mono">
                                  <span>Tracks: {pl.tracks.length} • Matched: {plMatchedCount}</span>
                                  <span>Accuracy: {plMatchRate}%</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => handleDeleteConfirmDialog(pl.id, e)}
                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-[#27272a] hover:border-red-500/20 transition-all"
                                    title="Delete Playlist"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="h-8 px-4 bg-white/5 hover:bg-white text-white hover:text-black font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-1">
                                    Load <ArrowRight className="w-3 h-3" />
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                ) : (
                  <div className="py-10 px-5 bg-[#0c0c0e] border border-[#18181b] rounded-2xl text-center flex flex-col items-center justify-center gap-3">
                    <div className="p-3 bg-white/5 text-gray-400 rounded-full border border-white/5">
                      <Layers3 className="w-5 h-5 text-[#1DB954]" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#fafafa]">Your converted library is empty</p>
                      <p className="text-[11px] text-gray-500 max-w-sm mx-auto mt-1">
                        Input or test with a public Spotify URL above to begin conversion. Successfully loaded playlists automatically store to local system.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : isLoading ? (
            /* COMPREHENSIVE LOADING DASHBOARD OVERLAY */
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto py-12 flex flex-col items-center justify-center text-center gap-6"
            >
              {/* Spinner anim */}
              <div className="relative">
                <div className="w-20 h-20 border-4 border-[#18181b] border-t-[#1DB954] border-r-red-550 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {loadingStep === "fetching" ? (
                    <Music className="w-8 h-8 text-[#1DB954]" />
                  ) : (
                    <Sparkles className="w-8 h-8 text-indigo-400" />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">
                  {loadingStep === "fetching" && "1. Establish Handshake"}
                  {loadingStep === "extracting" && "2. AI Processing"}
                  {loadingStep === "searching" && "3. Dynamic Matchmaking"}
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">Converting {tracks.length > 0 ? "Tracks" : "Playlist"}</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto min-h-[40px]">
                  {loadingMessage}
                </p>
              </div>

              {/* Progress Indicator for Sequenced Search */}
              {tracks.length > 0 && (
                <div className="w-full max-w-md bg-[#0c0c0e] border border-[#18181b] rounded-2xl p-5 text-left shadow-lg">
                  <div className="flex items-center justify-between text-xs text-[#a1a1aa] mb-3 font-medium">
                    <span>Searching YouTube matches...</span>
                    <span className="font-mono text-[#fafafa] font-bold">
                      {tracks.filter(t => t.status !== "searching").length} / {tracks.length}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#18181b] rounded-full overflow-hidden border border-[#27272a]">
                    <div 
                      className="h-full bg-gradient-to-r from-[#1DB954] to-red-500 transition-all duration-300"
                      style={{ 
                        width: `${Math.round((tracks.filter(t => t.status !== "searching").length / tracks.length) * 100)}%` 
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Premium Skeleton Tracking Setup */}
              <div className="w-full max-w-md space-y-3 mt-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={`flex items-center gap-4 py-3.5 px-4 bg-[#111113] border border-[#27272a] rounded-xl animate-pulse shadow-sm`} style={{ animationDelay: `${i * 150}ms` }}>
                    <div className="w-10 h-10 bg-[#18181b] rounded-lg border border-[#27272a]" />
                    <div className="flex-1 space-y-2.5">
                      <div className="h-3.5 bg-[#27272a] rounded w-2/3" />
                      <div className="h-2.5 bg-[#18181b] rounded w-1/3" />
                    </div>
                    <div className="w-6 h-6 bg-[#18181b] rounded-md" />
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* TABULAR CONVERTED RESULTS VIEW */
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col gap-6 py-2"
            >
              {/* Back to Input Header Controls & Reset */}
              <div className="flex items-center justify-between gap-4">
                <button 
                  onClick={handleClearAllConfirm}
                  className="px-4 py-2 text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-xl border border-[#27272a] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ListRestart className="w-4 h-4" /> Reset / Import New
                </button>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-xs text-[#52525b] font-mono whitespace-nowrap hidden sm:flex">
                    <span>State Autosaved</span>
                    <div className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse" />
                  </div>
                  <button 
                    onClick={handleManualSaveTrigger}
                    className="px-4 py-2 text-sm font-bold text-white bg-[#1DB954] hover:bg-emerald-500 rounded-xl border border-transparent transition-all shadow-[0_0_15px_rgba(29,185,84,0.15)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" /> Save to Library
                  </button>
                </div>
              </div>

              {/* Playlist Summary Dashboard banner */}
              <div className="bg-[#111113] border border-[#27272a] rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="absolute right-0 top-0 w-64 h-64 bg-[#1DB954]/5 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col gap-2 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20 px-2.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      Loaded Spotify Playlist
                    </span>
                    <span className="text-[#52525b] text-xs font-mono">•</span>
                    <span className="text-xs text-[#a1a1aa]">
                      {tracks.length} Songs Loaded
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white leading-tight">
                    {playlistMeta?.name}
                  </h3>
                  {playlistMeta?.description && (
                    <p className="text-sm text-[#a1a1aa]" dangerouslySetInnerHTML={{ __html: playlistMeta.description }} />
                  )}
                </div>

                {/* Performance stats mini card */}
                <div className="flex flex-col md:items-end gap-1 flex-shrink-0 bg-[#18181b] p-4 rounded-xl border border-[#27272a] w-full md:w-auto shadow-inner">
                  <div className="flex items-center gap-1 text-[10px] text-[#52525b] font-bold uppercase tracking-wider mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#1DB954]" /> Auto-Match Precision
                  </div>
                  <div className="text-2xl font-bold text-white flex items-baseline gap-1">
                    {matchRate}% <span className="text-[#1DB954] text-xs font-bold uppercase">High Precision</span>
                  </div>
                  <p className="text-xs text-[#a1a1aa] mt-0.5">
                    {matchedCount} of {tracks.length} tracks matched perfectly
                  </p>
                </div>
              </div>

              {/* Filtering Controls and Table Section */}
              <div className="bg-[#09090b] border border-[#27272a] rounded-2xl overflow-hidden shadow-2xl">
                {/* Section header & filters */}
                <div className="border-b border-[#18181b] p-5 bg-[#0c0c0e] flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#1DB954]" /> Playlist Songs Matching
                    </h4>
                    <p className="text-xs text-[#a1a1aa] mt-1">
                      Check aligned YouTube videos or paste manual fallback URLs if correct mapping is missing.
                    </p>
                  </div>

                  {/* FILTER SELECTION TABS & RETRY ACTION */}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex rounded-xl bg-[#18181b] p-1 border border-[#27272a]">
                      <button 
                        onClick={() => setActiveFilter('all')}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          activeFilter === 'all' 
                          ? 'bg-[#27272a] text-white shadow-sm' 
                          : 'text-[#a1a1aa] hover:text-white'
                        }`}
                      >
                        All ({tracks.length})
                      </button>
                      <button 
                        onClick={() => setActiveFilter('matched')}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          activeFilter === 'matched' 
                          ? 'bg-[#1DB954]/10 text-[#1DB954] shadow-sm border border-[#1DB954]/15' 
                          : 'text-[#a1a1aa] hover:text-[#1DB954]'
                        }`}
                      >
                        Matched ({matchedCount})
                      </button>
                      <button 
                        onClick={() => setActiveFilter('unresolved')}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          activeFilter === 'unresolved' 
                          ? 'bg-red-500/10 text-red-400 shadow-sm border border-red-500/15' 
                          : 'text-[#a1a1aa] hover:text-red-400'
                        }`}
                      >
                        Unresolved ({unresolvedCount})
                      </button>
                    </div>

                    {unresolvedCount > 0 && (
                      <button
                        onClick={handleRetryAllUnresolved}
                        className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-[#1DB954] hover:bg-emerald-500 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                        title="Re-run matching search on missing tracks"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-pulse" /> Re-Scan Unresolved
                      </button>
                    )}
                  </div>
                </div>

                {/* Dynamic Song Search Input Bar */}
                <div className="bg-[#0c0c0e] border-b border-[#18181b] px-5 py-3 flex items-center justify-between gap-3 text-xs text-[#a1a1aa]">
                  <div className="relative flex-1">
                    <input 
                      type="text"
                      className="w-full h-10 bg-[#121214] border border-[#27272a] rounded-xl pl-10 pr-4 text-xs text-[#fafafa] placeholder-gray-500 font-medium focus:outline-none focus:border-[#1DB954] transition-all"
                      placeholder="Search songs inside this playlist by title, artist, or album..."
                      value={songSearchQuery}
                      onChange={(e) => setSongSearchQuery(e.target.value)}
                    />
                    <Search className="absolute left-3.5 top-[13px] w-4 h-4 text-gray-500" />
                  </div>
                  {songSearchQuery.trim() && (
                    <button 
                      onClick={() => setSongSearchQuery("")}
                      className="text-[11px] font-bold text-gray-400 hover:text-white transition-colors cursor-pointer bg-[#18181b] px-3 py-1.5 rounded-lg border border-[#27272a]"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* THE MAIN TRACKS TABLE LISTING */}
                <div className="divide-y divide-[#18181b] max-h-[500px] overflow-y-auto scrollbar">
                  <AnimatePresence initial={false}>
                    {filteredTracks.map((track, idx) => (
                      <motion.div 
                        key={track.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <TrackRow 
                          track={track}
                          index={tracks.findIndex(t => t.id === track.id)}
                          onUpdateTrack={handleUpdateTrack}
                          onSearchAgain={triggerSearchForTrack}
                          isSearchingRow={!!searchIndicesInProgress[track.id]}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {filteredTracks.length === 0 && (
                    <div className="py-12 px-6 text-center text-[#52525b] flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="w-8 h-8 text-[#27272a]" />
                      <div>
                        {activeFilter === 'unresolved' ? (
                          <>
                            <p className="font-bold text-[#a1a1aa]">All songs are fully matched!</p>
                            <p className="text-xs text-[#52525b] mt-0.5">Unresolved filters only list songs awaiting links.</p>
                          </>
                        ) : activeFilter === 'matched' ? (
                          <>
                            <p className="font-bold text-[#a1a1aa]">No songs have matched yet.</p>
                            <p className="text-xs text-[#52525b] mt-0.5">Try triggering individual searches or link them manually.</p>
                          </>
                        ) : (
                          <p className="font-bold text-[#a1a1aa]">No songs found in this list.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructions helper block inside the container */}
                <div className="bg-[#0c0c0e] p-4 border-t border-[#18181b] flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-[#1DB954] flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-[#a1a1aa] leading-relaxed">
                    <strong>Manual Fallback Mode:</strong> If a specific song could not be automatically found or has been mapped to a wrong cover, simply search using your own query terms or copy and paste an exact YouTube URL / Video ID right in the input box. Syncify will automatically secure it and compile it!
                  </p>
                </div>
              </div>

              {/* Floating or fixed Action Footer Banner compiling the final YouTube playlist */}
              <div className="bg-[#0c0c0e] border border-[#27272a] rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-600/10 text-red-500 rounded-xl border border-red-500/15">
                    <Youtube className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">
                      Compile YouTube Queue
                    </h4>
                    <p className="text-xs text-[#a1a1aa] mt-0.5">
                      Ready with {matchedCount} matched track{matchedCount !== 1 ? 's' : ''}. Clicking below opens the sequential queue immediately!
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                  <button 
                    disabled={matchedCount === 0}
                    onClick={() => {
                      const tempUrl = getCompiledYouTubeUrl();
                      navigator.clipboard.writeText(tempUrl);
                      alert("Successfully copied YouTube compiled watch URL to your clipboard!");
                    }}
                    className="px-5 py-3 rounded-xl border border-[#27272a] hover:bg-[#18181b] text-sm font-semibold text-[#a1a1aa] hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Copy links list as queue URL"
                  >
                    <ClipboardCopy className="w-4 h-4" /> Copy Link
                  </button>

                  <button 
                    disabled={matchedCount === 0}
                    onClick={handleCreatePlaylistLink}
                    className="flex-1 sm:flex-none px-8 py-3.5 bg-[#fafafa] hover:bg-white text-[#09090b] text-sm font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Load in YouTube <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast Notification */}
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50 ${showToast.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-500' : 'bg-[#1DB954]/10 border border-[#1DB954]/20 text-[#1DB954]'}`}
            >
              <span className="text-sm font-medium">{showToast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modals */}
        <AnimatePresence>
          {showResetConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-md bg-[#121214] border border-[#27272a] rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-2">Reset Workspace</h3>
                <p className="text-sm text-gray-400 mb-6">Are you sure you want to reset and start a new import? Your unsaved workspace changes will be lost.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowResetConfirm(false)} className="px-5 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-[#27272a] transition-all cursor-pointer">Cancel</button>
                  <button onClick={handleClearAll} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 cursor-pointer">Reset Everything</button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {showSaveModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-md bg-[#121214] border border-[#27272a] rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-2">Save to Library</h3>
                <p className="text-sm text-gray-400 mb-6">Save the current active state to your library.</p>
                <div className="flex flex-col gap-4 mb-6">
                   <div>
                     <label className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2 block">Playlist Name</label>
                     <input type="text" value={saveCustomName} onChange={e => setSaveCustomName(e.target.value)} className="w-full h-11 bg-[#18181b] border border-[#27272a] rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#1DB954]" placeholder="e.g. My Awesome Mix" />
                   </div>
                   <div>
                     <label className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2 block">Description (Optional)</label>
                     <input type="text" value={saveCustomDesc} onChange={e => setSaveCustomDesc(e.target.value)} className="w-full h-11 bg-[#18181b] border border-[#27272a] rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#1DB954]" />
                   </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowSaveModal(false)} className="px-5 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-[#27272a] transition-all cursor-pointer">Cancel</button>
                  <button onClick={executeManualSave} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#1DB954] hover:bg-emerald-500 transition-all focus:outline-none shadow-[0_0_15px_rgba(29,185,84,0.15)] flex items-center gap-2 cursor-pointer"><Save className="w-4 h-4"/> Save</button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {deletePlaylistId && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-sm bg-[#121214] border border-[#27272a] rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-2">Delete Playlist</h3>
                <p className="text-sm text-gray-400 mb-6">Are you sure you want to delete this playlist from your library? This action cannot be undone.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeletePlaylistId(null)} className="px-5 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-[#27272a] transition-all cursor-pointer">Cancel</button>
                  <button onClick={executeDeletePlaylist} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 cursor-pointer">Delete</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
