const { GoogleGenAI } = require("@google/genai");

async function debugSpotify() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not defined in environment");
    return;
  }

  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const trackId = "1u8cAY277Y2vCEv679g6";
  const targetUrl = `https://open.spotify.com/track/${trackId}`;
  
  console.log("Querying Gemini with Search Grounding for Spotify track:", targetUrl);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Find the song title, artist/singer name, album name, and estimated duration in milliseconds for this Spotify track: ${targetUrl}. Return your output strictly as a JSON object conforming to: {"title": "Song Title", "artist": "Artist Name", "album": "Album Name", "durationMs": 180000}`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    console.log("Gemini Response Text:", response.text);
  } catch (error) {
    console.error("Gemini call failed:", error);
  }
}

debugSpotify();
