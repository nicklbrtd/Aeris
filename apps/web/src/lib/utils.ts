export function formatTime(dateValue: string): string {
  const date = new Date(dateValue);
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function shortDateTime(dateValue: string): string {
  const date = new Date(dateValue);
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function linkifyText(text: string): Array<{ text: string; href?: string }> {
  const regex = /(https?:\/\/[^\s]+)/g;
  const result: Array<{ text: string; href?: string }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ text: text.slice(lastIndex, match.index) });
    }

    const url = match[0];
    result.push({ text: url, href: url });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push({ text: text.slice(lastIndex) });
  }

  return result;
}
