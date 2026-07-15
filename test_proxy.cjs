async function testProxy() {
  const playlistId = "37i9dQZF1DXcBWIGsy3985"; // Hot Hits Indonesia or popular playlist
  const targetUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://open.spotify.com/embed/playlist/${playlistId}`)}`;
  
  console.log("Fetching via AllOrigins proxy:", targetUrl);
  try {
    const response = await fetch(targetUrl);
    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Keys in data:", Object.keys(data));
    const html = data.contents;
    console.log("HTML length:", html?.length || 0);
    
    // Try to parse using regex
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let found = false;
    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1];
      if (content.includes("__NEXT_DATA__") || content.includes("initial-state")) {
        console.log("Found JSON hydration script! Length:", content.length);
        found = true;
      }
    }
    if (!found) {
      console.log("Could not find json scripts in HTML snippet");
    }
  } catch (err) {
    console.error("Proxy fetch failed:", err);
  }
}

testProxy();
