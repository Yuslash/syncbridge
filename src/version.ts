export interface VersionInfo {
  version: string;
  codename: string;
  releaseDate: string;
  changelog: {
    version: string;
    date: string;
    changes: string[];
  }[];
}

export const APP_VERSION_INFO: VersionInfo = {
  version: "1.2.2",
  codename: "Glass Luminous",
  releaseDate: "2026-07-15",
  changelog: [
    {
      version: "1.2.2",
      date: "2026-07-15",
      changes: [
        "Resolved the Vercel deployment module-resolution error ('Cannot find module /var/task/server imported from /var/task/api/index.js') by correctly enforcing ESM relative file-extension rules.",
        "Verified clean build and runtime transpilation targets for absolute server-side resilience."
      ]
    },
    {
      version: "1.2.1",
      date: "2026-07-15",
      changes: [
        "Added local & production search validation diagnostics.",
        "Created dynamic Versioning Engine and UI Changelog dashboard.",
        "Injected environment synchronization instructions for Vercel deployment."
      ]
    },
    {
      version: "1.2.0",
      date: "2026-07-15",
      changes: [
        "Implemented high-priority Official YouTube Data API wrapper with error resilience.",
        "Refactored fallback waterfall with timeout promises to prevent Vercel Serverless Function gateway timeouts.",
        "Fixed critical ESM runtime ReferenceError ('__filename is not defined') in production build targets.",
        "Linked play/pause toggling between the custom Luminous Card controls and the Global audio state."
      ]
    },
    {
      version: "1.1.0",
      date: "2026-07-14",
      changes: [
        "Designed and integrated the custom high-contrast glassmorphism Luminous Card.",
        "Added a 3D rotating vinyl record visualizer for active tracks.",
        "Added ambient equalizer micro-soundwave animations responsive to audio playback."
      ]
    },
    {
      version: "1.0.0",
      date: "2026-07-10",
      changes: [
        "Initial release of SyncBridge client-only search and playlist mapper.",
        "Configured dual fast/deep conversion engines for matching Spotify to YouTube links."
      ]
    }
  ]
};
