'use client';
/* eslint-disable @next/next/no-img-element */

import clsx from 'clsx';
import { motion } from 'framer-motion';

import { API_URL } from '@/lib/config';
import { formatTime, linkifyText } from '@/lib/utils';
import type { Message } from '@/lib/types';

export function MessageBubble({
  message,
  own,
  onImageClick,
}: {
  message: Message;
  own: boolean;
  onImageClick: (src: string) => void;
}): JSX.Element {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={clsx('flex w-full', own ? 'justify-end' : 'justify-start')}
    >
      <div
        className={clsx(
          'max-w-[84%] rounded-bubble px-4 py-2.5 text-[15px] leading-snug shadow-sm',
          own
            ? 'rounded-br-[10px] bg-bubbleOut text-white'
            : 'rounded-bl-[10px] bg-bubbleIn text-text',
          message.pending && 'opacity-70',
        )}
      >
        {message.type === 'image' && message.image ? (
          <button
            type="button"
            onClick={() => onImageClick(`${API_URL}${message.image?.originalPath}`)}
            className="block overflow-hidden rounded-2xl"
          >
            <img
              src={`${API_URL}${message.image.thumbPath}`}
              alt="Фото"
              className="h-auto w-full max-w-[280px] object-cover"
            />
          </button>
        ) : null}

        {message.text ? (
          <p className="m-0 whitespace-pre-wrap break-words">
            {linkifyText(message.text).map((chunk, index) =>
              chunk.href ? (
                <a
                  key={`${chunk.href}-${index}`}
                  href={chunk.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx('underline decoration-white/60', !own && 'decoration-text/40')}
                >
                  {chunk.text}
                </a>
              ) : (
                <span key={`${chunk.text}-${index}`}>{chunk.text}</span>
              ),
            )}
          </p>
        ) : null}

        <div className={clsx('mt-1 text-[11px]', own ? 'text-white/75' : 'text-muted')}>
          {formatTime(message.createdAt)}
        </div>
      </div>
    </motion.div>
  );
}
