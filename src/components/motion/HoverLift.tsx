import React from 'react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface HoverLiftProps {
  children: React.ReactNode;
  className?: string;
  /** How far the element rises on hover, in px. Keep subtle (−3 to −6). */
  lift?: number;
}

/**
 * Professional micro-interaction for cards: a small translateY lift and a
 * barely-there press scale. Falls back to a plain wrapper under reduced motion.
 * Only GPU-friendly transforms are animated (no layout shifts).
 */
export const HoverLift: React.FC<HoverLiftProps> = ({ children, className, lift = 4 }) => {
  const reduce = usePrefersReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      whileHover={{ y: -lift }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
    >
      {children}
    </motion.div>
  );
};
