import React, { useState } from "react";
import { Music, Youtube, Link2, Search, Zap, Play, Loader2, Clipboard } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MatchedTrack, cleanYouTubeMetadata } from "../types";

interface QuickPlayPanelProps {
  onPlayTrack: (track: MatchedTrack) => void;
  isLoadingSong: boolean;
  setIsLoadingSong: (loading: boolean) => void;
}

export function QuickPlayPanel({ onPlayTrack, isLoadingSong, setIsLoadingSong }: QuickPlayPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isValidLink = (text: string): boolean => {
    const cleanText = text.trim();
    const isYT = /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(cleanText);
    const isSpotify = /open\.spotify\.com/i.test(cleanText);
    return isYT || isSpotify;
  };

  const handleLinkPlay = async (url: string) => {
    setIsLoadingSong(true);
    setErrorMsg("");
    setSuggestions([]);

    try {
      const cleanUrl = url.trim();
      
      // Spotify track link
      if (/open\.spotify\.com\/track\//i.test(cleanUrl)) {
        const response = await fetch("/api/spotify-track-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanUrl }),
        });

        if (!response.ok) {
          throw new Error("Failed to resolve Spotify track details");
        }

        const data = await response.json();
        const spotifyTrack = data.track;

        // Search YouTube to get matched video
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
          id: `quick_${Date.now()}`,
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

        onPlayTrack(track);
        setInputValue("");
      } 
      // YouTube link
      else {
        const response = await fetch("/api/youtube-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanUrl }),
        });

        if (!response.ok) {
          throw new Error("Failed to parse YouTube link. Please check if the video exists.");
        }

        const data = await response.json();
        const cleaned = cleanYouTubeMetadata(data.title, data.artist);
        const track: MatchedTrack = {
          id: `quick_${Date.now()}`,
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

        onPlayTrack(track);
        setInputValue("");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Could not load or play link.");
    } finally {
      setIsLoadingSong(false);
    }
  };

  const handleSearchPlay = async (query: string) => {
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
        setErrorMsg("No results found for that search.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to search for song.");
    } finally {
      setSearching(false);
    }
  };

  const handleSearchOrPasteAndPlay = async () => {
    setErrorMsg("");
    const val = inputValue.trim();

    // 1. Try to check input field link
    if (val && isValidLink(val)) {
      await handleLinkPlay(val);
      return;
    }

    // 2. Try to check input field search text
    if (val) {
      await handleSearchPlay(val);
      return;
    }

    // 3. If input is empty, try to detect clipboard content
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText && isValidLink(clipboardText)) {
          setInputValue(clipboardText);
          await handleLinkPlay(clipboardText);
          return;
        }
      }
    } catch (e) {
      console.warn("Clipboard access blocked by browser permissions.");
    }

    setErrorMsg("Please enter a song name, paste a URL, or copy a song link to your clipboard!");
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const cleaned = cleanYouTubeMetadata(suggestion.title, suggestion.artistName);
    const track: MatchedTrack = {
      id: `quick_${Date.now()}`,
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
    onPlayTrack(track);
    setSuggestions([]);
    setInputValue("");
  };

  return (
    <div className="vision-glass rounded-2xl p-4 sm:p-6 relative overflow-hidden flex flex-col gap-4">
      <div className="absolute right-0 top-0 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/60 block font-sans">
          Quick Song Play
        </label>
        <p className="text-xs text-white/40">
          Search for a song name or paste a Spotify/YouTube song URL.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch">
          <div className="relative flex-1 h-12 sm:h-14">
            <input
              type="text"
              className="w-full h-full vision-glass-input rounded-2xl px-5 pl-12 pr-16 text-sm text-[#fafafa] placeholder-white/30 font-medium focus:outline-none transition-all"
              placeholder="Enter song name or paste link..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setErrorMsg("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearchOrPasteAndPlay();
                }
              }}
            />
            <Music className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#10B981]" />
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) {
                    setInputValue(text);
                    setErrorMsg("");
                  }
                } catch (e) {
                  setErrorMsg("Could not access clipboard. Please paste manually.");
                }
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white rounded-lg transition-all"
              title="Paste from clipboard"
            >
              <Clipboard className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleSearchOrPasteAndPlay}
            disabled={searching || isLoadingSong}
            className="h-12 sm:h-14 px-6 md:px-8 bg-[#10B981] hover:bg-[#059669] text-black font-extrabold rounded-2xl transition-all flex items-center justify-center gap-2 flex-shrink-0 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
          >
            {searching || isLoadingSong ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-black fill-current" />
                <span>Search / Paste & Play</span>
              </>
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl text-left">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Suggestions List */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="vision-glass-interactive rounded-2xl overflow-hidden divide-y divide-white/10 z-25 shadow-2xl max-h-80 overflow-y-auto mt-2"
          >
            <div className="px-4 py-2 bg-white/5 text-[10px] font-bold text-white/50 uppercase tracking-wider">
              Search Results
            </div>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.videoId}
                onClick={() => handleSelectSuggestion(suggestion)}
                className="w-full p-3 hover:bg-white/10 text-left transition-colors flex items-center gap-3 group cursor-pointer"
              >
                <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                  <img
                    src={suggestion.thumbnailUrl}
                    alt={suggestion.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-4 h-4 text-white fill-current" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white truncate group-hover:text-white/80 transition-colors">
                    {suggestion.title}
                  </h4>
                  <p className="text-[10px] text-white/60 truncate mt-0.5">
                    {suggestion.artistName} • {suggestion.duration}
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
