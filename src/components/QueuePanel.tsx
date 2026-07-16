import React, { useState } from "react";
import { 
  Music, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Plus, 
  Search, 
  Loader2, 
  Clipboard, 
  Zap, 
  Play, 
  ListOrdered, 
  Layers, 
  GripVertical,
  Settings,
  Sliders,
  RotateCcw,
  Check,
  Copy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MatchedTrack, cleanYouTubeMetadata } from "../types";

interface QueuePanelProps {
  queue: MatchedTrack[];
  setQueue: React.Dispatch<React.SetStateAction<MatchedTrack[]>>;
  previousTracks: MatchedTrack[];
  setPreviousTracks: React.Dispatch<React.SetStateAction<MatchedTrack[]>>;
  onPlayNextImmediate: (track: MatchedTrack) => void;
  onPlayPreviousTrack: (track: MatchedTrack) => void;
  currentPlayingTrack: MatchedTrack | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  isAmbientFocusMode?: boolean;
}



export function QueuePanel({ 
  queue, 
  setQueue, 
  previousTracks, 
  setPreviousTracks, 
  onPlayNextImmediate, 
  onPlayPreviousTrack, 
  currentPlayingTrack,
  isPlaying,
  setIsPlaying,
  isAmbientFocusMode = false
}: QueuePanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Sorting Modes: 'drag' or 'number'
  const [isNumberedMode, setIsNumberedMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  interface DominantTheme {
    primary: string;
    secondary: string;
    rgb: string;
  }

  const [dominantTheme, setDominantTheme] = useState<DominantTheme>({
    primary: "#ec4899",
    secondary: "#8b5cf6",
    rgb: "236, 72, 153"
  });
  const dominantThemeRef = React.useRef(dominantTheme);

  React.useEffect(() => {
    dominantThemeRef.current = dominantTheme;
  }, [dominantTheme]);

  React.useEffect(() => {
    if (!currentPlayingTrack) return;

    // Fast deterministic hash-based premium colors as a reliable fallback/immediate result
    let hash = 0;
    const str = (currentPlayingTrack.title || "") + (currentPlayingTrack.artist || "") + (currentPlayingTrack.artworkUrl || "");
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const absHash = Math.abs(hash);
    const PREMIUM_PALETTES = [
      { primary: "#ec4899", secondary: "#8b5cf6", rgb: "236, 72, 153" }, // Cyber Purple
      { primary: "#3b82f6", secondary: "#1d4ed8", rgb: "59, 130, 246" }, // Electric Blue
      { primary: "#10b981", secondary: "#06b6d4", rgb: "16, 185, 129" }, // Jade Aurora
      { primary: "#f97316", secondary: "#ef4444", rgb: "249, 115, 22" },  // Coral Flare
      { primary: "#a855f7", secondary: "#3b82f6", rgb: "168, 85, 247" }, // Orchid Fusion
      { primary: "#f43f5e", secondary: "#be123c", rgb: "244, 63, 94" },  // Ruby Velvet
      { primary: "#06b6d4", secondary: "#3b82f6", rgb: "6, 182, 212" },  // Cyan Electric
      { primary: "#84cc16", secondary: "#10b981", rgb: "132, 204, 22" }, // Lime Aurora
      { primary: "#eab308", secondary: "#f97316", rgb: "234, 179, 8" },  // Solar Gold
      { primary: "#d946ef", secondary: "#c084fc", rgb: "217, 70, 239" }, // Neon Amethyst
      { primary: "#14b8a6", secondary: "#0f766e", rgb: "20, 184, 166" }, // Teal Abyss
      { primary: "#6366f1", secondary: "#a855f7", rgb: "99, 102, 241" }  // Indigo Prism
    ];
    const fallback = PREMIUM_PALETTES[absHash % PREMIUM_PALETTES.length];

    const imgUrl = currentPlayingTrack.artworkUrl;
    if (!imgUrl) {
      setDominantTheme(fallback);
      return;
    }

    // Attempt dynamically extracting the actual dominant color of the cover art
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setDominantTheme(fallback);
          return;
        }
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          const brightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
          // Look for vibrant pixels
          if (brightness > 30 && brightness < 225) {
            r += pr;
            g += pg;
            b += pb;
            count++;
          }
        }

        if (count === 0) {
          setDominantTheme(fallback);
          return;
        }

        let avgR = Math.round(r / count);
        let avgG = Math.round(g / count);
        let avgB = Math.round(b / count);

        // Boost vibrancy and ensure colors never blend into the dark background (minimum peak component is 185)
        const maxVal = Math.max(avgR, avgG, avgB);
        if (maxVal < 185) {
          const factor = 185 / (maxVal || 1);
          avgR = Math.min(255, Math.round(avgR * factor));
          avgG = Math.min(255, Math.round(avgG * factor));
          avgB = Math.min(255, Math.round(avgB * factor));
        }

        // Avoid letting the colors wash out into flat white, preserve rich saturation
        const minVal = Math.min(avgR, avgG, avgB);
        if (minVal > 150) {
          if (avgR === minVal) avgR = Math.round(avgR * 0.5);
          if (avgG === minVal) avgG = Math.round(avgG * 0.5);
          if (avgB === minVal) avgB = Math.round(avgB * 0.5);
        }

        const hex = (c: number) => c.toString(16).padStart(2, "0");
        const primaryHex = `#${hex(avgR)}${hex(avgG)}${hex(avgB)}`;

        // Create a highly distinct, vibrant, and visible secondary accent color (channel-shifted for harmony)
        let secR = avgG;
        let secG = avgB;
        let secB = avgR;
        const maxSec = Math.max(secR, secG, secB);
        if (maxSec < 155) {
          const factor = 155 / (maxSec || 1);
          secR = Math.min(255, Math.round(secR * factor));
          secG = Math.min(255, Math.round(secG * factor));
          secB = Math.min(255, Math.round(secB * factor));
        }
        const secondaryHex = `#${hex(secR)}${hex(secG)}${hex(secB)}`;

        setDominantTheme({
          primary: primaryHex,
          secondary: secondaryHex,
          rgb: `${avgR}, ${avgG}, ${avgB}`
        });
      } catch (err) {
        console.warn("CORS/Security prevented canvas reading for thumbnail, using premium fallback instead", err);
        setDominantTheme(fallback);
      }
    };
    img.onerror = () => {
      setDominantTheme(fallback);
    };
    img.src = imgUrl;
  }, [currentPlayingTrack]);

  // Persistent Spectrum Visibility Option
  const [showSpectrum, setShowSpectrum] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('syncbridge_show_spectrum');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const showSpectrumRef = React.useRef(showSpectrum);
  React.useEffect(() => {
    showSpectrumRef.current = showSpectrum;
    localStorage.setItem('syncbridge_show_spectrum', showSpectrum.toString());
  }, [showSpectrum]);

  // Detect mobile view to dynamically adjust alignment
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 640;
    }
    return false;
  });

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Satisfied, final-tuned player position constants (from User Satisfied Tuning)
  const debugTop = -3.6;
  const debugX = isMobile ? 8 : -20;
  const debugY = 0;
  const debugScale = 1.0;
  const debugVinylScale = 1.0;

  // Rotational physics & Interaction Refs
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const vinylRef = React.useRef<HTMLDivElement>(null);
  const vinylImageRef = React.useRef<HTMLImageElement>(null);
  const rotationRef = React.useRef(0);
  const isDraggingRef = React.useRef(false);
  const startAngleRef = React.useRef(0);
  const startRotationRef = React.useRef(0);
  const velocityRef = React.useRef(0.4);
  const isPlayingRef = React.useRef(isPlaying);
  const mouseRef = React.useRef<{ x: number; y: number; isOver: boolean }>({ x: 0, y: 0, isOver: false });

  // Spark physics particle array
  interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    alpha: number;
    life: number;
    maxLife: number;
  }
  const sparksRef = React.useRef<Spark[]>([]);

  React.useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      velocityRef.current = 0.5;
    }
  }, [isPlaying]);

  const spawnSparks = React.useCallback((x: number, y: number, count: number) => {
    const themeColors = dominantThemeRef.current;
    const colors = [
      themeColors.primary,
      themeColors.secondary,
      "#ffffff"
    ];

    const sparks = sparksRef.current;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        size: 1 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 0,
        maxLife: 30 + Math.floor(Math.random() * 30)
      });
    }
  }, []);

  const lastAngleRef = React.useRef(0);
  const lastTimeRef = React.useRef(0);

  const handleVinylPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    
    startAngleRef.current = angle;
    startRotationRef.current = rotationRef.current;
    lastAngleRef.current = angle;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;

    const canvas = canvasRef.current;
    if (canvas) {
      const canvasRect = canvas.getBoundingClientRect();
      const clickX = e.clientX - canvasRect.left;
      const clickY = e.clientY - canvasRect.top;
      spawnSparks(clickX, clickY, 22);
    }
  };

  const handleVinylPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    
    const diff = currentAngle - startAngleRef.current;
    rotationRef.current = startRotationRef.current + (diff * 180) / Math.PI;

    const now = performance.now();
    const dt = now - lastTimeRef.current;
    if (dt > 10) {
      let angleDiff = currentAngle - lastAngleRef.current;
      if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      velocityRef.current = (angleDiff * 180 / Math.PI) * (16.7 / dt);
      
      lastAngleRef.current = currentAngle;
      lastTimeRef.current = now;
    }

    const canvas = canvasRef.current;
    if (canvas && Math.random() < 0.5) {
      const canvasRect = canvas.getBoundingClientRect();
      const dragX = e.clientX - canvasRect.left;
      const dragY = e.clientY - canvasRect.top;
      spawnSparks(dragX, dragY, 3);
    }
  };

  const handleVinylPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDraggingRef.current = false;
    velocityRef.current = Math.max(-12, Math.min(12, velocityRef.current));
  };

  // Canvas interaction events
  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      isOver: true
    };
  };

  const handlePointerLeave = () => {
    mouseRef.current.isOver = false;
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnSparks(x, y, 16);
  };

  // Canvas loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Smoothed values to ensure incredible buttery transitions and absolute elimination of flickering/shaking
    let smoothedData: Float32Array | null = null;
    let smoothedVolume = 0;
    let smoothedBass = 0;
    let smoothedTreble = 0;

    const render = () => {
      time += 1;
      const colors = dominantThemeRef.current;

      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      const playing = isPlayingRef.current;
      
      // 0. Extract real-time frequency analysis data from Web Audio Analyser Node
      let realVolume = 0;
      let bassAvg = 0;
      let trebleAvg = 0;
      let realData: Uint8Array | null = null;

      try {
        const analyser = (window as any).__syncbridge_analyser;
        if (analyser) {
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(dataArray);
          
          realData = dataArray;
          
          let sum = 0;
          let bassSum = 0;
          let trebleSum = 0;
          const bassBound = Math.floor(bufferLength * 0.15) || 2;
          const trebleBound = Math.floor(bufferLength * 0.6) || 40;

          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
            if (i < bassBound) bassSum += dataArray[i];
            if (i > trebleBound) trebleSum += dataArray[i];
          }

          realVolume = sum / bufferLength;
          bassAvg = bassSum / bassBound;
          trebleAvg = trebleSum / (bufferLength - trebleBound);
        }
      } catch (e) {
        // Silent CORS/API fallback
      }

      // If the audio source is CORS-blocked or silent (or zero volume) but playing is true,
      // we generate an extremely sensitive, beautiful simulated spectrum!
      const isSimulated = playing && realVolume <= 1;
      if (isSimulated) {
        // Build a simulated high-sensitivity realData array
        const simulatedLength = 128;
        const fakeData = new Uint8Array(simulatedLength);
        
        // Use a dynamic BPM-aligned beat simulation (128 BPM)
        const bpm = 128;
        const bps = bpm / 60; // beats per second
        const seconds = time / 60; // approximate frame-based seconds
        const beatProgress = (seconds * bps) % 1;
        
        // Base rhythmic pulse (high intensity at start of beat)
        const beatWeight = Math.pow(1 - beatProgress, 2.5); // sharp peak then decay
        const bassPulse = beatWeight * 220 + 35; // high sensitivity base
        const treblePulse = (Math.sin(time * 0.15) * 0.3 + 0.7) * (beatProgress < 0.2 ? 180 : 40) + (Math.sin(time * 0.3) * 0.5 + 0.5) * 45;
        
        // Populate fake spectrum bins with organic noise and rhythm (no Math.random() for 100% flicker-free output!)
        for (let i = 0; i < simulatedLength; i++) {
          const ratio = i / simulatedLength;
          let baseVal = 0;
          if (ratio < 0.2) {
            // Bass frequencies with smooth trigonometric noise
            const noiseLow = (Math.sin(time * 0.12 + i * 0.3) + Math.cos(time * 0.08 + i * 0.7)) * 10;
            baseVal = bassPulse * (1 - ratio * 4) + noiseLow;
          } else if (ratio < 0.6) {
            // Mids with smooth trigonometric noise
            const noiseMid = (Math.sin(time * 0.15 + i * 0.5) + Math.cos(time * 0.1 + i * 0.9)) * 8;
            baseVal = (Math.sin(time * 0.08 + ratio * 10) * 0.5 + 0.5) * 90 + noiseMid + (bassPulse * 0.2);
          } else {
            // Treble / Highs with smooth trigonometric noise
            const noiseHigh = (Math.sin(time * 0.2 + i * 0.8) + Math.cos(time * 0.14 + i * 1.2)) * 12;
            baseVal = treblePulse * Math.pow(1 - ratio, 2) + noiseHigh;
          }
          fakeData[i] = Math.max(0, Math.min(255, baseVal));
        }
        
        realData = fakeData;
        
        // Compute averages from simulated data with extreme sensitivity
        let sum = 0;
        let bassSum = 0;
        let trebleSum = 0;
        const bassBound = Math.floor(simulatedLength * 0.15) || 2;
        const trebleBound = Math.floor(simulatedLength * 0.6) || 40;

        for (let i = 0; i < simulatedLength; i++) {
          sum += fakeData[i];
          if (i < bassBound) bassSum += fakeData[i];
          if (i > trebleBound) trebleSum += fakeData[i];
        }

        realVolume = sum / simulatedLength;
        bassAvg = bassSum / bassBound;
        trebleAvg = trebleSum / (simulatedLength - trebleBound);
      } else if (playing && realVolume > 1) {
        // Real audio is present! Let's boost the real volume and averages to have EXTREME sensitivity
        realVolume = Math.min(255, realVolume * 2.5);
        bassAvg = Math.min(255, bassAvg * 2.5);
        trebleAvg = Math.min(255, trebleAvg * 2.5);
        
        if (realData) {
          const boostedData = new Uint8Array(realData.length);
          for (let i = 0; i < realData.length; i++) {
            boostedData[i] = Math.min(255, realData[i] * 2.5);
          }
          realData = boostedData;
        }
      }

      // Smooth the raw realData to prevent any rapid visual frame-to-frame flickering
      if (realData) {
        if (!smoothedData || smoothedData.length !== realData.length) {
          smoothedData = new Float32Array(realData.length);
          for (let i = 0; i < realData.length; i++) {
            smoothedData[i] = realData[i];
          }
        } else {
          // Butter-smooth interpolation (0.25 reacts very fast but eliminates all harsh high-frequency flicker/jitter)
          const k = 0.25;
          for (let i = 0; i < realData.length; i++) {
            smoothedData[i] = smoothedData[i] * (1 - k) + realData[i] * k;
          }
        }
      }

      // Smooth the volume metrics over time as well
      const rate = 0.2;
      smoothedVolume = smoothedVolume * (1 - rate) + realVolume * rate;
      smoothedBass = smoothedBass * (1 - rate) + bassAvg * rate;
      smoothedTreble = smoothedTreble * (1 - rate) + trebleAvg * rate;

      const hasAudio = smoothedVolume > 1;
      const beatIntensity = hasAudio 
        ? 1 + (smoothedBass / 255) * 0.14 
        : (playing ? 1 + Math.sin(time * 0.08) * 0.06 + Math.cos(time * 0.15) * 0.03 : 1);
      
      // Dynamic baseRadius set beautifully (0.335 of canvas width, bringing it closer to the vinyl disk without crowding)
      const baseRadius = width * 0.335;

      const primaryColor = colors.primary;
      const secondaryColor = colors.secondary;

      // 1. Glowing background halo (Only if spectrum option is enabled)
      if (showSpectrumRef.current) {
        ctx.save();
        const glowGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.8, cx, cy, baseRadius * 1.5);
        const intensity = hasAudio ? (smoothedVolume / 255) * 0.45 + 0.15 : (playing ? 0.35 : 0.12);
        glowGrad.addColorStop(0, `rgba(${colors.rgb || "236, 72, 153"}, ${intensity})`);
        glowGrad.addColorStop(0.5, `rgba(${colors.rgb || "236, 72, 153"}, ${intensity * 0.4})`);
        glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2. Spin momentum
      if (!isDraggingRef.current) {
        if (playing) {
          // Dynamic rotational boost on heavy bass beats!
          const rotateSpeedBoost = hasAudio ? (smoothedBass / 255) * 0.25 : 0;
          rotationRef.current += velocityRef.current + rotateSpeedBoost;
          if (velocityRef.current < 0.4) velocityRef.current += 0.01;
          if (velocityRef.current > 0.4) velocityRef.current -= 0.01;
        } else {
          rotationRef.current += velocityRef.current;
          velocityRef.current *= 0.96;
          if (Math.abs(velocityRef.current) < 0.01) velocityRef.current = 0;
        }
      } else {
        rotationRef.current += velocityRef.current;
      }

      // Live rotate DOM
      if (vinylImageRef.current) {
        // Direct vinyl scale adjustment based on audio beat
        const vinylPulseScale = hasAudio ? 1 + (smoothedBass / 255) * 0.03 : 1.0;
        vinylImageRef.current.style.transform = `rotate(${rotationRef.current}deg) scale(${vinylPulseScale})`;
      }

      // 3. Draw circular spectrum (Only if spectrum option is enabled)
      if (showSpectrumRef.current) {
        const wavesCount = 3;
        for (let w = 0; w < wavesCount; w++) {
          ctx.save();
          ctx.beginPath();

          const wavePhase = time * (0.025 + w * 0.012) * (playing ? 1.5 : 0.5);
          const wavePoints = 144;
          
          // Music-reactive wave amplitude with high-sensitivity scaling
          const waveAmplitude = hasAudio
            ? (smoothedVolume / 255) * 55 * (1 - w * 0.2) + 4
            : ((playing ? 18 : 4) * (1 - w * 0.25) * beatIntensity);
            
          const waveBaseRadius = baseRadius + 3 + w * 4;

          let strokeColor = primaryColor;
          if (w === 1) strokeColor = secondaryColor;
          if (w === 2) strokeColor = `rgba(${colors.rgb || "236, 72, 153"}, 0.65)`;

          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = w === 0 ? 3 : (w === 1 ? 2 : 1.5);
          ctx.shadowBlur = w === 0 ? (hasAudio ? 18 : 12) : (w === 1 ? (hasAudio ? 12 : 8) : 6);
          ctx.shadowColor = strokeColor;

          for (let i = 0; i <= wavePoints; i++) {
            const angle = (i / wavePoints) * Math.PI * 2;
            
            // Map individual point around the circle to specific audio frequency bin for high fidelity bending!
            let freqVal = 0;
            if (smoothedData && hasAudio) {
              const binIdx = Math.floor((i / wavePoints) * (smoothedData.length * 0.75));
              freqVal = smoothedData[binIdx] || 0;
            }

            const noiseFactor = Math.sin(angle * (5 + w) + wavePhase) * Math.cos(angle * 3 - wavePhase * 0.7);
            
            // 9-fold symmetrical spike pattern (9 peaks pointing out, 9 troughs pointing in)
            // Combined with a medium-amplitude multiplier to ensure clean, readable, and non-overlapping waves
            const spikeFactor = Math.sin(angle * 9 + wavePhase * 0.8);
            const freqBoost = hasAudio ? (freqVal / 255) * 36 * (1 - w * 0.2) * spikeFactor : 0;
            let currentRadius = waveBaseRadius + (noiseFactor * waveAmplitude) + freqBoost;

            if (mouseRef.current.isOver) {
              const px = cx + Math.cos(angle) * currentRadius;
              const py = cy + Math.sin(angle) * currentRadius;
              const dx = mouseRef.current.x - px;
              const dy = mouseRef.current.y - py;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 45) {
                const force = (45 - dist) / 45;
                currentRadius += force * 14 * Math.sin(time * 0.2);
              }
            }

            const x = cx + Math.cos(angle) * currentRadius;
            const y = cy + Math.sin(angle) * currentRadius;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }

        // 4. Satellite particles
        const numComets = 2;
        for (let c = 0; c < numComets; c++) {
          ctx.save();
          const cometAngle = (time * (0.015 + c * 0.005)) % (Math.PI * 2);
          const cometRadius = baseRadius + 18 + c * 8;
          const cometX = cx + Math.cos(cometAngle) * cometRadius;
          const cometY = cy + Math.sin(cometAngle) * cometRadius;

          const grad = ctx.createRadialGradient(cometX, cometY, 0, cometX, cometY, 6);
          grad.addColorStop(0, "#fff");
          grad.addColorStop(0.3, primaryColor);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cometX, cometY, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 5. Physics Sparks
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.03;
        s.vx *= 0.98;
        s.vy *= 0.98;
        s.life += 1;
        s.alpha = 1 - s.life / s.maxLife;

        if (s.life >= s.maxLife) {
          sparks.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.shadowBlur = 4;
        ctx.shadowColor = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Spark emission frequency & reactivity to bass beats
      const spawnChance = hasAudio ? Math.min(0.4, (smoothedBass / 255) * 0.6) : (playing ? 0.15 : 0);
      if (playing && Math.random() < spawnChance) {
        const angle = Math.random() * Math.PI * 2;
        const spawnRadius = baseRadius + Math.random() * 20;
        const px = cx + Math.cos(angle) * spawnRadius;
        const py = cy + Math.sin(angle) * spawnRadius;
        const speedMultiplier = hasAudio ? 0.4 + (smoothedBass / 255) * 0.8 : 0.4;
        sparks.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * (0.2 + Math.random() * 0.4) * speedMultiplier + (Math.random() - 0.5) * 0.2,
          vy: Math.sin(angle) * (0.2 + Math.random() * 0.4) * speedMultiplier - 0.1,
          size: 1 + Math.random() * (hasAudio ? 2.5 : 1.5),
          color: Math.random() > 0.4 ? primaryColor : secondaryColor,
          alpha: 1,
          life: 0,
          maxLife: 40 + Math.floor(Math.random() * 40)
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [spawnSparks, dominantTheme]);

  const isValidLink = (text: string): boolean => {
    const cleanText = text.trim();
    const isYT = /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(cleanText) || /^[a-zA-Z0-9_-]{11}$/.test(cleanText);
    const isSpotify = /open\.spotify\.com/i.test(cleanText);
    return isYT || isSpotify;
  };

  const handleLinkAdd = async (url: string) => {
    setLoadingLink(true);
    setErrorMsg("");
    setSuggestions([]);

    try {
      const cleanUrl = url.trim();

      if (/open\.spotify\.com\/track\//i.test(cleanUrl)) {
        const response = await fetch("/api/spotify-track-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanUrl }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch Spotify track details");
        }

        const data = await response.json();
        const spotifyTrack = data.track;

        // Fetch YouTube match
        const searchResponse = await fetch("/api/search-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: spotifyTrack.title, artist: spotifyTrack.artist }),
        });

        if (!searchResponse.ok) {
          throw new Error("Failed to find a YouTube match for Spotify track");
        }

        const matchData = await searchResponse.json();
        if (!matchData.videoId) {
          throw new Error("No YouTube match found for this song");
        }

        const track: MatchedTrack = {
          id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: spotifyTrack.title,
          artist: spotifyTrack.artist,
          album: spotifyTrack.album || "",
          durationMs: matchData.durationMs || spotifyTrack.durationMs || 180000,
          artworkUrl: spotifyTrack.artworkUrl || matchData.thumbnailUrl || `https://img.youtube.com/vi/${matchData.videoId}/mqdefault.jpg`,
          videoId: matchData.videoId,
          videoTitle: matchData.videoTitle || spotifyTrack.title,
          videoUrl: matchData.videoUrl,
          thumbnailUrl: matchData.thumbnailUrl,
          status: "matched",
        };

        setQueue(prev => [...prev, track]);
        setInputValue("");
      } else {
        const response = await fetch("/api/youtube-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanUrl }),
        });

        if (!response.ok) {
          throw new Error("Failed to parse YouTube link");
        }

        const data = await response.json();
        const cleaned = cleanYouTubeMetadata(data.title, data.artist);
        const track: MatchedTrack = {
          id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: cleaned.title,
          artist: cleaned.artist,
          durationMs: data.durationMs,
          artworkUrl: data.artworkUrl,
          videoId: data.videoId,
          videoTitle: data.title,
          videoUrl: `https://www.youtube.com/watch?v=${data.videoId}`,
          thumbnailUrl: data.artworkUrl,
          status: "matched",
        };

        setQueue(prev => [...prev, track]);
        setInputValue("");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Could not add link to queue.");
    } finally {
      setLoadingLink(false);
    }
  };

  const handleSearchAdd = async (query: string) => {
    setSearching(true);
    setErrorMsg("");
    try {
      const response = await fetch("/api/youtube-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: query, artist: "" }),
      });

      if (!response.ok) {
        throw new Error("Search request failed.");
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
      if (!data.suggestions || data.suggestions.length === 0) {
        setErrorMsg("No results found.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to search for song.");
    } finally {
      setSearching(false);
    }
  };

  const handleAddToQueueSubmit = async () => {
    setErrorMsg("");
    const val = inputValue.trim();

    if (val && isValidLink(val)) {
      await handleLinkAdd(val);
      return;
    }

    if (val) {
      await handleSearchAdd(val);
      return;
    }

    setErrorMsg("Please enter a song name or paste a song URL to add!");
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const cleaned = cleanYouTubeMetadata(suggestion.title, suggestion.artistName);
    const track: MatchedTrack = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: cleaned.title,
      artist: cleaned.artist,
      durationMs: suggestion.durationMs,
      artworkUrl: suggestion.thumbnailUrl,
      videoId: suggestion.videoId,
      videoTitle: suggestion.title,
      videoUrl: suggestion.videoUrl,
      thumbnailUrl: suggestion.thumbnailUrl,
      status: "matched",
    };
    setQueue(prev => [...prev, track]);
    setSuggestions([]);
    setInputValue("");
  };

  const removeTrack = (id: string) => {
    setQueue(prev => prev.filter(t => t.id !== id));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setQueue(prev => {
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
      return list;
    });
  };

  const moveDown = (index: number) => {
    setQueue(prev => {
      if (index === prev.length - 1) return prev;
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
      return list;
    });
  };

  const handleNumberChange = (index: number, newPositionStr: string) => {
    const targetPos = parseInt(newPositionStr, 10);
    if (isNaN(targetPos) || targetPos < 1) return;
    
    setQueue(prev => {
      const list = [...prev];
      const maxPos = list.length;
      const finalPos = Math.min(targetPos, maxPos);
      const targetIndex = finalPos - 1;
      
      if (index === targetIndex) return prev;

      const [removed] = list.splice(index, 1);
      list.splice(targetIndex, 0, removed);
      return list;
    });
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    setQueue(prev => {
      const list = [...prev];
      const [removed] = list.splice(sourceIndex, 1);
      list.splice(targetIndex, 0, removed);
      return list;
    });
    setDraggedIndex(null);
  };

  if (isAmbientFocusMode) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-[50vh] py-4 transition-all duration-500">
        {currentPlayingTrack ? (
          <div className="luminous-card-container w-full max-w-sm sm:max-w-md scale-105 sm:scale-110 md:scale-115 transition-transform duration-500">
            <input 
              type="checkbox" 
              id="luminous-checkbox" 
              className="luminous-toggle-input" 
              checked={isPlaying} 
              onChange={(e) => setIsPlaying(e.target.checked)} 
            />
            
            <div className="luminous-card mx-auto">
              <div className="luminous-light-layer">
                <div className="luminous-slit"></div>
                <div className="luminous-lumen">
                  <div className="min"></div>
                  <div className="mid"></div>
                  <div className="hi"></div>
                </div>
                <div className="luminous-darken">
                  <div className="sl"></div>
                  <div className="ll"></div>
                  <div className="slt"></div>
                  <div className="srt"></div>
                </div>
              </div>
              
              <div className="luminous-content">
                {/* 3D Floating spinning vinyl record */}
                <div className="luminous-icon">
                  <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-black border border-zinc-800 shadow-[0_15px_35px_rgba(0,0,0,0.8)] flex items-center justify-center p-1.5 overflow-hidden">
                    {currentPlayingTrack.artworkUrl ? (
                      <img
                        src={currentPlayingTrack.artworkUrl}
                        alt={currentPlayingTrack.title}
                        className={`w-full h-full object-cover rounded-full transition-transform select-none ${
                          isPlaying ? "spin-slow" : "spin-slow spin-paused"
                        }`}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Music className="w-10 h-10 text-blue-400" />
                    )}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(255,255,255,0.06)_40%,transparent_50%,rgba(255,255,255,0.08)_60%,transparent_70%)] pointer-events-none rounded-full" />
                    <div className="absolute w-7 h-7 bg-[#09090b] border border-zinc-700 rounded-full flex items-center justify-center pointer-events-none z-10">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>
                </div>
                
                <div className="luminous-bottom">
                  <h3 className="luminous-title" title={currentPlayingTrack.title}>
                    {currentPlayingTrack.title}
                  </h3>
                  <p className="luminous-description" title={currentPlayingTrack.artist}>
                    {currentPlayingTrack.artist}
                  </p>
                  
                  {/* Micro equalizer soundwave bars inside the bottom of the card */}
                  <div className="absolute right-24 bottom-1.5 flex items-end gap-[2px] h-3.5 select-none pointer-events-none">
                    {[1, 2, 3, 4].map((bar, i) => (
                      <motion.span
                        key={i}
                        animate={isPlaying ? { height: [3, 14, 5, 11, 3] } : { height: 3 }}
                        transition={{
                          duration: 0.7 + i * 0.12,
                          repeat: isPlaying ? Infinity : 0,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        }}
                        className="w-[2px] bg-white/45 rounded-full"
                      />
                    ))}
                  </div>

                  <label htmlFor="luminous-checkbox" className="luminous-toggle">
                    <div className="luminous-handle"></div>
                    <div className="luminous-toggle-label">Play / Pause</div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-white/50">
            <Music className="w-12 h-12 text-zinc-500 mx-auto mb-3 animate-pulse" />
            <p className="text-sm font-bold">No active playing track</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="vision-glass rounded-2xl p-4 sm:p-5 md:p-6 shadow-2xl relative flex flex-col gap-4 sm:gap-5 md:gap-6 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-white" /> Playback Queue ({queue.length})
          </h4>
          <p className="text-xs text-white/40 mt-1">
            Build your session queue without leaving the active player workspace.
          </p>
        </div>

        {queue.length > 0 && (
          <div className="flex rounded-xl bg-white/5 p-1 border border-white/10">
            <button
              onClick={() => setIsNumberedMode(false)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                !isNumberedMode ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Drag & Drop
            </button>
            <button
              onClick={() => setIsNumberedMode(true)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                isNumberedMode ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" /> Numbered mode
            </button>
          </div>
        )}
      </div>

      {/* Add To Queue Interactive Input Card */}
      <div className="flex flex-col gap-3.5 bg-white/5 p-4 rounded-2xl border border-white/10">
        <div className="text-xs font-bold text-white/60 uppercase tracking-wider">
          Add Songs to Queue
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
          <div className="relative w-full sm:flex-1 h-11">
            <input
              type="text"
              className="w-full h-full vision-glass-input rounded-xl px-4 pl-10 pr-12 text-xs text-[#fafafa] placeholder-white/30 focus:outline-none transition-all"
              placeholder="Search song name or paste direct URL..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setErrorMsg("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAddToQueueSubmit()}
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) {
                    setInputValue(text);
                    setErrorMsg("");
                  }
                } catch (e) {
                  setErrorMsg("Please paste the link manually.");
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-white/15 hover:bg-white/25 text-white/50 hover:text-white rounded transition-colors"
              title="Paste from clipboard"
            >
              <Clipboard className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleAddToQueueSubmit}
            disabled={searching || loadingLink}
            className="h-11 px-5 bg-white hover:bg-gray-100 text-black text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:shadow-[0_0_25px_rgba(255,255,255,0.45)] transform hover:-translate-y-0.5"
          >
            {searching || loadingLink ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Add to Queue</span>
          </button>
        </div>

        {errorMsg && (
          <div className="text-[11px] text-red-300 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Search Recommendations in Queue */}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="vision-glass-interactive rounded-xl overflow-hidden divide-y divide-white/10 max-h-48 overflow-y-auto"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.videoId}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-3 py-2 hover:bg-white/10 text-left transition-colors flex items-center gap-3 group cursor-pointer"
                >
                  <img
                    src={suggestion.thumbnailUrl}
                    alt={suggestion.title}
                    className="w-8 h-8 object-cover rounded border border-white/10 flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-bold text-white truncate group-hover:text-white/80 transition-colors">
                      {suggestion.title}
                    </h5>
                    <p className="text-[10px] text-white/40 truncate">
                      {suggestion.artistName}
                    </p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-white/40 group-hover:text-white" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History and Active Session Status */}
      {previousTracks.length > 0 && (
        <div className="flex flex-col gap-2.5 pb-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)]" /> Previous Tracks ({previousTracks.length})
            </span>
            <button
              onClick={() => setPreviousTracks([])}
              className="text-[9px] font-bold text-white/30 hover:text-rose-400 uppercase tracking-widest transition-colors cursor-pointer"
            >
              Clear History
            </button>
          </div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {previousTracks.map((track, idx) => (
              <div 
                key={`prev_${track.id}_${idx}`}
                className="flex items-center gap-3 p-2 bg-white/[0.02] hover:bg-white/[0.06] rounded-xl border border-white/[0.03] hover:border-white/[0.08] transition-all group"
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/5 flex-shrink-0 relative">
                  <img
                    src={track.artworkUrl || `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`}
                    alt={track.title}
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    onClick={() => onPlayPreviousTrack(track)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    title="Play track again"
                  >
                    <Play className="w-3 h-3 text-white fill-current" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-white/50 group-hover:text-white transition-colors truncate block">
                    {track.title}
                  </span>
                  <span className="text-[10px] text-white/30 truncate block mt-0.5">
                    {track.artist}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => onPlayPreviousTrack(track)}
                    className="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-blue-400 hover:text-white bg-blue-400/10 hover:bg-blue-400 border border-blue-400/20 hover:border-blue-400 rounded-lg transition-all cursor-pointer"
                  >
                    Play
                  </button>
                  <button
                    onClick={() => setPreviousTracks(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/20 transition-all cursor-pointer flex items-center justify-center"
                    title="Remove from history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentPlayingTrack && (
        <div className="flex flex-col gap-2.5 pb-6 border-b border-white/10 items-center justify-center">
          <div className="flex items-center justify-between w-full select-none mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" /> Currently Playing
            </span>
            <button
              onClick={() => setShowSpectrum(!showSpectrum)}
              className={`text-[9.5px] font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                showSpectrum 
                  ? "bg-blue-400/10 border-blue-400/40 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.15)]" 
                  : "bg-white/5 border-white/10 hover:border-white/30 text-white/60 hover:text-white"
              }`}
              title="Toggle circular audio spectrum visualizer"
            >
              <Layers className="w-3 h-3" />
              <span>{showSpectrum ? "Hide Spectrum" : "Show Spectrum"}</span>
            </button>
          </div>

          {/* Stunning Luminous Card Container */}
          <div className="luminous-card-container w-full max-w-sm sm:max-w-md">
            <input 
              type="checkbox" 
              id="luminous-checkbox" 
              className="luminous-toggle-input" 
              checked={isPlaying} 
              onChange={(e) => setIsPlaying(e.target.checked)} 
            />
            
            <div className="luminous-card mx-auto">
              <div className="luminous-light-layer">
                <div className="luminous-slit"></div>
                <div className="luminous-lumen">
                  <div className="min"></div>
                  <div className="mid"></div>
                  <div className="hi"></div>
                </div>
                <div className="luminous-darken">
                  <div className="sl"></div>
                  <div className="ll"></div>
                  <div className="slt"></div>
                  <div className="srt"></div>
                </div>
              </div>
              
              <div className="luminous-content">
                {/* 3D Floating spinning vinyl record with interactive canvas behind */}
                <div 
                  className="luminous-icon select-none animate-none"
                  style={{
                    top: `${debugTop}rem`,
                    transform: `translate(${debugX}px, ${debugY}px) scale(${debugScale})`,
                    transition: isDraggingRef.current ? "none" : "top 0.1s ease-out, transform 0.1s ease-out"
                  }}
                >
                  <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
                    
                    {/* Dynamic Interactive Audio Waves Spectrum & Particles Canvas */}
                    <canvas
                      ref={canvasRef}
                      width={360}
                      height={360}
                      onMouseMove={handlePointerMove}
                      onMouseDown={handlePointerDown}
                      onMouseLeave={handlePointerLeave}
                      className="absolute inset-0 w-full h-full pointer-events-auto z-0"
                      title="Click around to spawn sparks!"
                    />

                    {/* Fully Tactile Scratchable Vinyl Deck */}
                    <div 
                      ref={vinylRef}
                      onPointerDown={handleVinylPointerDown}
                      onPointerMove={handleVinylPointerMove}
                      onPointerUp={handleVinylPointerUp}
                      onPointerCancel={handleVinylPointerUp}
                      style={{ 
                        touchAction: 'none',
                        transform: `scale(${debugVinylScale})`
                      }}
                      className="relative z-10 w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-[#0a0a0c] border border-zinc-800 shadow-[0_15px_35px_rgba(0,0,0,0.8)] flex items-center justify-center p-1.5 overflow-hidden cursor-grab active:cursor-grabbing group transition-all duration-300 hover:scale-105 hover:border-zinc-700 select-none"
                      title="Drag / swipe to scratch & spin manual-grooves!"
                    >
                      {currentPlayingTrack.artworkUrl ? (
                        <img
                          ref={vinylImageRef}
                          src={currentPlayingTrack.artworkUrl}
                          alt={currentPlayingTrack.title}
                          className="w-full h-full object-cover rounded-full select-none pointer-events-none"
                          referrerPolicy="no-referrer"
                          style={{ transform: `rotate(0deg)` }}
                        />
                      ) : (
                        <Music className="w-10 h-10 text-blue-400 pointer-events-none" />
                      )}
                      
                      {/* Deep dynamic vinyl audio grooves */}
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(255,255,255,0.06)_40%,transparent_50%,rgba(255,255,255,0.08)_60%,transparent_70%)] pointer-events-none rounded-full" />
                      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_45%,rgba(255,255,255,0.04)_50%,transparent_55%)] pointer-events-none rounded-full mix-blend-overlay" />
                      
                      {/* Center spindle cap */}
                      <div className="absolute w-7 h-7 bg-[#0f0f12] border border-zinc-700/80 rounded-full flex items-center justify-center pointer-events-none z-10 shadow-inner">
                        <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.9)]" />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="luminous-bottom !pt-12">
                  <h3 className="luminous-title !mb-1.5 truncate" title={currentPlayingTrack.title}>
                    {currentPlayingTrack.title}
                  </h3>
                  <p className="luminous-description truncate" title={currentPlayingTrack.artist}>
                    {currentPlayingTrack.artist}
                  </p>
                  
                  <div className="h-4" />

                  {/* Micro equalizer soundwave bars inside the bottom of the card */}
                  <div className="absolute right-24 bottom-2 flex items-end gap-[2px] h-3.5 select-none pointer-events-none">
                    {[1, 2, 3, 4].map((bar, i) => (
                      <motion.span
                        key={i}
                        animate={isPlaying ? { height: [3, 14, 5, 11, 3] } : { height: 3 }}
                        transition={{
                          duration: 0.7 + i * 0.12,
                          repeat: isPlaying ? Infinity : 0,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        }}
                        className="w-[2px] bg-white/45 rounded-full"
                      />
                    ))}
                  </div>

                  <label htmlFor="luminous-checkbox" className="luminous-toggle">
                    <div className="luminous-handle"></div>
                    <div className="luminous-toggle-label">Play / Pause</div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue List */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/40 font-mono mb-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-white/20 rounded-full" /> Upcoming Queue ({queue.length})
        </div>
        {queue.length === 0 ? (
          <div className="py-12 border border-dashed border-white/10 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
            <Music className="w-6 h-6 text-white/20" />
            <div>
              <p className="text-xs font-bold text-white/40">Queue is empty</p>
              <p className="text-[11px] text-white/30 mt-1 max-w-xs mx-auto">
                No upcoming tracks loaded. Search songs or paste URLs above to populate upcoming playlist order!
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[350px] sm:max-h-[380px] md:max-h-[500px] overflow-y-auto overscroll-y-contain touch-pan-y custom-scrollbar pr-1">
            <AnimatePresence initial={false}>
              {queue.map((track, index) => {
                const isDragging = draggedIndex === index;
                return (
                  <motion.div
                    key={track.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-2xl border transition-all ${
                      isDragging 
                        ? "border-white bg-white/15 opacity-60 scale-[0.98]" 
                        : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/15"
                    }`}
                    draggable={!isNumberedMode && !isTouchDevice}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={() => setDraggedIndex(null)}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    {/* Upper row/column: thumbnail + title/artist + play button (Mobile) */}
                    <div className="flex items-center justify-between gap-2 flex-1 min-w-0 w-full sm:w-auto">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Drag Handle or Index marker */}
                        {!isNumberedMode ? (
                          !isTouchDevice ? (
                            <div className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white p-1 rounded transition-colors flex-shrink-0">
                              <GripVertical className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="text-[10px] font-mono text-white/30 w-4 text-center flex-shrink-0 font-bold">
                              {index + 1}
                            </div>
                          )
                        ) : (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <input
                               type="text"
                               inputMode="numeric"
                               pattern="[0-9]*"
                               defaultValue={index + 1}
                               onBlur={(e) => handleNumberChange(index, e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key === "Enter") {
                                   handleNumberChange(index, (e.target as HTMLInputElement).value);
                                   (e.target as HTMLInputElement).blur();
                                 }
                               }}
                               className="w-8 h-7 bg-black/40 text-center font-mono font-bold text-xs text-white rounded border border-white/15 focus:outline-none focus:border-white/40"
                            />
                          </div>
                        )}

                        {/* Image thumb */}
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 relative group">
                          <img
                            src={track.artworkUrl || `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={() => onPlayNextImmediate(track)}
                            className="absolute inset-0 bg-black/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            title="Play song now"
                          >
                            <Play className="w-3.5 h-3.5 text-white fill-current" />
                          </button>
                        </div>

                        {/* Meta info */}
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-white truncate" title={track.title}>
                            {track.title}
                          </h5>
                          <p className="text-[10px] text-white/40 truncate mt-0.5" title={track.artist}>
                            {track.artist}
                          </p>
                        </div>
                      </div>

                      {/* Play instantly Button - Mobile view */}
                      <button
                        onClick={() => onPlayNextImmediate(track)}
                        className="sm:hidden px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-blue-400 hover:text-white bg-blue-400/10 hover:bg-blue-400 border border-blue-400/20 hover:border-blue-400 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 active:bg-blue-400 active:text-black"
                        title="Play song now"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Play</span>
                      </button>
                    </div>

                    {/* Bottom actions panel (mobile) or Right actions panel (desktop) */}
                    <div className="flex items-center justify-between sm:justify-end gap-1.5 border-t border-white/[0.03] pt-2 sm:pt-0 sm:border-0 w-full sm:w-auto">
                      {/* Mobile track indicator tag */}
                      <div className="sm:hidden text-[9px] font-mono text-white/40 font-bold bg-white/5 px-2 py-0.5 rounded-md">
                        Track #{index + 1}
                      </div>

                      <div className="flex items-center gap-2 sm:gap-1.5 flex-shrink-0 ml-auto sm:ml-0">
                        {/* Play instantly Button - Desktop only */}
                        <button
                          onClick={() => onPlayNextImmediate(track)}
                          className="hidden sm:flex px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-blue-400 hover:text-white bg-blue-400/10 hover:bg-blue-400 border border-blue-400/20 hover:border-blue-400 rounded-lg transition-all cursor-pointer items-center gap-1"
                          title="Play song now"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Play</span>
                        </button>

                        {/* Move Up Button */}
                        <button
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className="p-2 sm:p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded-lg border border-white/[0.05] sm:border-0 transition-all cursor-pointer flex items-center justify-center min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0"
                          title="Move Up"
                        >
                          <ArrowUp className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>

                        {/* Move Down Button */}
                        <button
                          onClick={() => moveDown(index)}
                          disabled={index === queue.length - 1}
                          className="p-2 sm:p-1.5 text-white/40 hover:text-white disabled:text-white/10 disabled:cursor-not-allowed hover:bg-white/10 rounded-lg border border-white/[0.05] sm:border-0 transition-all cursor-pointer flex items-center justify-center min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0"
                          title="Move Down"
                        >
                          <ArrowDown className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>

                        {/* Trash Delete Button */}
                        <button
                          onClick={() => removeTrack(track.id)}
                          className="p-2 sm:p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/10 sm:border-0 transition-all cursor-pointer flex items-center justify-center min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
