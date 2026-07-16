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
  version: "1.2.6",
  codename: "Glass Luminous",
  releaseDate: "2026-07-16",
  changelog: [
    {
      version: "1.2.6",
      date: "2026-07-16",
      changes: [
        "Added a sleek Collapse button to the bottom persistent player, letting users minimize it into a beautiful, compact floating disk badge.",
        "Implemented an elegant slide-down transition using Framer Motion when the player is minimized.",
        "Created an interactive, floating mini-player pill widget that displays live song title, playback status indicator, and small rotating album art when minimized, allowing quick restoration with a single click."
      ]
    },
    {
      version: "1.2.5",
      date: "2026-07-16",
      changes: [
        "Lowered the spinning vinyl record visualizer deep into the Luminous Player card face, hovering tightly right over the center light slit.",
        "Created a custom direct __NEXT_DATA__ JSON scraper for Spotify embeds, entirely resolving conversion crashes and ensuring robust playlist parsing without AI fallback truncation.",
        "Refined isTrackObject and parseTrack helper logic to seamlessly support modern Spotify properties (t.subtitle for artists and t.duration for lengths)."
      ]
    },
    {
      version: "1.2.4",
      date: "2026-07-15",
      changes: [
        "Resolved hardcoded YouTube track durations to fetch exact live lengths via a secondary batch video details API request.",
        "Created custom HTML Entity decoding filter to prevent title and channel formatting corruption ('We Don&#39;t Talk Anymore' → 'We Don't Talk Anymore').",
        "Applied HTML Entity decoding filters to the official YouTube API mapping, the youtube-sr fallback, and the backup scraper engine."
      ]
    },
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
