import React from "react";
import { Music, LogIn, LogOut, ShieldAlert, Cloud, Radio, RefreshCw } from "lucide-react";
import { User } from "firebase/auth";

interface HeaderProps {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  isCloudActive: boolean;
  onGoHome: () => void;
}

export function Header({ user, onLogin, onLogout, isCloudActive, onGoHome }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-[#09090b]/85 backdrop-blur-md shadow-lg shadow-black/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 md:h-20 flex items-center justify-between gap-4">
        
        {/* Sleek Brand Logo Layout - Always interactive & clicking goes Home */}
        <div 
          onClick={onGoHome}
          className="flex items-center gap-3 cursor-pointer select-none group active:scale-[0.98] transition-transform"
          title="Return to Home Importer"
        >
          {/* Logo Icon with subtle glowing ring on hover */}
          <div className="relative p-2.5 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:border-emerald-500/50 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <Music className="w-5 h-5 text-emerald-400 transition-colors duration-300 group-hover:text-emerald-300" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#09090b] animate-pulse" />
          </div>

          {/* Logo Typography and dynamic sub-tagging */}
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-extrabold tracking-tight text-white text-base md:text-lg">
                Sync<span className="text-emerald-400">Bridge</span>
              </span>
              <span className="text-[9px] font-black uppercase text-zinc-500 bg-zinc-800 border border-zinc-700/60 rounded px-1 py-0.5 tracking-wide leading-none select-none">
                PRO
              </span>
            </div>
            {/* Minimalist, professional sublabel - replaces messy color-block badges */}
            <span className="text-[9px] md:text-[10px] font-bold tracking-[0.14em] text-zinc-500 mt-1 uppercase transition-colors duration-300 group-hover:text-zinc-400 leading-none">
              Spotify <span className="text-emerald-400/80">⇄</span> YouTube
            </span>
          </div>
        </div>

        {/* Dynamic Compact Actions & State Pill - Keeps layout on a beautiful single row */}
        <div className="flex items-center gap-3.5">
          
          {/* Quick Borderless navigation */}
          <button
            onClick={onGoHome}
            className="hidden sm:flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer select-none"
            title="Clean interface reset"
          >
            <span>Home</span>
          </button>

          {/* Combined Sync Status & Account Pill */}
          <div className="flex items-center gap-2 bg-[#121214] border border-zinc-800/80 rounded-full p-1 pl-3.5 pr-1.5 shadow-inner">
            
            {/* Status indicator (Pulsing online dot vs. compact solid local status) */}
            <div className="flex items-center gap-1.5 mr-1.5 select-none" title={isCloudActive ? "Syncing with cloud database" : "Data persisting in secure local browser DB"}>
              {isCloudActive ? (
                <>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  <span className="hidden md:inline text-[9px] font-black uppercase tracking-widest text-[#1DB954]">
                    Cloud
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3 h-3 text-amber-500" />
                  <span className="hidden md:inline text-[9px] font-black uppercase tracking-widest text-amber-500">
                    Local
                  </span>
                </>
              )}
            </div>

            {/* User Session Action Area */}
            {user ? (
              <div className="flex items-center gap-2.5">
                <div className="h-4 w-[1px] bg-zinc-800" />

                {/* Account details and Avatar combination */}
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || "Avatar"} 
                      className="w-6 h-6 rounded-full border border-zinc-800 object-cover hover:border-emerald-500/40 transition-colors"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-white font-bold flex items-center justify-center text-[10px]">
                      {user.displayName ? user.displayName[0].toUpperCase() : "U"}
                    </div>
                  )}
                  {/* Subtle Name Label for Desktop */}
                  <span className="hidden lg:block text-xs font-semibold text-zinc-300 truncate max-w-[80px]" title={user.displayName || ""}>
                    {user.displayName?.split(" ")[0] || "User"}
                  </span>
                </div>

                {/* Sleek Compact Logout Button */}
                <button 
                  onClick={onLogout}
                  className="p-1.5 cursor-pointer max-h-7 rounded-full bg-zinc-800/40 hover:bg-red-500/10 border border-zinc-700/60 hover:border-red-500/20 text-zinc-400 hover:text-red-400 transition-all rounded-full flex items-center justify-center"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              isCloudActive && (
                <button
                  onClick={onLogin}
                  className="h-8 pl-3 pr-4 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 select-none active:scale-95 duration-100"
                >
                  <LogIn className="w-3.5 h-3.5" /> <span>Sign In</span>
                </button>
              )
            )}
          </div>

        </div>

      </div>
    </header>
  );
}

