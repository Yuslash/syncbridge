import React, { useState } from "react";
import { 
  Music, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Plus, 
  Search, 
  Loader2, 
  Clipboard, 
  Zap, 
  Play, 
  ListOrdered, 
  Layers, 
  GripVertical
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MatchedTrack, cleanYouTubeMetadata } from "../types";

interface QueuePanelProps {
  queue: MatchedTrack[];
  setQueue: React.Dispatch<React.SetStateAction<MatchedTrack[]>>;
  previousTracks: MatchedTrack[];
  setPreviousTracks: React.Dispatch<React.SetStateAction<MatchedTrack[]>>;
  onPlayNextImmediate: (track: MatchedTrack) => void;
  onPlayPreviousTrack: (track: MatchedTrack) => void;
  currentPlayingTrack: MatchedTrack | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  isAmbientFocusMode?: boolean;
}

export function QueuePanel({ 
  queue, 
  setQueue, 
  previousTracks, 
  setPreviousTracks, 
  onPlayNextImmediate, 
  onPlayPreviousTrack, 
  currentPlayingTrack,
  isPlaying,
  setIsPlaying,
  isAmbientFocusMode = false
}: QueuePanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Sorting Modes: 'drag' or 'number'
  const [isNumberedMode, setIsNumberedMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  React.useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const isValidLink = (text: string): boolean => {
    const cleanText = text.trim();
    const isYT = /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(cleanText) || /^[a-zA-Z0-9_-]{11}$/.test(cleanText);
    const isSpotify = /open\.spotify\.com/i.test(cleanText);
    return isYT || isSpotify;
  };

  const handleLinkAdd = async (url: string) => {
    setLoadingLink(true);
    setErrorMsg("");
    setSuggestions([]);

    try {
      const cleanUrl = url.trim();

      if (/open\.spotify\.com\/track\//i.test(cleanUrl)) {
        const response = await fetch("/api/spotify-track-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanUrl }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch Spotify track details");
        }

        const data = await response.json();
        const spotifyTrack = data.track;

        // Fetch YouTube match
        const searchResponse = await fetch("/api/search-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: spotifyTrack.title, artist: spotifyTrack.artist }),
        });

        if (!searchResponse.ok) {
          throw new Error("Failed to find a YouTube match for Spotify track");
        }

        const matchData = await searchResponse.json();
        if (!matchData.videoId) {
          throw new Error("No YouTube match found for this song");
        }

        const track: MatchedTrack = {
          id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: spotifyTrack.title,
          artist: spotifyTrack.artist,
          album: spotifyTrack.album || "",
          durationMs: matchData.durationMs || spotifyTrack.durationMs || 180000,
          artworkUrl: spotifyTrack.artworkUrl || matchData.thumbnailUrl || `https://img.youtube.com/vi/${matchData.videoId}/mqdefault.jpg`,
          videoId: matchData.videoId,
          videoTitle: matchData.videoTitle || spotifyTrack.title,
          videoUrl: matchData.videoUrl,
          thumbnailUrl: matchData.thumbnailUrl,
          status: "matched",
        };

        setQueue(prev => [...prev, track]);
        setInputValue("");
      } else {
        const response = await fetch("/api/youtube-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanUrl }),
        });

        if (!response.ok) {
          throw new Error("Failed to parse YouTube link");
        }

        const data = await response.json();
        const cleaned = cleanYouTubeMetadata(data.title, data.artist);
        const track: MatchedTrack = {
          id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: cleaned.title,
          artist: cleaned.artist,
          durationMs: data.durationMs,
          artworkUrl: data.artworkUrl,
          videoId: data.videoId,
          videoTitle: data.title,
          videoUrl: `https://www.youtube.com/watch?v=${data.videoId}`,
          thumbnailUrl: data.artworkUrl,
          status: "matched",
        };

        setQueue(prev => [...prev, track]);
        setInputValue("");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Could not add link to queue.");
    } finally {
      setLoadingLink(false);
    }
  };

  const handleSearchAdd = async (query: string) => {
    setSearching(true);
    setErrorMsg("");
    try {
      const response = await fetch("/api/youtube-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: query, artist: "" }),
      });

      if (!response.ok) {
        throw new Error("Search request failed.");
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
      if (!data.suggestions || data.suggestions.length === 0) {
        setErrorMsg("No results found.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to search for song.");
    } finally {
      setSearching(false);
    }
  };

  const handleAddToQueueSubmit = async () => {
    setErrorMsg("");
    const val = inputValue.trim();

    if (val && isValidLink(val)) {
      await handleLinkAdd(val);
      return;
    }

    if (val) {
      await handleSearchAdd(val);
      return;
    }

    setErrorMsg("Please enter a song name or paste a song URL to add!");
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const cleaned = cleanYouTubeMetadata(suggestion.title, suggestion.artistName);
    const track: MatchedTrack = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: cleaned.title,
      artist: cleaned.artist,
      durationMs: suggestion.durationMs,
      artworkUrl: suggestion.thumbnailUrl,
      videoId: suggestion.videoId,
      videoTitle: suggestion.title,
      videoUrl: suggestion.videoUrl,
      thumbnailUrl: suggestion.thumbnailUrl,
      status: "matched",
    };
    setQueue(prev => [...prev, track]);
    setSuggestions([]);
    setInputValue("");
  };

  const removeTrack = (id: string) => {
    setQueue(prev => prev.filter(t => t.id !== id));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setQueue(prev => {
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
      return list;
    });
  };

  const moveDown = (index: number) => {
    setQueue(prev => {
      if (index === prev.length - 1) return prev;
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
      return list;
    });
  };

  const handleNumberChange = (index: number, newPositionStr: string) => {
    const targetPos = parseInt(newPositionStr, 10);
    if (isNaN(targetPos) || targetPos < 1) return;
    
    setQueue(prev => {
      const list = [...prev];
      const maxPos = list.length;
      const finalPos = Math.min(targetPos, maxPos);
      const targetIndex = finalPos - 1;
      
      if (index === targetIndex) return prev;

      const [removed] = list.splice(index, 1);
      list.splice(targetIndex, 0, removed);
      return list;
    });
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    setQueue(prev => {
      const list = [...prev];
      const [removed] = list.splice(sourceIndex, 1);
      list.splice(targetIndex, 0, removed);
      return list;
    });
    setDraggedIndex(null);
  };

  if (isAmbientFocusMode) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-[50vh] py-4 transition-all duration-500">
        {currentPlayingTrack ? (
          <div className="luminous-card-container w-full max-w-sm sm:max-w-md scale-105 sm:scale-110 md:scale-115 transition-transform duration-500">
            <input 
              type="checkbox" 
              id="luminous-checkbox" 
              className="luminous-toggle-input" 
              checked={isPlaying} 
              onChange={(e) => setIsPlaying(e.target.checked)} 
            />
            
            <div className="luminous-card mx-auto">
              <div className="luminous-light-layer">
                <div className="luminous-slit"></div>
                <div className="luminous-lumen">
                  <div className="min"></div>
                  <div className="mid"></div>
                  <div className="hi"></div>
                </div>
                <div className="luminous-darken">
                  <div className="sl"></div>
                  <div className="ll"></div>
                  <div className="slt"></div>
                  <div className="srt"></div>
                </div>
              </div>
              
              <div className="luminous-content">
                {/* 3D Floating spinning vinyl record */}
                <div className="luminous-icon">
                  <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-black border border-zinc-800 shadow-[0_15px_35px_rgba(0,0,0,0.8)] flex items-center justify-center p-1.5 overflow-hidden">
                    {currentPlayingTrack.artworkUrl ? (
                      <img
                        src={currentPlayingTrack.artworkUrl}
                        alt={currentPlayingTrack.title}
                        className={`w-full h-full object-cover rounded-full transition-transform select-none ${
                          isPlaying ? "spin-slow" : "spin-slow spin-paused"
                        }`}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Music className="w-10 h-10 text-blue-400" />
                    )}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(255,255,255,0.06)_40%,transparent_50%,rgba(255,255,255,0.08)_60%,transparent_70%)] pointer-events-none rounded-full" />
                    <div className="absolute w-7 h-7 bg-[#09090b] border border-zinc-700 rounded-full flex items-center justify-center pointer-events-none z-10">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>
                </div>
                
                <div className="luminous-bottom">
                  <h3 className="luminous-title" title={currentPlayingTrack.title}>
                    {currentPlayingTrack.title}
                  </h3>
                  <p className="luminous-description" title={currentPlayingTrack.artist}>
                    {currentPlayingTrack.artist}
                  </p>
                  
                  {/* Micro equalizer soundwave bars inside the bottom of the card */}
                  <div className="absolute right-24 bottom-1.5 flex items-end gap-[2px] h-3.5 select-none pointer-events-none">
                    {[1, 2, 3, 4].map((bar, i) => (
                      <motion.span
                        key={i}
                        animate={isPlaying ? { height: [3, 14, 5, 11, 3] } : { height: 3 }}
                        transition={{
                          duration: 0.7 + i * 0.12,
                          repeat: isPlaying ? Infinity : 0,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        }}
                        className="w-[2px] bg-white/45 rounded-full"
                      />
                    ))}
                  </div>

                  <label htmlFor="luminous-checkbox" className="luminous-toggle">
                    <div className="luminous-handle"></div>
                    <div className="luminous-toggle-label">Play / Pause</div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-white/50">
            <Music className="w-12 h-12 text-zinc-500 mx-auto mb-3 animate-pulse" />
            <p className="text-sm font-bold">No active playing track</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="vision-glass rounded-2xl p-4 sm:p-5 md:p-6 shadow-2xl relative flex flex-col gap-4 sm:gap-5 md:gap-6 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-white" /> Playback Queue ({queue.length})
          </h4>
          <p className="text-xs text-white/40 mt-1">
            Build your session queue without leaving the active player workspace.
          </p>
        </div>

        {queue.length > 0 && (
          <div className="flex rounded-xl bg-white/5 p-1 border border-white/10">
            <button
              onClick={() => setIsNumberedMode(false)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                !isNumberedMode ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Drag & Drop
            </button>
            <button
              onClick={() => setIsNumberedMode(true)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                isNumberedMode ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" /> Numbered mode
            </button>
          </div>
        )}
      </div>

      {/* Add To Queue Interactive Input Card */}
      <div className="flex flex-col gap-3.5 bg-white/5 p-4 rounded-2xl border border-white/10">
        <div className="text-xs font-bold text-white/60 uppercase tracking-wider">
          Add Songs to Queue
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
          <div className="relative w-full sm:flex-1 h-11">
            <input
              type="text"
              className="w-full h-full vision-glass-input rounded-xl px-4 pl-10 pr-12 text-xs text-[#fafafa] placeholder-white/30 focus:outline-none transition-all"
              placeholder="Search song name or paste direct URL..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setErrorMsg("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAddToQueueSubmit()}
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) {
                    setInputValue(text);
                    setErrorMsg("");
                  }
                } catch (e) {
                  setErrorMsg("Please paste the link manually.");
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-white/15 hover:bg-white/25 text-white/50 hover:text-white rounded transition-colors"
              title="Paste from clipboard"
            >
              <Clipboard className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleAddToQueueSubmit}
            disabled={searching || loadingLink}
            className="h-11 px-5 bg-white hover:bg-gray-100 text-black text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:shadow-[0_0_25px_rgba(255,255,255,0.45)] transform hover:-translate-y-0.5"
          >
            {searching || loadingLink ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Add to Queue</span>
          </button>
        </div>

        {errorMsg && (
          <div className="text-[11px] text-red-300 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Search Recommendations in Queue */}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="vision-glass-interactive rounded-xl overflow-hidden divide-y divide-white/10 max-h-48 overflow-y-auto"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.videoId}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-3 py-2 hover:bg-white/10 text-left transition-colors flex items-center gap-3 group cursor-pointer"
                >
                  <img
                    src={suggestion.thumbnailUrl}
                    alt={suggestion.title}
                    className="w-8 h-8 object-cover rounded border border-white/10 flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-bold text-white truncate group-hover:text-white/80 transition-colors">
                      {suggestion.title}
                    </h5>
                    <p className="text-[10px] text-white/40 truncate">
                      {suggestion.artistName}
                    </p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-white/40 group-hover:text-white" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History and Active Session Status */}
      {previousTracks.length > 0 && (
        <div className="flex flex-col gap-2.5 pb-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)]" /> Previous Tracks ({previousTracks.length})
            </span>
            <button
              onClick={() => setPreviousTracks([])}
              className="text-[9px] font-bold text-white/30 hover:text-rose-400 uppercase tracking-widest transition-colors cursor-pointer"
            >
              Clear History
            </button>
          </div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {previousTracks.map((track, idx) => (
              <div 
                key={`prev_${track.id}_${idx}`}
                className="flex items-center gap-3 p-2 bg-white/[0.02] hover:bg-white/[0.06] rounded-xl border border-white/[0.03] hover:border-white/[0.08] transition-all group"
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/5 flex-shrink-0 relative">
                  <img
                    src={track.artworkUrl || `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`}
                    alt={track.title}
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    onClick={() => onPlayPreviousTrack(track)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    title="Play track again"
                  >
                    <Play className="w-3 h-3 text-white fill-current" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-white/50 group-hover:text-white transition-colors truncate block">
                    {track.title}
                  </span>
                  <span className="text-[10px] text-white/30 truncate block mt-0.5">
                    {track.artist}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => onPlayPreviousTrack(track)}
                    className="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-blue-400 hover:text-white bg-blue-400/10 hover:bg-blue-400 border border-blue-400/20 hover:border-blue-400 rounded-lg transition-all cursor-pointer"
                  >
                    Play
                  </button>
                  <button
                    onClick={() => setPreviousTracks(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/20 transition-all cursor-pointer flex items-center justify-center"
                    title="Remove from history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentPlayingTrack && (
        <div className="flex flex-col gap-2.5 pb-6 border-b border-white/10 items-center justify-center">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 font-mono flex items-center gap-1.5 self-start">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" /> Currently Playing
          </span>
          
          {/* Stunning Luminous Card Container */}
          <div className="luminous-card-container w-full max-w-sm sm:max-w-md">
            <input 
              type="checkbox" 
              id="luminous-checkbox" 
              className="luminous-toggle-input" 
              checked={isPlaying} 
              onChange={(e) => setIsPlaying(e.target.checked)} 
            />
            
            <div className="luminous-card mx-auto">
              <div className="luminous-light-layer">
                <div className="luminous-slit"></div>
                <div className="luminous-lumen">
                  <div className="min"></div>
                  <div className="mid"></div>
                  <div className="hi"></div>
                </div>
                <div className="luminous-darken">
                  <div className="sl"></div>
                  <div className="ll"></div>
                  <div className="slt"></div>
                  <div className="srt"></div>
                </div>
              </div>
              
              <div className="luminous-content">
                {/* 3D Floating spinning vinyl record */}
                <div className="luminous-icon">
                  <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-black border border-zinc-800 shadow-[0_15px_35px_rgba(0,0,0,0.8)] flex items-center justify-center p-1.5 overflow-hidden">
                    {currentPlayingTrack.artworkUrl ? (
                      <img
                        src={currentPlayingTrack.artworkUrl}
                        alt={currentPlayingTrack.title}
                        className={`w-full h-full object-cover rounded-full transition-transform select-none ${
                          isPlaying ? "spin-slow" : "spin-slow spin-paused"
                        }`}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Music className="w-10 h-10 text-blue-400" />
                    )}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(255,255,255,0.06)_40%,transparent_50%,rgba(255,255,255,0.08)_60%,transparent_70%)] pointer-events-none rounded-full" />
                    <div className="absolute w-7 h-7 bg-[#09090b] border border-zinc-700 rounded-full flex items-center justify-center pointer-events-none z-10">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>
                </div>
                
                <div className="luminous-bottom">
                  <h3 className="luminous-title" title={currentPlayingTrack.title}>
                    {currentPlayingTrack.title}
                  </h3>
                  <p className="luminous-description" title={currentPlayingTrack.artist}>
                    {currentPlayingTrack.artist}
                  </p>
                  
                  {/* Micro equalizer soundwave bars inside the bottom of the card */}
                  <div className="absolute right-24 bottom-1.5 flex items-end gap-[2px] h-3.5 select-none pointer-events-none">
                    {[1, 2, 3, 4].map((bar, i) => (
                      <motion.span
                        key={i}
                        animate={isPlaying ? { height: [3, 14, 5, 11, 3] } : { height: 3 }}
                        transition={{
                          duration: 0.7 + i * 0.12,
                          repeat: isPlaying ? Infinity : 0,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        }}
                        className="w-[2px] bg-white/45 rounded-full"
                      />
                    ))}
                  </div>

                  <label htmlFor="luminous-checkbox" className="luminous-toggle">
                    <div className="luminous-handle"></div>
                    <div className="luminous-toggle-label">Play / Pause</div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue List */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/40 font-mono mb-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-white/20 rounded-full" /> Upcoming Queue ({queue.length})
        </div>
        {queue.length === 0 ? (
          <div className="py-12 border border-dashed border-white/10 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
            <Music className="w-6 h-6 text-white/20" />
            <div>
              <p className="text-xs font-bold text-white/40">Queue is empty</p>
              <p className="text-[11px] text-white/30 mt-1 max-w-xs mx-auto">
                No upcoming tracks loaded. Search songs or paste URLs above to populate upcoming playlist order!
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[350px] sm:max-h-[380px] md:max-h-[500px] overflow-y-auto overscroll-y-contain touch-pan-y custom-scrollbar pr-1">
            <AnimatePresence initial={false}>
              {queue.map((track, index) => {
                const isDragging = draggedIndex === index;
                return (
                  <motion.div
                    key={track.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-2xl border transition-all ${
                      isDragging 
                        ? "border-white bg-white/15 opacity-60 scale-[0.98]" 
                        : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/15"
                    }`}
                    draggable={!isNumberedMode && !isTouchDevice}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={() => setDraggedIndex(null)}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    {/* Upper row/column: thumbnail + title/artist + play button (Mobile) */}
                    <div className="flex items-center justify-between gap-2 flex-1 min-w-0 w-full sm:w-auto">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Drag Handle or Index marker */}
                        {!isNumberedMode ? (
                          !isTouchDevice ? (
                            <div className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white p-1 rounded transition-colors flex-shrink-0">
                              <GripVertical className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="text-[10px] font-mono text-white/30 w-4 text-center flex-shrink-0 font-bold">
                              {index + 1}
                            </div>
                          )
                        ) : (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <input
                               type="text"
                               inputMode="numeric"
                               pattern="[0-9]*"
                               defaultValue={index + 1}
                               onBlur={(e) => handleNumberChange(index, e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key === "Enter") {
                                   handleNumberChange(index, (e.target as HTMLInputElement).value);
                                   (e.target as HTMLInputElement).blur();
                                 }
                               }}
                               className="w-8 h-7 bg-black/40 text-center font-mono font-bold text-xs text-white rounded border border-white/15 focus:outline-none focus:border-white/40"
                            />
                          </div>
                        )}

                        {/* Image thumb */}
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 relative group">
                          <img
                            src={track.artworkUrl || `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={() => onPlayNextImmediate(track)}
                            className="absolute inset-0 bg-black/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            title="Play song now"
                          >
                            <Play className="w-3.5 h-3.5 text-white fill-current" />
                          </button>
                        </div>

                        {/* Meta info */}
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-white truncate" title={track.title}>
                            {track.title}
                          </h5>
                          <p className="text-[10px] text-white/40 truncate mt-0.5" title={track.artist}>
                            {track.artist}
                          </p>
                        </div>
                      </div>

                      {/* Play instantly Button - Mobile view */}
                      <button
                        onClick={() => onPlayNextImmediate(track)}
                        className="sm:hidden px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-blue-400 hover:text-white bg-blue-400/10 hover:bg-blue-400 border border-blue-400/20 hover:border-blue-400 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 active:bg-blue-400 active:text-black"
                        title="Play song now"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Play</span>
                      </button>
                    </div>

                    {/* Bottom actions panel (mobile) or Right actions panel (desktop) */}
                    <div className="flex items-center justify-between sm:justify-end gap-1.5 border-t border-white/[0.03] pt-2 sm:pt-0 sm:border-0 w-full sm:w-auto">
                      {/* Mobile track indicator tag */}
                      <div className="sm:hidden text-[9px] font-mono text-white/40 font-bold bg-white/5 px-2 py-0.5 rounded-md">
                        Track #{index + 1}
                      </div>

                      <div className="flex items-center gap-2 sm:gap-1.5 flex-shrink-0 ml-auto sm:ml-0">
                        {/* Play instantly Button - Desktop only */}
                        <button
                          onClick={() => onPlayNextImmediate(track)}
                          className="hidden sm:flex px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-blue-400 hover:text-white bg-blue-400/10 hover:bg-blue-400 border border-blue-400/20 hover:border-blue-400 rounded-lg transition-all cursor-pointer items-center gap-1"
                          title="Play song now"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Play</span>
                        </button>

                        {/* Move Up Button */}
                        <button
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className="p-2 sm:p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded-lg border border-white/[0.05] sm:border-0 transition-all cursor-pointer flex items-center justify-center min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0"
                          title="Move Up"
                        >
                          <ArrowUp className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>

                        {/* Move Down Button */}
                        <button
                          onClick={() => moveDown(index)}
                          disabled={index === queue.length - 1}
                          className="p-2 sm:p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded-lg border border-white/[0.05] sm:border-0 transition-all cursor-pointer flex items-center justify-center min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0"
                          title="Move Down"
                        >
                          <ArrowDown className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>

                        {/* Trash Delete Button */}
                        <button
                          onClick={() => removeTrack(track.id)}
                          className="p-2 sm:p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/10 sm:border-0 transition-all cursor-pointer flex items-center justify-center min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
