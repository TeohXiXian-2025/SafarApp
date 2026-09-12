import React, { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, ChevronRight, CheckCircle2, Users, MapPin, Loader2, ArrowRight, Clock } from 'lucide-react';
import { AIPlanSolution, GroupConflict, TripState } from '../types/itinerary';
import { getPlanningContext } from '../services/groupConflictEngine';
import { generateWinWinPlans } from '../services/aiPlannerService';

interface AIPlannerWorkspaceProps {
  state: TripState;
  dispatch: any;
  onApplyPlan: (dayId: string, conflictActivityId: string, proposedStops: any[]) => void;
  onClose: () => void;
}

/**
 * The visible "reasoning" pipeline shown while the planner works.
 * Makes the AI feel like an optimisation engine rather than a chatbot.
 */
const AI_PIPELINE_STEPS: { label: string; detail: string }[] = [
  { label: 'Analyzing group preferences', detail: 'Food · Temples · Less walking' },
  { label: 'Scanning travel distances', detail: 'Walking, metro & taxi times' },
  { label: 'Checking prayer windows', detail: 'Solat anchors preserved' },
  { label: 'Optimising route order', detail: 'Minimising backtracking' },
  { label: 'Generating recommendations', detail: 'Scoring win-win options' },
];

export const AIPlannerWorkspace: React.FC<AIPlannerWorkspaceProps> = ({ state, dispatch, onApplyPlan, onClose }) => {
  const [solutions, setSolutions] = useState<AIPlanSolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);

  const conflict = state.activeConflicts.find(c => c.id === state.aiPlannerContext?.conflictId);
  const context = getPlanningContext(state);
  
  useEffect(() => {
    if (conflict && state.aiPlannerContext?.isOpen && !state.aiPlannerContext.solutions) {
      setLoading(true);
      setPipelineStep(0);

      const stepTimer = setInterval(() => {
        setPipelineStep((s) => (s < AI_PIPELINE_STEPS.length ? s + 1 : s));
      }, 300);
      const doneTimer = setTimeout(() => {
        const generated = generateWinWinPlans(conflict, context);
        setSolutions(generated);
        setLoading(false);
      }, 1600);

      return () => {
        clearInterval(stepTimer);
        clearTimeout(doneTimer);
      };
    } else if (state.aiPlannerContext?.solutions) {
      setSolutions(state.aiPlannerContext.solutions);
      setLoading(false);
    }
  }, [conflict, state.aiPlannerContext?.isOpen]);

  if (!state.aiPlannerContext?.isOpen || !conflict) return null;

  const conflictStop = context.itineraryStops.find(s => s.id === conflict.activityId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-[#E7DFD5]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-900 p-5 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20">
              <Sparkles className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2 tracking-tight">
                AI Group Planner
                <span className="text-[10px] font-bold bg-white/20 text-purple-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Beta
                </span>
              </h2>
              <p className="text-xs font-medium text-purple-200 mt-0.5">
                Resolving {conflict.type.replace('_', ' ').toLowerCase()} conflict at "{conflictStop?.title}"
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Area - 2 Columns */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column - Context & Groups */}
          <div className="w-1/3 bg-[#FAF8F5] border-r border-[#E7DFD5] p-5 overflow-y-auto hidden md:block">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#8A9592] mb-3">
              Context Analyzer
            </h3>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E7DFD5] mb-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-bold text-[#161C23]">The Conflict</span>
              </div>
              <p className="text-xs text-[#526360] leading-relaxed">
                {conflict.description}
              </p>
              
              <div className="mt-4 space-y-2">
                {context.activeGroups.map(group => (
                  <div key={group.id} className="flex items-center justify-between bg-[#FAF8F5] p-2 rounded-lg border border-[#E7DFD5]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                      <span className="text-xs font-bold text-[#161C23]">{group.name}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-[#6D7A77]">
                      {group.preferences.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E7DFD5]">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-bold text-[#161C23]">Location Data</span>
              </div>
              <ul className="text-xs text-[#526360] space-y-2">
                <li className="flex items-center justify-between">
                  <span>Current City:</span>
                  <span className="font-bold text-[#161C23]">{context.currentCity}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Weather:</span>
                  <span className="font-bold text-[#161C23]">22°C Clear</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column - Solutions */}
          <div className="flex-1 p-5 overflow-y-auto bg-white">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#161C23] tracking-tight">AI Planner</h3>
                      <p className="text-[11px] font-semibold text-[#8A9592]">
                        Resolving {conflict.type.replace('_', ' ').toLowerCase()} conflict…
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2">
                    {AI_PIPELINE_STEPS.map((step, i) => {
                      const isDone = i < pipelineStep;
                      const isActive = i === pipelineStep;
                      return (
                        <li
                          key={step.label}
                          className={`flex items-start gap-2.5 rounded-xl px-3 py-2 border transition-colors ${
                            isDone
                              ? 'bg-emerald-50/60 border-emerald-100'
                              : isActive
                              ? 'bg-purple-50/70 border-purple-100'
                              : 'bg-white border-[#E7DFD5] opacity-60'
                          }`}
                        >
                          <span className="mt-0.5 shrink-0">
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : isActive ? (
                              <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                            ) : (
                              <span className="block w-4 h-4 rounded-full border-2 border-[#E7DFD5]" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-[#161C23]">{step.label}</span>
                            <span className="block text-[10px] font-medium text-[#8A9592]">{step.detail}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 h-1.5 rounded-full bg-[#EDE7DF] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-300"
                      style={{ width: `${(pipelineStep / AI_PIPELINE_STEPS.length) * 100}%` }}
                    />
                  </div>
                  <p className="mt-3 text-center text-[10px] font-black uppercase tracking-widest text-purple-600">
                    Generating recommendation…
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[#161C23]">Suggested Solutions</h3>
                
                {solutions.map((sol) => (
                  <div 
                    key={sol.id}
                    onClick={() => setSelectedSolutionId(sol.id)}
                    className={`rounded-2xl border-2 transition-all cursor-pointer overflow-hidden ${
                      selectedSolutionId === sol.id 
                        ? 'border-purple-500 shadow-md ring-4 ring-purple-50' 
                        : 'border-[#E7DFD5] hover:border-purple-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`p-4 ${sol.type === 'SMART_SPLIT' ? 'bg-gradient-to-br from-indigo-50/50 to-purple-50/50' : 'bg-white'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {sol.type === 'SMART_SPLIT' && (
                            <span className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-2 py-0.5 rounded-full">
                              Hero Option
                            </span>
                          )}
                          <h4 className="text-base font-extrabold text-[#161C23]">{sol.title}</h4>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-emerald-600 leading-none">{sol.score}%</div>
                          <div className="text-[9px] font-bold text-[#8A9592] uppercase">Harmony Score</div>
                        </div>
                      </div>
                      
                      <p className="text-sm text-[#526360] mb-4">
                        {sol.description}
                      </p>
                      
                      {/* Tradeoffs */}
                      <div className="bg-[#FAF8F5] rounded-xl p-3 space-y-1.5 mb-3 border border-[#E7DFD5]/50">
                        {sol.tradeoffs.map((t, i) => (
                          <div key={i} className="text-xs font-medium flex items-start gap-1.5">
                            <span className="shrink-0 mt-0.5">{t.startsWith('✓') ? '✅' : '⚠️'}</span>
                            <span className={t.startsWith('✓') ? 'text-emerald-700' : 'text-amber-700'}>
                              {t.substring(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Smart Split Visualizer */}
                      {sol.type === 'SMART_SPLIT' && (
                        <div className="mt-4 mb-2 p-3 bg-white rounded-xl border border-indigo-100 shadow-xs">
                          <div className="flex items-center justify-between text-xs font-bold text-[#526360] mb-2">
                            <span>Before Split</span>
                            <span className="flex items-center gap-1 text-indigo-600"><Clock className="w-3 h-3"/> {sol.splitDurationMinutes}m Split</span>
                            <span>⭐ Reunion</span>
                          </div>
                          
                          <div className="relative pt-4 pb-2">
                            {/* Path lines */}
                            <div className="absolute left-[15%] right-[15%] top-6 h-px bg-[#E7DFD5]" />
                            <svg className="absolute left-[15%] w-[70%] h-12 top-6" preserveAspectRatio="none">
                              <path d="M 0 0 C 30 20, 70 20, 100 0" stroke="#22C55E" strokeWidth="2" fill="none" strokeDasharray="4 4" className="animate-[dash_1s_linear_infinite]" />
                              <path d="M 0 0 C 30 -20, 70 -20, 100 0" stroke="#A855F7" strokeWidth="2" fill="none" strokeDasharray="4 4" className="animate-[dash_1s_linear_infinite]" />
                            </svg>
                            
                            <div className="flex justify-between relative z-10 px-4">
                              <div className="w-3 h-3 rounded-full bg-[#161C23] border-2 border-white shadow-sm" />
                              <div className="flex flex-col items-center gap-6">
                                <div className="w-3 h-3 rounded-full bg-[#22C55E] border-2 border-white shadow-sm" />
                                <div className="w-3 h-3 rounded-full bg-[#A855F7] border-2 border-white shadow-sm" />
                              </div>
                              <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-white shadow-sm flex items-center justify-center text-[8px]">⭐</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#FAF8F5] border-t border-[#E7DFD5] p-4 flex items-center justify-between shrink-0">
          <div className="text-xs text-[#8A9592] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            <span>AI does not decide. Humans decide.</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-[#526360] hover:text-[#161C23] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selectedSolutionId && conflict.activityId) {
                  const sol = solutions.find(s => s.id === selectedSolutionId);
                  if (sol) {
                    onApplyPlan(state.activeDayId, conflict.activityId, sol.proposedStops);
                  }
                }
              }}
              disabled={!selectedSolutionId}
              className="px-6 py-2 bg-[#161C23] text-white text-sm font-black rounded-xl shadow-md hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Apply Selected Plan
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
};
