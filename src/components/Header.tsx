import React from "react";
import { Music, LogIn, LogOut, ShieldAlert, Laptop, Eye, Share2 } from "lucide-react";
import { User } from "firebase/auth";

interface HeaderProps {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  isCloudActive: boolean;
  onGoHome: () => void;
  onShowChangelog?: () => void;
  version?: string;
}

export function Header({ 
  user, 
  onLogin, 
  onLogout, 
  isCloudActive, 
  onGoHome,
  onShowChangelog,
  version = "1.2.1"
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0a0a0a]/20 backdrop-blur-md shadow-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 md:h-20 flex items-center justify-between gap-4">
        
        {/* Sleek Brand Logo Layout - Always interactive & clicking goes Home */}
        <div 
          onClick={onGoHome}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none group active:scale-[0.98] transition-transform"
          title="Return to Home Importer"
        >
          {/* Logo Icon with subtle glowing ring on hover */}
          <div className="relative p-1.5 sm:p-2.5 bg-black/40 border border-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:border-blue-400 group-hover:shadow-[0_0_20px_rgba(96,165,250,0.35)]">
            <Music className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 transition-colors duration-300 group-hover:text-white" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-400 ring-2 ring-[#0a0a0a] animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
          </div>
 
          {/* Logo Typography and dynamic sub-tagging */}
          <div className="flex flex-col text-left text-zinc-300">
            <div className="flex items-center gap-1 sm:gap-1.5 leading-none">
              <span className="font-sans tracking-wide text-white text-base sm:text-lg md:text-2xl font-bold accent-glow">
                Sync<span className="text-blue-400 font-extralight">Bridge</span>
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onShowChangelog?.();
                }}
                className="text-[7px] sm:text-[9px] font-mono font-bold uppercase text-blue-300 hover:text-white bg-blue-950/40 border border-blue-400/20 hover:border-blue-400 rounded px-1.5 py-0.5 tracking-wider leading-none select-none hidden xs:inline-block cursor-pointer transition-all hover:scale-105 active:scale-95"
                title="View Changelog & Updates"
              >
                v{version}
              </button>
            </div>
            {/* Minimalist, professional sublabel - replaces messy color-block badges */}
            <span className="text-[7px] sm:text-[9px] font-mono tracking-[0.1em] sm:tracking-[0.18em] text-zinc-400 mt-1 uppercase transition-colors duration-300 group-hover:text-white leading-none">
              Spotify <span className="text-blue-400">⇄</span> YouTube Loom
            </span>
          </div>
        </div>

        {/* Dynamic Compact Actions & State Pill - Keeps layout on a beautiful single row */}
        <div className="flex items-center gap-2 sm:gap-3.5">
          
          {/* Quick Borderless navigation */}
          <button
            onClick={onGoHome}
            className="hidden sm:flex items-center gap-1.5 h-9 px-3 text-xs font-mono font-bold uppercase tracking-widest text-zinc-400 hover:text-blue-400 transition-colors cursor-pointer select-none"
            title="Clean interface reset"
          >
            <span>Workspace</span>
          </button>

          {/* Combined Sync Status & Account Pill */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-black/50 border border-white/10 rounded-full p-1 pl-2.5 sm:pl-3.5 pr-1 sm:pr-1.5 shadow-inner">
            
            {/* Status indicator (Pulsing online dot vs. compact solid local status) */}
            <div className="flex items-center gap-1 sm:gap-1.5 select-none" title={isCloudActive ? "Syncing with cloud database" : "Data persisting in secure local browser DB"}>
              {isCloudActive ? (
                <>
                  <span className="relative flex h-1 w-1 sm:h-1.5 sm:w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1 sm:h-1.5 w-1 sm:w-1.5 bg-blue-400"></span>
                  </span>
                  <span className="hidden sm:inline text-[8px] md:text-[9px] font-mono font-black uppercase tracking-widest text-blue-400">
                    Cloud Core
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline text-[8px] md:text-[9px] font-mono font-black uppercase tracking-widest text-amber-400">
                    Local Vault
                  </span>
                </>
              )}
            </div>

            {/* User Session Action Area */}
            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <div className="h-4 w-[1px] bg-white/10" />

                {/* Account details and Avatar combination */}
                <div className="flex items-center gap-1 sm:gap-2">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || "Avatar"} 
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white/10 object-cover hover:border-blue-400 transition-colors"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 border border-white/10 text-white font-bold flex items-center justify-center text-[8px] sm:text-[10px]">
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
                  className="p-1 sm:p-1.5 cursor-pointer max-h-6 sm:max-h-7 rounded-full bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-zinc-400 hover:text-rose-400 transition-all flex items-center justify-center"
                  title="Sign Out"
                >
                  <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            ) : (
              isCloudActive && (
                <button
                  onClick={onLogin}
                  className="h-7 sm:h-8 pl-2 sm:pl-3 pr-3 sm:pr-4 rounded-full bg-white hover:bg-gray-100 text-black font-semibold text-[10px] sm:text-xs transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 select-none active:scale-95 duration-100 font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:shadow-[0_0_25px_rgba(255,255,255,0.45)] transform hover:-translate-y-0.5"
                >
                  <LogIn className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Sign In</span><span className="xs:hidden">In</span>
                </button>
              )
            )}
          </div>

        </div>

      </div>
    </header>
  );
}

