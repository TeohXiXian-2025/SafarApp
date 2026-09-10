import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Clock,
  TrendingUp,
  Check,
  Lock,
  Vote,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import { ClashCompromiseOption, firestoreSync } from '../firebase/firestoreService';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoteSubmitted?: (optionId: string) => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  onVoteSubmitted,
}) => {
  const [selectedOptionId, setSelectedOptionId] = useState<string>('opt-cable-car');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [votedCount, setVotedCount] = useState<number>(3);
  const totalTripmates = 4;

  if (!isOpen) return null;

  const handleSubmitVote = async () => {
    setIsSubmitting(true);
    try {
      await firestoreSync.submitAnonymousVote(selectedOptionId);
      setVotedCount(4);
      setHasVoted(true);
      if (onVoteSubmitted) onVoteSubmitted(selectedOptionId);
    } catch (err) {
      console.warn('Vote submission:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercentage = Math.round((votedCount / totalTripmates) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#E7DFD5] w-full max-w-2xl rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5 text-[#161C23] relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Strip */}
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF6F4] text-[#0D6955] text-xs font-black tracking-wide border border-[#0D6955]/20">
            <Sparkles className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>AI Conflict Resolution · Safar Mediator</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#161C23]">
            Timeline Clash Detected
          </h2>
          <p className="text-xs sm:text-sm text-[#6D7A77] leading-relaxed">
            Amina and John proposed conflicting afternoon activities. To maintain the group budget and transit limits, please vote anonymously on a win-win compromise.
          </p>
        </div>

        {/* Slot Info Banner */}
        <div className="p-3 rounded-2xl bg-[#F4FAF8] border border-[#0D6955]/20 flex items-center justify-between text-xs text-[#0D6955] font-semibold flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>Slot: 03:00 PM – 05:00 PM</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#8F520A]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Impact: +$14 budget delta / 18 min transit</span>
          </div>
        </div>

        {/* 3 AI Compromise Options (Radio Cards) */}
        <div className="space-y-3">
          {/* Option 1 (AI Best Match - Recommended) */}
          <div
            onClick={() => !hasVoted && setSelectedOptionId('opt-cable-car')}
            className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative ${
              selectedOptionId === 'opt-cable-car'
                ? 'bg-[#F3FAF8] border-[#0D6955] ring-2 ring-[#0D6955]/20 shadow-xs'
                : 'bg-white border-[#E7DFD5] hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                    selectedOptionId === 'opt-cable-car'
                      ? 'border-[#0D6955] bg-[#0D6955]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedOptionId === 'opt-cable-car' && (
                    <span className="w-2 h-2 rounded-full bg-white"></span>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-[#0D6955] text-white px-2 py-0.5 rounded-md">
                    <Sparkles className="w-3 h-3 text-[#62FAE3]" />
                    <span>AI Best Match (Fair &amp; Budget-aligned)</span>
                  </span>
                  <span className="text-xs font-bold text-[#0D6955]">Recommended</span>
                </div>

                <div>
                  <h4 className="text-sm sm:text-base font-extrabold text-[#161C23]">
                    Scenic Cable Car{' '}
                    <span className="text-xs font-medium text-[#6D7A77]">
                      (Includes cafe for John, meets Amina's budget)
                    </span>
                  </h4>
                </div>

                <div className="flex items-center gap-3 text-xs text-[#526360] flex-wrap font-medium">
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-[#0D6955]" />
                    <span>Prayer space at summit</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-[#0D6955]" />
                    <span>Cafe with panoramic views</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-[#0D6955]" />
                    <span>12 min group travel</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Option 2 (Historical Walking Tour) */}
          <div
            onClick={() => !hasVoted && setSelectedOptionId('opt-walking-tour')}
            className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative ${
              selectedOptionId === 'opt-walking-tour'
                ? 'bg-[#F3FAF8] border-[#0D6955] ring-2 ring-[#0D6955]/20 shadow-xs'
                : 'bg-white border-[#E7DFD5] hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                    selectedOptionId === 'opt-walking-tour'
                      ? 'border-[#0D6955] bg-[#0D6955]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedOptionId === 'opt-walking-tour' && (
                    <span className="w-2 h-2 rounded-full bg-white"></span>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm sm:text-base font-extrabold text-[#161C23]">
                    Historical Walking Tour
                  </h4>
                  <span className="text-xs font-bold text-[#8A9592] font-mono">
                    +$6 / person
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="px-2.5 py-0.5 rounded-lg bg-gray-100 text-[#526360] font-medium">
                    Guided English tour
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-gray-100 text-[#526360] font-medium">
                    Covers 4 heritage landmarks
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-[#0D6955] font-semibold border border-emerald-200">
                    Modest attire friendly
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Option 3 (Free Time - Split activities) */}
          <div
            onClick={() => !hasVoted && setSelectedOptionId('opt-free-time')}
            className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative ${
              selectedOptionId === 'opt-free-time'
                ? 'bg-[#F3FAF8] border-[#0D6955] ring-2 ring-[#0D6955]/20 shadow-xs'
                : 'bg-white border-[#E7DFD5] hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                    selectedOptionId === 'opt-free-time'
                      ? 'border-[#0D6955] bg-[#0D6955]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedOptionId === 'opt-free-time' && (
                    <span className="w-2 h-2 rounded-full bg-white"></span>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm sm:text-base font-extrabold text-[#161C23]">
                    Free Time (Split activities)
                  </h4>
                  <span className="text-xs font-bold text-[#8A9592] font-mono">
                    $0 delta
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="px-2.5 py-0.5 rounded-lg bg-gray-100 text-[#526360] font-medium">
                    Self-paced exploration
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-gray-100 text-[#526360] font-medium">
                    Automated meeting ping at 5:15 PM
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Real-Time Group Progress Consensus Bar */}
        <div className="space-y-1.5 pt-2 border-t border-[#E7DFD5]">
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-2 text-[#161C23]">
              <span className="w-2 h-2 rounded-full bg-[#0D6955]"></span>
              <span>
                {votedCount} of {totalTripmates} tripmates voted
              </span>
            </div>
            <span className="text-[#8A9592] font-medium">
              {votedCount === totalTripmates
                ? 'Consensus reached!'
                : 'Closes when unanimous or in 14 mins'}
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#0D6955] transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[#8A9592] font-medium">
            <Lock className="w-3.5 h-3.5 text-[#0D6955]" />
            <span>Votes are encrypted &amp; anonymous</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-[#161C23] text-xs font-bold transition-colors cursor-pointer"
            >
              Suggest Alternative
            </button>

            <button
              type="button"
              onClick={handleSubmitVote}
              disabled={isSubmitting || hasVoted}
              className="px-5 py-2.5 rounded-2xl bg-[#0D6955] hover:bg-[#095041] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Encrypting Vote...</span>
                </>
              ) : hasVoted ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#62FAE3]" />
                  <span>Vote Registered Anonymous</span>
                </>
              ) : (
                <>
                  <Vote className="w-4 h-4 text-[#62FAE3]" />
                  <span>Submit Anonymous Vote</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
