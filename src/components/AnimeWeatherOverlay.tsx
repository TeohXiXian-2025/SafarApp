import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  WeatherData,
  AnimeWeatherCondition,
  fetchLiveWeather,
  isAutumnInNorthernHemisphere,
} from '../services/weatherService';
import {
  CloudRain,
  Sun,
  Wind,
  Snowflake,
  Moon,
  Sparkles,
  Sliders,
  Eye,
  EyeOff,
  RefreshCw,
  MapPin,
  Flame,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface AnimeWeatherOverlayProps {
  city?: string;
  activeConditionOverride?: AnimeWeatherCondition | 'AUTO';
  isFullViewport?: boolean;
}

// Particle types for canvas simulation
interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  thickness: number;
  opacity: number;
  slant: number;
  layer: 'fore' | 'mid' | 'back';
}

interface RainRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  growth: number;
}

interface AutumnLeaf {
  x: number;
  y: number;
  size: number;
  type: 'momiji' | 'ginkgo' | 'amber';
  color: string;
  colorSecondary: string;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  flipX: number;
  flipXSpeed: number;
  flipY: number;
  flipYSpeed: number;
  flutterPhase: number;
  flutterFreq: number;
  opacity: number;
}

interface SunMote {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  pulsePhase: number;
  pulseSpeed: number;
  baseAlpha: number;
  color: string;
}

interface SnowFlake {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  swayPhase: number;
  swayAmp: number;
  opacity: number;
  blur: number;
}

interface StarParticle {
  x: number;
  y: number;
  radius: number;
  twinklePhase: number;
  twinkleSpeed: number;
  isFirefly: boolean;
  color: string;
}

export const AnimeWeatherOverlay: React.FC<AnimeWeatherOverlayProps> = ({
  city = 'Tokyo',
  activeConditionOverride,
  isFullViewport = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live weather state from Open-Meteo API
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // User simulation preferences
  const [simulationMode, setSimulationMode] = useState<AnimeWeatherCondition | 'AUTO'>('AUTO');
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [intensity, setIntensity] = useState<'subtle' | 'normal' | 'cinematic'>('normal');
  const [isHudExpanded, setIsHudExpanded] = useState<boolean>(false);

  // Fetch live weather from real API
  const loadWeather = async (targetCity: string) => {
    setIsLoading(true);
    try {
      const data = await fetchLiveWeather(targetCity);
      setWeatherData(data);
    } catch (err) {
      console.error('Failed to load live weather:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWeather(city);
  }, [city]);

  // Determine effective active simulation condition
  const effectiveCondition: AnimeWeatherCondition = useMemo(() => {
    if (activeConditionOverride && activeConditionOverride !== 'AUTO') {
      return activeConditionOverride;
    }
    if (simulationMode !== 'AUTO') {
      return simulationMode;
    }
    if (weatherData) {
      return weatherData.condition;
    }
    // Fallback: If Autumn season, default to Autumn, otherwise Sunny
    return isAutumnInNorthernHemisphere() ? 'AUTUMN' : 'SUNNY';
  }, [simulationMode, activeConditionOverride, weatherData]);

  // Multipliers based on intensity
  const intensityMultiplier = useMemo(() => {
    switch (intensity) {
      case 'subtle':
        return 0.5;
      case 'cinematic':
        return 1.6;
      default:
        return 1.0;
    }
  }, [intensity]);

  // Main Canvas Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isVisible) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // ─── PARTICLE ARRAYS ───────────────────────────────────
    // Rain
    const rainDrops: RainDrop[] = [];
    const rainRipples: RainRipple[] = [];
    const rainCount = Math.floor(130 * intensityMultiplier);

    for (let i = 0; i < rainCount; i++) {
      const layer = Math.random() > 0.65 ? 'fore' : Math.random() > 0.3 ? 'mid' : 'back';
      rainDrops.push({
        x: Math.random() * (width + 200) - 100,
        y: Math.random() * height,
        length: layer === 'fore' ? 24 + Math.random() * 16 : layer === 'mid' ? 16 + Math.random() * 10 : 10 + Math.random() * 8,
        speed: layer === 'fore' ? 19 + Math.random() * 8 : layer === 'mid' ? 14 + Math.random() * 6 : 9 + Math.random() * 4,
        thickness: layer === 'fore' ? 1.8 : layer === 'mid' ? 1.2 : 0.8,
        opacity: layer === 'fore' ? 0.65 : layer === 'mid' ? 0.4 : 0.22,
        slant: -4.5 + (Math.random() - 0.5) * 1.5,
        layer,
      });
    }

    // Autumn Leaves
    const autumnLeaves: AutumnLeaf[] = [];
    const leafCount = Math.floor(45 * intensityMultiplier);
    const momijiColors = [
      { primary: '#DC2626', secondary: '#991B1B' }, // Crimson red
      { primary: '#E11D48', secondary: '#BE123C' }, // Scarlet
      { primary: '#EA580C', secondary: '#C2410C' }, // Burnt orange
      { primary: '#D97706', secondary: '#B45309' }, // Amber
    ];
    const ginkgoColors = [
      { primary: '#FBBF24', secondary: '#D97706' }, // Golden yellow
      { primary: '#FCD34D', secondary: '#F59E0B' }, // Bright gold
    ];

    for (let i = 0; i < leafCount; i++) {
      const isMomiji = Math.random() > 0.35;
      const palette = isMomiji
        ? momijiColors[Math.floor(Math.random() * momijiColors.length)]
        : ginkgoColors[Math.floor(Math.random() * ginkgoColors.length)];

      autumnLeaves.push({
        x: Math.random() * (width + 300) - 150,
        y: Math.random() * height,
        size: isMomiji ? 14 + Math.random() * 12 : 16 + Math.random() * 10,
        type: isMomiji ? 'momiji' : 'ginkgo',
        color: palette.primary,
        colorSecondary: palette.secondary,
        speedX: 1.2 + Math.random() * 2.2,
        speedY: 1.0 + Math.random() * 1.8,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.04,
        flipX: Math.random() * Math.PI,
        flipXSpeed: 0.02 + Math.random() * 0.03,
        flipY: Math.random() * Math.PI,
        flipYSpeed: 0.015 + Math.random() * 0.025,
        flutterPhase: Math.random() * Math.PI * 2,
        flutterFreq: 0.02 + Math.random() * 0.02,
        opacity: 0.75 + Math.random() * 0.25,
      });
    }

    // Sunny Sun Motes & God Rays
    const sunMotes: SunMote[] = [];
    const moteCount = Math.floor(55 * intensityMultiplier);
    const motePalettes = ['#FEF08A', '#FDE047', '#FED7AA', '#FDE68A', '#FFFFFF'];

    for (let i = 0; i < moteCount; i++) {
      sunMotes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 1.5 + Math.random() * 3.5,
        speedY: -(0.3 + Math.random() * 0.7),
        speedX: (Math.random() - 0.4) * 0.5,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.03 + Math.random() * 0.04,
        baseAlpha: 0.25 + Math.random() * 0.5,
        color: motePalettes[Math.floor(Math.random() * motePalettes.length)],
      });
    }

    // Snow Flakes
    const snowFlakes: SnowFlake[] = [];
    const snowCount = Math.floor(70 * intensityMultiplier);
    for (let i = 0; i < snowCount; i++) {
      const isFore = Math.random() > 0.75;
      snowFlakes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: isFore ? 3.5 + Math.random() * 3 : 1.5 + Math.random() * 2,
        speedY: 0.8 + Math.random() * 1.5,
        speedX: (Math.random() - 0.5) * 0.5,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: 0.8 + Math.random() * 1.5,
        opacity: isFore ? 0.8 : 0.45,
        blur: isFore ? 0 : 1,
      });
    }

    // Starry Night & Fireflies
    const stars: StarParticle[] = [];
    const starCount = Math.floor(65 * intensityMultiplier);
    for (let i = 0; i < starCount; i++) {
      const isFirefly = Math.random() > 0.75;
      stars.push({
        x: Math.random() * width,
        y: isFirefly ? height * 0.4 + Math.random() * height * 0.6 : Math.random() * height * 0.7,
        radius: isFirefly ? 2.5 + Math.random() * 2.5 : 1 + Math.random() * 2,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.03 + Math.random() * 0.05,
        isFirefly,
        color: isFirefly ? '#A7F3D0' : '#E0E7FF',
      });
    }

    // Wind gust simulation state
    let windGust = 0;
    let windGustTarget = 0;
    let time = 0;

    // ─── DRAW HELPER: JAPANESE MOMIJI (MAPLE) LEAF ─────────
    const drawMomijiLeaf = (c: CanvasRenderingContext2D, size: number, color: string, colorDark: string) => {
      c.save();
      c.fillStyle = color;
      c.strokeStyle = colorDark;
      c.lineWidth = 0.8;

      // Draw 5 main lobes radiating from base
      c.beginPath();
      c.moveTo(0, size * 0.5); // stem base

      // Central stem line
      c.lineTo(0, size * 0.7);
      c.stroke();

      c.beginPath();
      c.moveTo(0, size * 0.3);

      // 5 star-like pointy lobes
      const lobeAngles = [-0.7, -0.35, 0, 0.35, 0.7];
      const lobeLengths = [size * 0.75, size * 0.95, size * 1.15, size * 0.95, size * 0.75];

      for (let i = 0; i < lobeAngles.length; i++) {
        const ang = lobeAngles[i];
        const len = lobeLengths[i];
        const tipX = Math.sin(ang) * len;
        const tipY = -Math.cos(ang) * len;
        const notchAng = ang + 0.17;
        const notchLen = len * 0.45;
        const notchX = Math.sin(notchAng) * notchLen;
        const notchY = -Math.cos(notchAng) * notchLen;

        if (i === 0) {
          c.lineTo(tipX, tipY);
        } else {
          c.lineTo(tipX, tipY);
        }
        if (i < lobeAngles.length - 1) {
          c.lineTo(notchX, notchY);
        }
      }

      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    };

    // ─── DRAW HELPER: GINKGO FAN LEAF ──────────────────────
    const drawGinkgoLeaf = (c: CanvasRenderingContext2D, size: number, color: string, colorDark: string) => {
      c.save();
      c.fillStyle = color;
      c.strokeStyle = colorDark;
      c.lineWidth = 0.8;

      c.beginPath();
      // Stem
      c.moveTo(0, size * 0.6);
      c.lineTo(0, size * 0.2);
      c.stroke();

      // Fan shape with center indentation
      c.beginPath();
      c.moveTo(0, size * 0.2);
      c.quadraticCurveTo(-size * 0.8, -size * 0.2, -size * 0.6, -size * 0.9);
      c.quadraticCurveTo(-size * 0.2, -size * 0.7, 0, -size * 0.65); // center notch
      c.quadraticCurveTo(size * 0.2, -size * 0.7, size * 0.6, -size * 0.9);
      c.quadraticCurveTo(size * 0.8, -size * 0.2, 0, size * 0.2);

      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    };

    // ─── ANIMATION FRAME LOOP ──────────────────────────────
    const render = () => {
      time += 1;
      ctx.clearRect(0, 0, width, height);

      // Random wind gusts
      if (time % 180 === 0) {
        windGustTarget = (Math.random() - 0.2) * 2.5;
      }
      windGust += (windGustTarget - windGust) * 0.02;

      // ───────────────────────────────────────────────────────
      // MODE 1: RAIN (Makoto Shinkai "Garden of Words" Style)
      // ───────────────────────────────────────────────────────
      if (effectiveCondition === 'RAINY') {
        // Soft atmospheric moody mist
        ctx.fillStyle = 'rgba(15, 23, 42, 0.04)';
        ctx.fillRect(0, 0, width, height);

        // Update & Draw Rain Drops
        ctx.lineCap = 'round';
        for (let i = 0; i < rainDrops.length; i++) {
          const d = rainDrops[i];
          d.x += d.slant + windGust * 0.8;
          d.y += d.speed;

          // Draw slanted raindrop with gradient
          ctx.beginPath();
          ctx.lineWidth = d.thickness;
          ctx.strokeStyle = `rgba(186, 230, 253, ${d.opacity})`;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.slant * 2.2, d.y - d.length);
          ctx.stroke();

          // Bottom splash ripple trigger
          if (d.y >= height - 20 - Math.random() * 60) {
            if (d.layer === 'fore' && Math.random() > 0.75) {
              rainRipples.push({
                x: d.x,
                y: d.y,
                radius: 2,
                maxRadius: 16 + Math.random() * 12,
                opacity: 0.55,
                growth: 0.8 + Math.random() * 0.5,
              });
            }
            // Reset drop to top
            d.y = -d.length - Math.random() * 50;
            d.x = Math.random() * (width + 200) - 50;
          }
        }

        // Draw & Expand Water Ripples
        for (let i = rainRipples.length - 1; i >= 0; i--) {
          const rip = rainRipples[i];
          rip.radius += rip.growth;
          rip.opacity -= 0.022;

          if (rip.opacity <= 0 || rip.radius >= rip.maxRadius) {
            rainRipples.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = `rgba(186, 230, 253, ${rip.opacity})`;
          ctx.lineWidth = 1.2;
          // Elliptical perspective ripple
          ctx.ellipse(rip.x, rip.y, rip.radius, rip.radius * 0.38, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ───────────────────────────────────────────────────────
      // MODE 2: SUNNY (Makoto Shinkai Volumetric Sunbeams & Bokeh)
      // ───────────────────────────────────────────────────────
      else if (effectiveCondition === 'SUNNY') {
        // Shimmering God Rays radiating from top right corner
        const sunOriginX = width * 0.85;
        const sunOriginY = -40;

        const rayCount = 4;
        for (let r = 0; r < rayCount; r++) {
          const breath = Math.sin(time * 0.015 + r * 1.5) * 0.04 + 0.09;
          const rayAngle = 0.55 + r * 0.22 + Math.sin(time * 0.005 + r) * 0.05;
          const rayWidth = 140 + r * 30;

          const grad = ctx.createRadialGradient(
            sunOriginX,
            sunOriginY,
            20,
            sunOriginX - Math.cos(rayAngle) * width * 0.9,
            sunOriginY + Math.sin(rayAngle) * height * 1.2,
            width * 0.85
          );
          grad.addColorStop(0, `rgba(254, 240, 138, ${breath * 1.5})`);
          grad.addColorStop(0.3, `rgba(253, 224, 71, ${breath})`);
          grad.addColorStop(0.7, `rgba(254, 215, 170, ${breath * 0.4})`);
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

          ctx.save();
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(sunOriginX, sunOriginY);
          ctx.lineTo(
            sunOriginX - Math.cos(rayAngle - 0.18) * width * 1.2,
            sunOriginY + Math.sin(rayAngle - 0.18) * height * 1.3
          );
          ctx.lineTo(
            sunOriginX - Math.cos(rayAngle + 0.18) * width * 1.2,
            sunOriginY + Math.sin(rayAngle + 0.18) * height * 1.3
          );
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Floating Bokeh Sun Motes
        for (let i = 0; i < sunMotes.length; i++) {
          const m = sunMotes[i];
          m.y += m.speedY;
          m.x += m.speedX + Math.sin(time * 0.02 + m.pulsePhase) * 0.4;
          m.pulsePhase += m.pulseSpeed;

          const currentAlpha = m.baseAlpha * (0.6 + Math.sin(m.pulsePhase) * 0.4);

          // Radial glow halo
          const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius * 2.8);
          glow.addColorStop(0, m.color);
          glow.addColorStop(0.5, `rgba(254, 240, 138, ${currentAlpha * 0.5})`);
          glow.addColorStop(1, 'rgba(255, 255, 255, 0)');

          ctx.save();
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius * 2.8, 0, Math.PI * 2);
          ctx.fill();

          // Bright center
          ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.9})`;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius * 0.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Reset when floated off top
          if (m.y < -20) {
            m.y = height + 10;
            m.x = Math.random() * width;
          }
        }
      }

      // ───────────────────────────────────────────────────────
      // MODE 3: AUTUMN (Kyoto Momiji Maple & Ginkgo Leaves Swirl)
      // ───────────────────────────────────────────────────────
      else if (effectiveCondition === 'AUTUMN') {
        // Soft golden-amber warm tint
        ctx.fillStyle = 'rgba(245, 158, 11, 0.025)';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < autumnLeaves.length; i++) {
          const leaf = autumnLeaves[i];

          // 3D physics flutter & tumbling
          leaf.flutterPhase += leaf.flutterFreq;
          leaf.rotation += leaf.rotationSpeed + windGust * 0.01;
          leaf.flipX += leaf.flipXSpeed;
          leaf.flipY += leaf.flipYSpeed;

          const flutterDrift = Math.sin(leaf.flutterPhase) * 1.5;
          leaf.x += leaf.speedX + flutterDrift + windGust * 2.8;
          leaf.y += leaf.speedY + Math.cos(leaf.flutterPhase * 0.8) * 0.6;

          // 3D scale compression simulates leaf tumbling in perspective
          const scaleX = Math.cos(leaf.flipX);
          const scaleY = Math.cos(leaf.flipY);

          ctx.save();
          ctx.translate(leaf.x, leaf.y);
          ctx.rotate(leaf.rotation);
          ctx.scale(Math.abs(scaleX) * 0.8 + 0.2, Math.abs(scaleY) * 0.8 + 0.2);
          ctx.globalAlpha = leaf.opacity;

          // Render leaf depending on type
          if (leaf.type === 'momiji') {
            drawMomijiLeaf(ctx, leaf.size, leaf.color, leaf.colorSecondary);
          } else {
            drawGinkgoLeaf(ctx, leaf.size, leaf.color, leaf.colorSecondary);
          }

          ctx.restore();

          // Wrap around screen
          if (leaf.x > width + 50 || leaf.y > height + 50) {
            leaf.x = Math.random() * (width + 100) - 150;
            leaf.y = -30 - Math.random() * 60;
          }
        }
      }

      // ───────────────────────────────────────────────────────
      // MODE 4: SNOW (Soft Drifting Anime Snow)
      // ───────────────────────────────────────────────────────
      else if (effectiveCondition === 'SNOW') {
        for (let i = 0; i < snowFlakes.length; i++) {
          const s = snowFlakes[i];
          s.swayPhase += 0.02;
          s.y += s.speedY;
          s.x += s.speedX + Math.sin(s.swayPhase) * s.swayAmp + windGust;

          ctx.save();
          ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          if (s.y > height + 10) {
            s.y = -10;
            s.x = Math.random() * width;
          }
        }
      }

      // ───────────────────────────────────────────────────────
      // MODE 5: NIGHT (Starlight & Fireflies)
      // ───────────────────────────────────────────────────────
      else if (effectiveCondition === 'NIGHT') {
        for (let i = 0; i < stars.length; i++) {
          const star = stars[i];
          star.twinklePhase += star.twinkleSpeed;
          const alpha = 0.35 + Math.sin(star.twinklePhase) * 0.45;

          if (star.isFirefly) {
            star.x += (Math.random() - 0.5) * 0.6;
            star.y += (Math.random() - 0.5) * 0.4;
          }

          ctx.save();
          ctx.fillStyle = star.isFirefly
            ? `rgba(167, 243, 208, ${alpha})`
            : `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          ctx.fill();

          if (star.isFirefly && alpha > 0.6) {
            ctx.fillStyle = `rgba(167, 243, 208, 0.18)`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // CLOUDY / OVERCAST (Subtle gentle drifting anime cloud shadows)
      else if (effectiveCondition === 'CLOUDY') {
        const cloudGrad = ctx.createLinearGradient(0, 0, width, height);
        cloudGrad.addColorStop(0, 'rgba(100, 116, 139, 0.025)');
        cloudGrad.addColorStop(1, 'rgba(71, 85, 105, 0.04)');
        ctx.fillStyle = cloudGrad;
        ctx.fillRect(0, 0, width, height);
      }

      animFrameId = requestAnimationFrame(render);
    };

    animFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [effectiveCondition, isVisible, intensityMultiplier]);

  return (
    <>
      {/* ─── GPU-Accelerated Canvas Overlay ────────────────────── */}
      <canvas
        ref={canvasRef}
        className={`pointer-events-none fixed inset-0 z-20 transition-opacity duration-700 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ mixBlendMode: 'normal' }}
      />

      {/* ─── Floating Weather HUD & Simulation Switcher ──────── */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Expanded Controller Panel */}
        {isHudExpanded && (
          <div className="w-80 bg-white/95 backdrop-blur-xl border border-[#E7DFD5] rounded-3xl p-4 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
            {/* Header with City & API Live Badge */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E7DFD5]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0D6955]/10 flex items-center justify-center text-[#0D6955]">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-[#161C23]">
                    {weatherData ? weatherData.city : city} Weather
                  </h4>
                  <p className="text-[10px] text-[#8A9592] font-semibold">
                    Live Open-Meteo API Sync
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadWeather(city)}
                disabled={isLoading}
                title="Refresh Live Weather"
                className="p-1.5 rounded-lg hover:bg-[#FAF8F5] text-[#8A9592] hover:text-[#161C23] transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Live Weather Metrics Cards */}
            {weatherData && (
              <div className="grid grid-cols-3 gap-2 bg-[#FAF8F5] p-2.5 rounded-2xl border border-[#E7DFD5]/60 text-center">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-[#8A9592]">Temp</span>
                  <p className="text-sm font-black text-[#161C23]">
                    {weatherData.temperature}°C
                  </p>
                </div>
                <div className="space-y-0.5 border-x border-[#E7DFD5]/60">
                  <span className="text-[10px] font-bold text-[#8A9592]">Humidity</span>
                  <p className="text-sm font-black text-[#161C23]">
                    {weatherData.humidity}%
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-[#8A9592]">Wind</span>
                  <p className="text-sm font-black text-[#161C23]">
                    {weatherData.windSpeed} km/h
                  </p>
                </div>
              </div>
            )}

            {/* Real Condition Summary */}
            <div className="flex items-center gap-2 p-2 bg-[#0D6955]/5 border border-[#0D6955]/15 rounded-xl text-xs">
              <span className="text-base select-none">
                {weatherData?.conditionEmoji || '✨'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-[#0D6955] truncate">
                  {weatherData?.conditionLabel || 'Connecting...'}
                </p>
                <p className="text-[10px] text-[#526360] truncate">
                  {weatherData?.description}
                </p>
              </div>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {weatherData?.isLive ? 'LIVE' : 'SYNC'}
              </span>
            </div>

            {/* Anime Simulation Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#526360]">
                <span>Anime Simulation Preset</span>
                <span className="text-[10px] text-[#0D6955] font-extrabold">
                  {simulationMode === 'AUTO' ? 'Auto (Real Weather)' : 'Manual Override'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSimulationMode('AUTO')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                    simulationMode === 'AUTO'
                      ? 'bg-[#0D6955] text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-[#526360] hover:bg-neutral-200/60'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto (Real Weather)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulationMode('RAINY')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                    simulationMode === 'RAINY'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-[#526360] hover:bg-neutral-200/60'
                  }`}
                >
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                  <span>🌧️ Anime Rain</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulationMode('SUNNY')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                    simulationMode === 'SUNNY'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-[#526360] hover:bg-neutral-200/60'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  <span>☀️ Golden Rays</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulationMode('AUTUMN')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                    simulationMode === 'AUTUMN'
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-[#526360] hover:bg-neutral-200/60'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-rose-300" />
                  <span>🍁 Autumn Momiji</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulationMode('SNOW')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                    simulationMode === 'SNOW'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-[#526360] hover:bg-neutral-200/60'
                  }`}
                >
                  <Snowflake className="w-3.5 h-3.5 text-indigo-300" />
                  <span>❄️ Winter Snow</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulationMode('NIGHT')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                    simulationMode === 'NIGHT'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-[#526360] hover:bg-neutral-200/60'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 text-yellow-200" />
                  <span>✨ Starry Night</span>
                </button>
              </div>
            </div>

            {/* Intensity & Visibility Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E7DFD5]">
              <div className="flex items-center gap-1">
                {(['subtle', 'normal', 'cinematic'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setIntensity(lvl)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black capitalize transition-all cursor-pointer ${
                      intensity === lvl
                        ? 'bg-[#161C23] text-white'
                        : 'text-[#8A9592] hover:text-[#161C23]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsVisible((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-[#526360] hover:text-[#161C23] cursor-pointer"
              >
                {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{isVisible ? 'Hide FX' : 'Show FX'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Minimized Quick Trigger Pill */}
        <button
          type="button"
          onClick={() => setIsHudExpanded((prev) => !prev)}
          className="flex items-center gap-2 px-3.5 py-2 bg-white/95 hover:bg-white backdrop-blur-md border border-[#E7DFD5] rounded-full shadow-lg hover:shadow-xl transition-all group cursor-pointer"
          title="Click to toggle Live Anime Weather simulation controls"
        >
          {/* Animated Weather Indicator */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>

          <span className="text-base select-none">
            {effectiveCondition === 'RAINY'
              ? '🌧️'
              : effectiveCondition === 'SUNNY'
              ? '☀️'
              : effectiveCondition === 'AUTUMN'
              ? '🍁'
              : effectiveCondition === 'SNOW'
              ? '❄️'
              : '🌙'}
          </span>

          <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#161C23]">
            <span>{weatherData ? `${weatherData.temperature}°C` : 'Live Weather'}</span>
            <span className="text-[#8A9592]">·</span>
            <span className="text-[#0D6955] capitalize">
              {effectiveCondition === 'AUTUMN'
                ? 'Autumn Anime'
                : effectiveCondition === 'RAINY'
                ? 'Rain Anime'
                : effectiveCondition === 'SUNNY'
                ? 'Sunny Anime'
                : effectiveCondition.toLowerCase()}
            </span>
          </div>

          <Sliders className="w-3.5 h-3.5 text-[#8A9592] group-hover:text-[#161C23] transition-colors" />
        </button>
      </div>
    </>
  );
};
