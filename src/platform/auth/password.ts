import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const LOCAL_PASSWORD_HASH_ALGORITHM = 'scrypt-v1';

const DEFAULT_SCRYPT_COST = 16_384;
const DEFAULT_SCRYPT_BLOCK_SIZE = 8;
const DEFAULT_SCRYPT_PARALLELIZATION = 1;
const DEFAULT_SALT_BYTES = 16;
const DEFAULT_KEY_LENGTH = 64;

export interface LocalPasswordHashOptions {
  saltBytes?: number;
  keyLength?: number;
  cost?: number;
  blockSize?: number;
  parallelization?: number;
}

export interface LocalPasswordHashResult {
  passwordHash: string;
  passwordHashAlgorithm: typeof LOCAL_PASSWORD_HASH_ALGORITHM;
}

interface ParsedLocalPasswordHash {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
  salt: Buffer;
  hash: Buffer;
}

export async function createLocalPasswordHash(
  password: string,
  options: LocalPasswordHashOptions = {},
): Promise<LocalPasswordHashResult> {
  assertPasswordInput(password);
  const saltBytes = options.saltBytes ?? DEFAULT_SALT_BYTES;
  const keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;
  const cost = options.cost ?? DEFAULT_SCRYPT_COST;
  const blockSize = options.blockSize ?? DEFAULT_SCRYPT_BLOCK_SIZE;
  const parallelization = options.parallelization ?? DEFAULT_SCRYPT_PARALLELIZATION;
  const salt = randomBytes(saltBytes);
  const derived = await deriveScryptKey(password, salt, {
    cost,
    blockSize,
    parallelization,
    keyLength,
  });
  return {
    passwordHash: [
      LOCAL_PASSWORD_HASH_ALGORITHM,
      cost,
      blockSize,
      parallelization,
      keyLength,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$'),
    passwordHashAlgorithm: LOCAL_PASSWORD_HASH_ALGORITHM,
  };
}

export async function verifyLocalPassword(
  password: string,
  stored: Pick<LocalPasswordHashResult, 'passwordHash' | 'passwordHashAlgorithm'>,
): Promise<boolean> {
  if (stored.passwordHashAlgorithm !== LOCAL_PASSWORD_HASH_ALGORITHM) {
    return false;
  }
  const parsed = parseLocalPasswordHash(stored.passwordHash);
  if (!parsed) {
    return false;
  }
  const derived = await deriveScryptKey(password, parsed.salt, parsed);
  return timingSafeEqualBuffer(derived, parsed.hash);
}

function parseLocalPasswordHash(hash: string): ParsedLocalPasswordHash | null {
  const [algorithm, cost, blockSize, parallelization, keyLength, salt, derived] = hash.split('$');
  if (algorithm !== LOCAL_PASSWORD_HASH_ALGORITHM || !salt || !derived) {
    return null;
  }
  const parsed = {
    cost: Number.parseInt(cost ?? '', 10),
    blockSize: Number.parseInt(blockSize ?? '', 10),
    parallelization: Number.parseInt(parallelization ?? '', 10),
    keyLength: Number.parseInt(keyLength ?? '', 10),
  };
  if (!Object.values(parsed).every((value) => Number.isInteger(value) && value > 0)) {
    return null;
  }
  const saltBuffer = Buffer.from(salt, 'base64url');
  const hashBuffer = Buffer.from(derived, 'base64url');
  if (saltBuffer.length === 0 || hashBuffer.length === 0) {
    return null;
  }
  return {
    ...parsed,
    salt: saltBuffer,
    hash: hashBuffer,
  };
}

async function deriveScryptKey(
  password: string,
  salt: Buffer,
  options: Required<Pick<
    LocalPasswordHashOptions,
    'cost' | 'blockSize' | 'parallelization' | 'keyLength'
  >>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, options.keyLength, {
      N: options.cost,
      r: options.blockSize,
      p: options.parallelization,
    }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.from(derivedKey));
    });
  });
}

function timingSafeEqualBuffer(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function assertPasswordInput(password: string): void {
  if (password.length === 0) {
    throw new Error('Password must not be empty.');
  }
}
