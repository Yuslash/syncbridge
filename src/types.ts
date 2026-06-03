export interface SpotifyTrack {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  artworkUrl?: string;
}

export interface MatchedTrack {
  id: string; // Unique ID (e.g. track_1, track_2)
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  artworkUrl?: string;
  
  // YouTube match details
  videoId: string | null; // null if not found
  videoTitle?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  isManual?: boolean;
  status: 'searching' | 'matched' | 'not_found' | 'manual';
}

export interface ConvertedPlaylist {
  spotifyUrl: string;
  name: string;
  description: string;
  tracks: MatchedTrack[];
  convertedAt: string;
}
