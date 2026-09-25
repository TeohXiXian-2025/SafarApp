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
