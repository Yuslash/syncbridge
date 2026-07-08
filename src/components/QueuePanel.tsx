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
import { MatchedTrack } from "../types";

interface QueuePanelProps {
  queue: MatchedTrack[];
  setQueue: React.Dispatch<React.SetStateAction<MatchedTrack[]>>;
  onPlayNextImmediate: (track: MatchedTrack) => void;
  currentPlayingTrack: MatchedTrack | null;
}

export function QueuePanel({ queue, setQueue, onPlayNextImmediate, currentPlayingTrack }: QueuePanelProps) {
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
        const track: MatchedTrack = {
          id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: data.title,
          artist: data.artist,
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
    const track: MatchedTrack = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: suggestion.title,
      artist: suggestion.artistName,
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
    <div className="vision-glass rounded-3xl p-5 md:p-6 shadow-2xl relative flex flex-col gap-6 w-full">
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
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <input
              type="text"
              className="w-full h-11 vision-glass-input rounded-xl px-4 pl-10 pr-12 text-xs text-[#fafafa] placeholder-white/30 focus:outline-none transition-all"
              placeholder="Search song name or paste direct URL..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setErrorMsg("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAddToQueueSubmit()}
            />
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-white/40" />
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
              className="absolute right-3 top-2.5 p-1 bg-white/15 hover:bg-white/25 text-white/50 hover:text-white rounded transition-colors"
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

      {/* Queue List */}
      <div className="flex flex-col gap-2">
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
                        className="p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded transition-all"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      {/* Move Down Button */}
                      <button
                        onClick={() => moveDown(index)}
                        disabled={index === queue.length - 1}
                        className="p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded transition-all"
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
