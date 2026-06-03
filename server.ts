import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { YouTube } from "youtube-sr";

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
      model: "gemini-2.5-flash",
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
          const geminiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
               responseMimeType: "application/json",
               responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                     bestVideoId: { type: Type.STRING, description: "The ID of the best video match, or null" }
                  }
               }
            }
          });
          const parsedGemini = JSON.parse(geminiResponse.text!.trim());
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
            console.error("[YouTube Search Gemini Error] Falling back to standard pick", err);
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
