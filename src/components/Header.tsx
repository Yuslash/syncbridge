import React from "react";
import { Music, Youtube, LogIn, LogOut, ShieldAlert, CheckCircle2, Layers3 } from "lucide-react";
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
    <header className="border-b border-[#27272a] bg-[#09090b] py-4 px-3 md:px-6 sticky top-0 z-50 shadow-md">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand Logo Layout */}
        <div 
          onClick={onGoHome}
          className="flex items-center gap-3 cursor-pointer select-none hover:opacity-90 active:scale-[0.98] transition-all group"
          title="Return to Home Dashboard"
        >
          <div className="p-2.5 bg-gradient-to-tr from-[#1DB954] to-red-600 rounded-xl shadow-lg border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Music className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold bg-[#1DB954]/15 text-[#1DB954] border border-[#1DB954]/25 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Spotify
              </span>
              <span className="text-gray-600 text-[10px] font-extrabold uppercase">to</span>
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold bg-red-500/15 text-red-500 border border-red-500/25 px-2 py-0.5 rounded-full uppercase tracking-wider">
                YouTube
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-1">
              SyncBridge <span className="text-[#a1a1aa] font-light text-base">Pro</span>
            </h1>
          </div>
        </div>

        {/* Dynamic Actions & Account Session Grid */}
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5 w-full md:w-auto">
          {/* Go Home Navigation Option */}
          <button
            onClick={onGoHome}
            className="h-10 px-3.5 bg-[#111113] hover:bg-[#18181b] text-[#a1a1aa] hover:text-[#fafafa] font-semibold text-xs rounded-xl border border-[#27272a] hover:border-[#3e3e42] transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Go to Home Importer Screen"
          >
            <Layers3 className="w-4 h-4 text-[#1DB954]" />
            <span>Home</span>
          </button>

          {/* Cloud Presence status indicator */}
          <div className="flex items-center gap-2 text-xs bg-[#121214] border border-[#27272a] rounded-xl px-3.5 py-2.5">
            {isCloudActive ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                  Cloud Live Sync
                </span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-500 font-bold uppercase tracking-wider text-[10px]" title="Firebase config pending region selection. All features will persist completely in local IndexedDB!">
                  Local Offline Persistent
                </span>
              </>
            )}
          </div>

          {/* User Sign-In Actions */}
          {user ? (
            <div className="flex items-center gap-3 bg-[#18181b] p-1.5 pr-4 rounded-xl border border-[#27272a]">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || "Avatar"} 
                  className="w-8 h-8 rounded-lg border border-[#27272a] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-[#27272a] border border-[#3f3f46] text-white font-bold flex items-center justify-center text-xs">
                  {user.displayName ? user.displayName[0] : "U"}
                </div>
              )}
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-[#fafafa] truncate max-w-[120px]" title={user.displayName || ""}>
                  {user.displayName || "User Signed In"}
                </p>
                <p className="text-[10px] text-[#71717a] truncate max-w-[120px]">
                  {user.email}
                </p>
              </div>
              <button 
                onClick={onLogout}
                className="p-1 px-2.5 text-xs font-semibold bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg border border-red-500/15 hover:border-red-500 transition-all flex items-center gap-1 cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3 h-3" /> <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            isCloudActive && (
              <button
                onClick={onLogin}
                className="h-10 px-4 bg-[#1DB954] hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-[0_0_15px_rgba(29,185,84,0.15)] flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-4 h-4" /> Sign In with Google
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
}

