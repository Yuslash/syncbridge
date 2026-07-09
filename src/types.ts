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

export function cleanYouTubeMetadata(rawTitle: string, rawChannel: string): { title: string; artist: string } {
  let title = rawTitle;
  let artist = rawChannel;

  // 1. Clean uploader channel name (remove common suffixes like VEVO, Official, Music, Topic, etc.)
  let cleanArtist = rawChannel
    .replace(/\s*-\s*Topic/gi, "")
    .replace(/\s*VEVO/gi, "")
    .replace(/\s*Official/gi, "")
    .replace(/\s*Music/gi, "")
    .replace(/\s*Records/gi, "")
    .replace(/\s*Recordings/gi, "")
    .replace(/\s*Entertainment/gi, "")
    .replace(/\s*Channel/gi, "")
    .replace(/\s*Studio(s)?/gi, "")
    .trim();

  // 2. Remove common noisy video title patterns
  let cleanTitle = rawTitle
    .replace(/\s*\[\s*Official\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Lyrical)\s*\]/gi, "")
    .replace(/\s*\(\s*Official\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Lyrical)\s*\)/gi, "")
    .replace(/\s*\[\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Lyrical|Remastered|Remaster)\s*\]/gi, "")
    .replace(/\s*\(\s*(Video|Audio|Music\s*Video|Lyric\s*Video|Lyrical|Remastered|Remaster)\s*\)/gi, "")
    .replace(/\s*\|\s*Official\s*(Music\s*)?Video/gi, "")
    .replace(/\s*-\s*Official\s*(Music\s*)?Video/gi, "")
    .replace(/\s*HD\s*/gi, "")
    .replace(/\s*HQ\s*/gi, "")
    .replace(/\s*4K\s*/gi, "")
    .replace(/\s*1080p\s*/gi, "")
    .trim();

  // 3. Check if the video title contains a separator like ' - ' or ' | '
  const separators = [' - ', ' | ', ' • ', ' ~ '];
  let splitResult: string[] = [];
  for (const sep of separators) {
    if (cleanTitle.includes(sep)) {
      splitResult = cleanTitle.split(sep);
      break;
    }
  }

  if (splitResult.length >= 2) {
    let part1 = splitResult[0].trim();
    let part2 = splitResult[1].trim();

    // Remove video song text from parts
    part1 = part1.replace(/\b(Video Song|Full Video|Lyrical Video|Full Song|Audio Song|Music Video)\b/gi, "").trim();
    part2 = part2.replace(/\b(Video Song|Full Video|Lyrical Video|Full Song|Audio Song|Music Video)\b/gi, "").trim();

    const artistLower = cleanArtist.toLowerCase();
    const p1Lower = part1.toLowerCase();
    const p2Lower = part2.toLowerCase();

    if (p1Lower.includes(artistLower) || artistLower.includes(p1Lower)) {
      artist = part1;
      title = part2;
    } else if (p2Lower.includes(artistLower) || artistLower.includes(p2Lower)) {
      artist = part2;
      title = part1;
    } else {
      artist = part1;
      title = part2;
    }
  } else {
    title = cleanTitle;
    artist = cleanArtist;
  }

  // Final trim and cleaning of excess hyphens, pipes, braces
  title = title.replace(/^[-|•\s]+|[-|•\s]+$/g, "").trim();
  artist = artist.replace(/^[-|•\s]+|[-|•\s]+$/g, "").trim();

  // If we ended up with empty values, fall back safely
  if (!title) title = rawTitle;
  if (!artist) artist = rawChannel || "YouTube Video";

  return { title, artist };
}

