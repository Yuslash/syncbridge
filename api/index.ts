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
  return !!(obj.artists || obj.artist || obj.artistsNames);
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
  }

  const album = (t.album && typeof t.album === 'object') ? (t.album.name || "") : (t.albumName || "");
  
  let artworkUrl = "";
  if (t.album && Array.isArray(t.album.images) && t.album.images.length > 0) {
    artworkUrl = t.album.images[0].url || "";
  } else if (Array.isArray(t.images) && t.images.length > 0) {
    artworkUrl = t.images[0].url || "";
  } else if (typeof t.artworkUrl === 'string') {
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
 * Recursively extracts track objects from any container inside parsed scripts.
 */
function extractTracksFromObject(obj: any, results: any[] = []): void {
  if (!obj || typeof obj !== 'object') return;

  // Primary Spotify JSON structure
  if (obj.tracks && typeof obj.tracks === 'object') {
    const items = obj.tracks.items;
    if (Array.isArray(items)) {
      for (const item of items) {
        const t = item.track || item;
        if (isTrackObject(t)) {
          results.push(parseTrack(t));
        }
      }
      if (results.length > 0) return;
    }
  }

  // Backup array listing
  if (Array.isArray(obj.items)) {
    for (const item of obj.items) {
      const t = item.track || item;
      if (isTrackObject(t)) {
        results.push(parseTrack(t));
      }
    }
    if (results.length > 0) return;
  }

  // General array of tracks directly
  if (Array.isArray(obj.tracks)) {
    for (const t of obj.tracks) {
      if (isTrackObject(t)) {
        results.push(parseTrack(t));
      }
    }
    if (results.length > 0) return;
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && key !== "parent") {
      extractTracksFromObject(obj[key], results);
      if (results.length > 0) return;
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

    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1].trim();
      if (!content) continue;

      const firstCurly = content.indexOf("{");
      const lastCurly = content.lastIndexOf("}");
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        const jsonStr = content.substring(firstCurly, lastCurly + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          
          const currentMeta = findPlaylistMeta(parsed);
          if (currentMeta && currentMeta.playlistName) {
            bestMeta = currentMeta;
          }
          
          const tracksContainer: any[] = [];
          extractTracksFromObject(parsed, tracksContainer);
          if (tracksContainer.length > 0) {
            bestTracks = tracksContainer;
            if (bestMeta && bestMeta.playlistName) {
              return {
                playlistName: bestMeta.playlistName,
                playlistDescription: bestMeta.playlistDescription || "",
                tracks: bestTracks
              };
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

    // Extract Playlist ID from typical Spotify links
    const playlistIdMatch = url.match(/playlist\/([a-zA-Z0-9]{22})/);
    if (!playlistIdMatch) {
      return res.status(400).json({ error: "Invalid Spotify playlist link. Could not find a 22-character playlist ID." });
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

/**
 * Searches YouTube recursively for songs and returns top results using youtube-sr.
 * Automatically filters out YouTube Shorts and short clip durations.
 */
app.post("/api/search-youtube", async (req, res): Promise<any> => {
  try {
    const { title, artist, mode = "fast" } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: "Track title and artist are required" });
    }

    const { cleanArtist, cleanTitle } = cleanQueryTerm(artist, title);

    // Progressive query waterfall to optimize success rate without hit limits
    const possibleQueries = [
      `${cleanArtist} ${cleanTitle}`,                             // 1: Primary artist & title
      `${cleanArtist} - ${cleanTitle} official audio`,            // 2: Clean audio focus
      `${artist} ${title}`,                                       // 3: Exact raw Spotify metadata
      `${cleanTitle}`                                             // 4: Last-ditch title alone
    ];

    if (mode === "research") {
      console.log(`[YouTube Search] Research mode activated for: "${artist} - ${title}"`);
      // Gather top candidates from the first two queries
      let allCandidates: any[] = [];
      for (const searchQuery of possibleQueries.slice(0, 2)) {
        try {
          const results = await YouTube.search(searchQuery, { 
            limit: 5,
            type: "video",
            requestOptions: {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Cookie": "SOCS=CAEQAw; CONSENT=YES+cb",
                "Accept-Language": "en-US,en;q=0.9"
              }
            } 
          });
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
              thumbnailUrl: bestChoice.thumbnail?.url || `https://img.youtube.com/vi/${bestChoice.id}/mqdefault.jpg`
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
          thumbnailUrl: primeVideo.thumbnail?.url || `https://img.youtube.com/vi/${primeVideo.id}/mqdefault.jpg`
        });
      }
    }

    const activeQueries = mode === "fast" ? possibleQueries.slice(0, 1) : possibleQueries;

    let primeVideoId: string | null = null;
    let videoTitle: string = `${artist} - ${title}`;
    let primeThumbnailUrl: string | null = null;

    // Iterate through waterfall search queries until a non-short videoId is located
    for (const searchQuery of activeQueries) {
      console.log(`[YouTube Search] Querying: "${searchQuery}" (Original: "${artist} - ${title}")`);

      try {
        const candidates = await YouTube.search(searchQuery, { 
          limit: 5,
          type: "video",
          requestOptions: {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Cookie": "SOCS=CAEQAw; CONSENT=YES+cb",
              "Accept-Language": "en-US,en;q=0.9"
            }
          }
        });

        // Prioritize non-shorts first helper
        const nonShorts = candidates.filter(c => c.duration > 75000);

        if (nonShorts.length > 0) {
          primeVideoId = nonShorts[0].id!;
          videoTitle = nonShorts[0].title!;
          primeThumbnailUrl = nonShorts[0].thumbnail?.url || `https://img.youtube.com/vi/${primeVideoId}/mqdefault.jpg`;
          break; // Located a satisfactory FULL-LENGTH video match! Exit loop.
        } else if (candidates.length > 0 && !primeVideoId) {
          // Keep a backup video (which might be a short or clip) just in case no query returns a full video song
          primeVideoId = candidates[0].id!;
          videoTitle = candidates[0].title!;
          primeThumbnailUrl = candidates[0].thumbnail?.url || `https://img.youtube.com/vi/${primeVideoId}/mqdefault.jpg`;
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
      thumbnailUrl: primeThumbnailUrl
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
    if (!title || !artist) {
      return res.status(400).json({ error: "Track title and artist are required" });
    }

    const { cleanArtist, cleanTitle } = cleanQueryTerm(artist, title);
    const searchQuery = `${cleanArtist} ${cleanTitle}`;
    console.log(`[YouTube Suggestions] Fetching candidates for: "${searchQuery}"`);

    const candidates = await YouTube.search(searchQuery, { 
      limit: 10,
      type: "video",
      requestOptions: {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Cookie": "SOCS=CAEQAw; CONSENT=YES+cb",
          "Accept-Language": "en-US,en;q=0.9"
        }
      }  
    });

    const formattedCandidates = candidates.map(c => ({
      videoId: c.id,
      title: c.title,
      artistName: c.channel?.name || "Unknown Channel",
      duration: c.durationFormatted,
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
