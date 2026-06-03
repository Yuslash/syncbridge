import React, { useState } from "react";
import { MatchedTrack } from "../types";
import { 
  Music, 
  Youtube, 
  Link2, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Loader2,
  Trash2,
  Play,
  Sparkles
} from "lucide-react";

export function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
    return url.trim();
  }
  return null;
}

interface TrackRowProps {
  track: MatchedTrack;
  index: number;
  onUpdateTrack: (trackId: string, updates: Partial<MatchedTrack>) => void;
  onSearchAgain: (trackId: string) => Promise<void>;
  isSearchingRow: boolean;
}

export function TrackRow({ track, index, onUpdateTrack, onSearchAgain, isSearchingRow }: TrackRowProps) {
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState(`${track.artist} ${track.title}`);
  const [isExpandingSearch, setIsExpandingSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const handleLoadSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    setFetchError("");
    try {
      const response = await fetch("/api/youtube-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: track.title, artist: track.artist })
      });
      if (!response.ok) throw new Error("Could not load suggestions.");
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setFetchError("Failed to fetch suggestions.");
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleManualLink = () => {
    setManualError("");
    const parsedId = extractYouTubeId(manualInput);
    if (!parsedId) {
      setManualError("Could not extract a valid 11-Digit YouTube Video ID or URL.");
      return;
    }

    onUpdateTrack(track.id, {
      videoId: parsedId,
      videoTitle: `User Manual Video (${parsedId})`,
      videoUrl: `https://www.youtube.com/watch?v=${parsedId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${parsedId}/mqdefault.jpg`,
      isManual: true,
      status: "manual"
    });
    setManualInput("");
  };

  const handleClearLink = () => {
    onUpdateTrack(track.id, {
      videoId: null,
      videoTitle: undefined,
      videoUrl: undefined,
      thumbnailUrl: undefined,
      isManual: false,
      status: "not_found"
    });
    setManualInput("");
    setManualError("");
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const hasYouTubeMatch = track.videoId && track.status !== "not_found";

  return (
    <div 
      className={`grid grid-cols-1 md:grid-cols-12 gap-4 py-4 px-5 border-b border-[#18181b] items-center transition-all ${
        hasYouTubeMatch ? "bg-transparent hover:bg-[#111113]" : "bg-[#1a1414] hover:bg-[#201818]"
      }`}
    >
      {/* Index and Spotify Info */}
      <div className="md:col-span-5 flex items-center gap-4">
        {/* Track Number */}
        <span className="font-mono text-sm text-[#52525b] w-6 text-right">
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Artwork */}
        <div className="w-11 h-11 rounded overflow-hidden bg-[#27272a] flex items-center justify-center flex-shrink-0 border border-[#3f3f46]/35 shadow-md">
          {track.artworkUrl ? (
            <img 
              src={track.artworkUrl} 
              alt={track.title} 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <Music className="w-4 h-4 text-[#1DB954]" />
          )}
        </div>

        {/* Title and Artist */}
        <div className="min-w-0 pr-2">
          <h4 className="text-sm font-medium text-[#fafafa] truncate hover:text-[#1DB954] transition-colors" title={track.title}>
            {track.title}
          </h4>
          <p className="text-xs text-[#71717a] truncate mt-0.5" title={track.artist}>
            {track.artist}
          </p>
          {track.album && (
            <p className="text-[10px] text-[#52525b] truncate mt-0.5">
              💿 {track.album}
            </p>
          )}
        </div>
      </div>

      {/* Match Status / Indicator Column */}
      <div className="md:col-span-2 flex items-center gap-2">
        {track.status === "searching" || isSearchingRow ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-[#fafafa]/5 text-[#a1a1aa] px-2.5 py-1 rounded uppercase tracking-tighter border border-[#27272a] animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-[#1DB954]" /> Searching
          </span>
        ) : track.status === "matched" ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-[#1DB954]/10 text-[#1DB954] px-2.5 py-0.5 rounded uppercase tracking-tighter border border-[#1DB954]/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Matched
          </span>
        ) : track.status === "manual" ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-[#1DB954]/10 text-emerald-400 px-2.5 py-0.5 rounded uppercase tracking-tighter border border-emerald-500/20">
            <Link2 className="w-3.5 h-3.5" /> Linked
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-red-500/10 text-red-500 px-2.5 py-0.5 rounded uppercase tracking-tighter border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5" /> Not Found
          </span>
        )}
      </div>

      {/* YouTube Link / Custom Input Action Column */}
      <div className="md:col-span-5 flex flex-col gap-1.5 justify-center">
        {hasYouTubeMatch ? (
          /* DISPLAY MATCHED YOUTUBE TRACK */
          <div className="flex items-center justify-between gap-3 bg-[#18181b] p-2 rounded-xl border border-[#27272a] shadow-inner">
            <div className="flex items-center gap-3 min-w-0">
              {/* YouTube Video Mini Thumbnail */}
              <div className="w-14 h-9 rounded bg-black overflow-hidden flex-shrink-0 border border-[#27272a] flex items-center justify-center relative group/vid">
                {track.thumbnailUrl ? (
                  <img 
                    src={track.thumbnailUrl} 
                    alt="youtube" 
                    className="w-full h-full object-cover group-hover/vid:scale-105 transition-transform" 
                  />
                ) : (
                  <Youtube className="w-4 h-4 text-red-500" />
                )}
                <a 
                  href={track.videoUrl!} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover/vid:opacity-100 flex items-center justify-center transition-all"
                >
                  <Play className="w-3 h-3 text-white fill-white" />
                </a>
              </div>

              {/* YouTube Video Details */}
              <div className="min-w-0">
                <a 
                  href={track.videoUrl!} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-medium text-[#fafafa] hover:text-[#1DB954] hover:underline line-clamp-1 flex items-center gap-1 transition-colors"
                >
                  {track.videoTitle || "YouTube Video"}
                  <ExternalLink className="w-3 h-3 inline flex-shrink-0 text-[#71717a]" />
                </a>
                <span className="text-[10px] font-mono text-[#52525b]">
                  ID: {track.videoId} {track.durationMs ? `• ${formatDuration(track.durationMs)}` : ''}
                </span>
              </div>
            </div>

            {/* Actions for matched video */}
            <div className="flex items-center gap-1">
              {/* Re-search query selector if they want to try another term */}
              <button 
                onClick={() => setIsExpandingSearch(!isExpandingSearch)}
                className="p-1.5 text-[#71717a] hover:text-[#1DB954] transition-colors rounded hover:bg-[#27272a]"
                title="Search options"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => onSearchAgain(track.id)}
                disabled={isSearchingRow}
                className="p-1.5 text-[#71717a] hover:text-blue-400 transition-colors rounded hover:bg-[#27272a] disabled:opacity-50"
                title="Retry auto-match search"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSearchingRow ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={handleClearLink}
                className="p-1.5 text-[#71717a] hover:text-red-500 transition-colors rounded hover:bg-[#27272a]"
                title="Remove match"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* MANUAL PASTE INPUT OR AUTO-SEARCH BUTTONS */
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input 
                  type="text"
                  placeholder="Paste YouTube Link or Video ID..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualLink()}
                  className="w-full bg-black/40 border border-red-500/30 focus:border-red-500 rounded-lg py-1.5 pl-3 pr-8 text-xs text-[#fafafa] placeholder:text-red-900/50 focus:outline-none transition-all shadow-inner"
                />
                <Youtube className="absolute right-2.5 top-2 w-3.5 h-3.5 text-red-500/50" />
              </div>
              <button 
                onClick={handleManualLink}
                className="bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] border border-[#3f3f46] font-semibold text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-md flex items-center gap-1 flex-shrink-0"
              >
                <Link2 className="w-3.5 h-3.5" /> Connect
              </button>
            </div>
            
            {manualError && (
              <p className="text-[10px] text-red-400 font-medium px-1 flex items-center gap-1">
                ⚠️ {manualError}
              </p>
            )}

            {/* Quick action helper to invoke suggestions or automatic retry */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium px-1 mt-1.5">
              <button
                onClick={handleLoadSuggestions}
                disabled={isLoadingSuggestions}
                className="text-[#1DB954] hover:text-green-400 transition-colors flex items-center gap-1 cursor-pointer font-bold disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" /> View Suggestions (Best 5)
              </button>
              <span className="text-[#27272a]">|</span>
              <button
                onClick={() => onSearchAgain(track.id)}
                className="text-[#71717a] hover:text-[#fafafa] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Retry Auto
              </button>
            </div>
          </div>
        )}

        {/* EXPANSIVE MANUAL TWEAK SEARCH OPTION */}
        {isExpandingSearch && (
          <div className="mt-2 bg-[#09090b] p-2 rounded-lg border border-[#27272a] text-xs flex flex-col gap-2">
            <span className="text-[10px] text-[#71717a] font-semibold uppercase tracking-wider block">Custom Search Phrase:</span>
            <div className="flex gap-2">
              <input 
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                className="flex-grow bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-xs text-white"
              />
              <button 
                onClick={async () => {
                  onUpdateTrack(track.id, { status: "searching" });
                  try {
                    const response = await fetch("/api/search-youtube", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: localSearchQuery, artist: "" })
                    });
                    const result = await response.json();
                    if (result.videoId) {
                      onUpdateTrack(track.id, {
                        videoId: result.videoId,
                        videoTitle: result.videoTitle,
                        videoUrl: result.videoUrl,
                        thumbnailUrl: result.thumbnailUrl,
                        isManual: false,
                        status: "matched"
                      });
                      setIsExpandingSearch(false);
                    } else {
                      onUpdateTrack(track.id, { status: "not_found" });
                    }
                  } catch (e) {
                    onUpdateTrack(track.id, { status: "not_found" });
                  }
                }}
                className="bg-[#fafafa] hover:bg-white text-[#09090b] font-bold px-2.5 py-1 rounded text-xs"
              >
                Find
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions Drawer spanning full width */}
      {!hasYouTubeMatch && showSuggestions && (
        <div className="col-span-1 md:col-span-12 mt-3 bg-[#0a0a0c] border border-emerald-500/15 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#18181b]">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#1DB954]" /> YouTube Search Results (Top 5 Matches)
            </span>
            <button 
              onClick={() => setShowSuggestions(false)}
              className="text-xs text-[#71717a] hover:text-[#fafafa] transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>

          {isLoadingSuggestions ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#a1a1aa] font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-[#1DB954]" /> Scanning YouTube indices...
            </div>
          ) : fetchError ? (
            <div className="text-xs text-red-400 py-2 font-medium">{fetchError}</div>
          ) : suggestions.length === 0 ? (
            <div className="text-xs text-[#71717a] py-2 font-medium">No results found on YouTube. Try a custom search query block.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.map((sug) => (
                <div 
                  key={sug.videoId}
                  className="flex items-center justify-between gap-4 p-2 rounded-lg bg-[#141416]/50 border border-[#27272a] hover:border-[#1DB954]/20 hover:bg-[#181820] transition-all group/sug"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-16 h-10 bg-black rounded overflow-hidden flex-shrink-0 relative border border-[#27272a]">
                      <img src={sug.thumbnailUrl} alt={sug.title} className="w-full h-full object-cover" />
                      <a 
                        href={sug.videoUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover/sug:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <Play className="w-3 h-3 text-white fill-white hover:scale-110 transition-transform" />
                      </a>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs font-semibold text-[#fafafa] truncate group-hover/sug:text-[#1DB954] transition-colors" title={sug.title}>
                          {sug.title}
                        </p>
                        {sug.isShort && (
                          <span className="flex-shrink-0 text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-zinc-800 text-amber-500 border border-amber-500/20 uppercase tracking-widest leading-none">
                            Short / Clip
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#71717a] truncate mt-1">
                        By: {sug.artistName} {sug.duration ? `• Duration: ${sug.duration}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onUpdateTrack(track.id, {
                        videoId: sug.videoId,
                        videoTitle: sug.title,
                        videoUrl: sug.videoUrl,
                        thumbnailUrl: sug.thumbnailUrl,
                        isManual: true,
                        status: "manual"
                      });
                      setShowSuggestions(false);
                    }}
                    className="h-8 px-3 text-[11px] font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 hover:border-emerald-500 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    Connect Track
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
