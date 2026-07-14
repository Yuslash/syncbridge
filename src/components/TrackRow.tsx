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
  Sparkles,
  Pencil,
  Pause,
  Volume2
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
  onPreviewTrack?: (track: MatchedTrack) => void;
  activePlayingTrackId?: string | null;
  isPlaying?: boolean;
  onPlayTrack?: (track: MatchedTrack) => void;
}

export function TrackRow({ 
  track, 
  index, 
  onUpdateTrack, 
  onSearchAgain, 
  isSearchingRow, 
  onPreviewTrack,
  activePlayingTrackId = null,
  isPlaying = false,
  onPlayTrack
}: TrackRowProps) {
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState(`${track.artist} ${track.title}`);
  const [isExpandingSearch, setIsExpandingSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // States for editing/changing existing link directly
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editInput, setEditInput] = useState("");
  const [editError, setEditError] = useState("");

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
      if (!response.ok) {
        let errorMsg = "Could not load suggestions.";
        try {
          const body = await response.json();
          if (body && body.error) errorMsg = body.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      setFetchError(err?.message || "Failed to fetch suggestions.");
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

  const handleSaveEditUrl = () => {
    setEditError("");
    const parsedId = extractYouTubeId(editInput);
    if (!parsedId) {
      setEditError("Could not extract a valid 11-Digit YouTube Video ID or URL.");
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
    setIsEditingUrl(false);
  };

  const startEditingUrl = () => {
    setEditInput(track.videoUrl || track.videoId || "");
    setEditError("");
    setIsEditingUrl(true);
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
    setIsEditingUrl(false);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const hasYouTubeMatch = !!(track.videoId && track.status !== "not_found");
  const isCurrentActive = activePlayingTrackId === track.id;
  const isCurrentPlaying = isCurrentActive && isPlaying;

  const handleRowPlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPlayTrack) {
      if (hasYouTubeMatch) {
        onPlayTrack(track);
      } else {
        // Find alternative video or search row suggestion. If not matched, we can still load to trigger preview
        onPlayTrack(track);
      }
    }
  };

  return (
    <div 
      onDoubleClick={handleRowPlayClick}
      className={`grid grid-cols-1 md:grid-cols-12 gap-4 py-4 px-5 border-b border-white/5 items-center transition-all group cursor-pointer ${
        isCurrentActive 
          ? "bg-blue-400/5 border-l-2 border-l-blue-400 shadow-[inset_0_1px_4px_rgba(96,165,250,0.15)]"
          : hasYouTubeMatch 
            ? "bg-transparent hover:bg-white/5" 
            : "bg-red-500/5 hover:bg-red-500/10"
      }`}
    >
      {/* Index and Spotify Info */}
      <div className="md:col-span-5 flex items-center justify-between md:justify-start gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Track Number Index Play/Pause Button overlay */}
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 relative font-sans">
            {isCurrentActive ? (
              isCurrentPlaying ? (
                <button 
                  onClick={handleRowPlayClick} 
                  className="text-white hover:text-white/80 cursor-pointer focus:outline-none flex items-center justify-center"
                  title="Pause song"
                >
                  {/* Active equalizer animation bars */}
                  <div className="flex items-end gap-[2px] h-3 w-3 group-hover:hidden">
                    <div className="w-[2.5px] bg-blue-400 rounded-full animate-bar-wave-1 h-3" />
                    <div className="w-[2.5px] bg-blue-400 rounded-full animate-bar-wave-2 h-4" />
                    <div className="w-[2.5px] bg-blue-400 rounded-full animate-bar-wave-3 h-2" />
                  </div>
                  <Pause className="w-4 h-4 hidden group-hover:block fill-blue-400 text-blue-400" />
                </button>
              ) : (
                <button 
                  onClick={handleRowPlayClick} 
                  className="text-white hover:text-white/80 cursor-pointer focus:outline-none flex items-center justify-center"
                  title="Play song"
                >
                  <Play className="w-4 h-4 fill-blue-400 text-blue-400" />
                </button>
              )
            ) : (
              <>
                <span className="font-mono text-xs text-white/40 group-hover:hidden select-none">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <button 
                  onClick={handleRowPlayClick}
                  className="hidden group-hover:block text-blue-400 hover:text-blue-400/80 cursor-pointer focus:outline-none transition-colors"
                  title="Play Track"
                >
                  <Play className="w-4 h-4 fill-blue-400 text-blue-400" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* Artwork */}
          <div 
            onClick={handleRowPlayClick}
            className={`w-11 h-11 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center flex-shrink-0 border shadow-md relative group/art-click ${
              isCurrentActive ? "border-blue-400/60 shadow-[0_0_10px_rgba(96,165,250,0.3)]" : "border-white/10"
            }`}
          >
            {track.artworkUrl ? (
              <img 
                src={track.artworkUrl} 
                alt={track.title} 
                className={`w-full h-full object-cover select-none transition-transform duration-300 ${isCurrentPlaying ? 'spin-slow' : ''}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <Music className={`w-4 h-4 ${isCurrentActive ? 'text-blue-400' : 'text-white/40'}`} />
            )}
            
            {/* Dark vinyl center dot decoration overlay for visual premium identity */}
            {isCurrentPlaying && track.artworkUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full bg-black border border-white/20" />
              </div>
            )}
          </div>
          
          {/* Title and Artist */}
          <div className="min-w-0 pr-2 overflow-hidden max-w-[130px] sm:max-w-none flex-1">
            <h4 
              className={`text-sm font-semibold transition-colors font-sans ${
                isCurrentActive 
                  ? "text-blue-400 font-bold" 
                  : "text-[#fafafa] hover:text-white"
              } ${
                track.title.length > 22 ? "mobile-marquee-title" : "truncate w-full"
              }`} 
              title={track.title}
            >
              {track.title}
            </h4>
            <p 
              className={`text-xs mt-0.5 ${
                isCurrentActive ? "text-blue-400/80" : "text-white/40"
              } ${
                track.artist.length > 25 ? "mobile-marquee-artist" : "truncate w-full"
              }`} 
              title={track.artist}
            >
              {track.artist}
            </p>
            {track.album && (
              <p className="text-[10px] text-white/30 truncate mt-0.5 font-mono">
                Ref: {track.album}
              </p>
            )}
          </div>
        </div>

        {/* Mobile-only compact status badge inline with the title block */}
        <div className="md:hidden flex-shrink-0">
          {track.status === "searching" || isSearchingRow ? (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-white/5 text-white/60 px-2 py-0.5 rounded border border-white/10 animate-pulse">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-white" /> Search
            </span>
          ) : track.status === "matched" ? (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded border border-blue-400/20">
              <CheckCircle2 className="w-3 h-3" /> Matched
            </span>
          ) : track.status === "manual" ? (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded border border-blue-400/20">
              <Link2 className="w-3 h-3" /> Linked
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded border border-rose-500/20">
              <AlertCircle className="w-3 h-3" /> Missing
            </span>
          )}
        </div>
      </div>

      {/* Desktop Match Status / Indicator Column */}
      <div className="hidden md:flex md:col-span-2 items-center gap-2">
        {track.status === "searching" || isSearchingRow ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-white/5 text-white/60 px-2.5 py-1 rounded border border-white/10 animate-pulse font-mono uppercase tracking-wider">
            <Loader2 className="w-3 h-3 animate-spin text-white" /> Searching
          </span>
        ) : track.status === "matched" ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-blue-400/10 text-blue-400 px-2.5 py-0.5 rounded border border-blue-400/20 font-mono uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" /> Matched
          </span>
        ) : track.status === "manual" ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-blue-400/10 text-blue-400 px-2.5 py-0.5 rounded border border-blue-400/20 font-mono uppercase tracking-wider">
            <Link2 className="w-3.5 h-3.5" /> Linked
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] font-bold bg-rose-500/10 text-rose-300 px-2.5 py-0.5 rounded border border-rose-500/20 font-mono uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" /> Not Found
          </span>
        )}
      </div>

      {/* YouTube Link / Custom Input Action Column */}
      <div className="md:col-span-5 flex flex-col gap-1.5 justify-center">
        {hasYouTubeMatch ? (
          /* DISPLAY MATCHED YOUTUBE TRACK */
          <div className="flex items-center justify-between gap-3 bg-white/5 p-2 rounded-xl border border-white/10 shadow-inner">
            <div className="flex items-center gap-3 min-w-0">
              {/* YouTube Video Mini Thumbnail */}
              <button 
                onClick={() => onPreviewTrack && onPreviewTrack(track)}
                className="w-14 h-9 rounded bg-black overflow-hidden flex-shrink-0 border border-white/10 flex items-center justify-center relative group/vid cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-white/20"
                title="Click to preview video"
              >
                {track.thumbnailUrl ? (
                  <img 
                    src={track.thumbnailUrl} 
                    alt="youtube" 
                    className="w-full h-full object-cover group-hover/vid:scale-105 transition-transform" 
                  />
                ) : (
                  <Youtube className="w-4 h-4 text-red-500" />
                )}
                {/* Visual hovering play overlay indicator for premium feel */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/vid:opacity-100 flex items-center justify-center transition-all">
                  <Play className="w-3.5 h-3.5 text-white fill-white hover:scale-110 transition-transform" />
                </div>
              </button>

              {/* YouTube Video Details */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <a 
                  href={track.videoUrl!} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-medium text-white hover:underline flex items-center gap-1 transition-colors w-full overflow-hidden"
                  title={track.videoTitle}
                >
                  <span className={`block truncate min-w-0 flex-1 ${
                    track.videoTitle && track.videoTitle.length > 20 ? "mobile-marquee-yt" : ""
                  }`}>
                    {track.videoTitle || "YouTube Video"}
                  </span>
                  <ExternalLink className="w-3 h-3 flex-shrink-0 text-white/40" />
                </a>
                <span className="text-[10px] font-mono text-white/30 block truncate mt-0.5">
                  ID: {track.videoId} {track.durationMs ? `• ${formatDuration(track.durationMs)}` : ''}
                </span>
              </div>
            </div>

            {/* Actions for matched video */}
            <div className="flex items-center gap-1">
              {/* Sparkles / Suggestions list toggle button */}
              <button 
                onClick={handleLoadSuggestions}
                disabled={isLoadingSuggestions}
                className={`p-1.5 transition-colors rounded cursor-pointer ${
                  showSuggestions && !isLoadingSuggestions
                    ? "text-white bg-white/15" 
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
                title="View Match Suggestions (Best 5)"
              >
                {isLoadingSuggestions ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Pencil / Direct URL Change button */}
              <button 
                onClick={startEditingUrl}
                className={`p-1.5 transition-colors rounded cursor-pointer ${
                  isEditingUrl 
                    ? "text-white bg-white/15" 
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
                title="Change YouTube Link / URL"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Re-search query selector if they want to try another term */}
              <button 
                onClick={() => setIsExpandingSearch(!isExpandingSearch)}
                className="hidden sm:inline-flex p-1.5 text-white/40 hover:text-white transition-colors rounded hover:bg-white/5"
                title="Search options"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => onSearchAgain(track.id)}
                disabled={isSearchingRow}
                className="hidden sm:inline-flex p-1.5 text-white/40 hover:text-white transition-colors rounded hover:bg-white/5 disabled:opacity-50"
                title="Retry auto-match search"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSearchingRow ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={handleClearLink}
                className="p-1.5 text-white/40 hover:text-red-400 transition-colors rounded hover:bg-white/5"
                title="Disconnect Match"
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
                  className="w-full h-9 bg-black/45 border border-white/10 focus:border-white/30 rounded-lg pl-3 pr-8 text-xs text-[#fafafa] placeholder-white/20 focus:outline-none transition-all shadow-inner"
                />
                <Youtube className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-white/30" />
              </div>
              <button 
                onClick={handleManualLink}
                className="bg-white hover:bg-gray-100 text-black font-bold text-xs px-3 py-1.5 h-9 rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:shadow-[0_0_25px_rgba(255,255,255,0.45)] transform hover:-translate-y-0.5 flex items-center gap-1 flex-shrink-0 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5 text-black" /> Connect
              </button>
            </div>
            
            {manualError && (
              <p className="text-[10px] text-red-300 font-medium px-1 flex items-center gap-1">
                ⚠️ {manualError}
              </p>
            )}

            {/* Quick action helper to invoke suggestions or automatic retry */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium px-1 mt-1.5">
              <button
                onClick={handleLoadSuggestions}
                disabled={isLoadingSuggestions}
                className="text-white hover:text-white/80 transition-colors flex items-center gap-1 cursor-pointer font-bold disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5 text-white" /> View Suggestions (Best 5)
              </button>
              <span className="text-white/10">|</span>
              <button
                onClick={() => onSearchAgain(track.id)}
                className="text-white/40 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Retry Auto
              </button>
            </div>
          </div>
        )}

        {/* DIRECT EDIT URL INLINE OPTION */}
        {isEditingUrl && (
          <div className="mt-2 bg-black/30 p-2.5 rounded-xl border border-white/10 text-xs flex flex-col gap-2 transition-all">
            <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider block">Change Match Video Link / ID:</span>
            <div className="flex gap-2">
              <input 
                type="text"
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEditUrl()}
                placeholder="Paste YouTube URL or Video ID..."
                className="flex-grow bg-[#141416] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-white/30 transition-colors"
                autoFocus
              />
              <button 
                onClick={handleSaveEditUrl}
                className="bg-white hover:bg-white/90 text-black font-extrabold px-3 py-1 rounded-lg text-xs transition-colors cursor-pointer active:scale-95 flex-shrink-0"
              >
                Save
              </button>
              <button 
                onClick={() => setIsEditingUrl(false)}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
            {editError && (
              <p className="text-[10px] text-red-300 font-medium px-1">
                ⚠️ {editError}
              </p>
            )}
          </div>
        )}

        {/* EXPANSIVE MANUAL TWEAK SEARCH OPTION */}
        {isExpandingSearch && (
          <div className="mt-2 bg-black/30 p-2 rounded-lg border border-white/10 text-xs flex flex-col gap-2">
            <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider block">Custom Search Phrase:</span>
            <div className="flex gap-2">
              <input 
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                className="flex-grow bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-white/20"
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
                className="bg-white hover:bg-white/90 text-black font-bold px-2.5 py-1 rounded text-xs transition-colors active:scale-95"
              >
                Find
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions Drawer spanning full width */}
      {showSuggestions && (
        <div className="col-span-1 md:col-span-12 mt-3 vision-glass-interactive rounded-2xl p-4 transition-all">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-white" /> YouTube Search Results (Top 5 Matches)
            </span>
            <button 
              onClick={() => setShowSuggestions(false)}
              className="text-xs text-white/40 hover:text-white transition-colors cursor-pointer font-semibold"
            >
              Dismiss
            </button>
          </div>

          {isLoadingSuggestions ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-white/50 font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-white" /> Scanning YouTube indices...
            </div>
          ) : fetchError ? (
            <div className="text-xs text-red-300 py-2 font-medium">{fetchError}</div>
          ) : suggestions.length === 0 ? (
            <div className="text-xs text-white/40 py-2 font-medium">No results found on YouTube. Try a custom search query block.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.map((sug) => (
                <div 
                  key={sug.videoId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/30 hover:bg-white/10 transition-all group/sug"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button 
                      onClick={() => {
                        const previewObj: MatchedTrack = {
                          id: track.id,
                          title: track.title,
                          artist: track.artist,
                          album: track.album || "",
                          durationMs: track.durationMs,
                          artworkUrl: track.artworkUrl,
                          status: "matched",
                          videoId: sug.videoId,
                          videoTitle: sug.title,
                          videoUrl: sug.videoUrl,
                          thumbnailUrl: sug.thumbnailUrl
                        };
                        if (onPreviewTrack) onPreviewTrack(previewObj);
                      }}
                      className="w-16 h-10 bg-black rounded overflow-hidden flex-shrink-0 relative border border-white/10 cursor-pointer focus:outline-none focus:ring-1 focus:ring-white/20 text-left"
                      title="Click to preview video"
                    >
                      <img src={sug.thumbnailUrl} alt={sug.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/sug:opacity-100 flex items-center justify-center transition-opacity">
                        <Play className="w-3.5 h-3.5 text-white fill-white hover:scale-110 transition-transform" />
                      </div>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs font-semibold text-white truncate group-hover/sug:text-white transition-colors" title={sug.title}>
                          {sug.title}
                        </p>
                        {sug.isShort && (
                          <span className="flex-shrink-0 text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-white/10 text-white/80 border border-white/10 uppercase tracking-widest leading-none">
                            Short / Clip
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/40 truncate mt-1">
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
                        durationMs: sug.durationMs,
                        isManual: true,
                        status: "manual"
                      });
                      setShowSuggestions(false);
                    }}
                    className="w-full sm:w-auto h-8 px-3 text-[11px] font-extrabold rounded-lg bg-white hover:bg-gray-100 text-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:shadow-[0_0_25px_rgba(255,255,255,0.45)] transform hover:-translate-y-0.5"
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
