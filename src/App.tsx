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
  Zap,
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Radio
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
  const [apiKeyErrorDetails, setApiKeyErrorDetails] = useState<{ error: string, suggestedFix: string } | null>(null);
  
  // Loaded state
  const [playlistMeta, setPlaylistMeta] = useState<{name: string, description: string} | null>(null);
  const [tracks, setTracks] = useState<MatchedTrack[]>([]);
  const trackIdToIndexMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < tracks.length; i++) {
      map[tracks[i].id] = i;
    }
    return map;
  }, [tracks]);
  const [searchIndicesInProgress, setSearchIndicesInProgress] = useState<Record<string, boolean>>({});

  // Active playlist ID
  const [currentPlaylistId, setCurrentPlaylistId] = useState<string | null>(null);

  // Filters state
  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'unresolved'>('all');
  const [previewVideo, setPreviewVideo] = useState<MatchedTrack | null>(null);

  // Premium Audio Player States
  const [activePlayingTrackId, setActivePlayingTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackVolume, setPlaybackVolume] = useState(() => {
    const savedVol = localStorage.getItem("syncify_volume");
    return savedVol ? parseInt(savedVol, 10) : 75;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [currentTimeSecs, setCurrentTimeSecs] = useState(0);
  const [trackDurationSecs, setTrackDurationSecs] = useState(180);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('all');
  const [isShuffled, setIsShuffled] = useState(false);
  const [showPlayerVideoPreview, setShowPlayerVideoPreview] = useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [isInsideIframe, setIsInsideIframe] = useState(false);
  const playerIframeRef = React.useRef<HTMLIFrameElement | null>(null);

  const playableTracks = React.useMemo(() => {
    return tracks.filter(t => t.videoId && t.status !== "not_found");
  }, [tracks]);

  const currentPlayingTrack = React.useMemo(() => {
    return tracks.find(t => t.id === activePlayingTrackId) || null;
  }, [tracks, activePlayingTrackId]);

  const handlePlayTrack = (track: MatchedTrack) => {
    if (activePlayingTrackId === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setActivePlayingTrackId(track.id);
      setIsPlaying(true);
      setCurrentTimeSecs(0);
      const estSecs = track.durationMs ? Math.floor(track.durationMs / 1000) : 180;
      setTrackDurationSecs(estSecs === 0 ? 180 : estSecs);
    }
  };

  const handlePlayWholePlaylist = () => {
    if (playableTracks.length === 0) return;
    const firstTrack = playableTracks[0];
    if (firstTrack) {
      setActivePlayingTrackId(firstTrack.id);
      setIsPlaying(true);
      setCurrentTimeSecs(0);
      const estSecs = firstTrack.durationMs ? Math.floor(firstTrack.durationMs / 1000) : 180;
      setTrackDurationSecs(estSecs === 0 ? 180 : estSecs);
    }
  };

  const handleSkipNext = () => {
    if (playableTracks.length === 0) return;
    let currentIndex = playableTracks.findIndex(t => t.id === activePlayingTrackId);
    let nextIndex = 0;
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * playableTracks.length);
      if (nextIndex === currentIndex && playableTracks.length > 1) {
        nextIndex = (nextIndex + 1) % playableTracks.length;
      }
    } else {
      if (currentIndex !== -1) {
        nextIndex = (currentIndex + 1) % playableTracks.length;
      }
    }
    const nextTrack = playableTracks[nextIndex];
    if (nextTrack) {
      setActivePlayingTrackId(nextTrack.id);
      setIsPlaying(true);
      setCurrentTimeSecs(0);
      const estSecs = nextTrack.durationMs ? Math.floor(nextTrack.durationMs / 1000) : 180;
      setTrackDurationSecs(estSecs === 0 ? 180 : estSecs);
    }
  };

  const handleSkipPrev = () => {
    if (playableTracks.length === 0) return;
    let currentIndex = playableTracks.findIndex(t => t.id === activePlayingTrackId);
    let prevIndex = 0;
    if (isShuffled) {
      prevIndex = Math.floor(Math.random() * playableTracks.length);
    } else {
      if (currentIndex !== -1) {
        prevIndex = currentIndex - 1;
        if (prevIndex < 0) prevIndex = playableTracks.length - 1;
      }
    }
    const prevTrack = playableTracks[prevIndex];
    if (prevTrack) {
      setActivePlayingTrackId(prevTrack.id);
      setIsPlaying(true);
      setCurrentTimeSecs(0);
      const estSecs = prevTrack.durationMs ? Math.floor(prevTrack.durationMs / 1000) : 180;
      setTrackDurationSecs(estSecs === 0 ? 180 : estSecs);
    }
  };

  const handleTimelineChange = (secs: number) => {
    setCurrentTimeSecs(secs);
    if (playerIframeRef.current) {
      playerIframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [secs, true] }),
        "*"
      );
    }
  };

  const handleVolumeChange = (vol: number) => {
    setPlaybackVolume(vol);
    localStorage.setItem("syncify_volume", String(vol));
    if (playerIframeRef.current) {
      playerIframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "setVolume", args: [vol] }),
        "*"
      );
    }
  };

  const playbackProgressTimerNextTrigger = () => {
    if (repeatMode === 'none') {
      const currentIndex = playableTracks.findIndex(t => t.id === activePlayingTrackId);
      if (currentIndex === playableTracks.length - 1) {
        setIsPlaying(false);
        setCurrentTimeSecs(0);
      } else {
        handleSkipNext();
      }
    } else {
      handleSkipNext();
    }
  };

  // Listen for YouTube Embed player events to trigger authentic seamless track progression
  useEffect(() => {
    const handleYouTubeMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.event === "onStateChange") {
          const playerState = data.info;
          // PlayerStates: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
          if (playerState === 0) {
            console.log("[YouTube Embed Listener] Song ended naturally. Triggering next track.");
            if (repeatMode === 'one') {
              if (playerIframeRef.current) {
                playerIframeRef.current.contentWindow?.postMessage(
                  JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }),
                  "*"
                );
                playerIframeRef.current.contentWindow?.postMessage(
                  JSON.stringify({ event: "command", func: "playVideo", args: [] }),
                  "*"
                );
              }
              setCurrentTimeSecs(0);
            } else {
              playbackProgressTimerNextTrigger();
            }
          }
        }
      } catch (e) {
        // Suppress parsing errors for other non-YouTube messages safely
      }
    };

    window.addEventListener("message", handleYouTubeMessage);
    return () => {
      window.removeEventListener("message", handleYouTubeMessage);
    };
  }, [repeatMode, activePlayingTrackId, playableTracks, trackDurationSecs]);

  // Local counting timer clock for 100% responsive timeline slider updates
  useEffect(() => {
    let timerId: any = null;
    if (isPlaying && activePlayingTrackId) {
      timerId = setInterval(() => {
        setCurrentTimeSecs(prev => {
          // Track plays for full YouTube duration. Grace buffer of 15s to guarantee no clipping!
          if (prev >= trackDurationSecs + 15) {
            if (repeatMode === 'one') {
              if (playerIframeRef.current) {
                playerIframeRef.current.contentWindow?.postMessage(
                  JSON.stringify({ event: "command", func: "seekTo", args: [0, true] }),
                  "*"
                );
              }
              return 0;
            } else {
              playbackProgressTimerNextTrigger();
              return prev;
            }
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isPlaying, activePlayingTrackId, trackDurationSecs, repeatMode, playableTracks]);

  // Volume and mute controls synchronizer
  useEffect(() => {
    if (playerIframeRef.current) {
      playerIframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "setVolume", args: [playbackVolume] }),
        "*"
      );
      playerIframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: isMuted ? "mute" : "unMute", args: [] }),
        "*"
      );
    }
  }, [playbackVolume, isMuted, activePlayingTrackId]);

  // Play/pause controls synchronizer
  useEffect(() => {
    if (playerIframeRef.current) {
      const command = isPlaying ? "playVideo" : "pauseVideo";
      playerIframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: command, args: [] }),
        "*"
      );
    }
  }, [isPlaying, activePlayingTrackId]);

  useEffect(() => {
    setIsInsideIframe(window.self !== window.top);
  }, []);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // High frame-rate drawing engine for 60fps translucent bezier wave frequencies
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let phase = 0;
    
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = 36;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;
      
      const speed = isPlaying ? 0.08 : 0.01;
      phase += speed;
      
      const targetAmplitude = isPlaying ? 10 : 1.5;
      const waveColors = [
        "rgba(29, 185, 84, 0.45)",
        "rgba(52, 211, 153, 0.25)",
        "rgba(16, 185, 129, 0.15)"
      ];
      
      waveColors.forEach((color, index) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = index === 0 ? 2 : 1.2;
        
        ctx.shadowBlur = isPlaying ? 8 : 0;
        ctx.shadowColor = "#1DB954";
        
        const frequencyMultiplier = 0.008 + index * 0.004;
        const phaseOffset = index * Math.PI * 0.5;
        
        for (let x = 0; x < width; x++) {
          const edgeFade = Math.sin((x / width) * Math.PI);
          const y = midY + Math.sin(x * frequencyMultiplier + phase + phaseOffset) * targetAmplitude * edgeFade;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [isPlaying, activePlayingTrackId]);



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
          durationMs: result.durationMs || targetTrack.durationMs,
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
                    durationMs: result.durationMs || t.durationMs,
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
    setApiKeyErrorDetails(null);
    
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
        if (errJson.isApiKeyError) {
          setApiKeyErrorDetails({
            error: errJson.error,
            suggestedFix: errJson.suggestedFix
          });
        }
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
                  durationMs: ytResult.durationMs || item.durationMs,
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
    setApiKeyErrorDetails(null);
    setCurrentPlaylistId(null);
    saveCurrentState(null, [], "");
    setShowResetConfirm(false);
  };

  const handleGoHome = () => {
    setPlaylistMeta(null);
    setTracks([]);
    setSpotifyUrl("");
    setErrorMsg("");
    setApiKeyErrorDetails(null);
    setCurrentPlaylistId(null);
    localStorage.removeItem("syncify_playlist_meta");
    localStorage.removeItem("syncify_tracks");
    localStorage.removeItem("syncify_spotify_url");
    localStorage.removeItem("syncify_playlist_id");
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
        onGoHome={handleGoHome}
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
                        <p className="text-[11px] text-gray-500 font-medium">Uses AI via OpenRouter to intelligently analyze candidate videos for the official best match.</p>
                      </div>
                    </button>
                  </div>
                </div>

                {apiKeyErrorDetails ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-5 bg-[#1c0f13] border border-red-900/40 rounded-2xl text-xs text-red-300 flex flex-col gap-3.5 relative overflow-hidden shadow-2xl"
                  >
                    {/* Visual warning background glow */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full" />
                    
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center text-red-500 flex-shrink-0">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-red-200 tracking-tight text-left">OpenRouter API Key Resolution Needed</p>
                        <p className="mt-1 text-gray-400 leading-relaxed text-left">{apiKeyErrorDetails.error}</p>
                      </div>
                    </div>

                    <div className="h-[1px] bg-red-950/40 w-full" />

                    <div className="flex flex-col gap-2.5 text-left">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#1DB954]">Recommended Actions:</span>
                      <ol className="list-decimal pl-4 space-y-2 text-gray-400 leading-relaxed font-medium">
                        <li>
                          Open the Google AI Studio <span className="text-white font-semibold">Settings &gt; Secrets</span> panel (located in your main workspace sidebar/context).
                        </li>
                        <li>
                          Inject your valid OpenRouter API Key into the <strong className="text-white font-mono bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800">OPENROUTER_API_KEY</strong> environment secret.
                        </li>
                        <li>
                          Refresh this page/dev-server to seamlessly retry your conversion!
                        </li>
                      </ol>
                    </div>
                  </motion.div>
                ) : errorMsg ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2 text-left animate-pulse"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-300">Conversion issue:</p>
                      <p className="mt-0.5">{errorMsg}</p>
                    </div>
                  </motion.div>
                ) : null}
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111113]/30 p-3 rounded-2xl border border-[#27272a]/40 sm:p-0 sm:bg-transparent sm:border-0">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleGoHome}
                    className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-semibold text-[#fafafa] bg-[#121214] hover:bg-[#18181b] border border-[#27272a] rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    title="Safely return back to the main search and import view"
                  >
                    <Layers3 className="w-3.5 h-3.5 text-[#1DB954]" /> Go Home
                  </button>
                  <button 
                    onClick={handleClearAllConfirm}
                    className="flex-1 sm:flex-none px-4 py-2.5 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-xl border border-[#27272a] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Hard reset of your workspace to import something completely new"
                  >
                    <ListRestart className="w-3.5 h-3.5" /> Reset Workspace
                  </button>
                </div>
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
                  {playableTracks.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-3">
                      <button 
                        onClick={handlePlayWholePlaylist}
                        className="px-5 py-2.5 bg-[#1DB954] hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(29,185,84,0.3)] flex items-center gap-2 cursor-pointer active:scale-95"
                        title="Start playing the whole playlist automatically"
                      >
                        <Play className="w-3.5 h-3.5 fill-black text-black" />
                        Play Entire Playlist
                      </button>
                    </div>
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
                <div 
                  className="divide-y divide-[#18181b] max-h-[500px] overflow-y-auto custom-scrollbar scroll-smooth [overscroll-behavior:contain]"
                  style={{ transform: "translate3d(0, 0, 0)", WebkitOverflowScrolling: "touch" }}
                >
                  <AnimatePresence initial={false}>
                    {filteredTracks.map((track, idx) => (
                      <motion.div 
                        key={track.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80px" } as React.CSSProperties}
                        className="will-change-[transform,opacity]"
                      >
                        <TrackRow 
                          track={track}
                          index={trackIdToIndexMap[track.id] ?? idx}
                          onUpdateTrack={handleUpdateTrack}
                          onSearchAgain={triggerSearchForTrack}
                          isSearchingRow={!!searchIndicesInProgress[track.id]}
                          onPreviewTrack={setPreviewVideo}
                          activePlayingTrackId={activePlayingTrackId}
                          isPlaying={isPlaying}
                          onPlayTrack={handlePlayTrack}
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

          {previewVideo && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-3xl md:backdrop-blur-[40px]"
            >
              <div 
                className="absolute inset-0 cursor-pointer" 
                onClick={() => setPreviewVideo(null)} 
              />
              <motion.div 
                initial={{ scale: 0.88, y: 40, opacity: 0 }} 
                animate={{ scale: 1, y: 0, opacity: 1 }} 
                exit={{ scale: 0.88, y: 40, opacity: 0 }} 
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
                className="w-full max-w-3xl bg-[#0e0e11]/80 border border-zinc-800/80 backdrop-blur-2xl rounded-[28px] overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.7)] relative z-10 p-5 md:p-6"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#1DB954] bg-[#1DB954]/10 border border-[#1DB954]/20 px-2.5 py-0.5 rounded-full select-none">
                      Dynamic Match Playback Preview
                    </span>
                    <h3 className="text-base md:text-lg font-bold text-white truncate mt-2" title={previewVideo.videoTitle}>
                      {previewVideo.videoTitle || "Matched Content"}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setPreviewVideo(null)}
                    className="p-2 cursor-pointer rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all duration-200 active:scale-90"
                    title="Close preview"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Aspect-Ratio video iframe wrapper conforming to top UX */}
                <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-zinc-800/85 shadow-2xl">
                  <iframe 
                    src={`https://www.youtube.com/embed/${previewVideo.videoId}?autoplay=1`} 
                    title={previewVideo.videoTitle || "YouTube Video"}
                    className="absolute inset-0 w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowFullScreen
                  />
                </div>

                {/* Info and helper details */}
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-500 font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Target Spotify:</span>
                    <span className="text-zinc-300 font-semibold">{previewVideo.title}</span>
                    <span className="text-zinc-600">by</span>
                    <span className="text-zinc-300 font-semibold">{previewVideo.artist}</span>
                  </div>
                  <a 
                    href={previewVideo.videoUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-shrink-0 text-[#1DB954] hover:underline flex items-center gap-1.5 font-bold transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Watch on YouTube
                  </a>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* The real underlying YouTube IFrame API Player engine */}
      {currentPlayingTrack && (
        <div className={`fixed transition-all duration-300 ${
          showPlayerVideoPreview 
            ? isVideoFullscreen
              ? "inset-0 w-screen h-screen bg-black border-0 rounded-none shadow-none z-50 pointer-events-auto"
              : "bottom-24 right-4 w-60 h-36 border-2 border-[#1DB954] rounded-xl shadow-[0_0_20px_rgba(29,185,84,0.3)] overflow-hidden opacity-100 z-50 pointer-events-auto bg-black" 
            : "w-60 h-36 opacity-0 pointer-events-none fixed bottom-24 right-4 translate-x-[9999px] z-50"
        }`}>
          {/* Visual indicator stamp overlay on video tray */}
          {showPlayerVideoPreview && (
            <div className="absolute top-1.5 left-1.5 bg-black/80 backdrop-blur text-[8px] uppercase tracking-widest text-[#1DB954] font-bold px-1.5 py-0.5 rounded border border-[#1DB954]/20 flex items-center gap-1 z-10 select-none">
              <span className="w-1.5 h-1.5 bg-[#1DB954] rounded-full animate-pulse" /> Live Feed {isVideoFullscreen && "(Fullscreen Mode)"}
            </div>
          )}

          {/* Fullscreen control overlay buttons */}
          {showPlayerVideoPreview && (
            <div className="absolute top-1.5 right-1.5 flex gap-1.5 z-10">
              <button
                onClick={() => setIsVideoFullscreen(!isVideoFullscreen)}
                className="bg-black/80 hover:bg-black/95 text-white hover:text-[#1DB954] p-1.5 rounded-lg border border-[#1DB954]/20 hover:border-[#1DB954]/55 shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-90"
                title={isVideoFullscreen ? "Exit Fullscreen" : "Expand to Fullscreen Feed"}
              >
                {isVideoFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}

          <iframe
            ref={playerIframeRef}
            src={`https://www.youtube.com/embed/${currentPlayingTrack.videoId}?enablejsapi=1&autoplay=1&controls=${isVideoFullscreen ? "1" : "0"}&mute=${isMuted ? "1" : "0"}&cc_load_policy=0&iv_load_policy=3&hl=en&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(window.location.origin)}`}
            title="Syncify Premium Streaming Core"
            className="w-full h-full border-0 select-none"
            allow="autoplay; encrypted-media"
          />
        </div>
      )}

      {/* Absolute Premium Floating Mini/Compact Media Player */}
      <AnimatePresence>
        {currentPlayingTrack && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 25 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0c0e]/95 border-t border-[#27272a]/70 backdrop-blur-xl shadow-[0_-10px_35px_rgba(0,0,0,0.6)] px-4 py-3.5 md:px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-white transition-all select-none"
          >
            {/* Elegant warning pill floating above player if inside iframe */}
            {isInsideIframe && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-500/15 border border-amber-500/25 text-[10px] text-amber-300 rounded-full flex items-center gap-1.5 shadow-md backdrop-blur-md">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                <span>Audio autoplay blocked inside sandboxes.</span>
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="underline hover:text-white font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  Open in New Tab ↗
                </button>
              </div>
            )}

            {/* LEFT COMPARTMENT: Vintage Vinyl artwork disk & Song metadata */}
            <div className="flex items-center gap-4 w-full md:w-1/4 min-w-0">
              <div 
                onClick={() => setIsPlaying(!isPlaying)}
                className="relative flex-shrink-0 w-12 h-12 rounded-full bg-black border border-zinc-850 shadow-xl overflow-hidden group flex items-center justify-center cursor-pointer"
              >
                {currentPlayingTrack.artworkUrl ? (
                  <img
                    src={currentPlayingTrack.artworkUrl}
                    alt={currentPlayingTrack.title}
                    className={`w-full h-full object-cover transition-transform select-none ${
                      isPlaying ? "spin-slow" : "spin-slow spin-paused"
                    }`}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Music className="w-5 h-5 text-[#1DB954]" />
                )}
                
                {/* Real aesthetic design: the reflective vinyl ridge curves and metallic dot core, making it feel 100% like premium audio equipment */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(255,255,255,0.06)_40%,transparent_50%,rgba(255,255,255,0.08)_60%,transparent_70%)] pointer-events-none rounded-full" />
                <div className="absolute w-2.5 h-2.5 bg-[#09090b] border border-zinc-700 rounded-full flex items-center justify-center pointer-events-none z-10">
                  <div className="w-1 h-1 bg-white rounded-full" />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <h5 className="text-xs md:text-sm font-bold text-white truncate max-w-[130px] md:max-w-[180px]" title={currentPlayingTrack.title}>
                  {currentPlayingTrack.title}
                </h5>
                <p className="text-[10px] md:text-xs text-[#71717a] truncate mt-0.5" title={currentPlayingTrack.artist}>
                  {currentPlayingTrack.artist}
                </p>
                {/* Visual indicator highlighting Youtube source match status */}
                <span className="inline-flex items-center gap-1 text-[8px] text-[#1DB954] mt-1 font-bold bg-[#1DB954]/10 border border-[#1DB954]/20 px-1.5 py-0.5 rounded uppercase tracking-wide">
                  <Youtube className="w-2.5 h-2.5 text-red-500 fill-red-500" /> YouTube Match
                </span>
              </div>

              {/* Action to toggle the floating compact TV screen feed */}
              <button
                onClick={() => setShowPlayerVideoPreview(!showPlayerVideoPreview)}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  showPlayerVideoPreview 
                    ? "text-[#1DB954] bg-[#1DB954]/10 border border-[#1DB954]/20" 
                    : "text-zinc-400 hover:text-white hover:bg-zinc-950 border border-transparent"
                }`}
                title="Toggle Live Video Feed Panel"
              >
                <Radio className={`w-3.5 h-3.5 ${showPlayerVideoPreview ? 'animate-pulse' : ''}`} />
              </button>
            </div>

            {/* MIDDLE COMPARTMENT: Core playback, Frequency sound wave canvas, timeline progress slider */}
            <div className="flex flex-col items-center gap-1.5 w-full md:w-2/4">
              
              {/* Controls button group */}
              <div className="flex items-center gap-4">
                {/* Shuffle Toggle */}
                <button
                  onClick={() => setIsShuffled(!isShuffled)}
                  className={`p-1.5 rounded-full transition-colors relative cursor-pointer ${
                    isShuffled ? "text-[#1DB954]" : "text-zinc-500 hover:text-white"
                  }`}
                  title={isShuffled ? "Shuffle active" : "Shuffle tracks"}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  {isShuffled && <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#1DB954]" />}
                </button>

                {/* Previous */}
                <button
                  onClick={handleSkipPrev}
                  className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Previous song"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>

                {/* Play/Pause Green Orb Circle */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-9 h-9 rounded-full bg-[#1DB954] text-[#09090b] flex items-center justify-center shadow-lg cursor-pointer hover:scale-105 active:scale-95 transition-all text-center focus:outline-none"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current text-[#09090b]" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5 text-[#09090b]" />
                  )}
                </button>

                {/* Next */}
                <button
                  onClick={handleSkipNext}
                  className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Next song"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>

                {/* Repeat Mode Toggle */}
                <button
                  onClick={() => {
                    if (repeatMode === 'all') setRepeatMode('one');
                    else if (repeatMode === 'one') setRepeatMode('none');
                    else setRepeatMode('all');
                  }}
                  className={`p-1.5 rounded-full transition-colors relative cursor-pointer ${
                    repeatMode !== 'none' ? "text-[#1DB954]" : "text-zinc-500 hover:text-white"
                  }`}
                  title={repeatMode === 'one' ? "Repeat One" : repeatMode === 'all' ? "Repeat All" : "Repeat Disabled"}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  {repeatMode !== 'none' && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#1DB954]" />
                  )}
                  {repeatMode === 'one' && (
                    <span className="absolute -top-1 -right-1 text-[7px] font-bold bg-[#1DB954] text-[#09090b] rounded-full w-2.5 h-2.5 flex items-center justify-center scale-90">1</span>
                  )}
                </button>
              </div>

              {/* Interactive dynamic responsive audio waveform visualizer render */}
              <div className="w-full relative px-2 max-w-[280px] hidden sm:block h-7 flex items-center justify-center overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full opacity-90 transition-opacity"
                />
              </div>

              {/* Timeline and clock readings */}
              <div className="w-full flex items-center gap-3 max-w-lg">
                {(() => {
                  const displayTimeSecs = Math.min(currentTimeSecs, trackDurationSecs);
                  return (
                    <>
                      {/* Clock elapsed progress text */}
                      <span className="text-[9px] font-mono text-zinc-500 w-8 text-right select-none">
                        {Math.floor(displayTimeSecs / 60)}:
                        {String(displayTimeSecs % 60).padStart(2, "0")}
                      </span>

                      {/* Timeline slider range */}
                      <div className="flex-1 relative group py-2">
                        <input
                          type="range"
                          min="0"
                          max={trackDurationSecs}
                          value={displayTimeSecs}
                          onChange={(e) => handleTimelineChange(parseInt(e.target.value, 10))}
                          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#1DB954] outline-none group-hover:bg-zinc-700 transition-all"
                          style={{
                            background: `linear-gradient(to right, #1DB954 ${
                              (displayTimeSecs / trackDurationSecs) * 100
                            }%, #27272a ${(displayTimeSecs / trackDurationSecs) * 100}%)`,
                          }}
                        />
                      </div>
                    </>
                  );
                })()}

                {/* Clock total track duration text */}
                <span className="text-[9px] font-mono text-zinc-500 w-8 select-none">
                  {Math.floor(trackDurationSecs / 60)}:
                  {String(trackDurationSecs % 60).padStart(2, "0")}
                </span>
              </div>

            </div>

            {/* RIGHT COMPARTMENT: Volume controller, mute toggles */}
            <div className="flex items-center justify-end gap-2.5 w-full md:w-1/4">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1.5 text-zinc-400 hover:text-[#1DB954] transition-colors cursor-pointer"
                title={isMuted ? "Unmute sound" : "Mute sound"}
              >
                {isMuted || playbackVolume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-500 animate-pulse" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#1DB954]" />
                )}
              </button>

              <div className="w-20 group py-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : playbackVolume}
                  onChange={(e) => {
                    const vol = parseInt(e.target.value, 10);
                    handleVolumeChange(vol);
                    if (isMuted && vol > 0) setIsMuted(false);
                  }}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#1DB954] outline-none group-hover:bg-zinc-700 transition-all"
                  style={{
                    background: `linear-gradient(to right, #1DB954 ${
                      isMuted ? 0 : playbackVolume
                    }%, #27272a ${isMuted ? 0 : playbackVolume}%)`,
                  }}
                />
              </div>

              <span className="text-[9px] font-mono text-zinc-500 w-8 select-none">
                {isMuted ? 0 : playbackVolume}%
              </span>

              {/* Seamless Button to Launch App on Full Tab context for perfect sound */}
              <button
                onClick={() => window.open(window.location.href, '_blank')}
                className="ml-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-[#1DB954] rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1.5 text-[9px] tracking-wide font-bold uppercase"
                title="Launch Playback in a standard Browser Tab to bypass frame cross-origin autoplay restrictions and hear premium output audio instantly!"
              >
                <Maximize2 className="w-3 h-3 text-[#1DB954] animate-pulse" />
                <span className="hidden xl:inline">New Tab</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
