'use client';

import { useEffect, useRef } from 'react';

import { getChats, getMe, getSettings } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Chat, Message } from '@/lib/types';

async function showChatNotification(params: { title: string; body: string; url: string }): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(params.title, {
      body: params.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: params.url },
      tag: `aeris-${params.url}`,
    });
    return;
  }

  const notification = new Notification(params.title, {
    body: params.body,
    icon: '/icon.svg',
    tag: `aeris-${params.url}`,
  });
  notification.onclick = () => {
    window.focus();
    window.location.href = params.url;
  };
}

export function NotificationBridge(): null {
  const meIdRef = useRef<string | null>(null);
  const isNotificationEnabledRef = useRef(false);
  const chatTitleMapRef = useRef<Map<string, string>>(new Map());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unmounted = false;
    const socket = getSocket();

    const joinRooms = (chats: Chat[]): void => {
      chats.forEach((chat) => {
        socket.emit('chat:join', chat.id);
      });
    };

    Promise.all([getMe(), getChats(), getSettings()])
      .then(([meRes, chatsRes, settingsRes]) => {
        if (unmounted) {
          return;
        }
        meIdRef.current = meRes.user.id;
        isNotificationEnabledRef.current = settingsRes.notifications.pushEnabled;
        chatTitleMapRef.current = new Map(chatsRes.chats.map((chat) => [chat.id, chat.title]));
        joinRooms(chatsRes.chats);
      })
      .catch(() => undefined);

    const onConnect = (): void => {
      getChats()
        .then((chatsRes) => {
          if (unmounted) {
            return;
          }
          chatTitleMapRef.current = new Map(chatsRes.chats.map((chat) => [chat.id, chat.title]));
          joinRooms(chatsRes.chats);
        })
        .catch(() => undefined);
    };

    const onMessage = (message: Message): void => {
      if (message.senderId === meIdRef.current) {
        return;
      }
      if (!isNotificationEnabledRef.current) {
        return;
      }
      if (document.visibilityState === 'visible') {
        return;
      }
      if (seenMessageIdsRef.current.has(message.id)) {
        return;
      }
      seenMessageIdsRef.current.add(message.id);
      if (seenMessageIdsRef.current.size > 500) {
        seenMessageIdsRef.current.clear();
        seenMessageIdsRef.current.add(message.id);
      }

      const chatTitle = chatTitleMapRef.current.get(message.chatId) ?? 'Новый чат';
      const senderName = message.sender?.nickname ?? 'Новый пользователь';
      const preview = message.type === 'image' ? 'Фото' : message.text?.trim() || 'Новое сообщение';

      void showChatNotification({
        title: chatTitle,
        body: `${senderName}: ${preview}`,
        url: `/chats/${message.chatId}`,
      });
    };

    socket.on('connect', onConnect);
    socket.on('message:new', onMessage);

    return () => {
      unmounted = true;
      socket.off('connect', onConnect);
      socket.off('message:new', onMessage);
    };
  }, []);

  return null;
}
