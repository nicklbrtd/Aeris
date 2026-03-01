'use client';
/* eslint-disable @next/next/no-img-element */

import { useGesture } from '@use-gesture/react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

type Props = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function PhotoViewer({ src, alt, open, onClose }: Props): JSX.Element {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const backdropOpacity = useTransform(y, [-240, 0, 240], [0.2, 0.88, 0.2]);

  useEffect(() => {
    if (!open) {
      x.set(0);
      y.set(0);
      scale.set(1);
    }
  }, [open, scale, x, y]);

  const bind = useGesture(
    {
      onDrag: ({ down, movement: [mx, my], velocity: [, vy], direction: [, dy] }) => {
        if (scale.get() <= 1.05) {
          if (down) {
            x.set(mx * 0.25);
            y.set(my);
          } else if (Math.abs(my) > 140 || (vy > 0.75 && dy > 0)) {
            onClose();
          } else {
            x.set(0);
            y.set(0);
          }
          return;
        }

        if (down) {
          x.set(mx);
          y.set(my);
        }
      },
      onPinch: ({ offset: [s] }) => {
        scale.set(clamp(s, 1, 4));
      },
    },
    {
      drag: {
        pointer: { touch: true },
        filterTaps: true,
      },
      pinch: {
        scaleBounds: { min: 1, max: 4 },
        rubberband: true,
      },
    },
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4"
          style={{ opacity: backdropOpacity }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.img
            {...(bind() as any)}
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded-2xl object-contain will-change-transform"
            style={{ x, y, scale, touchAction: 'none' }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={() => {
              const next = scale.get() > 1.05 ? 1 : 2;
              scale.set(next);
              if (next === 1) {
                x.set(0);
                y.set(0);
              }
            }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
