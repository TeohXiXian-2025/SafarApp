import React, { useState } from 'react';
import {
  Compass,
  MapPin,
  Calendar,
  Users,
  Sparkles,
  Check,
  Plus,
  X,
  Clock,
  ShieldCheck,
  Crown,
  ChevronRight,
  ArrowLeft,
  Search,
  Heart,
  UtensilsCrossed,
  Footprints,
} from 'lucide-react';
import { FaithDietaryTier, TravelPace } from '../types';

interface TripSetupWizardProps {
  onComplete: (setupData: {
    leadName: string;
    leadFaithDietary: FaithDietaryTier;
    destination: string;
    startDate: string;
    endDate: string;
    travelGroup: string;
    tourismPoints: string[];
    pace: TravelPace;
    halalTier: FaithDietaryTier;
    prayerBuffers: boolean;
    currency: string;
  }) => void;
  onCancel: () => void;
}

interface DestinationPreset {
  city: string;
  country: string;
  emoji: string;
  currency: string;
  suggestedPoints: string[];
}

const DESTINATION_PRESETS: DestinationPreset[] = [
  {
    city: 'Kyoto',
    country: 'Japan',
    emoji: '🍁',
    currency: '¥',
    suggestedPoints: [
      'Arashiyama Bamboo Grove',
      'Fushimi Inari Taisha (Torii Gates)',
      'Kyoto Islamic Cultural Center',
      'Gion Historic District',
      'Kiyomizu-dera Temple',
      'Nishiki Market (Halal Food Walk)',
      'Kinkaku-ji (Golden Pavilion)',
    ],
  },
  {
    city: 'Mecca & Madinah',
    country: 'Saudi Arabia',
    emoji: '🕋',
    currency: 'SAR',
    suggestedPoints: [
      'Masjid al-Haram & Kaaba',
      'Al-Masjid an-Nabawi (Madinah)',
      'Jabal al-Nour & Hira Cave',
      'Mount Arafat & Mina',
      'Quba Mosque',
      'Clock Tower Museum',
    ],
  },
  {
    city: 'Istanbul',
    country: 'Turkey',
    emoji: '🕌',
    currency: '₺',
    suggestedPoints: [
      'Hagia Sophia Grand Mosque',
      'Blue Mosque (Sultan Ahmed)',
      'Grand Bazaar Halal Spice Walk',
      'Topkapi Palace Museum',
      'Bosphorus Sunset Ferry Cruise',
      'Suleymaniye Mosque',
    ],
  },
  {
    city: 'Kuala Lumpur',
    country: 'Malaysia',
    emoji: '🌴',
    currency: 'RM',
    suggestedPoints: [
      'Petronas Twin Towers & KLCC Park',
      'National Mosque of Malaysia (Masjid Negara)',
      'Batu Caves',
      'Jalan Alor Halal Street Food',
      'Islamic Arts Museum Malaysia',
      'Putrajaya Pink Mosque (Masjid Putra)',
    ],
  },
  {
    city: 'Tokyo',
    country: 'Japan',
    emoji: '🗼',
    currency: '¥',
    suggestedPoints: [
      'Tokyo Camii Mosque & Turkish Culture Center',
      'Shinjuku Gyoen National Garden',
      'Asakusa Senso-ji & Halal Asakusa Ramen',
      'Shibuya Crossing & Hachiko',
      'Akihabara Tech & Anime District',
    ],
  },
];

export const TripSetupWizard: React.FC<TripSetupWizardProps> = ({
  onComplete,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // 1. Team Lead Info
  const [leadName, setLeadName] = useState('Amina');
  const [leadFaithDietary, setLeadFaithDietary] = useState<FaithDietaryTier>('strictly_halal');

  // 2. Destination & Dates
  const [destination, setDestination] = useState('Kyoto, Japan');
  const [startDate, setStartDate] = useState('Oct 14');
  const [endDate, setEndDate] = useState('Oct 20');
  const [travelGroup, setTravelGroup] = useState('Friends (4 members)');
  const [currency, setCurrency] = useState('$');

  // 3. Tourism Points / Where to visit
  const [selectedPoints, setSelectedPoints] = useState<string[]>([
    'Arashiyama Bamboo Grove',
    'Fushimi Inari Taisha (Torii Gates)',
    'Kyoto Islamic Cultural Center',
    'Gion Historic District',
    'Nishiki Market (Halal Food Walk)',
  ]);
  const [customPointInput, setCustomPointInput] = useState('');

  // 4. Preferences & Halal strictness
  const [pace, setPace] = useState<TravelPace>('moderate');
  const [halalTier, setHalalTier] = useState<FaithDietaryTier>('strictly_halal');
  const [prayerBuffers, setPrayerBuffers] = useState(true);

  // Handle selecting a destination preset
  const handleSelectPreset = (preset: DestinationPreset) => {
    setDestination(`${preset.city}, ${preset.country}`);
    setSelectedPoints(preset.suggestedPoints.slice(0, 5));
    setCurrency(preset.currency);
  };

  // Toggle tourism point selection
  const handleTogglePoint = (point: string) => {
    if (selectedPoints.includes(point)) {
      setSelectedPoints(selectedPoints.filter((p) => p !== point));
    } else {
      setSelectedPoints([...selectedPoints, point]);
    }
  };

  // Add custom tourism point
  const handleAddCustomPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPointInput.trim()) return;
    if (!selectedPoints.includes(customPointInput.trim())) {
      setSelectedPoints([...selectedPoints, customPointInput.trim()]);
    }
    setCustomPointInput('');
  };

  const handleFinish = () => {
    onComplete({
      leadName: leadName.trim() || 'Team Lead',
      leadFaithDietary,
      destination: destination.trim() || 'Kyoto, Japan',
      startDate,
      endDate,
      travelGroup,
      tourismPoints: selectedPoints.length > 0 ? selectedPoints : ['City Center & Cultural Quarter'],
      pace,
      halalTier,
      prayerBuffers,
      currency,
    });
  };

  // Get active suggested list based on current destination
  const activePreset = DESTINATION_PRESETS.find(
    (p) => destination.toLowerCase().includes(p.city.toLowerCase())
  ) || DESTINATION_PRESETS[0];

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-[#E7DFD5] relative overflow-hidden">
        {/* Progress Bar & Header */}
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-[#E7DFD5]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="p-2 rounded-xl text-[#6D7A77] hover:text-[#161C23] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              title="Return to home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00685F]/10 text-[#00685F] text-[11px] font-extrabold uppercase tracking-wider">
                  <Crown className="w-3.5 h-3.5 text-[#00685F]" />
                  <span>Team Lead Setup Flow</span>
                </span>
                <span className="text-xs font-bold text-[#6D7A77]">
                  Step {currentStep} of 4
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#161C23] mt-0.5">
                {currentStep === 1 && '1. Team Lead Profile'}
                {currentStep === 2 && '2. Destination & Dates'}
                {currentStep === 3 && '3. Where to Visit (Tourism Points)'}
                {currentStep === 4 && '4. Halal & Travel Preferences'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((stepNum) => (
              <div
                key={stepNum}
                className={`h-2 rounded-full transition-all ${
                  stepNum === currentStep
                    ? 'w-7 bg-[#00685F]'
                    : stepNum < currentStep
                    ? 'w-3 bg-[#00685F]/50'
                    : 'w-2 bg-[#E7DFD5]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STEP 1: TEAM LEAD PROFILE                                                 */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <div className="pt-6 space-y-6">
            <div className="bg-[#EEF4FE]/80 border border-[#00685F]/20 rounded-2xl p-4 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#00685F] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-[#161C23]">
                  You are designated as the Team Lead 👑
                </h4>
                <p className="text-xs text-[#6D7A77] mt-0.5 leading-relaxed">
                  As the creator of this trip, you have prior authorization to manage, approve, or reject itinerary changes, swap Halal options, and review suggestions submitted by tripmates.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1.5 block">
                  Your Full Name or Nickname
                </label>
                <input
                  type="text"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="e.g. Amina, Tariq, Sarah"
                  className="w-full h-12 px-4 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] text-sm font-bold text-[#161C23] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1.5 block">
                  Your Faith &amp; Dietary Preference
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      id: 'strictly_halal',
                      title: 'Strictly Halal',
                      desc: 'Certified Halal only. Zabihah verified kitchens.',
                      badge: '🕌 100% Certified',
                    },
                    {
                      id: 'muslim_owned',
                      title: 'Muslim-Owned / Friendly',
                      desc: 'Muslim chefs, halal meat, or trusted community reviews.',
                      badge: '🍽️ Muslim-Owned',
                    },
                    {
                      id: 'pork_free',
                      title: 'Pork & Alcohol Free',
                      desc: 'Vegetarian, seafood, or zero pork/lard cross-contamination.',
                      badge: '🥢 Pork-Free',
                    },
                    {
                      id: 'non_muslim',
                      title: 'Non-Muslim / Flexible',
                      desc: 'Local authentic gastronomy without religious restrictions.',
                      badge: '🍜 All Gastronomy',
                    },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setLeadFaithDietary(option.id as FaithDietaryTier)}
                      className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer ${
                        leadFaithDietary === option.id
                          ? 'bg-[#EEF4FE] border-[#00685F] ring-2 ring-[#00685F]/20'
                          : 'bg-[#FAF8F5] border-[#E7DFD5] hover:bg-white hover:border-[#00685F]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-[#161C23]">
                          {option.title}
                        </span>
                        <span className="text-[10px] font-bold text-[#00685F]">
                          {option.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6D7A77] font-medium leading-normal">
                        {option.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: DESTINATION & DATES                                               */}
        {/* ========================================================================= */}
        {currentStep === 2 && (
          <div className="pt-6 space-y-6">
            {/* Destination Input */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#00685F]" />
                <span>Destination City &amp; Country</span>
              </label>
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-[#6D7A77] absolute left-3.5" />
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Kyoto, Japan or Mecca, Saudi Arabia"
                  className="w-full h-12 pl-10 pr-4 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] text-sm font-bold text-[#161C23] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 focus:bg-white transition-all shadow-inner"
                />
              </div>
            </div>

            {/* Popular Halal Travel Presets */}
            <div>
              <span className="text-xs font-bold text-[#6D7A77] mb-2 block">
                Popular Muslim Travel Hubs:
              </span>
              <div className="flex flex-wrap gap-2">
                {DESTINATION_PRESETS.map((preset) => (
                  <button
                    key={preset.city}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                      destination.toLowerCase().includes(preset.city.toLowerCase())
                        ? 'bg-[#00685F] text-white border-[#00685F] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#161C23] border-[#E7DFD5] hover:bg-white'
                    }`}
                  >
                    <span>{preset.emoji}</span>
                    <span>{preset.city}</span>
                    <span className="text-[10px] opacity-75">({preset.country})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dates and Travel Group */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#00685F]" />
                  <span>Travel Date Range</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="Start date"
                    className="w-1/2 h-11 px-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-center text-[#161C23]"
                  />
                  <span className="text-xs text-[#6D7A77]">to</span>
                  <input
                    type="text"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="End date"
                    className="w-1/2 h-11 px-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-center text-[#161C23]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#00685F]" />
                  <span>Travel Party / Group</span>
                </label>
                <select
                  value={travelGroup}
                  onChange={(e) => setTravelGroup(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23] focus:outline-none focus:bg-white"
                >
                  <option value="Friends (4 members)">Friends Group (Mixed/Muslim)</option>
                  <option value="Family with Kids & Elders">Multi-Generation Family</option>
                  <option value="Couple Getaway">Couple Getaway</option>
                  <option value="Solo Traveler">Solo Explorer</option>
                  <option value="Corporate / University Trip">Corporate / Study Trip</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: WHERE TO VISIT (TOURISM POINTS)                                   */}
        {/* ========================================================================= */}
        {currentStep === 3 && (
          <div className="pt-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[#161C23] flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#00685F]" />
                  <span>Choose Must-Visit Points of Interest in {destination.split(',')[0]}</span>
                </label>
                <span className="text-xs font-bold text-[#00685F]">
                  {selectedPoints.length} selected
                </span>
              </div>
              <p className="text-xs text-[#6D7A77] mb-3">
                Select from top-rated attractions or add specific spots you want Safar AI to schedule around prayer times and Halal dining.
              </p>

              {/* Recommended Tourism Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {activePreset.suggestedPoints.map((point) => {
                  const isChecked = selectedPoints.includes(point);
                  return (
                    <button
                      key={point}
                      type="button"
                      onClick={() => handleTogglePoint(point)}
                      className={`p-2.5 rounded-xl text-left border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-[#EEF4FE] border-[#00685F] text-[#00685F] font-bold'
                          : 'bg-[#FAF8F5] border-[#E7DFD5] text-[#161C23] hover:bg-white'
                      }`}
                    >
                      <span className="text-xs truncate">{point}</span>
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          isChecked ? 'bg-[#00685F] text-white' : 'border border-[#C4BCB3]'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Point Input */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 block">
                + Add Another Landmark, Museum or Food District
              </label>
              <form onSubmit={handleAddCustomPoint} className="flex gap-2">
                <input
                  type="text"
                  value={customPointInput}
                  onChange={(e) => setCustomPointInput(e.target.value)}
                  placeholder="e.g. Kyoto Tower, Tsukiji Fish Market, Grand Mosque"
                  className="flex-1 h-11 px-3.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 focus:bg-white"
                />
                <button
                  type="submit"
                  className="px-4 h-11 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </form>
            </div>

            {/* Selected Tags Display */}
            {selectedPoints.length > 0 && (
              <div className="pt-2 border-t border-[#E7DFD5]">
                <span className="text-[11px] font-bold text-[#6D7A77] block mb-2">
                  Trip Itinerary Anchors:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPoints.map((point) => (
                    <span
                      key={point}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23]"
                    >
                      <span>{point}</span>
                      <button
                        type="button"
                        onClick={() => handleTogglePoint(point)}
                        className="text-[#6D7A77] hover:text-[#dc2626] transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: PREFERENCES & HALAL STRICTNESS                                    */}
        {/* ========================================================================= */}
        {currentStep === 4 && (
          <div className="pt-6 space-y-6">
            {/* Travel Pace */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <Footprints className="w-4 h-4 text-[#00685F]" />
                <span>Travel Pace &amp; Walking Tolerance</span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'relaxed',
                    label: 'Relaxed & Easy',
                    desc: 'Padded buffers for kids, stroller & elderly',
                  },
                  {
                    id: 'moderate',
                    label: 'Balanced Pace',
                    desc: '2-3 key stops per day + meal & prayer pauses',
                  },
                  {
                    id: 'fast',
                    label: 'High Energy',
                    desc: 'See as much as possible, fast transit routing',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPace(item.id as TravelPace)}
                    className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                      pace === item.id
                        ? 'bg-[#EEF4FE] border-[#00685F] ring-2 ring-[#00685F]/20'
                        : 'bg-[#FAF8F5] border-[#E7DFD5] hover:bg-white'
                    }`}
                  >
                    <span className="text-xs font-black text-[#161C23] block">
                      {item.label}
                    </span>
                    <span className="text-[10px] text-[#6D7A77] font-medium block mt-1 leading-tight">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Halal Strictness Policy */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#00685F]" />
                <span>Group Halal Dining Verification Policy</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'strictly_halal',
                    title: 'Tier 1: Certified Halal',
                    desc: 'Only officially certified kitchens (JAKIM, NAHA, JHA).',
                  },
                  {
                    id: 'muslim_owned',
                    title: 'Tier 2: Muslim-Owned',
                    desc: 'Muslim owners or chefs with halal meat assurance.',
                  },
                  {
                    id: 'pork_free',
                    title: 'Tier 3: Pork-Free',
                    desc: 'Pork & alcohol-free local restaurants.',
                  },
                ].map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setHalalTier(tier.id as FaithDietaryTier)}
                    className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                      halalTier === tier.id
                        ? 'bg-[#EEF4FE] border-[#00685F] ring-2 ring-[#00685F]/20'
                        : 'bg-[#FAF8F5] border-[#E7DFD5] hover:bg-white'
                    }`}
                  >
                    <span className="text-xs font-black text-[#161C23] block">
                      {tier.title}
                    </span>
                    <span className="text-[10px] text-[#6D7A77] font-medium block mt-1 leading-tight">
                      {tier.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prayer Anchor Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#EEF4FE]/60 border border-[#00685F]/20">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#00685F] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-extrabold text-[#161C23]">
                    Auto-Lock Local Prayer Times (Waktu Solat)
                  </h4>
                  <p className="text-[11px] text-[#6D7A77] mt-0.5">
                    Automatically fetches GPS prayer times for {destination.split(',')[0]} and reserves 45-min musalla/mosque rest breaks.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prayerBuffers}
                onChange={(e) => setPrayerBuffers(e.target.checked)}
                className="w-5 h-5 accent-[#00685F] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* BOTTOM NAVIGATION CONTROLS                                                */}
        {/* ========================================================================= */}
        <div className="pt-6 mt-6 border-t border-[#E7DFD5] flex items-center justify-between gap-3">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
              className="px-5 py-2.5 rounded-xl border border-[#E7DFD5] bg-[#FAF8F5] hover:bg-white text-xs font-bold text-[#161C23] transition-colors cursor-pointer"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl border border-[#E7DFD5] bg-[#FAF8F5] hover:bg-white text-xs font-bold text-[#6D7A77] transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((prev) => (prev + 1) as any)}
              className="px-6 py-2.5 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-7 py-3 rounded-2xl bg-[#00685F] hover:bg-[#008378] active:scale-[0.99] text-white text-sm font-black flex items-center gap-2 shadow-md transition-all cursor-pointer group"
            >
              <Sparkles className="w-4 h-4 text-[#62FAE3] group-hover:rotate-12 transition-transform" />
              <span>Generate AI Itinerary (as Team Lead 👑)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
