import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LEN = 64;
const N = 1 << 15;
const R = 8;
const P = 1;

async function scryptDerive(
  password: string,
  salt: string,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptDerive(password, salt, KEY_LEN, { N, r: R, p: P });

  return `scrypt$${N}$${R}$${P}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  const [algo, nRaw, rRaw, pRaw, salt, hashHex] = passwordHash.split('$');
  if (algo !== 'scrypt' || !nRaw || !rRaw || !pRaw || !salt || !hashHex) {
    return false;
  }

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptDerive(password, salt, expected.length, { N: n, r, p });

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
