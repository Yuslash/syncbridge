import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK with User-Agent telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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

  // If we found script content, use that (it usually has the clean complete JSON)
  if (scriptContent) {
    return scriptContent.substring(0, 35000);
  }

  // Fallback: strip tags and keep text
  let fallbackText = clean.replace(/<[^>]+>/g, ' ');
  fallbackText = fallbackText.replace(/\s+/g, ' ');
  return fallbackText.substring(0, 25000);
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
    // Handles: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGsy3985?si=... or open.spotify.com/playlist/37i9... or spotify/playlist/...
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

    // Clean html content to keep it concise for processing
    const cleanContent = cleanSpotifyHtml(html);

    console.log(`[Spotify Engine] Calling Gemini to parse track list cleanly...`);

    // Use Gemini Structured JSON response to extract details
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Extract the tracklist details in exact track order from this Spotify Playlist embed snippet.
Keep the original sequence. Find the track name, artist/producer, album Name, duration, and artwork image URL if available.

Source snippet:
${cleanContent}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            playlistName: { type: Type.STRING, description: "Name of the playlist" },
            playlistDescription: { type: Type.STRING, description: "Description or tags of the playlist" },
            tracks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Title of the song" },
                  artist: { type: Type.STRING, description: "Full artist name(s)" },
                  album: { type: Type.STRING, description: "Album name (optional)" },
                  durationMs: { type: Type.INTEGER, description: "Duration in milliseconds (optional)" },
                  artworkUrl: { type: Type.STRING, description: "Smal lcover/album artwork URL if present" },
                },
                required: ["title", "artist"],
              }
            }
          },
          required: ["playlistName", "tracks"]
        }
      }
    });

    const parsedJson = JSON.parse(geminiResponse.text!.trim());
    return res.json({
      playlistName: parsedJson.playlistName || "Imported Playlist",
      playlistDescription: parsedJson.playlistDescription || "",
      tracks: parsedJson.tracks || []
    });

  } catch (error: any) {
    console.error("[Spotify Engine Error]", error);
    return res.status(500).json({ error: error.message || "An error occurred while parsing the Spotify playlist." });
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
 * YouTubeVideoCandidate interface representation.
 */
interface YouTubeVideoCandidate {
  videoId: string;
  title: string;
  artistName: string;
  duration: string;
  thumbnailUrl: string;
  videoUrl: string;
  isShort: boolean;
}

/**
 * Extracts and cleans video candidates from raw YouTube HTML search results using a fast chunking splitter.
 * Detects whether a candidate is a YouTube Short or a teaser (< 75 seconds).
 */
function parseVideosFromHtml(html: string): YouTubeVideoCandidate[] {
  const candidates: YouTubeVideoCandidate[] = [];
  const chunks = html.split('"videoRenderer":{');

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Extract video ID
    const videoIdMatch = chunk.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    if (!videoIdMatch) continue;
    const videoId = videoIdMatch[1];

    if (["youtube_logo", "svg_graphics", "pixel_spacer"].includes(videoId)) continue;

    // Extract Title cleanly
    let title = "";
    const titleMatch = chunk.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/);
    if (titleMatch) {
      title = titleMatch[1];
    } else {
      const labelMatch = chunk.match(/"accessibilityData"\s*:\s*\{\s*"label"\s*:\s*"([^"]+)"/);
      if (labelMatch) {
        title = labelMatch[1];
      } else {
        const simpleTitleMatch = chunk.match(/"title"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
        title = simpleTitleMatch ? simpleTitleMatch[1] : `YouTube Video (${videoId})`;
      }
    }

    // Decode unicode escaping & backslash escapes
    title = title
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, '&')
      .replace(/\\u0027/g, "'")
      .replace(/\\/g, '')
      .trim();

    // Extract Channel Name / Artist
    let artistName = "YouTube Channel";
    const channelMatch = chunk.match(/"ownerText"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/);
    if (channelMatch) {
      artistName = channelMatch[1];
    } else {
      const bylineMatch = chunk.match(/"shortBylineText"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/);
      if (bylineMatch) {
        artistName = bylineMatch[1];
      }
    }

    artistName = artistName
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, '&')
      .replace(/\\u0027/g, "'")
      .replace(/\\/g, '')
      .trim();

    // Extract Length / Duration
    let duration = "";
    const durationMatch = chunk.match(/"lengthText"\s*:\s*\{\s*"accessibility"\s*:\s*\{[^}]+\},\s*"simpleText"\s*:\s*"([^"]+)"/);
    if (durationMatch) {
      duration = durationMatch[1];
    } else {
      const simpleLenMatch = chunk.match(/"lengthText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
      if (simpleLenMatch) {
        duration = simpleLenMatch[1];
      }
    }

    // Determine if candidate is a short, a teaser, or a clip
    let isShortMatch = false;
    const titleLower = title.toLowerCase();
    
    // Explicit keywords
    if (
      titleLower.includes("#shorts") || 
      titleLower.includes("shorts") || 
      titleLower.includes("tik tok") || 
      titleLower.includes("tiktok") || 
      titleLower.includes("reel") ||
      titleLower.includes("status video")
    ) {
      isShortMatch = true;
    }

    // Short duration check (less than 1 minute 15 seconds is very likely a Short or clip, not a full song)
    if (duration) {
      const parts = duration.split(":");
      if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        if (!isNaN(minutes)) {
          const totalSeconds = minutes * 60 + (isNaN(seconds) ? 0 : seconds);
          if (totalSeconds < 75) {
            isShortMatch = true;
          }
        }
      } else if (parts.length === 1) {
        const seconds = parseInt(parts[0], 10);
        if (!isNaN(seconds) && seconds < 75) {
          isShortMatch = true;
        }
      }
    }

    candidates.push({
      videoId,
      title,
      artistName,
      duration,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      isShort: isShortMatch
    });
  }

  return candidates;
}

/**
 * Searches YouTube recursively for songs and returns top results using public YouTube scraping.
 * Automatically filters out YouTube Shorts and short clip durations.
 */
app.post("/api/search-youtube", async (req, res): Promise<any> => {
  try {
    const { title, artist } = req.body;
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

    let primeVideoId: string | null = null;
    let videoTitle: string = `${artist} - ${title}`;
    let backupVideo: YouTubeVideoCandidate | null = null;

    // Iterate through waterfall search queries until a non-short videoId is located
    for (const searchQuery of possibleQueries) {
      console.log(`[YouTube Search] Querying: "${searchQuery}" (Original: "${artist} - ${title}")`);
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

      try {
        const response = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
            "Accept-Language": "en-US,en;q=0.9"
          }
        });

        if (!response.ok) continue;

        const htmlContent = await response.text();
        const candidates = parseVideosFromHtml(htmlContent);

        // Prioritize non-shorts first helper
        const nonShorts = candidates.filter(c => !c.isShort);

        if (nonShorts.length > 0) {
          primeVideoId = nonShorts[0].videoId;
          videoTitle = nonShorts[0].title;
          break; // Located a satisfactory FULL-LENGTH video match! Exit loop.
        } else if (candidates.length > 0 && !backupVideo) {
          // Keep a backup video (which might be a short or clip) just in case no query returns a full video song
          backupVideo = candidates[0];
        }
      } catch (err) {
        console.warn(`[YouTube Search Retry Warning] Call to "${searchQuery}" failed. Retrying next tier.`, err);
      }
    }

    // Fall back to backup matcher if no full song was matched across all progressive tiers
    if (!primeVideoId && backupVideo) {
      primeVideoId = backupVideo.videoId;
      videoTitle = backupVideo.title;
      console.log(`[YouTube Search] Falling back to backup matched short/clip ID: ${primeVideoId}`);
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
      thumbnailUrl: `https://img.youtube.com/vi/${primeVideoId}/mqdefault.jpg`
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

    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      throw new Error("Failed to scan YouTube results.");
    }

    const html = await response.text();
    const candidates = parseVideosFromHtml(html);

    // Prioritize non-shorts to top positions, but keep shorts at bottom of list if not enough results
    const nonShorts = candidates.filter(c => !c.isShort);
    const shorts = candidates.filter(c => c.isShort);

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
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server starting on http://localhost:${PORT}`);
  });
}

startServer();
