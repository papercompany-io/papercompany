// 로그인용 암호 도구(A-249): bcrypt 비밀번호, TOTP(RFC 6238), 무작위 토큰, SHA-256 해시.
// Workers와 Bun 모두 Web Crypto(crypto.subtle)를 쓰므로 Node 전용 API는 쓰지 않습니다.
import bcrypt from 'bcryptjs';

const enc = new TextEncoder();
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const randomToken = (n = 32) => toHex(randomBytes(n));

export async function sha256Hex(s: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}

// 길이가 같은 문자열을 내용과 무관한 시간에 비교합니다
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ── 비밀번호(bcrypt). $2a$·$2b$ 해시 모두 읽습니다. 72바이트를 넘는 부분은 bcrypt가 버리므로 입력에서 막습니다 ──
export const PASSWORD_MAX_BYTES = 72;
export const hashPassword = (password: string, cost: number) => bcrypt.hash(password, cost);
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
// 없는 계정으로 로그인할 때도 같은 시간이 걸리게 비교할 가짜 해시(비용 10)
export const DUMMY_HASH = '$2b$10$B9HrAvoc1pmsk/OB1wwz3O5RLbWlq7Xsu4XncXMKjXU9g6Tpz2G6u';

// ── base32(RFC 4648, 패딩 없음) ──
export function base32Encode(b: Uint8Array): string {
  let out = '';
  let bits = 0;
  let val = 0;
  for (const x of b) {
    val = (val << 8) | x;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let val = 0;
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad base32');
    val = (val << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ── TOTP(RFC 6238: HMAC-SHA1, 30초, 6자리) ──
export const TOTP_PERIOD_S = 30;
export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_PERIOD_S);

export async function hotp(secret: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

// 앞뒤 한 칸(±30초)까지 받습니다. 맞으면 맞은 시간 칸, 아니면 null
export async function matchTotp(secretB32: string, code: string, nowMs: number): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const now = totpStep(nowMs);
  let hit: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    if (safeEqual(await hotp(secret, step), code)) hit = step;
  }
  return hit;
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

// TOTP는 확인할 때 원문이 필요하므로 해시 대신 사용자 id에 묶인 AES-GCM으로 보관합니다.
async function totpKey(keyHex: string) {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new TypeError('AUTH_ENCRYPTION_KEY must be 32-byte hex');
  return crypto.subtle.importKey('raw', hexBytes(keyHex), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function hexBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new TypeError('Invalid encrypted TOTP');
  return Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
}

export async function sealTotp(secret: string, keyHex: string, userId: string): Promise<string> {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(userId) },
    await totpKey(keyHex),
    enc.encode(secret),
  );
  return `v1:${toHex(iv)}:${toHex(new Uint8Array(encrypted))}`;
}

export async function openTotp(stored: string, keyHex: string, userId: string): Promise<string> {
  const [version, iv, ciphertext, extra] = stored.split(':');
  if (version !== 'v1' || !iv || iv.length !== 24 || !ciphertext || extra !== undefined) throw new TypeError('Invalid encrypted TOTP');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexBytes(iv), additionalData: enc.encode(userId) },
    await totpKey(keyHex),
    hexBytes(ciphertext),
  );
  return new TextDecoder().decode(plain);
}

// ── 복구 코드: 'abcde-fghij'(base32 10자, 50비트). 비교 전 소문자·하이픈 없이 맞춥니다 ──
export const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[\s-]/g, '');
export function newRecoveryCode(): string {
  const s = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

// 6자리 이메일 인증 코드(나머지 치우침이 없게 거절 표본 추출)
export function newEmailCode(): string {
  for (;;) {
    const v = new DataView(randomBytes(4).buffer).getUint32(0);
    if (v < 4_294_000_000) return String(v % 1_000_000).padStart(6, '0');
  }
}
