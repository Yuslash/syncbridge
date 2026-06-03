import React from "react";
import { Music, Youtube, HelpCircle, ArrowRightLeft } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-[#27272a] bg-[#09090b] py-5 px-6 sticky top-0 z-50 shadow-md">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-[#1DB954] to-[#FF0000] rounded-xl shadow-lg border border-white/10 flex items-center justify-center animate-pulse">
            <ArrowRightLeft className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20 px-2 py-0.5 rounded-full">
                <Music className="w-3.5 h-3.5" /> Spotify
              </span>
              <span className="text-gray-500 text-xs font-medium">to</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full">
                <Youtube className="w-3.5 h-3.5" /> YouTube
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-1">
              SyncBridge <span className="text-[#a1a1aa] font-light text-base">Pro</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-[#a1a1aa] bg-[#18181b] rounded-full px-4 py-2 border border-[#27272a] backdrop-blur-sm self-stretch md:self-auto justify-center">
          <HelpCircle className="w-4 h-4 text-[#1DB954]" />
          <span>Convert public playlists cleanly with dynamic ordering</span>
        </div>
      </div>
    </header>
  );
}
