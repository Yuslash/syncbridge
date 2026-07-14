import express from "express";
import path from "path";
import dotenv from "dotenv";
import { YouTube } from "youtube-sr";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

/**
 * Robust wrapper to query the OpenRouter API.
 * Uses google/gemini-2.5-flash as default, providing fast, cheap, and accurate JSON structure extraction.
 */
async function callOpenRouter(prompt: string, expectJson: boolean = true): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("No OpenRouter API key found. Please define OPENROUTER_API_KEY.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://ais-pre-h3vdpdt2rwxb7wo3anwl22-647025301367.asia-east1.run.app",
      "X-Title": "SyncBridge Pro"
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: expectJson ? { type: "json_object" } : undefined,
      max_tokens: 3000
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API returned error status ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error("Invalid response format received from OpenRouter API.");
  }

  return data.choices[0].message.content;
}

/**
 * Robustly checks if an object qualifies as a Spotify track structure.
 */
function isTrackObject(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const name = obj.name || obj.title;
  if (typeof name !== 'string' || !name.trim()) return false;
  return !!(obj.artists || obj.artist || obj.artistsNames || obj.albumOfTrack || obj.album);
}

/**
 * Standardizes a track object parsed from raw scripts into our standard schema.
 */
function parseTrack(t: any) {
  const title = t.name || t.title || "Unknown Title";
  
  let artist = "Unknown Artist";
  if (Array.isArray(t.artists)) {
    artist = t.artists
      .map((a: any) => (typeof a === 'object' && a !== null ? (a.name || a.title || "") : String(a)))
      .filter(Boolean)
      .join(", ");
  } else if (typeof t.artists === 'string') {
    artist = t.artists;
  } else if (t.artist) {
    if (typeof t.artist === 'string') artist = t.artist;
    else if (typeof t.artist === 'object' && t.artist !== null) artist = t.artist.name || t.artist.title || "Unknown Artist";
  } else if (Array.isArray(t.artistsNames)) {
    artist = t.artistsNames.filter(Boolean).join(", ");
  } else if (t.profile && typeof t.profile === 'object') {
    artist = t.profile.name || "Unknown Artist";
  }

  const album = (t.album && typeof t.album === 'object') ? (t.album.name || "") : (t.albumName || "");
  
  let artworkUrl = "";
  // 1. Check album.images (Traditional Spotify web API structure)
  if (t.album && typeof t.album === 'object' && Array.isArray(t.album.images) && t.album.images.length > 0) {
    artworkUrl = t.album.images[0].url || "";
  } 
  // 2. Check albumOfTrack.coverArt.sources (Modern Spotify Embed graph hydration)
  else if (t.albumOfTrack && typeof t.albumOfTrack === 'object') {
    const coverArt = t.albumOfTrack.coverArt;
    if (coverArt && Array.isArray(coverArt.sources) && coverArt.sources.length > 0) {
      artworkUrl = coverArt.sources[0].url || "";
    }
  } 
  // 3. Check direct images array
  else if (Array.isArray(t.images) && t.images.length > 0) {
    artworkUrl = t.images[0].url || "";
  } 
  // 4. Check nested cover/sources objects
  else if (t.cover && typeof t.cover === 'object') {
    if (Array.isArray(t.cover.images) && t.cover.images.length > 0) {
      artworkUrl = t.cover.images[0].url || "";
    } else if (Array.isArray(t.cover.sources) && t.cover.sources.length > 0) {
      artworkUrl = t.cover.sources[0].url || "";
    }
  }
  // 5. Fallback string properties
  else if (typeof t.artworkUrl === 'string') {
    artworkUrl = t.artworkUrl;
  } else if (typeof t.coverUrl === 'string') {
    artworkUrl = t.coverUrl;
  }

  const durationMs = t.duration_ms || t.durationMs || 0;

  return { title, artist, album, durationMs, artworkUrl };
}

/**
 * Recursively locates playlist metadata inside parsed Javascript/JSON scripts.
 */
function findPlaylistMeta(obj: any): { playlistName?: string; playlistDescription?: string } | null {
  if (!obj || typeof obj !== 'object') return null;

  if (obj.type === "playlist" || obj.type === "album") {
    if (typeof obj.name === 'string') {
      return {
        playlistName: obj.name,
        playlistDescription: obj.description || ""
      };
    }
  }

  if (typeof obj.playlistName === 'string' || typeof obj.name === 'string') {
    if (obj.tracks && (Array.isArray(obj.tracks) || Array.isArray(obj.tracks.items))) {
      return {
        playlistName: obj.name || obj.playlistName,
        playlistDescription: obj.description || ""
      };
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const meta = findPlaylistMeta(obj[key]);
      if (meta && meta.playlistName) return meta;
    }
  }

  return null;
}

/**
 * Recursively scans any object hierarchy to find valid track list candidate arrays.
 */
function findTracksRecursive(val: any, foundLists: any[][]): void {
  if (!val || typeof val !== 'object') return;

  if (Array.isArray(val)) {
    const candidateTracks: any[] = [];
    for (const el of val) {
      if (!el || typeof el !== 'object') continue;
      const potentialTrack = el.track || el.item?.track || el;
      if (isTrackObject(potentialTrack)) {
        candidateTracks.push(parseTrack(potentialTrack));
      }
    }
    if (candidateTracks.length > 0) {
      foundLists.push(candidateTracks);
    }
    
    // Continue scanning nested array members
    for (const el of val) {
      findTracksRecursive(el, foundLists);
    }
    return;
  }

  for (const key of Object.keys(val)) {
    if (key !== 'parent' && typeof val[key] === 'object' && val[key] !== null) {
      findTracksRecursive(val[key], foundLists);
    }
  }
}

/**
 * Attempts to extract tracks and metadata programmatically using regex and JSON loading.
 */
function tryRegexAndJsonParse(html: string): { playlistName: string; playlistDescription: string; tracks: any[] } | null {
  try {
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    
    let bestTracks: any[] = [];
    let bestMeta: { playlistName?: string; playlistDescription?: string } | null = null;
    let highestScore = -1;

    while ((match = scriptRegex.exec(html)) !== null) {
      let content = match[1].trim();
      if (!content) continue;

      // Handle raw percent-encoded text states if embedded in specific data container attributes
      if (content.includes("%7B") && content.includes("%22")) {
        try {
          content = decodeURIComponent(content);
        } catch (_) {}
      }

      const firstCurly = content.indexOf("{");
      const lastCurly = content.lastIndexOf("}");
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        const jsonStr = content.substring(firstCurly, lastCurly + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          
          const currentMeta = findPlaylistMeta(parsed);
          
          const foundTrackLists: any[][] = [];
          findTracksRecursive(parsed, foundTrackLists);
          
          for (const list of foundTrackLists) {
            if (list.length === 0) continue;
            
            const artworkCount = list.filter(t => !!t.artworkUrl).length;
            // Weigh track count and non-empty artwork density to fetch rich outcomes
            const score = list.length * 10 + artworkCount * 100;
            
            if (score > highestScore) {
              highestScore = score;
              bestTracks = list;
              if (currentMeta && currentMeta.playlistName) {
                bestMeta = currentMeta;
              }
            }
          }
        } catch (e) {
          // Ignore parse errors within script chunks
        }
      }
    }

    if (bestTracks.length > 0) {
      return {
        playlistName: bestMeta?.playlistName || "Imported Spotify Playlist",
        playlistDescription: bestMeta?.playlistDescription || "",
        tracks: bestTracks
      };
    }
  } catch (err) {
    console.error("[Spotify Local Parser Error]", err);
  }
  return null;
}

/**
 * Trims down the HTML content to keep it lightweight for Gemini API extraction.
 * Removes heavy style/svg elements, keeping meta tags and scripts that contain track data.
 */
function cleanSpotifyHtml(html: string): string {
  // Strip CSS styles
  let clean = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
  // Strip inline SVG icons
  clean = clean.replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, '');
  
  // Extract all script block contents (containing json/entities)
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptContent = "";
  let match;
  while ((match = scriptRegex.exec(clean)) !== null) {
    const content = match[1];
    if (
      content.includes("initial-state") || 
      content.includes("__NEXT_DATA__") || 
      content.includes("session") || 
      content.includes("tracks") || 
      content.includes("resource") ||
      content.includes("playlist")
    ) {
      scriptContent += content.trim() + "\n";
    }
  }

  // If we found script content, use that. Keep it very compact for API calls to prevent 402 issues.
  if (scriptContent) {
    return scriptContent.substring(0, 10000);
  }

  // Fallback: strip tags and keep text
  let fallbackText = clean.replace(/<[^>]+>/g, ' ');
  fallbackText = fallbackText.replace(/\s+/g, ' ');
  return fallbackText.substring(0, 8000);
}

// REST Endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/youtube-details", async (req, res): Promise<any> => {
  const { url, videoId } = req.body || {};
  try {
    let targetUrl = url;
    if (videoId && !targetUrl) {
      targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }
    if (!targetUrl) {
      return res.status(400).json({ error: "URL or videoId is required" });
    }
    const info = await YouTube.getVideo(targetUrl);
    return res.json({
      videoId: info.id,
      title: info.title,
      artist: info.channel?.name || "YouTube Video",
      durationMs: info.duration || 180000,
      artworkUrl: info.thumbnail?.url || `https://img.youtube.com/vi/${info.id}/mqdefault.jpg`
    });
  } catch (err: any) {
    console.error("[YouTube Details Error]", err);
    const parsedId = videoId || (url ? url.match(/(?:v=|\/)([a-zA-Z0-9_\-]{11})/)?.[1] : null);
    if (parsedId) {
      return res.json({
        videoId: parsedId,
        title: "YouTube Video",
        artist: "YouTube Channel",
        durationMs: 180000,
        artworkUrl: `https://img.youtube.com/vi/${parsedId}/mqdefault.jpg`
      });
    }
    return res.status(500).json({ error: err.message || "Failed to fetch YouTube details" });
  }
});

app.post("/api/spotify-track-details", async (req, res): Promise<any> => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Spotify URL is required" });
    }
    // Match Base62 Spotify ID of typical lengths (typically 21, 22 or 23 characters)
    const trackIdMatch = url.match(/track\/([a-zA-Z0-9]{21,23})/);
    if (!trackIdMatch) {
      return res.status(400).json({ error: "Invalid Spotify track link. Could not extract Spotify track ID." });
    }
    const trackId = trackIdMatch[1];
    const targetUrl = `https://open.spotify.com/embed/track/${trackId}`;
    
    const fetchResponse = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch Spotify track. Status: ${fetchResponse.status}`);
    }

    const html = await fetchResponse.text();
    const programResult = tryRegexAndJsonParse(html);
    if (programResult && programResult.tracks && programResult.tracks.length > 0) {
      const track = programResult.tracks[0];
      return res.json({ track });
    }
    
    // Fallback 1: Title Parsing with various standard Spotify page title layouts
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      let pageTitle = titleMatch[1].trim();
      // Remove possible site suffix
      pageTitle = pageTitle.replace(/\s*\|\s*Spotify/gi, "");
      pageTitle = pageTitle.replace(/\s*-\s*song\s+and\s+lyrics\s+by\s+/gi, " - song by ");
      pageTitle = pageTitle.replace(/\s*-\s*song\s+by\s+/gi, " - song by ");
      
      const parts = pageTitle.split(" - song by ");
      if (parts.length >= 2) {
        return res.json({
          track: {
            title: parts[0].trim(),
            artist: parts[1].trim(),
            artworkUrl: "",
            durationMs: 180000
          }
        });
      }
    }

    // Fallback 2: Call OpenRouter to dynamically find track information from Spotify Embed HTML
    try {
      console.log("[Spotify Track Engine] Programmatic and title fallback failed. Trying OpenRouter...");
      const cleanContent = cleanSpotifyHtml(html);
      const prompt = `Extract the track title, artist, and album name (if present) from this Spotify Track Embed HTML.
Source snippet:
${cleanContent}

You MUST return your output STRICTLY as a JSON object of this structure:
{
  "title": "Song Title",
  "artist": "Artist Name",
  "album": "Album Name (or empty string)",
  "durationMs": 180000
}`;
      const openRouterText = await callOpenRouter(prompt, true);
      const parsed = JSON.parse(openRouterText.trim());
      if (parsed.title && parsed.artist) {
        return res.json({
          track: {
            title: parsed.title,
            artist: parsed.artist,
            album: parsed.album || "",
            durationMs: parsed.durationMs || 180000,
            artworkUrl: ""
          }
        });
      }
    } catch (llmErr) {
      console.error("[Spotify Track OpenRouter Error]", llmErr);
    }
    
    return res.status(404).json({ error: "Could not parse track details." });
  } catch (err: any) {
    console.error("[Spotify Track Parse Error]", err);
    return res.status(500).json({ error: err.message || "Failed to parse Spotify track" });
  }
});

/**
 * Endpoint to parse Spotify playlist details.
 * Uses a robust cleaning mechanism + Gemini Structured JSON output to guarantee a perfect parse.
 */
app.post("/api/parse-spotify", async (req, res): Promise<any> => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Spotify URL is required" });
    }

    // Extract Playlist ID from typical Spotify links (typically 21, 22 or 23 characters)
    const playlistIdMatch = url.match(/playlist\/([a-zA-Z0-9]{21,23})/);
    if (!playlistIdMatch) {
      return res.status(400).json({ error: "Invalid Spotify playlist link. Could not find a valid playlist ID." });
    }

    const playlistId = playlistIdMatch[1];
    const targetUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

    console.log(`[Spotify Engine] Fetching public embed page for ID: ${playlistId}`);
    
    // Fetch public embed HTML
    const fetchResponse = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch Spotify playlist embed. Status: ${fetchResponse.status}`);
    }

    const html = await fetchResponse.text();

    // 1st Priority: Blazing fast offline programmatic script parsing
    console.log(`[Spotify Engine] Attempting programmatic JSON extraction from script hydrations...`);
    const programResult = tryRegexAndJsonParse(html);
    if (programResult && programResult.tracks.length > 0) {
      console.log(`[Spotify Engine] Success! Programmatically extracted ${programResult.tracks.length} tracks.`);
      return res.json(programResult);
    }

    // 2nd Priority Fallback: Low-token OpenRouter LLM Call
    console.log(`[Spotify Engine] Local parser returned 0 tracks. Falling back to OpenRouter matching...`);
    const cleanContent = cleanSpotifyHtml(html);

    const prompt = `Extract the tracklist details in exact track order from this Spotify Playlist embed snippet.
Keep the original sequence. Find the track name, artist/producer, album Name, duration, and artwork image URL if available.

Source snippet:
${cleanContent}

You MUST return your output STRICTLY as a JSON object of this structure:
{
  "playlistName": "Name or title of the playlist",
  "playlistDescription": "Detailed overview or tags of the playlist",
  "tracks": [
    {
      "title": "Title of the song",
      "artist": "Full artist name(s)",
      "album": "Album name (optional)",
      "durationMs": 180000,
      "artworkUrl": "image URL"
    }
  ]
}`;

    const openRouterText = await callOpenRouter(prompt, true);
    const parsedJson = JSON.parse(openRouterText.trim());
    return res.json({
      playlistName: parsedJson.playlistName || "Imported Playlist",
      playlistDescription: parsedJson.playlistDescription || "",
      tracks: parsedJson.tracks || []
    });

  } catch (error: any) {
    console.error("[Spotify Engine Error]", error);
    const errMsg = error.message || String(error);
    const isLeaked = /leaked/i.test(errMsg);
    const isPermissionDenied = /permission_denied|403|denied|unauthorized|invalid api key/i.test(errMsg);
    const isKeyError = /api_key|api key/i.test(errMsg);

    if (isLeaked || isPermissionDenied || isKeyError) {
      return res.status(403).json({
        error: "Your OpenRouter API key is invalid or failed authorization.",
        isApiKeyError: true,
        suggestedFix: "To fix this, please verify or update your OPENROUTER_API_KEY value inside Google AI Studio's 'Settings' > 'Secrets' panel, then try again!"
      });
    }

    return res.status(500).json({ error: errMsg || "An error occurred while parsing the Spotify playlist." });
  }
});

/**
 * Cleans Spotify song details to create highly optimized terms for YouTube search discovery.
 * Strips secondary features, remasters, acoustic tags, and comma-separated secondary artists.
 */
function cleanQueryTerm(artist: string, title: string): { cleanArtist: string; cleanTitle: string } {
  // Strip comma-separated secondary artists, ampersands, or "feat" strings from the artist
  let cleanArtist = artist
    .split(",")[0]
    .split("&")[0]
    .split(" featuring ")[0]
    .split(" feat. ")[0]
    .split(" ft. ")[0]
    .trim();

  // Strip common noisy suffixes from titles
  let cleanTitle = title
    .replace(/\s*[([].*?(remaster|re-master|live|acoustic|edit|version|feat\.|ft\.).*?[)\]]/gi, "")
    .replace(/- \d{4} Remastered Version/gi, "")
    .replace(/- Remastered \d{4}/gi, "")
    .replace(/- Remastered/gi, "")
    .replace(/- Single Version/gi, "")
    .replace(/- Radio Edit/gi, "")
    .replace(/- live/gi, "")
    .replace(/\s+-\s+acoustic/gi, "")
    .trim();

  // If cleaning leaves an empty string, safely fall back to the original text
  if (!cleanArtist) cleanArtist = artist.trim();
  if (!cleanTitle) cleanTitle = title.trim();

  return { cleanArtist, cleanTitle };
}

interface YouTubeResult {
  videoId: string;
  title: string;
  artistName: string;
  duration: string;
  durationMs: number;
  thumbnailUrl: string;
  videoUrl: string;
  isShort: boolean;
}

/**
 * Finds the index of the matching closing brace '}' in a JSON/JS string.
 * Accounts for nested braces, escaped characters, and string literals.
 */
function findClosingBraceIndex(str: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  let stringChar = '"';
  
  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (inString) {
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    
    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }
    
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Robust HTML backup scraper when youtube-sr internally crashes or breaks due to layout updates.
 * Fetches the raw search page from YouTube and parses ytInitialData or falls back to robust regexes.
 */
async function fallbackSearchYouTube(query: string): Promise<YouTubeResult[]> {
  console.log(`[YouTube Fallback Scraper] Initiating robust scrape search for: "${query}"`);
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`; // sp forces Video results
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "SOCS=CAEQAw; CONSENT=YES+cb",
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube scrape returned status code ${response.status}`);
    }

    const html = await response.text();
    const results: YouTubeResult[] = [];

    // Safe extraction of ytInitialData JSON from HTML source using brace counting
    let parsedData: any = null;
    const initialDataMarkers = [
      "window['ytInitialData'] =", 
      "window[\"ytInitialData\"] =", 
      "var ytInitialData =", 
      "ytInitialData = ", 
      "ytInitialData="
    ];
    
    for (const marker of initialDataMarkers) {
      const startIdx = html.indexOf(marker);
      if (startIdx !== -1) {
        const firstBraceIdx = html.indexOf("{", startIdx + marker.length);
        if (firstBraceIdx !== -1) {
          const closingBraceIdx = findClosingBraceIndex(html, firstBraceIdx);
          if (closingBraceIdx !== -1) {
            try {
              const jsonStr = html.substring(firstBraceIdx, closingBraceIdx + 1).trim();
              parsedData = JSON.parse(jsonStr);
              console.log("[YouTube Fallback Scraper] Successfully parsed ytInitialData JSON via brace counting!");
              break;
            } catch (e) {
              // Quiet fail and try the next marker
            }
          }
        }
      }
    }

    if (parsedData) {
      const contents = parsedData?.contents?.twoColumnSearchResultRenderer?.primaryContents?.sectionListRenderer?.contents;
      if (Array.isArray(contents)) {
        for (const section of contents) {
          const itemSection = section.itemSectionRenderer?.contents;
          if (Array.isArray(itemSection)) {
            for (const item of itemSection) {
              const vr = item.videoRenderer;
              if (vr && vr.videoId) {
                const id = vr.videoId;
                const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || "Unknown Track";
                const channel = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || "Unknown Channel";
                const lengthStr = vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text || "";
                const thumb = vr.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
                
                // Parse duration formatted e.g. "3:45" to ms
                let durationMs = 180000; // default 3 mins
                if (lengthStr) {
                  const parts = lengthStr.split(":").map(Number);
                  if (parts.length === 2 && !parts.some(isNaN)) {
                    durationMs = (parts[0] * 60 + parts[1]) * 1000;
                  } else if (parts.length === 3 && !parts.some(isNaN)) {
                    durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                  }
                }

                results.push({
                  videoId: id,
                  title,
                  artistName: channel,
                  duration: lengthStr || "3:00",
                  durationMs,
                  thumbnailUrl: thumb,
                  videoUrl: `https://www.youtube.com/watch?v=${id}`,
                  isShort: durationMs < 75000
                });
              }
            }
          }
        }
      }
    }

    // Secondary emergency sub-block parsing: Scan the entire HTML for raw `"videoRenderer"` structures!
    // This is incredibly resilient against YouTube schema changes as long as some JSON remains.
    if (results.length === 0) {
      console.log("[YouTube Fallback Scraper] ytInitialData path navigation empty/failed; evaluating raw videoRenderer sub-blocks");
      let searchIdx = 0;
      const vrMarker = '"videoRenderer"';
      while (true) {
        const vrIdx = html.indexOf(vrMarker, searchIdx);
        if (vrIdx === -1) break;
        searchIdx = vrIdx + vrMarker.length;
        
        // Find opening brace associated with videoRenderer
        const braceIdx = html.indexOf("{", vrIdx);
        if (braceIdx !== -1 && braceIdx < vrIdx + 30) {
          const closingIdx = findClosingBraceIndex(html, braceIdx);
          if (closingIdx !== -1) {
            try {
              const jsonStr = html.substring(braceIdx, closingIdx + 1).trim();
              const vr = JSON.parse(jsonStr);
              if (vr && vr.videoId) {
                const id = vr.videoId;
                const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || "Unknown Track";
                const channel = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || "Unknown Channel";
                const lengthStr = vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text || "";
                const thumb = vr.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
                
                let durationMs = 180000;
                if (lengthStr) {
                  const parts = lengthStr.split(":").map(Number);
                  if (parts.length === 2 && !parts.some(isNaN)) {
                    durationMs = (parts[0] * 60 + parts[1]) * 1000;
                  } else if (parts.length === 3 && !parts.some(isNaN)) {
                    durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                  }
                }

                if (!results.some(r => r.videoId === id)) {
                  results.push({
                    videoId: id,
                    title,
                    artistName: channel,
                    duration: lengthStr || "3:00",
                    durationMs,
                    thumbnailUrl: thumb,
                    videoUrl: `https://www.youtube.com/watch?v=${id}`,
                    isShort: durationMs < 75000
                  });
                }
              }
            } catch (e) {
              // Ignore single block parse error and proceed to search next
            }
          }
        }
      }
    }

    // Tertiary emergency regex matching if both JSON structures failed to extract candidates
    if (results.length === 0) {
      console.log("[YouTube Fallback Scraper] All JSON extractors returned empty; evaluating emergency HTML regexes");
      const videoIdRegex = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
      const videoIds: string[] = [];
      let rxMatch;
      while ((rxMatch = videoIdRegex.exec(html)) !== null) {
        const id = rxMatch[1];
        if (!videoIds.includes(id)) {
          videoIds.push(id);
        }
        if (videoIds.length >= 10) break;
      }

      if (videoIds.length === 0) {
        const watchUrlRegex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
        while ((rxMatch = watchUrlRegex.exec(html)) !== null) {
          const id = rxMatch[1];
          if (!videoIds.includes(id)) {
            videoIds.push(id);
          }
          if (videoIds.length >= 10) break;
        }
      }

      // Generate a friendly name based on query as title instead of raw ID
      const queryCleaned = query.replace(/lyrics|official video|audio|remix|hd|music video|official/gi, "").trim();
      const fallbackTitle = queryCleaned ? queryCleaned.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Matched Track";

      for (const id of videoIds) {
        results.push({
          videoId: id,
          title: `${fallbackTitle} [Matched Video]`,
          artistName: "YouTube Artist",
          duration: "3:30",
          durationMs: 210000,
          thumbnailUrl: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
          videoUrl: `https://www.youtube.com/watch?v=${id}`,
          isShort: false
        });
      }
    }

    console.log(`[YouTube Fallback Scraper] Extracted ${results.length} valid results successfully`);
    return results;
  } catch (err) {
    console.error("[YouTube Fallback Scraper Error]", err);
    return [];
  }
}

/**
 * Advanced custom scoring metric for YouTube videos to ensure embed viability & prevent regional/licensing blockages.
 * Strongly flags and filters down auto-generated licensing streams (e.g. "- Topic" channels) and unofficial cover loops
 * that frequently block embedding on external frames.
 */
function scoreCandidate(c: any, targetTitle: string, targetArtist: string): number {
  let score = 100;
  const titleLower = (c.title || "").toLowerCase();
  const channelLower = (c.channel?.name || "").toLowerCase();
  const rawArtist = (targetArtist || "").toLowerCase();
  const rawTitle = (targetTitle || "").toLowerCase();

  // 1. Heavy penalty for "- Topic" channels because they are auto-generated tracks
  // that frequently block embedding and have heavy geo-restriction limits outside YouTube.
  if (channelLower.includes("topic") || channelLower.endsWith("- topic")) {
    score -= 60;
  }

  // 2. Heavy penalties for covers, karaokes, loops, speed up, slowed, reactions
  if (titleLower.includes("cover") && !rawTitle.includes("cover")) {
    score -= 50;
  }
  if (titleLower.includes("karaoke") || titleLower.includes("instrumental") || titleLower.includes("piano tutorial")) {
    score -= 70;
  }
  if (titleLower.includes("1 hour") || titleLower.includes("loop") || titleLower.includes("slowed") || titleLower.includes("speed up") || titleLower.includes("nightcore") || titleLower.includes("reversed") || titleLower.includes("reaction")) {
    score -= 80;
  }

  // 3. Penalty for "live" performance versions unless target track specifically refers to "live"
  if (titleLower.includes("live") && !rawTitle.includes("live")) {
    score -= 40;
  }

  // 4. Boost for official indicators (official video, official audio, lyric video)
  if (titleLower.includes("official video") || titleLower.includes("music video") || titleLower.includes("official music video")) {
    score += 25;
  } else if (titleLower.includes("official audio") || titleLower.includes("lyric video") || titleLower.includes("lyrics")) {
    score += 20;
  }

  // 5. Boost for matching artist or channel title containing artist name
  if (rawArtist) {
    if (channelLower.includes(rawArtist)) {
      score += 20;
    }
    if (titleLower.includes(rawArtist)) {
      score += 10;
    }
  }

  return score;
}

/**
 * Safe, fault-tolerant search wrapper over youtube-sr.
 * Intercepts TypeError crashes (like channel.browseId reference errors) and safely triggers the HTML scraper.
 */
async function searchYouTubeWithFallback(query: string, limit: number = 10): Promise<any[]> {
  try {
    console.log(`[YouTube Search Wrapper] Trying youtube-sr first for query: "${query}"`);
    const candidates = await YouTube.search(query, { 
      limit: limit,
      type: "video",
      requestOptions: {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Cookie": "SOCS=CAEQAw; CONSENT=YES+cb",
          "Accept-Language": "en-US,en;q=0.9"
        }
      }  
    });

    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from youtube-sr");
    }

    return candidates.map(c => {
      const safeId = c?.id || "";
      const safeTitle = c?.title || "Unknown Title";
      const safeChannelName = c?.channel?.name || "Unknown Channel";
      const safeDuration = c?.durationFormatted || "3:00";
      const safeDurationMs = typeof c?.duration === "number" ? c.duration : 180000;
      const safeThumbnail = c?.thumbnail?.url || `https://img.youtube.com/vi/${safeId}/mqdefault.jpg`;
      return {
        id: safeId,
        title: safeTitle,
        channel: { name: safeChannelName },
        durationFormatted: safeDuration,
        duration: safeDurationMs,
        thumbnail: { url: safeThumbnail }
      };
    }).filter(c => c.id);
  } catch (err: any) {
    console.warn(`[YouTube Search Wrapper] youtube-sr failed ("${err?.message || err}"). Transitioning to backup HTML scraper...`);
    try {
      const fallbackResults = await fallbackSearchYouTube(query);
      return fallbackResults.map(f => ({
        id: f.videoId,
        title: f.title,
        channel: { name: f.artistName },
        durationFormatted: f.duration,
        duration: f.durationMs,
        thumbnail: { url: f.thumbnailUrl }
      }));
    } catch (fallbackErr) {
      console.error("[YouTube Search Wrapper] Critical fail. Scraper and youtube-sr failed.", fallbackErr);
      return [];
    }
  }
}

/**
 * Searches YouTube recursively for songs and returns top results using youtube-sr.
 * Automatically filters out YouTube Shorts and short clip durations.
 */
app.post("/api/search-youtube", async (req, res): Promise<any> => {
  try {
    const { title, artist, mode = "fast" } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Track title is required" });
    }

    const artistName = artist || "";
    const { cleanArtist, cleanTitle } = cleanQueryTerm(artistName, title);

    // Progressive query waterfall to optimize success rate without hit limits
    const possibleQueries = [
      cleanArtist ? `${cleanArtist} ${cleanTitle}` : `${cleanTitle}`, // 1: Primary artist & title if artist is present
      cleanArtist ? `${cleanArtist} - ${cleanTitle} official audio` : `${cleanTitle} official audio`, // 2: Clean audio focus
      artistName ? `${artistName} ${title}` : `${title}`, // 3: Exact raw Spotify metadata
      `${cleanTitle}` // 4: Last-ditch title alone
    ].filter(Boolean);

    if (mode === "research") {
      console.log(`[YouTube Search] Research mode activated for: "${artist} - ${title}"`);
      // Gather top candidates from the first two queries
      let allCandidates: any[] = [];
      for (const searchQuery of possibleQueries.slice(0, 2)) {
        try {
          const results = await searchYouTubeWithFallback(searchQuery, 5);
          allCandidates = [...allCandidates, ...results];
        } catch (err) {
          console.warn(`[YouTube Search] Retry for query failed in research mode`, err);
        }
      }
      
      // Deduplicate
      const uniqueCandidatesMap = new Map();
      allCandidates.forEach(c => {
        if (!uniqueCandidatesMap.has(c.id)) {
          uniqueCandidatesMap.set(c.id, c);
        }
      });
      const uniqueCandidates = Array.from(uniqueCandidatesMap.values());
      
      // Sort candidates by custom embedding/licensing suitability score
      uniqueCandidates.sort((a, b) => {
        const sa = scoreCandidate({ title: a.title, channel: a.channel }, title, artist);
        const sb = scoreCandidate({ title: b.title, channel: b.channel }, title, artist);
        return sb - sa;
      });

      const nonShorts = uniqueCandidates.filter(c => c.duration > 75000);
      
      if (nonShorts.length > 0) {
        // Use Gemini to analyze and pick the best one
        const prompt = `You are evaluating YouTube search results to find the PERFECT full-length official song match.
Target Song: "${title}" by Artist: "${artist}"

Candidates (JSON):
${JSON.stringify(nonShorts.map(c => ({ id: c.id, title: c.title, channel: c.channel?.name, duration: c.durationFormatted })), null, 2)}

Rules:
1. Prefer official audio, music videos, or lyric videos from the artist's official channel/VEVO over covers, live performances, or heavily remixed versions (unless a remix was explicitly requested).
2. The duration should be typical for a song (2-6 minutes generally).
3. Return ONLY the JSON containing {"bestVideoId": "videoId_here"}. If there's no suitable match, return null for bestVideoId.

Return your response strictly as JSON conforming to:
{"bestVideoId": "<string or null>"}`;
        try {
          const openRouterText = await callOpenRouter(prompt, true);
          const parsedGemini = JSON.parse(openRouterText.trim());
          if (parsedGemini.bestVideoId) {
            const bestChoice = nonShorts.find(c => c.id === parsedGemini.bestVideoId) || nonShorts[0];
            return res.json({
              videoId: bestChoice.id,
              videoTitle: bestChoice.title,
              videoUrl: `https://www.youtube.com/watch?v=${bestChoice.id}`,
              thumbnailUrl: bestChoice.thumbnail?.url || `https://img.youtube.com/vi/${bestChoice.id}/mqdefault.jpg`,
              durationMs: typeof bestChoice.duration === "number" ? bestChoice.duration : 180000
            });
          }
        } catch (err) {
            console.error("[YouTube Search OpenRouter Error] Falling back to standard pick", err);
        }
        
        // Fallback if Gemini fails or returns null
        const primeVideo = nonShorts[0];
        return res.json({
          videoId: primeVideo.id,
          videoTitle: primeVideo.title,
          videoUrl: `https://www.youtube.com/watch?v=${primeVideo.id}`,
          thumbnailUrl: primeVideo.thumbnail?.url || `https://img.youtube.com/vi/${primeVideo.id}/mqdefault.jpg`,
          durationMs: typeof primeVideo.duration === "number" ? primeVideo.duration : 180000
        });
      }
    }

    const activeQueries = mode === "fast" ? possibleQueries.slice(0, 1) : possibleQueries;

    let primeVideoId: string | null = null;
    let videoTitle: string = `${artist} - ${title}`;
    let primeThumbnailUrl: string | null = null;
    let primeDurationMs: number = 180000; // default 3 mins

    // Iterate through waterfall search queries until a non-short videoId is located
    for (const searchQuery of activeQueries) {
      console.log(`[YouTube Search] Querying: "${searchQuery}" (Original: "${artist} - ${title}")`);

      try {
        const candidates = await searchYouTubeWithFallback(searchQuery, 5);

        // Sort candidates by custom embedding/licensing suitability score
        candidates.sort((a, b) => {
          const sa = scoreCandidate({ title: a.title, channel: a.channel }, title, artist);
          const sb = scoreCandidate({ title: b.title, channel: b.channel }, title, artist);
          return sb - sa;
        });

        // Prioritize non-shorts first helper
        const nonShorts = candidates.filter(c => c.duration > 75000);

        if (nonShorts.length > 0) {
          primeVideoId = nonShorts[0].id!;
          videoTitle = nonShorts[0].title!;
          primeThumbnailUrl = nonShorts[0].thumbnail?.url || `https://img.youtube.com/vi/${primeVideoId}/mqdefault.jpg`;
          primeDurationMs = typeof nonShorts[0].duration === "number" ? nonShorts[0].duration : 180000;
          break; // Located a satisfactory FULL-LENGTH video match! Exit loop.
        } else if (candidates.length > 0 && !primeVideoId) {
          // Keep a backup video (which might be a short or clip) just in case no query returns a full video song
          primeVideoId = candidates[0].id!;
          videoTitle = candidates[0].title!;
          primeThumbnailUrl = candidates[0].thumbnail?.url || `https://img.youtube.com/vi/${primeVideoId}/mqdefault.jpg`;
          primeDurationMs = typeof candidates[0].duration === "number" ? candidates[0].duration : 180000;
        }
      } catch (err) {
        console.warn(`[YouTube Search Retry Warning] Call to "${searchQuery}" failed. Retrying next tier.`, err);
      }
    }

    if (!primeVideoId) {
      console.log(`[YouTube Search] No video match found across waterfall tiers or backups for track: ${artist} - ${title}`);
      return res.json({ videoId: null });
    }

    console.log(`[YouTube Search] Matched Top ID: ${primeVideoId} ("${videoTitle}")`);

    return res.json({
      videoId: primeVideoId,
      videoTitle: videoTitle,
      videoUrl: `https://www.youtube.com/watch?v=${primeVideoId}`,
      thumbnailUrl: primeThumbnailUrl,
      durationMs: primeDurationMs
    });

  } catch (error: any) {
    console.error("[YouTube Search Error]", error);
    return res.status(500).json({ error: error.message || "Failed to search YouTube." });
  }
});

/**
 * Endpoint to scan for up to 5 recommendations for a track,
 * prioritizing full song tracks over YouTube Shorts.
 */
app.post("/api/youtube-suggestions", async (req, res): Promise<any> => {
  try {
    const { title, artist } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Track title is required" });
    }

    const artistName = artist || "";
    const { cleanArtist, cleanTitle } = cleanQueryTerm(artistName, title);
    const searchQuery = cleanArtist ? `${cleanArtist} ${cleanTitle}` : cleanTitle;
    console.log(`[YouTube Suggestions] Fetching candidates for: "${searchQuery}"`);

    const candidates = await searchYouTubeWithFallback(searchQuery, 10);

    // Dynamic scoring pass to ensure official/embed-friendly/unrestricted sources show first
    candidates.sort((a, b) => {
      const sa = scoreCandidate({ title: a.title, channel: a.channel }, title, artistName);
      const sb = scoreCandidate({ title: b.title, channel: b.channel }, title, artistName);
      return sb - sa;
    });

    const formattedCandidates = candidates.map(c => ({
      videoId: c.id,
      title: c.title,
      artistName: c.channel?.name || "Unknown Channel",
      duration: c.durationFormatted,
      durationMs: typeof c.duration === "number" ? c.duration : 180000,
      thumbnailUrl: c.thumbnail?.url || `https://img.youtube.com/vi/${c.id}/mqdefault.jpg`,
      videoUrl: `https://www.youtube.com/watch?v=${c.id}`,
      isShort: c.duration < 75000
    }));

    // Prioritize non-shorts to top positions, but keep shorts at bottom of list if not enough results
    const nonShorts = formattedCandidates.filter(c => !c.isShort);
    const shorts = formattedCandidates.filter(c => c.isShort);

    let finalSuggestions = nonShorts.slice(0, 5);
    if (finalSuggestions.length < 5) {
      for (const short of shorts) {
        if (finalSuggestions.length >= 5) break;
        finalSuggestions.push(short);
      }
    }

    console.log(`[YouTube Suggestions] Found ${finalSuggestions.length} candidates after short-filtering for "${title}"`);
    return res.json({ suggestions: finalSuggestions });
  } catch (error: any) {
    console.error("[YouTube Suggestions Error]", error);
    return res.status(500).json({ error: error.message || "Failed to search suggestions." });
  }
});

async function startServer() {
  // Vite dev mode integration
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const viteModule = "vite";
    const { createServer: createViteServer } = await import(viteModule);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static files serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only bind to a local port if NOT running in Vercel (Vercel manages instances automatically)
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server starting on http://localhost:${PORT}`);
    });
  }
}

startServer();

// Vercel Serverless Function export
export default app;
