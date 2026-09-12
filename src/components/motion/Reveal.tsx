import React from 'react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds. Use small increments to stagger a list. */
  delay?: number;
  /** Vertical travel distance in px. */
  y?: number;
  /** Animate only the first time the element enters the viewport. */
  once?: boolean;
}

/**
 * Calm enter-on-scroll animation: fade + slight rise.
 * Falls back to a static, unanimated wrapper when reduced motion is requested.
 */
export const Reveal: React.FC<RevealProps> = ({ children, className, delay = 0, y = 12, once = true }) => {
  const reduce = usePrefersReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};
