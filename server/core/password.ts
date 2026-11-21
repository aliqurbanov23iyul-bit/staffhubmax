import crypto from 'node:crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL_CHARS = UPPER + LOWER + DIGITS + SYMBOLS;

export function generateSecureTempPassword(length = 14): string {
  const safeLen = Math.max(12, Math.min(16, length));
  const chars: string[] = [
    UPPER[crypto.randomInt(UPPER.length)],
    LOWER[crypto.randomInt(LOWER.length)],
    DIGITS[crypto.randomInt(DIGITS.length)],
    SYMBOLS[crypto.randomInt(SYMBOLS.length)],
  ];

  for (let i = chars.length; i < safeLen; i++) {
    chars.push(ALL_CHARS[crypto.randomInt(ALL_CHARS.length)]);
  }

  // Fisher-Yates shuffle with crypto.randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, message: 'Şifre en az 8 karakter olmalıdır.' };
  }
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, message: 'Şifre en az bir harf ve bir rakam içermelidir.' };
  }
  return { valid: true };
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
