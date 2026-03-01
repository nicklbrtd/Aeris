type OriginConfig = {
  NODE_ENV: 'development' | 'test' | 'production';
  WEB_ORIGIN: string;
  WEB_ORIGINS?: string;
};

function normalize(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function getAllowedWebOrigins(config: OriginConfig): string[] {
  const values = new Set<string>();

  values.add(normalize(config.WEB_ORIGIN));

  if (config.WEB_ORIGINS) {
    config.WEB_ORIGINS
      .split(',')
      .map((part) => normalize(part))
      .filter(Boolean)
      .forEach((origin) => values.add(origin));
  }

  if (config.NODE_ENV !== 'production') {
    values.add('http://localhost:3000');
    values.add('http://127.0.0.1:3000');
  }

  return [...values];
}

export function isAllowedWebOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }
  const normalized = normalize(origin);
  return allowedOrigins.includes(normalized);
}
