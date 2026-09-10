import React, { useState } from 'react';
import { Itinerary, Collaborator } from '../types';
import { generateItineraryPdf, PdfExportOptions } from '../services/pdfGenerator';
import {
  FileDown,
  Printer,
  X,
  Check,
  Calendar,
  DollarSign,
  Clock,
  MapPin,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  Eye,
  Layers,
  Info,
} from 'lucide-react';

interface PrintItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: Itinerary;
  currentUser: Collaborator;
  initialDayId?: string;
}

export const PrintItineraryModal: React.FC<PrintItineraryModalProps> = ({
  isOpen,
  onClose,
  itinerary,
  currentUser,
  initialDayId,
}) => {
  const [dayScope, setDayScope] = useState<'all' | string>('all');
  const [includeBudget, setIncludeBudget] = useState<boolean>(true);
  const [includePrayerTimes, setIncludePrayerTimes] = useState<boolean>(true);
  const [includeMusallas, setIncludeMusallas] = useState<boolean>(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'preview' | 'options'>('preview');

  if (!isOpen) return null;

  const cur = itinerary.budget?.currency || '$';
  const totalGoal = itinerary.budget?.totalGoal || 1500;
  const totalSpent = itinerary.activityBlocks.reduce((sum, a) => sum + (a.cost || 0), 0);
  const percentUsed = Math.min(Math.round((totalSpent / (totalGoal || 1)) * 100), 100);

  // Target days for preview
  const targetDays =
    dayScope === 'all'
      ? itinerary.days
      : itinerary.days.filter((d) => d.id === dayScope);

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setDownloadSuccess(false);

    try {
      // Allow UI render state update
      await new Promise((resolve) => setTimeout(resolve, 350));

      const options: PdfExportOptions = {
        dayScope,
        includeBudget,
        includePrayerTimes,
        includeMusallas,
      };

      const doc = generateItineraryPdf(itinerary, options);
      const cleanTitle = itinerary.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanTitle}_Print_Itinerary.pdf`;

      doc.save(filename);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      console.error('PDF Generation Error:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-[#FAF8F5] border border-[#E7DFD5] w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[#161C23]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Control Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-[#E7DFD5] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00685F] text-[#62FAE3] flex items-center justify-center shrink-0 shadow-xs">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#00685F]/10 text-[#00685F] px-2 py-0.5 rounded-md">
                  Print-Ready Export
                </span>
                <span className="text-xs font-mono text-[#6D7A77] hidden sm:inline">
                  Vector A4 Standard
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#161C23]">
                Generate Itinerary PDF &amp; Print
              </h2>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Direct PDF Download Trigger */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-3.5 py-2 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-[#62FAE3] text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Compile and download high-resolution PDF file"
            >
              {isGeneratingPdf ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#62FAE3] border-t-transparent rounded-full animate-spin"></span>
                  <span>Rendering PDF...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <Check className="w-4 h-4 text-[#62FAE3]" />
                  <span>PDF Downloaded!</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 text-[#62FAE3]" />
                  <span className="text-white">Download PDF</span>
                </>
              )}
            </button>

            {/* Native Browser Print */}
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-3 py-2 rounded-2xl bg-white hover:bg-gray-100 border border-[#E7DFD5] text-[#161C23] text-xs font-bold shadow-xs transition-colors hidden sm:flex items-center gap-1.5 cursor-pointer"
              title="Open browser print dialog"
            >
              <Printer className="w-3.5 h-3.5 text-[#00685F]" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl hover:bg-gray-100 text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Configuration Strip */}
        <div className="px-4 py-3 bg-[#FAF8F5] border-b border-[#E7DFD5] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[#6D7A77] flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-[#00685F]" />
              <span>Scope:</span>
            </span>

            {/* Scope Selector */}
            <select
              value={dayScope}
              onChange={(e) => setDayScope(e.target.value)}
              className="px-2.5 py-1 rounded-xl bg-white border border-[#E7DFD5] font-bold text-[#161C23] text-xs focus:outline-none focus:ring-1 focus:ring-[#00685F]"
            >
              <option value="all">Full Trip (All {itinerary.days.length} Days)</option>
              {itinerary.days.map((d) => (
                <option key={d.id} value={d.id}>
                  Day {d.dayNumber}: {d.title} ({d.city})
                </option>
              ))}
            </select>

            <span className="h-4 w-[1px] bg-gray-300 mx-1 hidden sm:block"></span>

            {/* Toggle Switches */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeBudget}
                onChange={(e) => setIncludeBudget(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#00685F] accent-[#00685F] cursor-pointer"
              />
              <span className="font-semibold text-[#161C23]">Budget Summary</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includePrayerTimes}
                onChange={(e) => setIncludePrayerTimes(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#00685F] accent-[#00685F] cursor-pointer"
              />
              <span className="font-semibold text-[#161C23]">Prayer Timings</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeMusallas}
                onChange={(e) => setIncludeMusallas(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#00685F] accent-[#00685F] cursor-pointer"
              />
              <span className="font-semibold text-[#161C23]">Musalla Badges</span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#6D7A77]">
            <span className="font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md font-semibold border border-emerald-200">
              {targetDays.length} {targetDays.length === 1 ? 'Day' : 'Days'} Included
            </span>
            <span className="font-mono bg-amber-50 text-amber-900 px-2 py-0.5 rounded-md font-semibold border border-amber-200">
              {cur}{totalSpent.toLocaleString()} Budget Logged
            </span>
          </div>
        </div>

        {/* Modal Scrollable Body: High-Fidelity Print-Ready Document Preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-100/70">
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-md p-6 sm:p-8 space-y-6 print-container text-[#161C23]">
            {/* PDF Preview Top Banner */}
            <div className="rounded-2xl bg-gradient-to-r from-[#004D46] via-[#00685F] to-[#004D46] text-white p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#62FAE3] uppercase tracking-wider mb-2">
                <span>SAFAR OS · TRAVEL COMPANION DOCUMENT</span>
                <span className="bg-white/10 px-2.5 py-0.5 rounded-md">VERIFIED PRINT ITINERARY</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {itinerary.title}
              </h1>
              <p className="text-xs text-[#E6F8F5] mt-1 font-medium">
                {itinerary.dateRange} · {itinerary.subtitle}
              </p>

              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/20 text-[11px] text-white/90 flex-wrap">
                <span className="flex items-center gap-1 font-semibold">
                  <Calendar className="w-3.5 h-3.5 text-[#62FAE3]" />
                  <span>{itinerary.days.length} Days Curated</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#62FAE3]" />
                  <span>100% Halal Verified</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-semibold">
                  <Clock className="w-3.5 h-3.5 text-[#62FAE3]" />
                  <span>Prayer Synchronized</span>
                </span>
              </div>
            </div>

            {/* Traveling Collaborators Strip */}
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E7DFD5] flex items-center justify-between text-xs text-[#6D7A77] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#161C23]">Travelers:</span>
                <span>{itinerary.collaborators.map((c) => c.name).join(', ')} ({itinerary.collaborators.length} members)</span>
              </div>
              <div>
                <span className="font-bold text-[#161C23]">Generated:</span>{' '}
                <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            </div>

            {/* Budget Summary Preview Block */}
            {includeBudget && (
              <div className="space-y-3 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-[#00685F] uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-[#00685F]" />
                    <span>Trip Budget &amp; Financial Summary</span>
                  </h3>
                  <span className="text-xs text-[#6D7A77] font-semibold">
                    {percentUsed}% of goal committed
                  </span>
                </div>

                {/* 3 Metric Summary Boxes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <span className="text-[10px] font-bold text-[#6D7A77] uppercase block">
                      Running Total Spent
                    </span>
                    <span className="text-lg font-black text-[#161C23]">
                      {cur}{totalSpent.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <span className="text-[10px] font-bold text-[#6D7A77] uppercase block">
                      Target Trip Goal
                    </span>
                    <span className="text-lg font-black text-[#161C23]">
                      {cur}{totalGoal.toLocaleString()}
                    </span>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      totalSpent > totalGoal
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase block opacity-80">
                      {totalSpent > totalGoal ? 'Over Budget' : 'Safe Buffer Remaining'}
                    </span>
                    <span className="text-lg font-black">
                      {totalSpent > totalGoal
                        ? `+${cur}${(totalSpent - totalGoal).toLocaleString()}`
                        : `${cur}${(totalGoal - totalSpent).toLocaleString()}`}
                    </span>
                  </div>
                </div>

                {/* Category Table */}
                <div className="rounded-xl border border-gray-200 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-[11px] font-bold text-[#6D7A77] border-b border-gray-200">
                      <tr>
                        <th className="py-2 px-3">Expense Category</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3 text-right">Share of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      <tr>
                        <td className="py-2 px-3">Halal Dining &amp; Cafes</td>
                        <td className="py-2 px-3 font-bold">
                          {cur}
                          {itinerary.activityBlocks
                            .filter((a) => a.costCategory === 'dining' || a.type === 'dining' || a.type === 'cafe')
                            .reduce((s, a) => s + (a.cost || 0), 0)
                            .toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-[#6D7A77]">
                          {Math.round(
                            (itinerary.activityBlocks
                              .filter((a) => a.costCategory === 'dining' || a.type === 'dining' || a.type === 'cafe')
                              .reduce((s, a) => s + (a.cost || 0), 0) /
                              (totalSpent || 1)) *
                              100
                          )}
                          %
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3">Sightseeing &amp; Cultural Passes</td>
                        <td className="py-2 px-3 font-bold">
                          {cur}
                          {itinerary.activityBlocks
                            .filter((a) => a.costCategory === 'tickets' || a.type === 'sightseeing' || a.type === 'cultural')
                            .reduce((s, a) => s + (a.cost || 0), 0)
                            .toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-[#6D7A77]">
                          {Math.round(
                            (itinerary.activityBlocks
                              .filter((a) => a.costCategory === 'tickets' || a.type === 'sightseeing' || a.type === 'cultural')
                              .reduce((s, a) => s + (a.cost || 0), 0) /
                              (totalSpent || 1)) *
                              100
                          )}
                          %
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3">Transit &amp; Ground Travel</td>
                        <td className="py-2 px-3 font-bold">
                          {cur}
                          {itinerary.activityBlocks
                            .filter((a) => a.costCategory === 'transit' || a.type === 'transit')
                            .reduce((s, a) => s + (a.cost || 0), 0)
                            .toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-[#6D7A77]">
                          {Math.round(
                            (itinerary.activityBlocks
                              .filter((a) => a.costCategory === 'transit' || a.type === 'transit')
                              .reduce((s, a) => s + (a.cost || 0), 0) /
                              (totalSpent || 1)) *
                              100
                          )}
                          %
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Daily Schedules & Prayer Timings */}
            <div className="space-y-6 pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#00685F] uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#00685F]" />
                  <span>Day-By-Day Schedule &amp; Prayer Timings</span>
                </h3>
                <span className="text-xs text-[#6D7A77]">
                  Showing {targetDays.length} {targetDays.length === 1 ? 'day' : 'days'}
                </span>
              </div>

              {targetDays.map((day) => {
                const dayActivities = itinerary.activityBlocks.filter((a) => a.dayId === day.id);
                const dayAnchors = itinerary.prayerAnchors.filter((p) => p.dayId === day.id);

                const combinedItems = [
                  ...dayActivities.map((a) => ({ kind: 'activity' as const, item: a, sortTime: a.time })),
                  ...dayAnchors.map((p) => ({ kind: 'prayer' as const, item: p, sortTime: p.time })),
                ].sort((a, b) => a.sortTime.localeCompare(b.sortTime));

                return (
                  <div
                    key={day.id}
                    className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F5] border border-[#E7DFD5] space-y-4 page-break"
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-[#E7DFD5] flex-wrap gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold text-[#00685F] uppercase tracking-wider">
                          Day {day.dayNumber} · {day.city}
                        </span>
                        <h4 className="text-base font-extrabold text-[#161C23]">
                          {day.title}
                        </h4>
                      </div>
                      <span className="text-xs font-semibold text-[#6D7A77] bg-white px-2.5 py-1 rounded-lg border border-gray-200">
                        {day.date}
                      </span>
                    </div>

                    {/* Prayer Timings Bar */}
                    {includePrayerTimes && day.prayerTimes && (
                      <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs">
                        <div className="flex items-center justify-between font-bold text-amber-950 mb-1.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-700" />
                            <span>Prayer Timings (Kyoto Local)</span>
                          </span>
                          <span className="text-[10px] text-amber-800 font-mono">Qibla: 289° WNW</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5 text-center font-mono">
                          <div className="bg-white/80 p-1 rounded-lg border border-amber-200">
                            <div className="text-[10px] text-[#6D7A77] font-bold">Fajr</div>
                            <div className="text-xs font-bold text-[#161C23]">{day.prayerTimes.fajr}</div>
                          </div>
                          <div className="bg-white/80 p-1 rounded-lg border border-amber-200">
                            <div className="text-[10px] text-[#6D7A77] font-bold">Dhuhr</div>
                            <div className="text-xs font-bold text-[#161C23]">{day.prayerTimes.dhuhr}</div>
                          </div>
                          <div className="bg-white/80 p-1 rounded-lg border border-amber-200">
                            <div className="text-[10px] text-[#6D7A77] font-bold">Asr</div>
                            <div className="text-xs font-bold text-[#161C23]">{day.prayerTimes.asr}</div>
                          </div>
                          <div className="bg-white/80 p-1 rounded-lg border border-amber-200">
                            <div className="text-[10px] text-[#6D7A77] font-bold">Maghrib</div>
                            <div className="text-xs font-bold text-[#161C23]">{day.prayerTimes.maghrib}</div>
                          </div>
                          <div className="bg-white/80 p-1 rounded-lg border border-amber-200">
                            <div className="text-[10px] text-[#6D7A77] font-bold">Isha</div>
                            <div className="text-xs font-bold text-[#161C23]">{day.prayerTimes.isha}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Chronological Timeline List */}
                    <div className="space-y-2.5">
                      {combinedItems.map((entry) => {
                        if (entry.kind === 'prayer') {
                          return (
                            <div
                              key={entry.item.id}
                              className="p-3 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 text-xs flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono font-bold text-amber-900 bg-amber-200 px-2 py-0.5 rounded text-[11px]">
                                  {entry.item.time}
                                </span>
                                <div>
                                  <div className="font-bold flex items-center gap-1.5">
                                    <span>[Prayer Anchor] {entry.item.name}</span>
                                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-mono">
                                      {entry.item.buffer}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-amber-900/80">
                                    {entry.item.location} · {entry.item.details}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const act = entry.item;
                        return (
                          <div
                            key={act.id}
                            className="p-3 rounded-xl bg-white border border-[#E7DFD5] text-xs space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#00685F] text-xs">
                                  {act.time}
                                </span>
                                <h5 className="font-bold text-[#161C23] text-sm">
                                  {act.title}
                                </h5>
                              </div>

                              {act.cost !== undefined && act.cost > 0 && (
                                <span className="font-bold font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 shrink-0">
                                  {cur}{act.cost.toLocaleString()}{act.paidBy ? ` · ${act.paidBy}` : ''}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[#6D7A77] text-[11px]">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#00685F]" />
                                <span>{act.location}</span>
                              </span>
                              <span>•</span>
                              <span>{act.duration}</span>
                            </div>

                            {act.description && (
                              <p className="text-[#6D7A77] text-xs leading-relaxed">
                                {act.description}
                              </p>
                            )}

                            <div className="flex items-center gap-2 pt-1 flex-wrap">
                              {act.halalBadge && (
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                  <span>{act.halalBadge}</span>
                                </span>
                              )}
                              {includeMusallas && act.nearestPrayerFacilityId && (
                                <span className="text-[10px] font-semibold bg-cyan-50 text-cyan-800 px-2 py-0.5 rounded border border-cyan-200">
                                  Musalla nearby
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Document Footer */}
            <div className="pt-4 border-t border-gray-200 text-center text-xs text-[#6D7A77] space-y-1">
              <p className="font-semibold text-[#161C23]">
                Safar OS · Muslim Family Travel Itinerary &amp; Prayer Companion
              </p>
              <p className="text-[11px]">
                Halal Verified · All prayer timings adjusted for Kyoto solar coordinate angles
              </p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="p-4 bg-white border-t border-[#E7DFD5] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[#6D7A77] flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[#00685F] shrink-0" />
            <span>
              The generated PDF formats automatically for standard A4 printing with crisp vector styling.
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-[#161C23] text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-5 py-2 rounded-2xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isGeneratingPdf ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 text-[#62FAE3]" />
                  <span>Download Print-Ready PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
