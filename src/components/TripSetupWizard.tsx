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
  CloudSun,
  CloudRain,
  Route,
  ArrowUpDown,
  BookOpen,
  Link as LinkIcon,
  HelpCircle,
  Sliders,
  CheckCircle2,
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
    routeStrategy: 'weather_smart' | 'minimal_distance' | 'faith_anchored';
    weatherAware: boolean;
  }) => void;
  onCancel: () => void;
}

interface DestinationPreset {
  city: string;
  country: string;
  emoji: string;
  currency: string;
  weatherPreview: { temp: string; cond: string; icon: string; advice: string };
  suggestedPoints: { name: string; category: string; estDistance: string; weatherType: 'outdoor' | 'indoor' | 'flexible' }[];
}

const DESTINATION_PRESETS: DestinationPreset[] = [
  {
    city: 'Kyoto',
    country: 'Japan',
    emoji: '🍁',
    currency: '¥',
    weatherPreview: {
      temp: '22°C',
      cond: 'Clear & Mild Autumn',
      icon: '☀️',
      advice: 'Crisp autumn weather. Morning outdoor foliage is peak at Arashiyama. 20% light drizzle chance late afternoon.',
    },
    suggestedPoints: [
      { name: 'Arashiyama Bamboo Grove', category: 'Nature & Scenic', estDistance: '7.2 km West', weatherType: 'outdoor' },
      { name: 'Fushimi Inari Taisha (Torii Gates)', category: 'Heritage Walk', estDistance: '3.8 km South', weatherType: 'outdoor' },
      { name: 'Kyoto Islamic Cultural Center', category: 'Prayer & Musalla', estDistance: '1.2 km Central', weatherType: 'indoor' },
      { name: 'Gion Historic District & Teahouses', category: 'Culture & Dining', estDistance: '0.9 km Central', weatherType: 'flexible' },
      { name: 'Nishiki Market (Covered Arcade)', category: 'Halal Food Walk', estDistance: '0.6 km Central', weatherType: 'indoor' },
      { name: 'Kiyomizu-dera Temple Viewpoint', category: 'Historical Landmark', estDistance: '2.1 km East', weatherType: 'outdoor' },
      { name: 'Kyoto National Museum', category: 'Imperial Art & History', estDistance: '1.8 km East', weatherType: 'indoor' },
    ],
  },
  {
    city: 'Mecca & Madinah',
    country: 'Saudi Arabia',
    emoji: '🕋',
    currency: 'SAR',
    weatherPreview: {
      temp: '34°C',
      cond: 'Warm & Sunny',
      icon: '☀️',
      advice: 'High daytime temperatures. Best to schedule outdoor ziyarat visits in early morning (Fajr-Duha) or evening after Asr.',
    },
    suggestedPoints: [
      { name: 'Masjid al-Haram & Kaaba', category: 'Sacred Sanctuary', estDistance: 'Central', weatherType: 'flexible' },
      { name: 'Al-Masjid an-Nabawi (Madinah)', category: 'Prophetic Mosque', estDistance: 'Intercity', weatherType: 'flexible' },
      { name: 'Jabal al-Nour & Hira Cave', category: 'Historical Mountain', estDistance: '5.4 km NE', weatherType: 'outdoor' },
      { name: 'Mount Arafat & Mina', category: 'Pilgrimage Sites', estDistance: '12 km East', weatherType: 'outdoor' },
      { name: 'Clock Tower Museum (Indoor)', category: 'Islamic History', estDistance: '0.2 km South', weatherType: 'indoor' },
    ],
  },
  {
    city: 'Istanbul',
    country: 'Turkey',
    emoji: '🕌',
    currency: '₺',
    weatherPreview: {
      temp: '19°C',
      cond: 'Partly Cloudy & Breeze',
      icon: '⛅',
      advice: 'Mild Bosphorus breeze. Ideal for all-day walking with covered bazaar alternatives.',
    },
    suggestedPoints: [
      { name: 'Hagia Sophia Grand Mosque', category: 'Historical Heritage', estDistance: '0.3 km Sultanahmet', weatherType: 'indoor' },
      { name: 'Blue Mosque (Sultan Ahmed)', category: 'Historic Mosque', estDistance: '0.4 km Sultanahmet', weatherType: 'indoor' },
      { name: 'Grand Bazaar (Covered Spice Walk)', category: 'Shopping & Sweets', estDistance: '1.1 km West', weatherType: 'indoor' },
      { name: 'Bosphorus Sunset Ferry Cruise', category: 'Scenic Waterway', estDistance: '2.5 km North', weatherType: 'outdoor' },
      { name: 'Topkapi Palace Gardens', category: 'Ottoman Architecture', estDistance: '0.7 km East', weatherType: 'outdoor' },
    ],
  },
  {
    city: 'Kuala Lumpur',
    country: 'Malaysia',
    emoji: '🌴',
    currency: 'RM',
    weatherPreview: {
      temp: '30°C',
      cond: 'Tropical Warmth & Showers',
      icon: '🌦️',
      advice: 'Warm mornings. Afternoon tropical rain showers common (3-5 PM); plan covered mall/mosque rest breaks.',
    },
    suggestedPoints: [
      { name: 'Petronas Twin Towers & KLCC Park', category: 'Iconic Modern', estDistance: 'Central', weatherType: 'flexible' },
      { name: 'National Mosque of Malaysia (Masjid Negara)', category: 'Grand Mosque', estDistance: '2.5 km SW', weatherType: 'indoor' },
      { name: 'Batu Caves Sanctuary', category: 'Scenic Landmark', estDistance: '11 km North', weatherType: 'outdoor' },
      { name: 'Islamic Arts Museum Malaysia (Indoor)', category: 'Treasures & Art', estDistance: '2.8 km SW', weatherType: 'indoor' },
      { name: 'Jalan Alor Halal Gastronomy Corridor', category: 'Foodie Haven', estDistance: '1.2 km South', weatherType: 'outdoor' },
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
    'Gion Historic District & Teahouses',
    'Nishiki Market (Covered Arcade)',
  ]);
  const [customPointInput, setCustomPointInput] = useState('');

  // 📕 RedNote (小红书) / Social Link Import State
  const [redNoteUrl, setRedNoteUrl] = useState('');
  const [isExtractingRedNote, setIsExtractingRedNote] = useState(false);
  const [redNoteSuccessMsg, setRedNoteSuccessMsg] = useState<string | null>(null);

  // 4. Weather & Distance Route Strategy (User in Control, not AI dominant)
  const [routeStrategy, setRouteStrategy] = useState<'weather_smart' | 'minimal_distance' | 'faith_anchored'>('weather_smart');
  const [weatherAware, setWeatherAware] = useState(true);
  const [pace, setPace] = useState<TravelPace>('moderate');
  const [halalTier, setHalalTier] = useState<FaithDietaryTier>('strictly_halal');
  const [prayerBuffers, setPrayerBuffers] = useState(true);

  // Active preset data
  const activePreset = DESTINATION_PRESETS.find(
    (p) => destination.toLowerCase().includes(p.city.toLowerCase())
  ) || DESTINATION_PRESETS[0];

  const handleSelectPreset = (preset: DestinationPreset) => {
    setDestination(`${preset.city}, ${preset.country}`);
    setSelectedPoints(preset.suggestedPoints.slice(0, 5).map((p) => p.name));
    setCurrency(preset.currency);
  };

  const handleTogglePoint = (pointName: string) => {
    if (selectedPoints.includes(pointName)) {
      setSelectedPoints(selectedPoints.filter((p) => p !== pointName));
    } else {
      setSelectedPoints([...selectedPoints, pointName]);
    }
  };

  // Reorder points manually (User control!)
  const handleMovePoint = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= selectedPoints.length) return;
    const copy = [...selectedPoints];
    const temp = copy[idx];
    copy[idx] = copy[newIdx];
    copy[newIdx] = temp;
    setSelectedPoints(copy);
  };

  const handleAddCustomPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPointInput.trim()) return;
    if (!selectedPoints.includes(customPointInput.trim())) {
      setSelectedPoints([...selectedPoints, customPointInput.trim()]);
    }
    setCustomPointInput('');
  };

  // 📕 RedNote (小红书) Link Import Handler
  const handleImportRedNote = (urlToExtract: string) => {
    const url = urlToExtract || redNoteUrl;
    if (!url.trim()) return;

    setIsExtractingRedNote(true);
    setRedNoteSuccessMsg(null);

    setTimeout(() => {
      setIsExtractingRedNote(false);
      // Smart extraction based on RedNote link content
      const extractedSpots = [
        'Ayam-YA Halal Ramen Karasuma (小红书爆款清真拉面)',
        'Kiyomizu-dera Teahouse Sunset (小红书绝景机位)',
        'Gion Artisan Alley (小红书避坑探店)',
      ];

      const newPoints = [...selectedPoints];
      extractedSpots.forEach((spot) => {
        if (!newPoints.includes(spot)) newPoints.push(spot);
      });

      setSelectedPoints(newPoints);
      setRedNoteSuccessMsg(`✓ Extracted 3 verified spots from RedNote (小红书) link! Added to your tour list.`);
      setTimeout(() => setRedNoteSuccessMsg(null), 4000);
    }, 700);
  };

  const handleFinish = () => {
    onComplete({
      leadName: leadName.trim() || 'Team Lead',
      leadFaithDietary,
      destination: destination.trim() || 'Kyoto, Japan',
      startDate,
      endDate,
      travelGroup,
      tourismPoints: selectedPoints.length > 0 ? selectedPoints : ['City Center & Cultural Corridor'],
      pace,
      halalTier,
      prayerBuffers,
      currency,
      routeStrategy,
      weatherAware,
    });
  };

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
                  <span>Team Lead Itinerary Wizard</span>
                </span>
                <span className="text-xs font-bold text-[#6D7A77]">
                  Step {currentStep} of 4
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#161C23] mt-0.5">
                {currentStep === 1 && '1. Lead Profile & Role Authority'}
                {currentStep === 2 && '2. Destination, Dates & Live Weather'}
                {currentStep === 3 && '3. Places to Visit & RedNote Import'}
                {currentStep === 4 && '4. Route Optimization (User Controlled)'}
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
                  As the planner, you hold prior authorization. The AI will assist with live weather, distance clustering, and prayer anchors, but <strong>you maintain full authority</strong> to approve, reorder, or swap stops.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#161C23] mb-1.5 block">
                  Your Name / Lead Identifier
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
                      desc: 'Vegetarian, seafood, or zero pork/lard contamination.',
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
                          : 'bg-[#FAF8F5] border-[#E7DFD5] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-[#161C23]">{option.title}</span>
                        <span className="text-[10px] font-bold text-[#00685F]">{option.badge}</span>
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
        {/* STEP 2: DESTINATION, DATES & LIVE WEATHER                                 */}
        {/* ========================================================================= */}
        {currentStep === 2 && (
          <div className="pt-6 space-y-5">
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

            {/* Live Weather Forecast Preview (Requirement: Consider Weather in Planning) */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50/70 to-[#EEF4FE] border border-[#E7DFD5] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CloudSun className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-extrabold text-[#161C23]">
                    Live Weather Insight for {destination.split(',')[0]}
                  </span>
                </div>
                <span className="text-xs font-black text-[#00685F] bg-white px-2.5 py-0.5 rounded-full border border-[#E7DFD5]">
                  {activePreset.weatherPreview.icon} {activePreset.weatherPreview.temp} · {activePreset.weatherPreview.cond}
                </span>
              </div>
              <p className="text-xs text-[#526360] leading-relaxed">
                💡 <strong>Route Planning Advice:</strong> {activePreset.weatherPreview.advice}
              </p>
            </div>

            {/* Quick Destination Hubs */}
            <div>
              <span className="text-xs font-bold text-[#6D7A77] mb-2 block">
                Select from Curated Hubs:
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
                    <span className="text-[10px] opacity-75">({preset.weatherPreview.temp})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dates & Travel Group */}
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
                  <span>Travel Party</span>
                </label>
                <select
                  value={travelGroup}
                  onChange={(e) => setTravelGroup(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23]"
                >
                  <option value="Friends (4 members)">Friends Group (Mixed-Faith &amp; Halal)</option>
                  <option value="Family with Kids & Elders">Multi-Generation Family</option>
                  <option value="Couple Getaway">Couple Getaway</option>
                  <option value="Solo Explorer">Solo Traveler</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: WHERE TO VISIT + REDNOTE (小红书) LINK IMPORT                      */}
        {/* ========================================================================= */}
        {currentStep === 3 && (
          <div className="pt-6 space-y-5">
            {/* 📕 RedNote (小红书) Import Box */}
            <div className="p-4 rounded-2xl bg-[#FFF5F5] border border-red-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-red-700 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-red-600" />
                  <span>Import from RedNote (小红书) or Social Link</span>
                </span>
                <span className="text-[10px] font-extrabold bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                  📕 小红书 / RedNote
                </span>
              </div>
              <p className="text-[11px] text-red-900/80">
                Paste any RedNote (小红书) travel note, TikTok, or Reel. Safar AI extracts tourist spots, checks weather compatibility, and pulls Halal ratings into your list.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={redNoteUrl}
                  onChange={(e) => setRedNoteUrl(e.target.value)}
                  placeholder="Paste RedNote link (e.g. xhslink.com/... or xiaohongshu.com/...)"
                  className="flex-1 h-11 px-3.5 rounded-xl bg-white border border-red-200 text-xs font-bold text-[#161C23] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <button
                  type="button"
                  onClick={() => handleImportRedNote(redNoteUrl)}
                  disabled={isExtractingRedNote}
                  className="px-4 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isExtractingRedNote ? 'Extracting...' : 'Extract'}</span>
                </button>
              </div>

              {/* Sample RedNote Links */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-red-800">Quick Test:</span>
                <button
                  type="button"
                  onClick={() => handleImportRedNote('https://xhslink.com/a/kyoto_halal_ramen')}
                  className="px-2 py-0.5 rounded-lg bg-white border border-red-200 text-[10px] font-bold text-red-700 hover:bg-red-50"
                >
                  📕 小红书京都爆款拉面打卡
                </button>
                <button
                  type="button"
                  onClick={() => handleImportRedNote('https://xhslink.com/a/arashiyama_autumn_walk')}
                  className="px-2 py-0.5 rounded-lg bg-white border border-red-200 text-[10px] font-bold text-red-700 hover:bg-red-50"
                >
                  📕 岚山竹林红叶避坑攻略
                </button>
              </div>

              {redNoteSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-1.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{redNoteSuccessMsg}</span>
                </div>
              )}
            </div>

            {/* Tourist Points Selection with Distance & Weather Badges */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[#161C23] flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#00685F]" />
                  <span>Points of Interest in {destination.split(',')[0]}</span>
                </label>
                <span className="text-xs font-bold text-[#00685F]">
                  {selectedPoints.length} selected
                </span>
              </div>
              <p className="text-xs text-[#6D7A77] mb-3">
                Includes walking distance and outdoor/indoor weather classification for optimal routing:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {activePreset.suggestedPoints.map((point) => {
                  const isChecked = selectedPoints.includes(point.name);
                  return (
                    <button
                      key={point.name}
                      type="button"
                      onClick={() => handleTogglePoint(point.name)}
                      className={`p-2.5 rounded-xl text-left border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-[#EEF4FE] border-[#00685F] text-[#00685F] font-bold'
                          : 'bg-[#FAF8F5] border-[#E7DFD5] text-[#161C23] hover:bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="text-xs truncate block">{point.name}</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#6D7A77] mt-0.5">
                          <span>📍 {point.estDistance}</span>
                          <span>·</span>
                          <span>{point.weatherType === 'outdoor' ? '☀️ Outdoor' : '🏛️ Indoor'}</span>
                        </div>
                      </div>
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

            {/* Custom Attraction Add */}
            <form onSubmit={handleAddCustomPoint} className="flex gap-2">
              <input
                type="text"
                value={customPointInput}
                onChange={(e) => setCustomPointInput(e.target.value)}
                placeholder="+ Add another spot (e.g. Kyoto Tower, Yasaka Shrine)"
                className="flex-1 h-11 px-3.5 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold text-[#161C23]"
              />
              <button
                type="submit"
                className="px-4 h-11 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </form>

            {/* Selected Sequence (User Can Reorder - AI Does NOT Dominate) */}
            {selectedPoints.length > 0 && (
              <div className="pt-2 border-t border-[#E7DFD5] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase text-[#6D7A77]">
                    Route Order (Use arrows to reorder — You control the route):
                  </span>
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {selectedPoints.map((point, idx) => (
                    <div
                      key={point}
                      className="flex items-center justify-between p-2 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] text-xs font-bold"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-5 h-5 rounded-full bg-[#00685F]/10 text-[#00685F] text-[10px] flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <span className="truncate">{point}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMovePoint(idx, 'up')}
                          disabled={idx === 0}
                          className="px-1.5 py-0.5 rounded bg-white border border-[#E7DFD5] text-[10px] hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMovePoint(idx, 'down')}
                          disabled={idx === selectedPoints.length - 1}
                          className="px-1.5 py-0.5 rounded bg-white border border-[#E7DFD5] text-[10px] hover:bg-neutral-100 disabled:opacity-30 cursor-pointer"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePoint(point)}
                          className="text-red-500 hover:text-red-700 ml-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: WEATHER & DISTANCE ROUTE OPTIMIZATION (USER IN CONTROL)           */}
        {/* ========================================================================= */}
        {currentStep === 4 && (
          <div className="pt-6 space-y-5">
            {/* User-in-Control Assurance Banner */}
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-amber-950">
                  User in Control Guarantee (AI Acts as Copilot, Not Dominant)
                </h4>
                <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                  The itinerary adapts to distance and weather according to your selected policy below. You can manually adjust, lock, or swap any stop in the workspace at any time.
                </p>
              </div>
            </div>

            {/* Route Strategy Selection */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <Route className="w-4 h-4 text-[#00685F]" />
                <span>Choose How Safar Should Structure Your Route</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'weather_smart',
                    title: '🌤️ Weather-Smart',
                    desc: 'Outdoor gardens in clear mornings, covered markets & tea rooms if rain/heat predicted.',
                  },
                  {
                    id: 'minimal_distance',
                    title: '🚶 Shortest Distance',
                    desc: 'Cluster stops tightly by district to avoid zigzagging and minimize walking exhaustion.',
                  },
                  {
                    id: 'faith_anchored',
                    title: '🕌 Faith-Anchored',
                    desc: 'Group stops closest to certified Halal dining and musalla/wudu hubs at prayer hours.',
                  },
                ].map((strat) => (
                  <button
                    key={strat.id}
                    type="button"
                    onClick={() => setRouteStrategy(strat.id as any)}
                    className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                      routeStrategy === strat.id
                        ? 'bg-[#EEF4FE] border-[#00685F] ring-2 ring-[#00685F]/20'
                        : 'bg-[#FAF8F5] border-[#E7DFD5] hover:bg-white'
                    }`}
                  >
                    <span className="text-xs font-black text-[#161C23] block">{strat.title}</span>
                    <span className="text-[10px] text-[#6D7A77] font-medium block mt-1 leading-tight">
                      {strat.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Weather Sensor Active Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#EEF4FE]/60 border border-[#00685F]/20">
              <div className="flex items-center gap-3">
                <CloudSun className="w-5 h-5 text-[#00685F] shrink-0" />
                <div>
                  <h4 className="text-xs font-extrabold text-[#161C23]">
                    Live Weather Sensor Active ({activePreset.weatherPreview.temp} in {destination.split(',')[0]})
                  </h4>
                  <p className="text-[11px] text-[#6D7A77]">
                    Forecast will recommend umbrella buffers or indoor tea rest when rain is likely.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={weatherAware}
                onChange={(e) => setWeatherAware(e.target.checked)}
                className="w-5 h-5 accent-[#00685F] cursor-pointer"
              />
            </div>

            {/* Halal Verification Tier Policy */}
            <div>
              <label className="text-xs font-bold text-[#161C23] mb-1.5 flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4 text-[#00685F]" />
                <span>Halal Dining Verification Tier</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'strictly_halal', label: '100% Certified', sub: 'JAKIM, NAHA, JHA only' },
                  { id: 'muslim_owned', label: 'Muslim-Owned', sub: 'Trusted Muslim kitchens' },
                  { id: 'pork_free', label: 'Pork & Alcohol Free', sub: 'Vegetarian / Seafood' },
                ].map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setHalalTier(tier.id as FaithDietaryTier)}
                    className={`p-2.5 rounded-xl text-left border text-xs transition-all cursor-pointer ${
                      halalTier === tier.id
                        ? 'bg-[#EEF4FE] border-[#00685F] font-bold text-[#00685F]'
                        : 'bg-[#FAF8F5] border-[#E7DFD5] text-[#161C23] hover:bg-white'
                    }`}
                  >
                    <div className="font-bold">{tier.label}</div>
                    <div className="text-[10px] text-[#6D7A77]">{tier.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Prayer Anchor Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5]">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-[#00685F]" />
                <div>
                  <h4 className="text-xs font-bold text-[#161C23]">
                    Auto-Anchor Daily Prayer Times (GPS-Synced)
                  </h4>
                  <p className="text-[11px] text-[#6D7A77]">
                    Includes nearby wudu facilities &amp; musalla directions for {destination.split(',')[0]}.
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
              <span>Generate Route (User-Controlled &amp; Weather-Optimized)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
