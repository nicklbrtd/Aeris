const MAX_MESSAGE_LENGTH = 2000;

export function sanitizeNickname(input: string): string {
  const cleaned = input.replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 40);
}

export function sanitizeMessageText(input: string): string {
  const withoutControls = input.replace(/[\u0000-\u001F\u007F]/g, '');
  return withoutControls.trim().slice(0, MAX_MESSAGE_LENGTH);
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
