'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import { MessageBubble } from '@/components/message-bubble';
import { PhotoViewer } from '@/components/photo-viewer';
import { TypingIndicator } from '@/components/typing-indicator';
import { getChatMessages, getChats, getMe, sendMessageRest, uploadImage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Chat, Message, User } from '@/lib/types';

function makeClientId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
}

export default function ChatPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const chatId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [me, setMe] = useState<User | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const hasBootstrappedScroll = useRef(false);

  const scrollToLatest = useCallback((smooth = true) => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const isNearBottom = useCallback(() => {
    const element = listRef.current;
    if (!element) {
      return true;
    }
    const distance = element.scrollHeight - (element.scrollTop + element.clientHeight);
    return distance < 120;
  }, []);

  useEffect(() => {
    Promise.all([getMe(), getChats(), getChatMessages(chatId)])
      .then(([meRes, chatsRes, messagesRes]) => {
        setMe(meRes.user);
        setChat(chatsRes.chats.find((item) => item.id === chatId) ?? null);
        setMessages(messagesRes.items);
        hasBootstrappedScroll.current = false;
      })
      .catch(() => {
        router.replace('/join');
      });
  }, [chatId, router]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }

    const onScroll = (): void => {
      const distance = element.scrollHeight - (element.scrollTop + element.clientHeight);
      setShowJump(distance > 280);
    };

    onScroll();
    element.addEventListener('scroll', onScroll);

    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!messages.length || hasBootstrappedScroll.current) {
      return;
    }
    hasBootstrappedScroll.current = true;
    window.requestAnimationFrame(() => scrollToLatest(false));
  }, [messages.length, scrollToLatest]);

  useEffect(() => {
    const socket = getSocket();

    socket.emit('chat:join', chatId);

    const onMessage = (incoming: Message & { clientId?: string }): void => {
      if (incoming.chatId !== chatId) {
        return;
      }
      const shouldStickToBottom = isNearBottom();

      setMessages((prev) => {
        if (incoming.clientId) {
          const existingIndex = prev.findIndex((item) => item.id === incoming.clientId);
          if (existingIndex >= 0) {
            const next = [...prev];
            next[existingIndex] = incoming;
            return next;
          }
        }

        if (prev.some((item) => item.id === incoming.id)) {
          return prev;
        }

        return [...prev, incoming];
      });

      if (shouldStickToBottom) {
        window.requestAnimationFrame(() => scrollToLatest(false));
      }
    };

    const onTypingStart = (payload: { chatId: string; userId: string }): void => {
      if (payload.chatId !== chatId || payload.userId === me?.id) {
        return;
      }
      setTypingUsers((prev) => new Set(prev).add(payload.userId));
    };

    const onTypingStop = (payload: { chatId: string; userId: string }): void => {
      if (payload.chatId !== chatId) {
        return;
      }
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(payload.userId);
        return next;
      });
    };

    const onMessageError = (payload: { clientId: string; error: string }): void => {
      setMessages((prev) => prev.filter((item) => item.id !== payload.clientId));
    };

    socket.on('message:new', onMessage);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('message:error', onMessageError);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('message:error', onMessageError);
    };
  }, [chatId, isNearBottom, me?.id, scrollToLatest]);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
      }
    };
  }, []);

  const typingLabel = useMemo(() => {
    if (!typingUsers.size) {
      return '';
    }

    return typingUsers.size > 1 ? 'Печатают несколько участников...' : 'Печатает собеседник...';
  }, [typingUsers.size]);

  const sendTextMessage = async (): Promise<void> => {
    const value = text.trim();
    if (!value || !me) {
      return;
    }

    const clientId = makeClientId();
    const pending: Message = {
      id: clientId,
      chatId,
      senderId: me.id,
      createdAt: new Date().toISOString(),
      type: 'text',
      text: value,
      imageId: null,
      sender: me,
      pending: true,
    };

    setMessages((prev) => [...prev, pending]);
    window.requestAnimationFrame(() => scrollToLatest(false));
    setText('');
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    const socket = getSocket();
    if (!socket.connected) {
      sendMessageRest({ chatId, type: 'text', text: value })
        .then(({ message }) => {
          setMessages((prev) => prev.map((item) => (item.id === clientId ? message : item)));
        })
        .catch(() => {
          setMessages((prev) => prev.filter((item) => item.id !== clientId));
        });
      return;
    }

    socket.emit('message:send', { chatId, clientId, type: 'text', text: value });
  };

  const onTyping = (): void => {
    const socket = getSocket();
    socket.emit('typing:start', { chatId });

    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = window.setTimeout(() => {
      socket.emit('typing:stop', { chatId });
    }, 900);
  };

  const onImagePick = async (file: File | null): Promise<void> => {
    if (!file || !me) {
      return;
    }

    setSendingImage(true);
    try {
      const uploaded = await uploadImage(file);
      if (!uploaded.image?.id) {
        return;
      }

      const clientId = makeClientId();
      const pending: Message = {
        id: clientId,
        chatId,
        senderId: me.id,
        createdAt: new Date().toISOString(),
        type: 'image',
        text: '',
        imageId: uploaded.image.id,
        sender: me,
        image: uploaded.image,
        pending: true,
      };
      setMessages((prev) => [...prev, pending]);
      window.requestAnimationFrame(() => scrollToLatest(false));

      const socket = getSocket();
      if (!socket.connected) {
        sendMessageRest({ chatId, type: 'image', imageId: uploaded.image.id })
          .then(({ message }) => {
            setMessages((prev) => prev.map((item) => (item.id === clientId ? message : item)));
          })
          .catch(() => {
            setMessages((prev) => prev.filter((item) => item.id !== clientId));
          });
      } else {
        socket.emit('message:send', {
          chatId,
          clientId,
          type: 'image',
          imageId: uploaded.image.id,
        });
      }
    } finally {
      setSendingImage(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-3 pb-4 pt-2">
      <header className="backdrop-glass sticky top-2 z-20 mb-2 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 shadow-glass">
        <div className="flex items-center gap-2">
          <Link href="/chats" className="rounded-full border border-white/10 px-3 py-1 text-sm text-muted">
            Назад
          </Link>
          <div>
            <h1 className="text-base font-semibold text-text">{chat?.title || 'Чат'}</h1>
            <p className="text-xs text-muted">Приватный диалог</p>
          </div>
        </div>
      </header>

      <div ref={listRef} className="relative flex-1 space-y-2 overflow-y-auto px-1 pb-2 pt-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            own={message.senderId === me?.id}
            onImageClick={setPhotoSrc}
          />
        ))}

        {typingLabel ? <TypingIndicator label={typingLabel} /> : null}
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={() => scrollToLatest()}
          className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-surfaceElevated/90 px-4 py-2 text-xs text-text shadow-lg"
        >
          К новым сообщениям
        </button>
      ) : null}

      <motion.form
        onSubmit={(event) => {
          event.preventDefault();
          void sendTextMessage();
        }}
        className="safe-bottom mt-2 flex items-end gap-2 rounded-[22px] border border-white/10 bg-surface/80 p-2 backdrop-blur"
      >
        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-sm text-muted hover:bg-white/5">
          Фото
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              void onImagePick(file);
              event.currentTarget.value = '';
            }}
          />
        </label>

        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onTyping();
          }}
          placeholder="Сообщение"
          rows={1}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-surfaceElevated px-3 py-2.5 text-sm text-text outline-none ring-accent/35 transition focus:ring-2"
        />

        <motion.button
          type="submit"
          whileTap={{ scale: 0.95 }}
          className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow"
          disabled={sendingImage}
        >
          Отпр.
        </motion.button>
      </motion.form>

      <PhotoViewer src={photoSrc || ''} alt="Фото" open={Boolean(photoSrc)} onClose={() => setPhotoSrc(null)} />
    </main>
  );
}
