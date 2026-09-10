import React, { useState } from 'react';
import { Itinerary, ActivityBlock, Collaborator } from '../types';
import {
  DollarSign,
  TrendingUp,
  PieChart,
  Users,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  X,
  AlertCircle,
  Plus,
  ArrowUpRight,
  UtensilsCrossed,
  Ticket,
  Train,
  Bed,
  ShoppingBag,
  Sparkles,
  Layers,
  FileDown,
} from 'lucide-react';

interface BudgetTrackerProps {
  itinerary: Itinerary;
  currentDayId: string;
  currentUser: Collaborator;
  onUpdateItinerary: (updated: Itinerary, actionDescription?: string) => void;
  onOpenAddModal: (dayId: string) => void;
  onOpenPrintModal?: () => void;
}

export const BudgetTracker: React.FC<BudgetTrackerProps> = ({
  itinerary,
  currentDayId,
  currentUser,
  onUpdateItinerary,
  onOpenAddModal,
  onOpenPrintModal,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [viewScope, setViewScope] = useState<'trip' | 'day'>('trip');
  const [isEditingGoal, setIsEditingGoal] = useState<boolean>(false);
  const [goalInput, setGoalInput] = useState<string>('');
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [activityCostInput, setActivityCostInput] = useState<string>('');

  const currentDay =
    itinerary.days.find((d) => d.id === currentDayId) || itinerary.days[0];

  // Budget settings from itinerary or sensible defaults
  const currency = itinerary.budget?.currency || '$';
  const tripGoal = itinerary.budget?.totalGoal || 1500;
  const dayGoal = itinerary.budget?.dailyGoal || Math.round(tripGoal / (itinerary.days.length || 7));

  // Compute Trip-wide running totals
  const tripActivities = itinerary.activityBlocks;
  const tripRunningTotal = tripActivities.reduce((sum, act) => sum + (act.cost || 0), 0);

  // Compute Current Day running totals
  const dayActivities = itinerary.activityBlocks.filter((act) => act.dayId === currentDay.id);
  const dayRunningTotal = dayActivities.reduce((sum, act) => sum + (act.cost || 0), 0);

  // Active metrics based on selected view scope
  const activeRunningTotal = viewScope === 'trip' ? tripRunningTotal : dayRunningTotal;
  const activeGoal = viewScope === 'trip' ? tripGoal : dayGoal;
  const remaining = activeGoal - activeRunningTotal;
  const percentUsed = Math.min(Math.round((activeRunningTotal / (activeGoal || 1)) * 100), 100);
  const isOverBudget = activeRunningTotal > activeGoal;
  const overAmount = activeRunningTotal - activeGoal;

  // Category breakdown for currently scoped activities
  const scopedActivities = viewScope === 'trip' ? tripActivities : dayActivities;

  const categories = [
    {
      key: 'dining',
      label: 'Halal Dining & Cafe',
      icon: UtensilsCrossed,
      color: 'bg-amber-500',
      textColor: 'text-amber-700',
      badgeBg: 'bg-amber-50 border-amber-200',
      total: scopedActivities
        .filter((a) => a.costCategory === 'dining' || a.type === 'dining' || a.type === 'cafe')
        .reduce((sum, a) => sum + (a.cost || 0), 0),
    },
    {
      key: 'tickets',
      label: 'Sightseeing & Culture',
      icon: Ticket,
      color: 'bg-emerald-600',
      textColor: 'text-emerald-700',
      badgeBg: 'bg-emerald-50 border-emerald-200',
      total: scopedActivities
        .filter((a) => a.costCategory === 'tickets' || a.type === 'sightseeing' || a.type === 'cultural')
        .reduce((sum, a) => sum + (a.cost || 0), 0),
    },
    {
      key: 'accommodation',
      label: 'Lodging & Stays',
      icon: Bed,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-700',
      badgeBg: 'bg-indigo-50 border-indigo-200',
      total: scopedActivities
        .filter((a) => a.costCategory === 'accommodation')
        .reduce((sum, a) => sum + (a.cost || 0), 0),
    },
    {
      key: 'transit',
      label: 'Transit & Passes',
      icon: Train,
      color: 'bg-cyan-600',
      textColor: 'text-cyan-700',
      badgeBg: 'bg-cyan-50 border-cyan-200',
      total: scopedActivities
        .filter((a) => a.costCategory === 'transit' || a.type === 'transit')
        .reduce((sum, a) => sum + (a.cost || 0), 0),
    },
    {
      key: 'other',
      label: 'Shopping & Other',
      icon: ShoppingBag,
      color: 'bg-purple-500',
      textColor: 'text-purple-700',
      badgeBg: 'bg-purple-50 border-purple-200',
      total: scopedActivities
        .filter(
          (a) =>
            a.costCategory === 'shopping' ||
            a.costCategory === 'other' ||
            (!a.costCategory && !['dining', 'cafe', 'sightseeing', 'cultural', 'transit'].includes(a.type))
        )
        .reduce((sum, a) => sum + (a.cost || 0), 0),
    },
  ];

  // Collaborator split calculations
  const collaboratorSpending = itinerary.collaborators.map((c) => {
    const totalPaid = tripActivities
      .filter((a) => a.paidBy === c.name || (c.isCurrentUser && a.paidBy === 'You'))
      .reduce((sum, a) => sum + (a.cost || 0), 0);
    return {
      ...c,
      totalPaid,
    };
  });

  const memberCount = Math.max(itinerary.collaborators.length, 1);
  const perPersonAvg = (tripRunningTotal / memberCount).toFixed(2);

  // Handle saving modified budget goal
  const handleSaveGoal = () => {
    const parsed = parseFloat(goalInput);
    if (isNaN(parsed) || parsed <= 0) {
      setIsEditingGoal(false);
      return;
    }

    const updatedBudget = {
      ...itinerary.budget,
      totalGoal: viewScope === 'trip' ? parsed : Math.round(parsed * (itinerary.days.length || 7)),
      currency: itinerary.budget?.currency || '$',
      dailyGoal: viewScope === 'day' ? parsed : Math.round(parsed / (itinerary.days.length || 7)),
    };

    onUpdateItinerary(
      {
        ...itinerary,
        budget: updatedBudget,
      },
      `${currentUser.name} updated the ${viewScope === 'trip' ? 'trip' : 'daily'} budget goal to ${currency}${parsed}`
    );
    setIsEditingGoal(false);
  };

  // Handle quick inline update of an activity cost
  const handleSaveActivityCost = (activityId: string) => {
    const parsed = parseFloat(activityCostInput);
    if (isNaN(parsed) || parsed < 0) {
      setEditingActivityId(null);
      return;
    }

    const targetAct = itinerary.activityBlocks.find((a) => a.id === activityId);
    const updatedActivities = itinerary.activityBlocks.map((act) => {
      if (act.id === activityId) {
        return {
          ...act,
          cost: parsed,
          paidBy: act.paidBy || currentUser.name,
        };
      }
      return act;
    });

    onUpdateItinerary(
      {
        ...itinerary,
        activityBlocks: updatedActivities,
      },
      `${currentUser.name} updated cost for ${targetAct?.title || 'item'} to ${currency}${parsed}`
    );
    setEditingActivityId(null);
  };

  // Currency quick cycle
  const handleToggleCurrency = () => {
    const currencies = ['$', '¥', '€', '£', 'RM'];
    const currentIdx = currencies.indexOf(currency);
    const nextCurrency = currencies[(currentIdx + 1) % currencies.length];

    onUpdateItinerary(
      {
        ...itinerary,
        budget: {
          ...itinerary.budget,
          totalGoal: itinerary.budget?.totalGoal || 1500,
          currency: nextCurrency,
          dailyGoal: itinerary.budget?.dailyGoal || 250,
        },
      },
      `${currentUser.name} switched currency display to ${nextCurrency}`
    );
  };

  // Progress bar color based on percentage
  const getProgressBarColor = () => {
    if (isOverBudget) return 'bg-rose-500';
    if (percentUsed > 85) return 'bg-amber-500';
    return 'bg-gradient-to-r from-[#004D46] to-[#00685F]';
  };

  return (
    <div className="rounded-3xl bg-white border border-[#E7DFD5] shadow-xs overflow-hidden transition-all">
      {/* Header Bar */}
      <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E7DFD5]/60 bg-gradient-to-r from-[#FAF8F5] via-white to-[#F3F9F8]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0 border border-[#00685F]/20">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#00685F] text-[#62FAE3] px-2 py-0.5 rounded-md">
                Live Budget Tracker
              </span>
              <span className="text-[11px] font-mono text-[#6D7A77] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Real-Time Aggregated</span>
              </span>
            </div>
            <h3 className="text-base font-bold text-[#161C23] mt-0.5">
              {viewScope === 'trip' ? 'Entire Trip Cost Tracker' : `Day ${currentDay.dayNumber} (${currentDay.city}) Budget`}
            </h3>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Scope Toggle: Trip vs Day */}
          <div className="flex items-center p-1 bg-gray-100 rounded-xl border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => setViewScope('trip')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewScope === 'trip'
                  ? 'bg-white text-[#00685F] shadow-xs'
                  : 'text-[#6D7A77] hover:text-[#161C23]'
              }`}
            >
              All Trip
            </button>
            <button
              type="button"
              onClick={() => setViewScope('day')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewScope === 'day'
                  ? 'bg-white text-[#00685F] shadow-xs'
                  : 'text-[#6D7A77] hover:text-[#161C23]'
              }`}
            >
              Day {currentDay.dayNumber} Only
            </button>
          </div>

          {/* Currency Toggle */}
          <button
            type="button"
            onClick={handleToggleCurrency}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-[#161C23] shadow-xs flex items-center gap-1 cursor-pointer"
            title="Click to cycle currency: $, ¥, €, £, RM"
          >
            <span className="text-[#00685F] font-extrabold">{currency}</span>
            <span className="text-[10px] text-[#6D7A77]">Switch</span>
          </button>

          {/* Export PDF Button */}
          {onOpenPrintModal && (
            <button
              type="button"
              onClick={onOpenPrintModal}
              className="px-2.5 py-1.5 rounded-xl bg-[#00685F]/10 hover:bg-[#00685F]/20 text-[#00685F] border border-[#00685F]/30 text-xs font-bold shadow-xs flex items-center gap-1 cursor-pointer transition-colors"
              title="Generate and download print-ready PDF itinerary"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          )}

          {/* Collapse/Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse budget details' : 'Expand budget details'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Running Total vs Goal Hero Panel */}
      <div className="p-4 md:p-5 space-y-4">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Running Total */}
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] space-y-1">
            <span className="text-[11px] font-bold text-[#6D7A77] uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-[#00685F]" />
              <span>Running Total ({scopedActivities.filter((a) => (a.cost || 0) > 0).length} items)</span>
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#161C23] tracking-tight">
                {currency}{activeRunningTotal.toLocaleString()}
              </span>
              <span className="text-xs text-[#6D7A77] font-medium">committed</span>
            </div>
          </div>

          {/* Budget Goal */}
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] space-y-1 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#6D7A77] uppercase tracking-wide flex items-center gap-1">
                <PieChart className="w-3.5 h-3.5 text-[#00685F]" />
                <span>{viewScope === 'trip' ? 'Trip Budget Goal' : 'Day Target Goal'}</span>
              </span>
              {!isEditingGoal && (
                <button
                  type="button"
                  onClick={() => {
                    setGoalInput(activeGoal.toString());
                    setIsEditingGoal(true);
                  }}
                  className="p-1 text-[#00685F] hover:bg-[#00685F]/10 rounded-lg transition-colors cursor-pointer"
                  title="Edit Goal Amount"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {isEditingGoal ? (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-sm font-bold text-[#161C23]">{currency}</span>
                <input
                  type="number"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  className="w-24 px-2 py-0.5 rounded-lg border border-[#00685F] text-sm font-bold text-[#161C23] focus:outline-none focus:ring-1 focus:ring-[#00685F]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveGoal}
                  className="p-1 rounded-lg bg-[#00685F] text-white hover:bg-[#008378] cursor-pointer"
                  title="Save goal"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingGoal(false)}
                  className="p-1 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-[#161C23] tracking-tight">
                  {currency}{activeGoal.toLocaleString()}
                </span>
                <span className="text-xs text-[#6D7A77] font-medium">target</span>
              </div>
            )}
          </div>

          {/* Variance / Remaining Balance */}
          <div
            className={`p-3.5 rounded-2xl border space-y-1 ${
              isOverBudget
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            }`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1">
              <AlertCircle className={`w-3.5 h-3.5 ${isOverBudget ? 'text-rose-600' : 'text-emerald-700'}`} />
              <span>{isOverBudget ? 'Over Budget' : 'Safe Balance Remaining'}</span>
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-black tracking-tight ${isOverBudget ? 'text-rose-700' : 'text-emerald-800'}`}>
                {isOverBudget ? `+${currency}${overAmount.toLocaleString()}` : `${currency}${remaining.toLocaleString()}`}
              </span>
              <span className="text-xs font-semibold opacity-80">
                {isOverBudget ? 'over target' : `${100 - percentUsed}% buffer left`}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Real-Time Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6D7A77] font-bold flex items-center gap-1.5">
              <span>Progress:</span>
              <span className="text-[#161C23]">{percentUsed}% of goal committed</span>
            </span>
            <span className="text-[11px] font-mono text-[#6D7A77]">
              {currency}{activeRunningTotal} / {currency}{activeGoal}
            </span>
          </div>

          <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor()}`}
              style={{ width: `${percentUsed}%` }}
            ></div>
          </div>
        </div>

        {/* Expanded Detail Sections */}
        {isExpanded && (
          <div className="pt-3 border-t border-[#E7DFD5]/60 space-y-4 animate-in fade-in duration-200">
            {/* Category Breakdown Badges */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#161C23] uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#00685F]" />
                  <span>Cost by Category ({viewScope === 'trip' ? 'Full Trip' : `Day ${currentDay.dayNumber}`})</span>
                </span>
                <span className="text-[11px] text-[#6D7A77]">
                  Avg: {currency}{perPersonAvg} / person ({memberCount} travelers)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  const catPercent = activeRunningTotal > 0 ? Math.round((cat.total / activeRunningTotal) * 100) : 0;
                  return (
                    <div
                      key={cat.key}
                      className={`p-2.5 rounded-2xl border ${cat.badgeBg} flex flex-col justify-between space-y-1`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${cat.textColor}`} />
                          <span className={`text-[11px] font-bold ${cat.textColor} truncate`}>
                            {cat.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-gray-500">
                          {catPercent}%
                        </span>
                      </div>
                      <div className="text-sm font-black text-[#161C23]">
                        {currency}{cat.total.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Collaborator Contributions & Quick Expense Log */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {/* Member Contribution Breakdown */}
              <div className="p-3 rounded-2xl bg-white border border-[#E7DFD5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#161C23] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#00685F]" />
                    <span>Traveler Share &amp; Paid By</span>
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md font-bold">
                    Equal 4-Way Split: {currency}{perPersonAvg}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {collaboratorSpending.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-xs p-1.5 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={c.avatar}
                          alt={c.name}
                          referrerPolicy="no-referrer"
                          className="w-5 h-5 rounded-full object-cover shrink-0"
                        />
                        <span className="font-semibold text-[#161C23]">{c.name}</span>
                        {c.isCurrentUser && (
                          <span className="text-[9px] bg-[#00685F]/10 text-[#00685F] px-1.5 py-0.2 rounded font-extrabold">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#161C23]">
                          {currency}{c.totalPaid.toLocaleString()} paid
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Activity Cost Editor List for Current Day */}
              <div className="p-3 rounded-2xl bg-white border border-[#E7DFD5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#161C23] flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-[#00685F]" />
                    <span>Day {currentDay.dayNumber} Activity Expenses</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenAddModal(currentDay.id)}
                    className="text-[11px] font-bold text-[#00685F] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                  {dayActivities.length === 0 ? (
                    <p className="text-xs text-[#6D7A77] italic py-2 text-center">
                      No activities scheduled for this day yet.
                    </p>
                  ) : (
                    dayActivities.map((act) => (
                      <div
                        key={act.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 hover:bg-gray-100/80 text-xs border border-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="text-[10px] font-mono text-[#00685F] shrink-0">{act.time}</span>
                          <span className="font-bold text-[#161C23] truncate">{act.title}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {editingActivityId === act.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold">{currency}</span>
                              <input
                                type="number"
                                value={activityCostInput}
                                onChange={(e) => setActivityCostInput(e.target.value)}
                                className="w-16 px-1.5 py-0.5 rounded border border-[#00685F] text-xs font-bold focus:outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveActivityCost(act.id)}
                                className="p-1 rounded bg-[#00685F] text-white hover:bg-[#008378]"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingActivityId(null)}
                                className="p-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingActivityId(act.id);
                                setActivityCostInput((act.cost || 0).toString());
                              }}
                              className="px-2 py-0.5 rounded-md bg-white border border-gray-200 hover:border-[#00685F] font-bold text-xs text-[#161C23] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              title="Click to edit expense"
                            >
                              <span>{currency}{(act.cost || 0).toLocaleString()}</span>
                              <Edit2 className="w-2.5 h-2.5 text-[#6D7A77]" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
