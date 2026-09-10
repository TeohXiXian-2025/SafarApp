import React, { useState } from 'react';
import { ActivityBlock, ActivityType } from '../types';
import { X, Plus, Clock, MapPin, Tag, UtensilsCrossed, Camera, Coffee, ShoppingBag, Landmark } from 'lucide-react';

interface AddActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayId: string;
  onAddActivity: (activity: Omit<ActivityBlock, 'id'>) => void;
}

export const AddActivityModal: React.FC<AddActivityModalProps> = ({
  isOpen,
  onClose,
  dayId,
  onAddActivity,
}) => {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('16:30');
  const [duration, setDuration] = useState('1.5h duration');
  const [type, setType] = useState<ActivityType>('dining');
  const [location, setLocation] = useState('Gion, Kyoto');
  const [description, setDescription] = useState('Halal verified option with prayer space nearby');
  const [halalBadge, setHalalBadge] = useState('100% Halal Certified');
  const [cost, setCost] = useState<string>('30');
  const [costCategory, setCostCategory] = useState<'dining' | 'tickets' | 'transit' | 'shopping' | 'accommodation' | 'other'>('dining');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const parsedCost = parseFloat(cost);

    onAddActivity({
      dayId,
      title: title.trim(),
      time,
      duration,
      type,
      location: location.trim(),
      description: description.trim(),
      cost: !isNaN(parsedCost) ? parsedCost : 0,
      costCategory,
      tags: [type.charAt(0).toUpperCase() + type.slice(1), halalBadge],
      halalBadge: type === 'dining' || type === 'cafe' ? halalBadge : undefined,
      votes: {
        count: 1,
        voters: ['You'],
        userVoted: true,
      },
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#E7DFD5] p-6 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#E7DFD5]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#00685F]/10 flex items-center justify-center text-[#00685F]">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#161C23]">Add Itinerary Item</h3>
              <p className="text-[11px] text-[#6D7A77]">Coordinates with prayer times automatically</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#EEF4FE] flex items-center justify-center text-[#6D7A77] hover:text-[#161C23]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Activity Category Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-[#6D7A77] uppercase text-[10px]">Category</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: 'dining', label: 'Halal Dining', icon: UtensilsCrossed },
                { id: 'sightseeing', label: 'Sightseeing', icon: Camera },
                { id: 'cafe', label: 'Halal Cafe', icon: Coffee },
                { id: 'cultural', label: 'Culture', icon: Landmark },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = type === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setType(item.id as ActivityType)}
                    className={`p-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                      isSelected
                        ? 'bg-[#00685F] text-white border-[#00685F] shadow-xs'
                        : 'bg-[#EEF4FE] text-[#6D7A77] border-[#E7DFD5] hover:bg-[#E3E8F2]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-bold truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1">
            <label className="font-bold text-[#6D7A77]">Activity Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Kyoto Halal Wagyu or Fushimi Shrine"
              className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-[#161C23] border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
            />
          </div>

          {/* Time & Duration */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-[#6D7A77]">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-[#161C23] border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-[#6D7A77]">Duration</label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 1.5h duration"
                className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-[#161C23] border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1">
            <label className="font-bold text-[#6D7A77]">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Neighborhood or Station name"
              className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-[#161C23] border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
            />
          </div>

          {/* Real-time Cost & Budget Category */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-[#6D7A77]">Estimated Cost ($)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="e.g. 45"
                className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-[#161C23] font-bold border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-[#6D7A77]">Budget Category</label>
              <select
                value={costCategory}
                onChange={(e) => setCostCategory(e.target.value as any)}
                className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-[#161C23] font-semibold border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
              >
                <option value="dining">🍱 Halal Dining</option>
                <option value="tickets">🎟️ Sightseeing / Tickets</option>
                <option value="transit">🚆 Transit / Passes</option>
                <option value="accommodation">🏨 Lodging</option>
                <option value="shopping">🛍️ Shopping / Gifts</option>
                <option value="other">✨ Other Expense</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="font-bold text-[#6D7A77]">Description / Collaborator Note</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Recommended early morning to avoid crowds"
              className="w-full h-10 px-3 rounded-xl bg-[#EEF4FE] text-[#161C23] border border-[#E7DFD5] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white font-bold transition-all shadow-md flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer mt-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add to Itinerary</span>
          </button>
        </form>
      </div>
    </div>
  );
};
