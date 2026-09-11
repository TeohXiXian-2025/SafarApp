import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Link as LinkIcon,
  Play,
  Clipboard,
  MapPin,
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  AlertCircle,
  Video,
  Send,
} from 'lucide-react';
import { ActivityType, Collaborator, TripSuggestion } from '../types';

interface SuggestActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Collaborator;
  activeDayId: string;
  onSubmitSuggestion: (suggestion: Omit<TripSuggestion, 'id' | 'votes' | 'votedBy' | 'submittedAt'>) => void;
}

export const SuggestActivityModal: React.FC<SuggestActivityModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeDayId,
  onSubmitSuggestion,
}) => {
  const [mode, setMode] = useState<'social_link' | 'manual_place'>('social_link');

  // Social link mode state
  const [socialUrl, setSocialUrl] = useState('');
  const [isSimulatingExtract, setIsSimulatingExtract] = useState(false);
  const [extractedPlace, setExtractedPlace] = useState<{
    title: string;
    location: string;
    type: ActivityType;
    halalBadge: string;
    description: string;
  } | null>(null);

  // Manual place mode state
  const [placeTitle, setPlaceTitle] = useState('');
  const [placeLocation, setPlaceLocation] = useState('');
  const [placeType, setPlaceType] = useState<ActivityType>('dining');
  const [halalBadge, setHalalBadge] = useState('100% Halal Certified');
  const [mateNote, setMateNote] = useState('');

  if (!isOpen) return null;

  const handleSimulateUrlExtract = (url: string) => {
    setSocialUrl(url);
    if (!url.trim()) return;

    setIsSimulatingExtract(true);
    setTimeout(() => {
      setIsSimulatingExtract(false);
      if (url.toLowerCase().includes('xhs') || url.toLowerCase().includes('xiaohongshu') || url.toLowerCase().includes('rednote')) {
        setExtractedPlace({
          title: 'Gion Karyo Halal Kaiseki & Tea Garden',
          location: 'Higashiyama Ward, Kyoto',
          type: 'cultural',
          halalBadge: '100% Halal Verified (RedNote 爆款)',
          description: 'Trending on RedNote (小红书): Traditional multi-course Kyoto kaiseki prepared with halal certified dashi, non-alcoholic mirin, and private wudu space.',
        });
      } else if (url.toLowerCase().includes('ramen') || url.toLowerCase().includes('food')) {
        setExtractedPlace({
          title: 'Ayam-YA Halal Ramen Karasuma',
          location: 'Shimogyo Ward, Kyoto',
          type: 'dining',
          halalBadge: '100% Halal Certified (NAHA / JHA)',
          description: 'Rich chicken paitan ramen with dedicated prayer mat space on 2nd floor.',
        });
      } else if (url.toLowerCase().includes('coffee') || url.toLowerCase().includes('cafe')) {
        setExtractedPlace({
          title: '% Arabica Kyoto Higashiyama',
          location: 'Yasaka Pagoda Street, Kyoto',
          type: 'cafe',
          halalBadge: 'Muslim-Friendly / Pork-Free Drinks',
          description: 'Iconic latte spot right next to the historic pagoda while prayers take place.',
        });
      } else {
        setExtractedPlace({
          title: 'Nishiki Market Halal Street Skewers',
          location: 'Nakagyo Ward, Kyoto',
          type: 'dining',
          halalBadge: 'Muslim-Owned Stall',
          description: 'Famous food street featuring certified halal wagyu beef skewers and matcha sweets.',
        });
      }
    }, 600);
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0) {
          handleSimulateUrlExtract(text.trim());
          return;
        }
      }
    } catch {
      // fallback
    }
    handleSimulateUrlExtract('https://www.tiktok.com/@halaltraveler/video/73918237_kyotofood');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'social_link') {
      const finalTitle = extractedPlace?.title || 'Trending Social Spot';
      const finalLocation = extractedPlace?.location || 'Kyoto City Center';
      const finalType = extractedPlace?.type || 'dining';
      const finalHalal = extractedPlace?.halalBadge || 'Community Halal Checked';
      const finalDesc = mateNote.trim()
        ? `${mateNote.trim()} · Extracted from ${socialUrl}`
        : extractedPlace?.description || `Recommended via social media link (${socialUrl})`;

      onSubmitSuggestion({
        proposedBy: {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          role: currentUser.role,
        },
        title: finalTitle,
        location: finalLocation,
        type: finalType,
        description: finalDesc,
        sourceUrl: socialUrl,
        halalBadge: finalHalal,
        status: 'pending',
        suggestedDayId: activeDayId,
      });
    } else {
      if (!placeTitle.trim()) return;

      onSubmitSuggestion({
        proposedBy: {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          role: currentUser.role,
        },
        title: placeTitle.trim(),
        location: placeLocation.trim() || 'Central District',
        type: placeType,
        description: mateNote.trim() || 'Tripmate suggested this attraction for group itinerary.',
        halalBadge,
        status: 'pending',
        suggestedDayId: activeDayId,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-[#E7DFD5] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E7DFD5] flex items-center justify-between bg-[#FAF8F5]">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-800 text-[10px] font-extrabold uppercase">
                Tripmate Role 👤
              </span>
              <span className="text-xs text-[#6D7A77]">Suggestion Mode</span>
            </div>
            <h3 className="text-base font-black text-[#161C23] mt-0.5">
              Suggest Activity or Drop Social Link
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-200 text-[#6D7A77] hover:text-[#161C23] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-[#E7DFD5] px-6 bg-[#FAF8F5]/50">
          <button
            type="button"
            onClick={() => setMode('social_link')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'social_link'
                ? 'border-[#00685F] text-[#00685F]'
                : 'border-transparent text-[#6D7A77] hover:text-[#161C23]'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Drop Reel / TikTok Link</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('manual_place')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'manual_place'
                ? 'border-[#00685F] text-[#00685F]'
                : 'border-transparent text-[#6D7A77] hover:text-[#161C23]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Suggest Place Manually</span>
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {mode === 'social_link' ? (
            <>
              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <LinkIcon className="w-3.5 h-3.5 text-[#00685F]" />
                    <span>Instagram Reel, TikTok, or Xiaohongshu Link</span>
                  </span>
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="text-[11px] text-[#00685F] font-bold hover:underline flex items-center gap-1"
                  >
                    <Clipboard className="w-3 h-3" />
                    <span>Paste Sample Link</span>
                  </button>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={socialUrl}
                    onChange={(e) => handleSimulateUrlExtract(e.target.value)}
                    placeholder="https://www.tiktok.com/@user/video/..."
                    className="w-full h-11 px-3.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-medium text-[#161C23] focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              {/* Quick Sample Links */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] font-semibold text-[#6D7A77]">Quick Test:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSimulateUrlExtract('https://xhslink.com/a/kyoto_halal_kaiseki')
                  }
                  className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold hover:bg-red-600 hover:text-white transition-colors"
                >
                  📕 RedNote (小红书) Kaiseki
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSimulateUrlExtract('https://tiktok.com/@kyoto_halal/video/ayam_ya_ramen')
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#EEF4FE] text-[#00685F] text-[11px] font-bold hover:bg-[#00685F] hover:text-white transition-colors"
                >
                  🍜 Halal Ramen TikTok
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSimulateUrlExtract('https://instagram.com/reel/arabicacoffee_kyoto')
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] text-[#161C23] border border-[#E7DFD5] text-[11px] font-bold hover:bg-white transition-colors"
                >
                  ☕ Higashiyama Cafe Reel
                </button>
              </div>

              {/* Extracted Card Preview */}
              {isSimulatingExtract && (
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] flex items-center gap-2.5 text-xs text-[#00685F] font-bold animate-pulse">
                  <Sparkles className="w-4 h-4" />
                  <span>Safar AI is scanning video audio &amp; captions for Halal verification...</span>
                </div>
              )}

              {extractedPlace && !isSimulatingExtract && (
                <div className="p-4 rounded-2xl bg-[#EEF4FE]/80 border border-[#00685F]/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#00685F] uppercase flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>AI Extracted Recommendation</span>
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {extractedPlace.halalBadge}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-[#161C23]">{extractedPlace.title}</h4>
                  <p className="text-xs text-[#6D7A77] font-medium">{extractedPlace.description}</p>
                  <div className="text-[11px] text-[#526360] flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#00685F]" />
                    <span>{extractedPlace.location}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1 block">
                  Why should the group visit this place? (Note to Team Lead)
                </label>
                <textarea
                  value={mateNote}
                  onChange={(e) => setMateNote(e.target.value)}
                  placeholder="e.g. Saw this viral spot on TikTok, reviews say it is right beside the Dhuhr prayer hall and opens till 9 PM!"
                  rows={2}
                  className="w-full p-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-medium text-[#161C23] focus:outline-none focus:bg-white resize-none"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1 block">
                  Place / Attraction Name
                </label>
                <input
                  type="text"
                  value={placeTitle}
                  onChange={(e) => setPlaceTitle(e.target.value)}
                  placeholder="e.g. Halal Wagyu Gion, Kiyomizu-dera Teahouse"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23] focus:outline-none focus:bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#161C23] mb-1 block">Category</label>
                  <select
                    value={placeType}
                    onChange={(e) => setPlaceType(e.target.value as ActivityType)}
                    className="w-full h-11 px-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23]"
                  >
                    <option value="dining">Halal Dining</option>
                    <option value="cafe">Cafe &amp; Tea Break</option>
                    <option value="sightseeing">Sightseeing / Scenic</option>
                    <option value="cultural">Cultural Landmark</option>
                    <option value="shopping">Shopping District</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#161C23] mb-1 block">Halal Status</label>
                  <select
                    value={halalBadge}
                    onChange={(e) => setHalalBadge(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23]"
                  >
                    <option value="100% Halal Certified">100% Halal Certified</option>
                    <option value="Muslim-Owned Kitchen">Muslim-Owned Kitchen</option>
                    <option value="Pork-Free & Vegetarian">Pork-Free &amp; Vegetarian</option>
                    <option value="Non-Halal / Non-Muslim Spot">Non-Halal (Separate Route)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1 block">
                  Location / Address
                </label>
                <input
                  type="text"
                  value={placeLocation}
                  onChange={(e) => setPlaceLocation(e.target.value)}
                  placeholder="e.g. Gion Historic District, Kyoto"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-medium text-[#161C23] focus:outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1 block">
                  Reason for Suggestion
                </label>
                <textarea
                  value={mateNote}
                  onChange={(e) => setMateNote(e.target.value)}
                  placeholder="Tell Team Lead why you'd love to go here..."
                  rows={2}
                  className="w-full p-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-medium text-[#161C23] focus:outline-none focus:bg-white resize-none"
                />
              </div>
            </>
          )}

          {/* Notice: Submitting for Team Lead Approval */}
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-2 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Prior Authorisation Notice:</strong> As a Tripmate, your suggestion will be sent to the Team Lead's review queue. The Team Lead will review and officially anchor it into the shared itinerary.
            </p>
          </div>

          <button
            type="submit"
            className="w-full h-12 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Submit Suggestion to Team Lead</span>
          </button>
        </form>
      </div>
    </div>
  );
};
