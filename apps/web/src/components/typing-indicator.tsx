'use client';

import { motion } from 'framer-motion';

export function TypingIndicator({ label }: { label: string }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-2 rounded-bubble bg-bubbleIn px-4 py-2 text-xs text-muted">
      <span>{label}</span>
      <div className="inline-flex gap-1">
        {[0, 1, 2].map((dot) => (
          <motion.span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-muted"
            animate={{ y: [0, -3, 0], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.12 }}
          />
        ))}
      </div>
    </div>
  );
}
