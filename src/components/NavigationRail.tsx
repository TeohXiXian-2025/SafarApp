import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  AlertTriangle,
  FileText,
  MapPin,
  Bookmark,
  DollarSign,
  Sparkles,
  Moon,
  Shield,
  ChevronDown,
  ChevronUp,
  Compass,
  Layers,
} from 'lucide-react';
import { TripState, ItineraryDay, SalahTime } from '../types/itinerary';
import { fetchKyotoPrayerTimes, KyotoPrayerData } from '../services/prayerTimeService';

interface NavigationRailProps {
  state: TripState;
  onSelectDay: (dayId: string) => void;
  onToggleCollapse: () => void;
  onOpenMultiplayer?: () => void;
  onOpenConflict?: () => void;
  onOpenVault?: () => void;
  onOpenBudget?: () => void;
  onToggleGroupTravel?: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  ATTRACTION: '🏛️',
  FOOD: '🍜',
  PRAYER: '🕌',
  LODGING: '🏨',
  TRANSIT: '🚆',
};

const SALAH_COLORS: Record<string, string> = {
  Fajr: 'text-sky-500',
  Dhuhr: 'text-amber-500',
  Asr: 'text-orange-500',
  Maghrib: 'text-rose-500',
  Isha: 'text-purple-500',
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

interface DayCalendarItemProps {
  day: ItineraryDay;
  isActive: boolean;
  isCollapsed: boolean;
  onSelect: () => void;
}

const DayCalendarItem: React.FC<DayCalendarItemProps> = ({
  day,
  isActive,
  isCollapsed,
  onSelect,
}) => {
  const [expanded, setExpanded] = useState(isActive);
  const stopCount = day.stops.length;
  const prayerCount = day.stops.filter((s) => s.category === 'PRAYER').length;
  const attractionCount = day.stops.filter((s) => s.category === 'ATTRACTION').length;
  const dayColor = day.color || (day.dayNumber === 1 ? '#0284C7' : day.dayNumber === 2 ? '#F97316' : '#8B5CF6');

  return (
    <div className="select-none">
      <button
        type="button"
        onClick={() => {
          onSelect();
          if (!isCollapsed) setExpanded((e) => !e);
        }}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer group ${
          isActive
            ? 'text-white shadow-md'
            : 'hover:bg-[#FAF8F5] text-[#526360]'
        }`}
        style={{
          backgroundColor: isActive ? dayColor : undefined,
        }}
        title={`Day ${day.dayNumber} — ${day.themeTitle}`}
      >
        {/* Day Number Badge */}
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
            isActive ? 'bg-white/20 text-white' : 'text-white font-bold'
          }`}
          style={{
            backgroundColor: isActive ? undefined : dayColor,
          }}
        >
          {day.dayNumber}
        </div>

        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-[#161C23]'}`}
              >
                {day.themeTitle}
              </span>
            </div>
            <div
              className={`text-[10px] font-semibold truncate ${
                isActive ? 'text-white/80' : 'text-[#8A9592]'
              }`}
            >
              {day.dateLabel ? day.dateLabel : formatDate(day.date)}
              {day.distanceMiles ? ` · ${day.distanceMiles}` : ''}
            </div>
          </div>
        )}

        {!isCollapsed && (
          <div className="flex items-center gap-1 shrink-0">
            {attractionCount > 0 && (
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}
                title={`${attractionCount} attractions`}
              >
                🏛️{attractionCount}
              </span>
            )}
            {prayerCount > 0 && (
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-teal-50 text-teal-700'
                }`}
                title={`${prayerCount} prayer stops`}
              >
                🕌{prayerCount}
              </span>
            )}
            {isActive &&
              (expanded ? (
                <ChevronUp className="w-3 h-3 text-white/80" />
              ) : (
                <ChevronDown className="w-3 h-3 text-white/80" />
              ))}
          </div>
        )}
      </button>

      {/* Expandable Stop Preview */}
      {!isCollapsed && isActive && expanded && (
        <div className="ml-9 mt-1 space-y-0.5 pb-1 border-l-2 pl-2" style={{ borderColor: `${dayColor}40` }}>
          {day.stops.slice(0, 6).map((stop) => (
            <div
              key={stop.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold text-[#526360] hover:bg-[#EAF6F4] transition-colors cursor-default"
              title={stop.title}
            >
              <span>{CATEGORY_ICONS[stop.category] ?? '📍'}</span>
              <span className="truncate">{stop.title}</span>
              {stop.timeWindow && (
                <span className="ml-auto text-[9px] text-[#8A9592] shrink-0 font-mono">
                  {stop.timeWindow.start.replace(' AM', '').replace(' PM', '')}
                </span>
              )}
            </div>
          ))}
          {day.stops.length > 6 && (
            <div className="text-[9px] text-[#8A9592] px-2 py-0.5 italic">
              +{day.stops.length - 6} more stops in itinerary...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface KyotoSalahWidgetProps {
  isCollapsed: boolean;
}

const KyotoSalahWidget: React.FC<KyotoSalahWidgetProps> = ({ isCollapsed }) => {
  const [prayerData, setPrayerData] = useState<KyotoPrayerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchKyotoPrayerTimes().then((data) => {
      if (mounted) {
        setPrayerData(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (isCollapsed) {
    return (
      <div
        className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center cursor-default"
        title="Kyoto Solat Time Zone (Aladhan API)"
      >
        <Moon className="w-4 h-4 text-teal-600" />
      </div>
    );
  }

  const nextPrayer = prayerData?.fiveDailySalah.find((s) => s.isNext);

  return (
    <div className="p-3 rounded-2xl bg-gradient-to-br from-[#0D6955]/10 via-teal-50/50 to-emerald-50/40 border border-[#0D6955]/20 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Moon className="w-3.5 h-3.5 text-[#0D6955]" />
          <span className="text-xs font-black text-[#161C23]">Kyoto Solat API</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
            {prayerData?.isLive ? 'Live API' : 'Synced'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[#526360] pb-1 border-b border-[#0D6955]/10">
        <span className="font-semibold">Kyoto (Asia/Tokyo)</span>
        <span className="font-bold flex items-center gap-0.5 text-teal-700">
          <Compass className="w-2.5 h-2.5" /> Qibla 287°
        </span>
      </div>

      {loading ? (
        <div className="text-[10px] text-[#8A9592] py-2 text-center">Loading Kyoto Solat API...</div>
      ) : (
        <div className="space-y-1">
          {prayerData?.fiveDailySalah.map((s) => (
            <div
              key={s.name}
              className={`flex items-center justify-between text-[10px] rounded px-1.5 py-0.5 ${
                s.isNext
                  ? 'bg-[#0D6955] text-white font-bold shadow-sm'
                  : s.isPassed
                  ? 'text-[#8A9592] line-through'
                  : 'text-[#161C23] font-medium'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={s.isNext ? 'text-white' : SALAH_COLORS[s.name] ?? ''}>
                  {s.name}
                </span>
                {s.isNext && (
                  <span className="text-[8px] font-black bg-white/20 text-white px-1 rounded uppercase">
                    NEXT
                  </span>
                )}
              </div>
              <span className="font-mono">{s.formattedTime12}</span>
            </div>
          ))}
        </div>
      )}

      {nextPrayer && (
        <div className="text-[9px] text-[#0D6955] font-bold bg-[#EAF6F4] p-1.5 rounded-xl text-center">
          Next Prayer: {nextPrayer.name} at {nextPrayer.formattedTime12}
        </div>
      )}
    </div>
  );
};

export const NavigationRail: React.FC<NavigationRailProps> = ({
  state,
  onSelectDay,
  onToggleCollapse,
  onOpenMultiplayer,
  onOpenConflict,
  onOpenVault,
  onOpenBudget,
  onToggleGroupTravel,
}) => {
  const { days, activeDayId, navRailCollapsed: isCollapsed } = state;

  const navItems = [
    {
      id: 'conflict',
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      label: 'Conflict Radar',
      badge: 'Protected',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      action: onOpenConflict,
    },
    {
      id: 'vault',
      icon: <Shield className="w-4 h-4" />,
      label: 'Document Vault',
      action: onOpenVault,
    },
    {
      id: 'budget',
      icon: <DollarSign className="w-4 h-4" />,
      label: 'Budget (PDF MYR 0.00)',
      badge: '¥0',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      action: onOpenBudget,
    },
  ];

  return (
    <aside
      className={`flex flex-col bg-white border-r border-[#E7DFD5] shrink-0 h-full overflow-hidden transition-all duration-300 select-none hidden md:flex ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* ─── Brand + Collapse Toggle ─── */}
      <div
        className={`flex items-center border-b border-[#E7DFD5] shrink-0 ${
          isCollapsed ? 'justify-center p-3' : 'justify-between px-4 py-3'
        }`}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#0D6955] text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
              S
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-[#161C23] tracking-tight leading-none">
                Safar OS
              </div>
              <div className="text-[10px] font-semibold text-[#6D7A77] truncate">
                {state.title}
              </div>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 rounded-xl bg-[#0D6955] text-white flex items-center justify-center font-black text-sm shadow-sm">
            S
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`p-1.5 rounded-lg text-[#8A9592] hover:text-[#161C23] hover:bg-[#FAF8F5] transition-colors cursor-pointer shrink-0 ${
            isCollapsed ? 'mt-2' : ''
          }`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* ─── Scrollable Body ─── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className={`py-3 space-y-3 ${isCollapsed ? 'px-2' : 'px-3'}`}>
          {/* Overview ("总览") Button matching reference screenshot */}
          <div>
            <button
              type="button"
              onClick={() => onSelectDay('overview')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left font-extrabold text-xs transition-all cursor-pointer ${
                activeDayId === 'overview'
                  ? 'bg-[#161C23] text-white shadow-md'
                  : 'bg-[#FAF8F5] text-[#161C23] hover:bg-[#F3EFEA] border border-[#E7DFD5]'
              }`}
              title="Overview of all days"
            >
              <span className="text-sm">📋</span>
              {!isCollapsed && (
                <>
                  <span className="flex-1">Overview</span>
                  <span
                    className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      activeDayId === 'overview'
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {days.length} Days
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Calendar Day Tree */}
          <div>
            {!isCollapsed && (
              <div className="flex items-center gap-1.5 px-2 mb-1.5">
                <Calendar className="w-3 h-3 text-[#8A9592]" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#8A9592]">
                  Itinerary Schedule
                </span>
              </div>
            )}
            <div className={`space-y-1 ${isCollapsed ? 'space-y-1.5' : ''}`}>
              {days.map((day) => (
                <DayCalendarItem
                  key={day.id}
                  day={day}
                  isActive={day.id === activeDayId}
                  isCollapsed={isCollapsed}
                  onSelect={() => onSelectDay(day.id)}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className={`border-t border-[#E7DFD5] ${isCollapsed ? 'mx-1' : 'mx-2'}`} />

          {/* Smart Buckets + Mode Tabs */}
          <div className="space-y-0.5">
            {!isCollapsed && (
              <div className="px-2 mb-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#8A9592]">
                  Tools
                </span>
              </div>
            )}
            
            {/* Group Travel Mode Toggle */}
            <button
              type="button"
              onClick={onToggleGroupTravel}
              className={`w-full flex items-center gap-2.5 rounded-xl transition-all cursor-pointer group ${
                isCollapsed
                  ? 'justify-center p-2 hover:bg-[#FAF8F5]'
                  : 'px-3 py-1.5 hover:bg-[#FAF8F5]'
              } ${state.groupTravelMode ? 'bg-[#EAF6F4] text-[#0D6955]' : 'text-[#526360] hover:text-[#161C23]'}`}
              title="Group Travel Mode"
            >
              <span className="shrink-0 text-lg leading-none">👥</span>
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left text-xs font-bold truncate">
                    Group Travel {state.groupTravelMode ? '● ON' : '○ OFF'}
                  </span>
                  {state.groupTravelMode && state.activeConflicts.length > 0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full border shrink-0 bg-amber-50 text-amber-700 border-amber-200">
                      ⚠ {state.activeConflicts.length}
                    </span>
                  )}
                </>
              )}
            </button>

            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className={`w-full flex items-center gap-2.5 rounded-xl transition-all cursor-pointer group ${
                  isCollapsed
                    ? 'justify-center p-2 hover:bg-[#FAF8F5]'
                    : 'px-3 py-1.5 hover:bg-[#FAF8F5]'
                } text-[#526360] hover:text-[#161C23]`}
                title={item.label}
              >
                <span className="shrink-0">{item.icon}</span>
                {!isCollapsed && (
                  <>
                    <span className="flex-1 text-left text-xs font-semibold truncate">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                          item.badgeColor ?? 'bg-[#FAF8F5] text-[#526360] border-[#E7DFD5]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Bottom: Kyoto Solat Widget + User Card ─── */}
      <div
        className={`border-t border-[#E7DFD5] space-y-2 shrink-0 ${
          isCollapsed ? 'p-2' : 'p-3'
        }`}
      >
        <KyotoSalahWidget isCollapsed={isCollapsed} />

        {/* Current User Card */}
        {!isCollapsed && (
          <div className="flex items-center gap-2 p-2 rounded-xl hover:bg-[#FAF8F5] transition-colors cursor-default">
            {state.members.slice(0, 1).map((m) => (
              <React.Fragment key={m.id}>
                <div className="relative shrink-0">
                  <img
                    src={m.avatar}
                    alt={m.name}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-[#0D6955]"
                  />
                  {m.isLead && (
                    <span className="absolute -top-1 -right-1 text-[10px]">👑</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#161C23] truncate">
                    {m.name}
                  </div>
                  <div className="text-[10px] font-semibold text-[#6D7A77] truncate">
                    {m.role}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
