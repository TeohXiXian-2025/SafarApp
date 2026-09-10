import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Compass,
  CheckCircle2,
  Clock,
  MapPin,
  UtensilsCrossed,
  X,
  ShieldCheck,
} from 'lucide-react';

interface GeneratingScreenProps {
  onComplete: () => void;
  onCancel: () => void;
  sourceText?: string;
}

export const GeneratingScreen: React.FC<GeneratingScreenProps> = ({
  onComplete,
  onCancel,
  sourceText = 'https://instagram.com/reel/C8k9xM2... (Kyoto Halal Guide)',
}) => {
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [progressPercent, setProgressPercent] = useState(15);

  useEffect(() => {
    // Phase 1 (0-1s): "Extracting locations from video..."
    const t1 = setTimeout(() => {
      setPhase(2);
      setProgressPercent(55);
    }, 1000);

    // Phase 2 (1-2s): "Verifying Halal spots..."
    const t2 = setTimeout(() => {
      setPhase(3);
      setProgressPercent(90);
    }, 2000);

    // Phase 3 (2-3s): "Anchoring prayer times..." -> complete
    const t3 = setTimeout(() => {
      setProgressPercent(100);
      onComplete();
    }, 3000);

    // Progress bar animation interval
    const interval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 98) return prev;
        return prev + 2;
      });
    }, 60);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(interval);
    };
  }, [onComplete]);

  return (
    <div className="w-full min-h-[75vh] flex flex-col items-center justify-center px-4 py-12 animate-in fade-in zoom-in-95 duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-neutral-200/80 text-center relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#0D6955]/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-[#A2F0D8]/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Close / Cancel Button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
          title="Cancel generation"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Central Animated Spinner */}
        <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
          {/* Outer pulsating ring */}
          <div className="absolute inset-0 rounded-full border-4 border-[#0D6955]/20 animate-ping opacity-30"></div>
          {/* Spinning SVG ring */}
          <svg className="w-24 h-24 animate-spin" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="#EEF4FE"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="#0D6955"
              strokeWidth="8"
              strokeDasharray="264"
              strokeDashoffset={264 - (264 * progressPercent) / 100}
              strokeLinecap="round"
              className="transition-all duration-150"
            />
          </svg>

          {/* Center Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            {phase === 1 && (
              <MapPin className="w-8 h-8 text-[#0D6955] animate-bounce" />
            )}
            {phase === 2 && (
              <UtensilsCrossed className="w-8 h-8 text-amber-600 animate-pulse" />
            )}
            {phase === 3 && (
              <Clock className="w-8 h-8 text-[#0D6955] animate-pulse" />
            )}
          </div>
        </div>

        {/* Dynamic Status Text matching user prompt */}
        <div className="space-y-2 mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0D6955]/10 text-[#0D6955] text-xs font-extrabold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Neural Synthesizer</span>
          </div>

          <h3 className="text-xl font-extrabold text-neutral-900 tracking-tight transition-all">
            {phase === 1 && 'Extracting locations from video...'}
            {phase === 2 && 'Verifying Halal spots...'}
            {phase === 3 && 'Anchoring prayer times...'}
          </h3>

          <p className="text-xs text-neutral-500 font-medium truncate max-w-xs mx-auto">
            {sourceText}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-gradient-to-r from-[#0D6955] to-[#128a70] rounded-full transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {/* 3 Step Sequence Checklist */}
        <div className="space-y-2.5 text-left bg-[#FAF8F5] p-3.5 rounded-2xl border border-neutral-200/70 mb-6">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-neutral-800">
              <MapPin className={`w-3.5 h-3.5 ${phase >= 1 ? 'text-[#0D6955]' : 'text-neutral-400'}`} />
              <span>Extracting video landmarks</span>
            </span>
            {phase > 1 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-[#0D6955] animate-ping"></span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-neutral-800">
              <UtensilsCrossed className={`w-3.5 h-3.5 ${phase >= 2 ? 'text-amber-600' : 'text-neutral-400'}`} />
              <span>Cross-verifying 100% Halal dining</span>
            </span>
            {phase > 2 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : phase === 2 ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-neutral-300"></span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-neutral-800">
              <Clock className={`w-3.5 h-3.5 ${phase >= 3 ? 'text-[#0D6955]' : 'text-neutral-400'}`} />
              <span>Auto-anchoring Dhuhr &amp; Asr prayer windows</span>
            </span>
            {phase >= 3 ? (
              <span className="w-2 h-2 rounded-full bg-[#0D6955] animate-ping"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-neutral-300"></span>
            )}
          </div>
        </div>

        {/* Cancel Action */}
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-bold text-neutral-500 hover:text-red-600 transition-colors cursor-pointer"
        >
          Cancel generation
        </button>
      </div>
    </div>
  );
};
