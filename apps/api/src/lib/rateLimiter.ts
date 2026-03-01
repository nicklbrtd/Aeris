export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; last: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillRatePerSec: number,
  ) {}

  consume(key: string, cost = 1): boolean {
    const now = Date.now();
    const current = this.buckets.get(key) ?? { tokens: this.capacity, last: now };

    const elapsed = (now - current.last) / 1000;
    const refill = elapsed * this.refillRatePerSec;
    const nextTokens = Math.min(this.capacity, current.tokens + refill);

    if (nextTokens < cost) {
      this.buckets.set(key, { tokens: nextTokens, last: now });
      return false;
    }

    this.buckets.set(key, { tokens: nextTokens - cost, last: now });
    return true;
  }
}

export const messageLimiter = new TokenBucket(8, 1.2);
