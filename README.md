# SyncBridge Pro

SyncBridge Pro is an intelligent, full-stack web application designed to bridge the gap between music platforms. It allows users to effortlessly translate public **Spotify Playlists** into custom aggregated **YouTube Playlists and Video queues** with zero manual tracking, redundant searches, or mandatory API credentials.

---

## ⚡ How It Works Under the Hood

SyncBridge Pro operates using a sophisticated five-part extraction and lookup pipeline designed for high accuracy, exceptional speed, and zero platform friction.

### 1. Public Embed Scraping (By-Passing API Gatekeepers)
Traditional playlist converters require complex Spotify Developer credentials, Client IDs, and OAuth redirects just to read basic song titles. SyncBridge Pro bypasses this entirely:
* **The Process**: When you enter a Spotify playlist link, the server extracts its unique 22-character playlist ID.
* **The Fetch**: It requests the public **Spotify Embed Page** (`https://open.spotify.com/embed/playlist/<id>`) using a standard web agent. This returns clean, raw markup containing the tracks without triggering authentication prompts.

### 2. Structured AI Extraction (Gemini 2.5 Flash)
Once the raw embed document is fetched, the server cleans heavy scripts and tags, passing the readable text to the modern **Gemini 2.5 Flash** model with a strict JSON-Schema constraint.
* **Extraction**: Gemini translates the visual elements of the scraper into a perfectly structured JSON array.
* **Metadata Integrity**: It extracts the exact, ordered sequence of the track listing, retaining metadata such as **Title**, **Artist/Producer**, **Album Name**, **Duration**, and **Artwork Image URL**.

### 3. Suffix Cleaning & Term Normalization
To prevent YouTube search engines from getting confused by live performance dates, remasters, or comma-separated collabs, SyncBridge Pro runs an automated regex-based cleaning algorithm on each track's metadata:
* **Collabs**: Strips comma-separated secondary artists, ampersands, or "featuring/feat" tags to prioritize the lead vocalist.
* **Noisy Suffixes**: Drastically cleanses titles by stripping standard terms such as `[Remastered]`, `(Live)`, `(Acoustic)`, `- Single Version`, `- Radio Edit`, and copyright years (e.g., `- 2018 remaster`).
* **Waterfalls**: Constructs a tiered backup sequence of queries from most specific (`Clean Artist + Clean Title`) to broadest (`Raw Title Only`).

### 4. Dual Matching Engines
For matching tracks with their corresponding YouTube videos, the application features two sophisticated lookup pipelines:
* **Fast Match Mode** (Optimized for speed):
  * Queries YouTube directly via `youtube-sr`.
  * Runs an automatic duration validator (filtering out short clips and YouTube Shorts under 75 seconds).
  * Automatically matches the primary full-length track or video upload instantly.
* **Deep Research Mode** (Optimized for accuracy):
  * Queries YouTube across multiples of the waterfall tiers.
  * Filters out invalid clip durations and YouTube Shorts.
  * Consolidates and sends candidates to **Gemini 2.5 Flash**.
  * Gemini conducts a semantic audit: matching against official channels/VEVO accounts, checking typical track length ratios, and avoiding unofficial live covers or speed-up edits to pick the **Perfect Match**.

### 5. Instant Alternatives & Intelligent Correction
Sometimes, secondary remixes or live versions are preferred. Every track has secondary choices built into the app's interface:
* The user can open the alternative suggestion panel to lookup 5 alternative matches on YouTube.
* Candidates are processed dynamically, letting users swap, replace, search custom terms, or play individual tracks instantly within the application.

---

## 🎵 Playback, Audio, & Auto-Play Features

We have built dedicated features to guarantee smooth audio playback and full-queue streaming:

### 📀 Play Entire Playlist Option
* A prominent **"Play Entire Playlist"** action button has been added directly under the Spotify playlist header cards.
* Clicking this button automatically queues and plays the entire translated sequence from the very first track in the queue, handling seamless tracking and autoplaying subsequent tracks.

### 🔊 Bypassing Sandbox Iframe Audio Restrictions
* **The Limitation**: Modern browsers (Chrome, Safari, Edge, etc.) run strict autoplay block security mechanisms when an application runs inside a nested sandboxed iframe (such as developing in AI Studio, preview tools, or inline frames). As a result, the browser prevents the hidden/underlying YouTube audio stream from automatically playing sound.
* **The Solution**: SyncBridge Pro automatically detects if it is running inside an iframe. If detected, it displays an elegant **floating alert** and a dedicated **"Open in New Tab"** button at the bottom-right control drawer.
* Clicking **"Open in New Tab"** launches the app in a primary browser context. In a standard top-level tab, the browser grants full audio execution instantly, enabling you to hear premium audio, adjust volume sliders, and autoplay subsequent songs perfectly!
* **Production Build Note**: Once you commit and push to your production environment (running outside of development frames, as a primary root application), the audio and autoplay features will operate normally from the main page.

---

## 🛠️ Technical Stack & Architecture

### **Frontend (SPA/Client-Side)**
* **Environment**: React 18+ powered by Vite.
* **Styling**: Tailwind CSS utility design.
* **Icons**: Elegant vectors imported with `lucide-react`.
* **State Management**: Durable state layers managing full tracklist feedback, playback streams, and active indices.
* **Authentication**: Firebase Authentication with Google Auth integration.

### **Backend (Express Server)**
* **Server Framework**: Node.js & Express.
* **AI Engine**: `@google/genai` SDK using `gemini-2.5-flash`.
* **Music Discovery**: Robust scraper coupled with `youtube-sr` for automated video querying.
* **Persistence**: Synchronized Google account playlist storage securely powered by **Google Cloud Firestore**.

---

## 🚀 Preparing and Deploying to Vercel

SyncBridge Pro is fully optimized for **Vercel** serverless environments. The React frontend is deployed to Vercel's Edge CDN, while the Node/Express backend serves request flows through Vercel Serverless Functions.

### **Step 1: Push code to GitHub**
Commit the repository files and push them to your GitHub profile.

### **Step 2: Connect the Project to Vercel**
1. Log in to [Vercel](https://vercel.com) and click **Add New... > Project**.
2. Select and import your GitHub repository.

### **Step 3: Configure Build & Deployment Settings**
Vercel's build engine will automatically identify the Vite structure:
* **Framework Preset**: `Vite`
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* **Install Command**: `npm install` (default)

### **Step 4: Configure Serverless Environment Variables**
Navigate to the deployment settings, expand **Environment Variables**, and define your server-side keys:
* `GEMINI_API_KEY`: Your official Google AI Studio API key (used to run Gemini 2.5 Flash).

### **Step 5: Click Deploy 🎉**
Vercel completes the build pipeline, sets up routing rewrites via `vercel.json`, and deploys both static and serverless components globally.

---

## 📂 Configuration Mapping Files

* **`vercel.json`**: Establishes API rewrite proxies, routing matches to `/api/(.*)` into `api/index.ts`, and redirects client browser routes to Vite's static index.
* **`api/index.ts`**: The official Serverless entry point containing the full full-stack Express app inside a single, zero-dependency directory. Conditionally disables physical `app.listen()` port biddings if running in serverless environments (`process.env.VERCEL`), allowing Vercel functions to execute routes raw.
