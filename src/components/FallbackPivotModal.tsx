// ============================================================
// Safar OS — FallbackPivotModal
// AI reschedule flow shown when a flight delay is detected in
// the Document Vault (Emergency Fallback Engine).
// ============================================================

import React from 'react';
import { AlertOctagon, Check } from 'lucide-react';

export interface FallbackPivotModalProps {
  /** Secondary action / backdrop dismiss — review the AI plan manually. */
  onReviewManually: () => void;
  /** Primary action — apply the AI fallback plan to the itinerary. */
  onExecute: () => void;
}

const FALLBACK_PLAN_ITEMS: string[] = [
  'Refunded 16:45 Skyliner; auto-booked 20:45 Narita Express.',
  'Drafted delay notice to Hotel Granvia.',
  'Added KLIA Plaza Premium Lounge (Halal) for your 4-hour wait.',
];

export const FallbackPivotModal: React.FC<FallbackPivotModalProps> = ({
  onReviewManually,
  onExecute,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onReviewManually}
    >
      <div
        className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Alert Header */}
        <AlertOctagon className="w-9 h-9 text-rose-600" />
        <h2 className="text-xl font-bold text-gray-900 mt-2">
          🚨 Transit Exception Detected
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          Aviationstack API reports a 4-hour delay for MH70. This creates a
          schedule conflict with your Keisei Skyliner ticket and hotel check-in.
        </p>

        {/* 2. AI Fallback Strategy Box */}
        <div className="bg-[#E6F0EE] border border-[#0D6955] rounded-xl p-4 mt-5">
          <h3 className="font-bold text-[#0D6955] mb-3">
            ✨ AI Fallback Plan Generated
          </h3>
          <div className="flex flex-col space-y-2.5">
            {FALLBACK_PLAN_ITEMS.map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#0D6955] shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700 leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Action Footer */}
        <div className="flex flex-row justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onReviewManually}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Review Manually
          </button>
          <button
            type="button"
            onClick={onExecute}
            className="px-4 py-2 text-sm font-bold bg-[#0D6955] text-white hover:bg-[#095041] rounded-lg shadow-sm transition-colors"
          >
            Execute Fallback Plan
          </button>
        </div>
      </div>
    </div>
  );
};
