import { API_URL } from './config';
import { getCsrfToken, getGuestToken, setCsrfToken } from './storage';
import type { Chat, Message, User } from './types';

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const csrf = getCsrfToken();
  const guestToken = getGuestToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (csrf && method !== 'GET') {
    headers['x-csrf-token'] = csrf;
  }

  if (guestToken) {
    headers['x-guest-token'] = guestToken;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if ((data as { csrfToken?: string }).csrfToken) {
    setCsrfToken((data as { csrfToken: string }).csrfToken);
  }

  if (!response.ok) {
    throw new ApiError((data as { error?: string }).error || 'Ошибка API', response.status);
  }

  return data as T;
}

export async function getMe(): Promise<{ user: User; csrfToken: string }> {
  return request('/me');
}

export async function joinByInvite(payload: {
  code: string;
  nickname: string;
  avatarUrl?: string;
}): Promise<{ user: User; csrfToken: string; guestToken: string | null }> {
  return request('/auth/join', { method: 'POST', body: payload });
}

export async function registerWithPassword(payload: {
  nickname: string;
  password: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
}): Promise<
  | { requiresOtp: false; user: User; csrfToken: string; guestToken: string | null }
  | { requiresOtp: true; phoneMasked: string; expiresInSec: number; debugOtpCode?: string }
> {
  const data = await request<
    | { user: User; csrfToken: string; guestToken: string | null }
    | { requiresOtp: true; phoneMasked: string; expiresInSec: number; debugOtpCode?: string }
  >('/auth/register', { method: 'POST', body: payload });

  if ('user' in data) {
    return { ...data, requiresOtp: false };
  }

  return data;
}

export async function verifyRegisterPhoneOtp(payload: {
  phone: string;
  code: string;
}): Promise<{ user: User; csrfToken: string; guestToken: string | null }> {
  return request('/auth/register/verify-phone', { method: 'POST', body: payload });
}

export async function resendRegisterPhoneOtp(payload: {
  phone: string;
}): Promise<{ ok: true; expiresInSec: number; debugOtpCode?: string }> {
  return request('/auth/register/resend-otp', { method: 'POST', body: payload });
}

export async function loginWithPassword(payload: {
  identifier: string;
  password: string;
}): Promise<{ user: User; csrfToken: string; guestToken: string | null }> {
  return request('/auth/login', { method: 'POST', body: payload });
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function getChats(): Promise<{ chats: Chat[]; csrfToken: string }> {
  return request('/chats');
}

export async function getChatMessages(chatId: string): Promise<{ items: Message[]; nextCursor: string | null }> {
  return request(`/chats/${chatId}/messages`);
}

export async function sendMessageRest(payload: {
  chatId: string;
  type: 'text' | 'image';
  text?: string;
  imageId?: string;
}): Promise<{ message: Message }> {
  return request('/messages', { method: 'POST', body: payload });
}

export async function createCommunity(title: string): Promise<{ chat: Chat }> {
  return request('/chats', {
    method: 'POST',
    body: {
      type: 'community',
      title,
    },
  });
}

export async function uploadImage(file: File): Promise<{ image: Message['image'] }> {
  const guestToken = getGuestToken();
  const csrf = getCsrfToken();

  const form = new FormData();
  form.append('file', file);

  const headers: Record<string, string> = {};

  if (guestToken) {
    headers['x-guest-token'] = guestToken;
  }

  if (csrf) {
    headers['x-csrf-token'] = csrf;
  }

  const response = await fetch(`${API_URL}/uploads/image`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError((data as { error?: string }).error || 'Ошибка загрузки', response.status);
  }

  return data as { image: Message['image'] };
}

export async function subscribePush(subscription: PushSubscription): Promise<void> {
  await request('/push/subscribe', {
    method: 'POST',
    body: { subscription },
  });
}
