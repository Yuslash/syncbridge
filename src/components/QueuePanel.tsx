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
}

export function QueuePanel({ 
  queue, 
  setQueue, 
  previousTracks, 
  setPreviousTracks, 
  onPlayNextImmediate, 
  onPlayPreviousTrack, 
  currentPlayingTrack,
  isPlaying
}: QueuePanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Sorting Modes: 'drag' or 'number'
  const [isNumberedMode, setIsNumberedMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const isValidLink = (text: string): boolean => {
    const cleanText = text.trim();
    return /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(cleanText) || /open\.spotify\.com/i.test(cleanText);
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
            className="h-11 px-5 bg-[#10B981] hover:bg-[#059669] text-black text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed shadow-[0_4px_15px_rgba(16,185,129,0.2)]"
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
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Previous Tracks ({previousTracks.length})
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
                <button
                  onClick={() => onPlayPreviousTrack(track)}
                  className="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-[#1DB954] hover:text-white bg-[#1DB954]/10 hover:bg-[#1DB954] border border-[#1DB954]/20 hover:border-[#1DB954] rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                >
                  Play
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentPlayingTrack && (
        <div className="flex flex-col gap-2 pb-5 border-b border-white/10">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#1DB954] font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#1DB954] rounded-full animate-pulse" /> Currently Playing
          </span>
          <motion.div 
            animate={{
              boxShadow: [
                "0 0 12px rgba(29,185,84,0.05), inset 0 0 12px rgba(29,185,84,0.02)",
                "0 0 24px rgba(29,185,84,0.18), inset 0 0 16px rgba(29,185,84,0.05)",
                "0 0 12px rgba(29,185,84,0.05), inset 0 0 12px rgba(29,185,84,0.02)"
              ]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="flex items-center gap-4 p-4 rounded-2xl border border-[#1DB954]/30 bg-[#111113] relative overflow-hidden group"
          >
            {/* Ambient blurred glow in background */}
            <div className="absolute right-0 top-0 w-32 h-32 bg-[#1DB954]/10 rounded-full blur-3xl pointer-events-none" />
            
            {/* Retro-Modern Spinning Vinyl Record Artwork */}
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-zinc-800/80 flex-shrink-0 shadow-[0_8px_24px_rgba(0,0,0,0.6)] relative bg-black flex items-center justify-center p-[2px]">
              {/* Outer vinyl groove rings */}
              <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none scale-[0.88]" />
              <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none scale-[0.74]" />
              <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none scale-[0.60]" />
              
              {/* Spinning vinyl content */}
              <motion.div
                animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                transition={{
                  repeat: isPlaying ? Infinity : 0,
                  duration: isPlaying ? 12 : 0.6,
                  ease: "linear"
                }}
                className="w-full h-full rounded-full overflow-hidden relative"
              >
                <img
                  src={currentPlayingTrack.artworkUrl || `https://img.youtube.com/vi/${currentPlayingTrack.videoId}/mqdefault.jpg`}
                  alt={currentPlayingTrack.title}
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
                
                {/* Vinyl Center spindle hole and label */}
                <div className="absolute inset-0 m-auto w-4 h-4 bg-zinc-950 rounded-full border-2 border-zinc-800 shadow-inner flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full border border-zinc-500" />
                </div>
              </motion.div>
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[8px] font-black tracking-widest text-[#1DB954] uppercase bg-[#1DB954]/10 border border-[#1DB954]/20 px-2 py-0.5 rounded-full inline-block mb-1">
                Active Session
              </span>
              <h5 className="text-sm font-bold text-white truncate" title={currentPlayingTrack.title}>
                {currentPlayingTrack.title}
              </h5>
              <p className="text-xs text-zinc-400 font-medium truncate mt-0.5" title={currentPlayingTrack.artist}>
                {currentPlayingTrack.artist}
              </p>
            </div>
            
            {/* Highly Creative Glowing Equalizer Soundwave Visualizer */}
            <div className="flex items-end justify-center gap-[3px] h-9 px-2.5 bg-black/40 rounded-xl border border-white/5 min-w-[76px]">
              {[
                { duration: 0.9, delay: 0.1, heights: [6, 24, 10, 32, 6] },
                { duration: 1.2, delay: 0.3, heights: [10, 18, 30, 8, 10] },
                { duration: 0.8, delay: 0.0, heights: [4, 32, 14, 20, 4] },
                { duration: 1.3, delay: 0.4, heights: [14, 8, 26, 12, 14] },
                { duration: 1.0, delay: 0.2, heights: [8, 22, 12, 30, 8] },
                { duration: 1.1, delay: 0.5, heights: [12, 28, 6, 18, 12] },
                { duration: 0.9, delay: 0.6, heights: [6, 16, 24, 10, 6] },
                { duration: 0.7, delay: 0.1, heights: [8, 20, 12, 26, 8] },
              ].map((bar, i) => (
                <motion.span
                  key={i}
                  animate={isPlaying ? { height: bar.heights } : { height: 4 }}
                  transition={{
                    duration: isPlaying ? bar.duration : 0.3,
                    delay: isPlaying ? bar.delay : 0,
                    repeat: isPlaying ? Infinity : 0,
                    repeatType: "reverse",
                    ease: "easeInOut",
                  }}
                  className="w-[3px] bg-gradient-to-t from-[#1DB954] to-emerald-300 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                />
              ))}
            </div>
          </motion.div>
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
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
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
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      isDragging 
                        ? "border-white bg-white/15 opacity-60 scale-[0.98]" 
                        : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/15"
                    }`}
                    draggable={!isNumberedMode}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={() => setDraggedIndex(null)}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    {/* Drag Handle or Index marker */}
                    {!isNumberedMode ? (
                      <div className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white p-1 rounded transition-colors flex-shrink-0">
                        <GripVertical className="w-4 h-4" />
                      </div>
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
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 relative group">
                      <img
                        src={track.artworkUrl || `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`}
                        alt={track.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        onClick={() => onPlayNextImmediate(track)}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
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

                    {/* Action buttons (Arrows + Delete) */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Move Up Button */}
                      <button
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        className="hidden sm:inline-flex p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded transition-all"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Move Down Button */}
                      <button
                        onClick={() => moveDown(index)}
                        disabled={index === queue.length - 1}
                        className="hidden sm:inline-flex p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded transition-all"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Trash Delete Button */}
                      <button
                        onClick={() => removeTrack(track.id)}
                        className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
