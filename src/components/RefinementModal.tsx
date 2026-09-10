import React, { useState } from 'react';
import { ActivityBlock, HalalFallbackOption } from '../types';
import { HALAL_FALLBACK_OPTIONS, INITIAL_VOICE_NOTE } from '../data/mockData';
import {
  X,
  Sparkles,
  AlertTriangle,
  Compass,
  Navigation,
  UtensilsCrossed,
  Star,
  Check,
  Play,
  Pause,
  Mic,
  Send,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Baby,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface RefinementModalProps {
  activity: ActivityBlock | null;
  onClose: () => void;
  onSwapActivity: (oldActivityId: string, newOption: HalalFallbackOption) => void;
  onAddAiPrompt: (promptText: string) => void;
}

export const RefinementModal: React.FC<RefinementModalProps> = ({
  activity,
  onClose,
  onSwapActivity,
  onAddAiPrompt,
}) => {
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordFeedback, setRecordFeedback] = useState('Hold to Record Voice Note');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!activity) return null;

  const handlePlayVoice = () => {
    setIsPlayingVoice(!isPlayingVoice);
  };

  const handleStartRecord = () => {
    setIsRecording(true);
    setRecordFeedback('Recording audio note for family...');
  };

  const handleStopRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      setRecordFeedback('Voice Note Shared to Family!');
      setToastMessage('Voice note pinned to this activity and shared across family devices!');
      setTimeout(() => {
        setRecordFeedback('Hold to Record Voice Note');
        setToastMessage(null);
      }, 3500);
    }
  };

  const handleFindNearby = () => {
    setIsSearchingNearby(true);
    setTimeout(() => {
      setIsSearchingNearby(false);
      setToastMessage('Found 4 Halal-certified kitchens open within 1.2km walk!');
      setTimeout(() => setToastMessage(null), 3500);
    }, 1000);
  };

  const handleSwap = (option: HalalFallbackOption) => {
    onSwapActivity(activity.id, option);
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
    });
    setToastMessage(`Swapped to "${option.title}". Buffer extended by 45 mins!`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    onAddAiPrompt(aiPrompt.trim());
    setAiPrompt('');
    setToastMessage('AI Copilot applied schedule refinement and synced with family!');
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-[#E7DFD5] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Handle / Header */}
        <div className="pt-4 pb-3 px-6 flex items-center justify-between border-b border-[#E7DFD5]/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#00685F]/10 flex items-center justify-center text-[#00685F]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#161C23]">Schedule Adjustment</h2>
              <p className="text-[11px] text-[#6D7A77]">Real-time Halal alternatives &amp; prayer sync</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#EEF4FE] hover:bg-[#E3E8F2] flex items-center justify-center text-[#6D7A77] hover:text-[#161C23] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5">
          {/* Toast Notice */}
          {toastMessage && (
            <div className="p-3 rounded-2xl bg-[#00685F] text-white text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 text-[#62FAE3] shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Current Plan Card */}
          <div className="bg-[#EEF4FE]/70 rounded-2xl p-4 border border-[#E7DFD5] space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-white text-[#6D7A77] text-[11px] font-bold shadow-xs">
                    Current Plan
                  </span>
                  <span className="text-xs font-bold text-[#00685F]">
                    {activity.time} · {activity.duration}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#161C23] mt-1">{activity.title}</h3>
                <p className="text-xs text-[#6D7A77] mt-0.5">{activity.location}</p>
                {activity.cost !== undefined && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold">
                      ${activity.cost.toLocaleString()} · {activity.costCategory ? activity.costCategory.charAt(0).toUpperCase() + activity.costCategory.slice(1) : 'Expense'}
                    </span>
                    {activity.paidBy && (
                      <span className="text-[11px] text-[#6D7A77] font-medium">
                        Paid by {activity.paidBy}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-[#D97706] shadow-xs shrink-0">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
            </div>

            {/* Warning callout if closing soon */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-[#904D00]">
                  {activity.warning?.message || 'Kitchen closes at 2:00 PM for afternoon prep'}
                </p>
                <p className="text-[#6D7A77] text-[11px] mt-0.5">
                  {activity.warning?.details ||
                    'Only 15 mins buffer remaining. Risk of missing seated lunch before Dhuhr prayer ends.'}
                </p>
              </div>
            </div>
          </div>

          {/* Prominent Turquoise Green Action Button: "Find Halal Near Me" */}
          <button
            onClick={handleFindNearby}
            disabled={isSearchingNearby}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#00685F] hover:bg-[#008378] active:scale-[0.99] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSearchingNearby ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-[#62FAE3]" />
                <span>Scanning 1.2km radius for Halal certified kitchens...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4 text-[#62FAE3]" />
                <span>Find Halal Near Me (Open Now)</span>
              </>
            )}
          </button>

          {/* AI Smart Fallbacks Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#00685F]" />
                <h4 className="font-bold text-xs text-[#161C23] uppercase tracking-wider">
                  AI Smart Fallbacks
                </h4>
              </div>
              <span className="text-[11px] font-semibold text-[#00685F]">Instant Switch</span>
            </div>

            <div className="space-y-2.5">
              {HALAL_FALLBACK_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  className="bg-white rounded-2xl p-3.5 border border-[#E7DFD5] hover:border-[#00685F]/50 shadow-xs hover:shadow-md transition-all space-y-2.5"
                >
                  <div className="flex gap-3">
                    <img
                      src={opt.image}
                      alt={opt.title}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-xl object-cover shrink-0 bg-gray-100"
                    />
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <h5 className="font-bold text-sm text-[#161C23] truncate">{opt.title}</h5>
                          <span className="text-[11px] font-bold text-[#D97706] flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-current" />
                            <span>{opt.rating}</span>
                          </span>
                        </div>
                        <p className="text-xs text-[#6D7A77] mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#00685F]" />
                          <span>{opt.walkTime} · {opt.cuisine}</span>
                        </p>
                      </div>

                      {/* Amenities */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {opt.amenities.map((amenity, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-[#EEF4FE] text-[#00685F] text-[10px] font-bold"
                          >
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E7DFD5]/40 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-[#6D7A77]">{opt.seatingNote}</span>
                    <button
                      onClick={() => handleSwap(opt)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#00685F]/10 hover:bg-[#00685F] text-[#00685F] hover:text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <span>Swap this in</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Family Voice Thread Section */}
          <div className="bg-white rounded-2xl p-4 border border-[#E7DFD5] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#161C23] flex items-center gap-1.5">
                <Mic className="w-4 h-4 text-[#00685F]" />
                <span>Family Voice Thread</span>
              </span>
              <span className="text-[11px] text-[#6D7A77]">Synced 2m ago</span>
            </div>

            <div className="bg-[#EEF4FE]/70 p-3 rounded-xl flex items-center gap-3">
              <img
                src={INITIAL_VOICE_NOTE.avatar}
                alt={INITIAL_VOICE_NOTE.author}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-[#00685F]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-[#161C23]">
                    {INITIAL_VOICE_NOTE.author}
                  </span>
                  <span className="text-[11px] text-[#6D7A77]">{INITIAL_VOICE_NOTE.duration}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePlayVoice}
                    className="w-6 h-6 rounded-full bg-[#00685F] text-white flex items-center justify-center shrink-0 hover:bg-[#008378] transition-colors"
                  >
                    {isPlayingVoice ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                  </button>

                  {/* Simulated Waveform Bars */}
                  <div className="flex-1 flex items-center gap-0.5 h-4">
                    {INITIAL_VOICE_NOTE.audioWaveform.map((val, i) => (
                      <span
                        key={i}
                        style={{ height: `${val}%` }}
                        className={`w-1 rounded-full transition-all ${
                          isPlayingVoice ? 'bg-[#00685F] animate-pulse' : 'bg-[#00685F]/50'
                        }`}
                      ></span>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-[#6D7A77] italic mt-1.5">
                  &ldquo;{INITIAL_VOICE_NOTE.transcription}&rdquo;
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Chat Refinement Input Box */}
          <div className="bg-[#F5F1EA] rounded-2xl p-4 border border-[#E7DFD5] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#00685F]" />
                <h4 className="font-bold text-xs text-[#161C23]">Family Travel Copilot</h4>
              </div>
              <span className="text-[10px] font-bold text-[#00685F] bg-[#00685F]/10 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>

            <form onSubmit={handleSendPrompt} className="space-y-2">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ask AI to refine this day..."
                  className="w-full h-11 pl-3.5 pr-11 bg-white rounded-xl text-xs font-medium text-[#161C23] placeholder:text-[#6D7A77] border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 shadow-xs"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 w-8 h-8 rounded-lg bg-[#00685F] hover:bg-[#008378] text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Hold to record microphone button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={handleStartRecord}
                  onMouseUp={handleStopRecord}
                  onTouchStart={handleStartRecord}
                  onTouchEnd={handleStopRecord}
                  className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border ${
                    isRecording
                      ? 'bg-red-50 text-red-600 border-red-300 animate-pulse'
                      : 'bg-white hover:bg-[#EEF4FE] text-[#161C23] border-[#E7DFD5]'
                  }`}
                >
                  <Mic className={`w-3.5 h-3.5 ${isRecording ? 'text-red-600' : 'text-[#00685F]'}`} />
                  <span>{recordFeedback}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAiPrompt('Find stroller-friendly halal dining closer to temple')}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-gray-50 text-[#6D7A77] text-xs font-semibold border border-[#E7DFD5] transition-colors whitespace-nowrap"
                >
                  Stroller route
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
