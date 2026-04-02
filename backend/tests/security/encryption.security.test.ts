/**
 * Encryption security tests — AES-256-GCM IV randomness, tamper detection, wrong key.
 *
 * These are pure unit tests (no DB) — they test the crypto.ts utility directly.
 */

// Set required env vars before any imports that pull in env.ts
process.env.PROFILE_ENCRYPTION_KEY = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-characters-here';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-characters-here';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

import { encrypt, decrypt } from '@utils/crypto';

describe('AES-256-GCM — random IV per encryption', () => {
  it('encrypting the same plaintext twice produces different ciphertexts', () => {
    const plaintext = 'AB123456'; // same passport number
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);

    expect(c1).not.toBe(c2);
  });

  it('both ciphertexts decrypt back to the same plaintext', () => {
    const plaintext = 'AB123456';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);

    expect(decrypt(c1)).toBe(plaintext);
    expect(decrypt(c2)).toBe(plaintext);
  });
});

describe('AES-256-GCM — tamper detection', () => {
  it('flipping a bit in the auth tag causes decrypt() to throw', () => {
    const ciphertext = encrypt('SensitiveData');
    const buf = Buffer.from(ciphertext, 'base64');

    // Auth tag starts at byte 12 (after IV)
    buf[12] ^= 0xff; // flip all bits in first auth tag byte
    const tampered = buf.toString('base64');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('flipping a bit in the ciphertext body causes decrypt() to throw', () => {
    const ciphertext = encrypt('SensitiveData');
    const buf = Buffer.from(ciphertext, 'base64');

    // Ciphertext starts at byte 28 (12 IV + 16 authTag)
    if (buf.length > 28) {
      buf[28] ^= 0x01;
    }
    const tampered = buf.toString('base64');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('truncated ciphertext causes decrypt() to throw', () => {
    const ciphertext = encrypt('SensitiveData');
    const buf = Buffer.from(ciphertext, 'base64');
    const truncated = buf.subarray(0, 10).toString('base64');

    expect(() => decrypt(truncated)).toThrow();
  });
});

describe('AES-256-GCM — wrong key (manual verification)', () => {
  it('ciphertext encrypted with key A cannot be decrypted with key B', () => {
    // Directly use Node crypto to simulate wrong-key scenario without module-level env dependency
    const crypto = require('crypto');
    const ALGO = 'aes-256-gcm';
    const IV_LEN = 12;
    const TAG_LEN = 16;

    const keyA = Buffer.from('aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899', 'hex');
    const keyB = Buffer.from('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'hex');

    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, keyA, iv, { authTagLength: TAG_LEN });
    const enc = Buffer.concat([cipher.update('PassportNumber', 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, enc]).toString('base64');

    // Attempt decryption with keyB — should throw due to auth tag mismatch
    const buf = Buffer.from(payload, 'base64');
    const ivOut = buf.subarray(0, IV_LEN);
    const tagOut = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const encOut = buf.subarray(IV_LEN + TAG_LEN);

    const decipher = crypto.createDecipheriv(ALGO, keyB, ivOut, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tagOut);

    expect(() => {
      decipher.update(encOut);
      decipher.final();
    }).toThrow();
  });
});

describe('AES-256-GCM — correctness', () => {
  it('encrypts and decrypts unicode/special characters correctly', () => {
    const texts = [
      'João da Silva',      // accented chars
      '1990-01-01',        // date
      'Pass@word!123',     // special chars
      '护照12345',         // Chinese characters
    ];

    for (const text of texts) {
      expect(decrypt(encrypt(text))).toBe(text);
    }
  });
});
