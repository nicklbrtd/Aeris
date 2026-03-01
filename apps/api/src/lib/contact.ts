const phoneRegex = /^\+?[\d\s().-]{8,24}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!phoneRegex.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }

  return `+${digits}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 4) {
    return phone;
  }
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}
