// One colour per split group, used on cards, the timeline and the map.
import type { SplitTrackKey } from '../domain';

export const TRACK_COLOR: Record<SplitTrackKey, { main: string; soft: string; label: string }> = {
  A: { main: '#00685F', soft: '#E6F2F0', label: 'Main group' },
  B: { main: '#2563EB', soft: '#E8EFFD', label: 'Group B' },
  C: { main: '#7C3AED', soft: '#F1EAFD', label: 'Group C' },
  F: { main: '#B45309', soft: '#FBF0E4', label: 'Free time' },
};

export const trackKeyOf = (track: string): SplitTrackKey | null => {
  const k = track.split(':')[1];
  return k === 'A' || k === 'B' || k === 'C' || k === 'F' ? k : null;
};

/**
 * During a prayer break the group splits like any split: the people praying
 * (gold, at the mosque — where everyone meets back), each activity the others
 * picked in its own colour, and whoever didn't pick resting nearby (grey).
 */
export const PRAYER_GROUP = { main: '#CA8A04', soft: '#FDF6E3', label: 'Praying' };
export const PRAYER_PICK_COLORS = ['#2563EB', '#DB2777', '#7C3AED', '#0891B2'];
export const REST_GROUP = { main: '#64748B', soft: '#F1F5F9', label: 'Rest / free time' };
