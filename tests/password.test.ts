import { describe, expect, test } from 'vitest';
import { hashPassword, passwordSchema, verifyPassword } from '../src/utils/password';

describe('passwordSchema', () => {
  test.each(['Str0ng!Pass#', 'Abcdef1!gh', 'correct horse battery staple'])('accepts %s', (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(true);
  });

  test.each([
    ['too short', 'Ab1!xyz'],
    ['no symbol or number', 'abcdefghijkl'],
    ['missing uppercase', 'abcdefg1!x'],
    ['one long word is not a passphrase', 'aaaaaaaaaaaaaaaaaaaa'],
    ['two words is not a passphrase', 'sixteen letters here'.slice(0, 15)],
    ['over 72 bytes', 'Aa1!' + 'x'.repeat(80)],
  ])('rejects %s', (_label, pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});

describe('hash and verify', () => {
  test('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('Str0ng!Pass#');
    expect(hash).not.toContain('Str0ng');
    expect(await verifyPassword('Str0ng!Pass#', hash)).toBe(true);
    expect(await verifyPassword('wrong-Pass1!', hash)).toBe(false);
  });

  test('returns false when there is no stored hash (unknown user)', async () => {
    expect(await verifyPassword('Str0ng!Pass#', null)).toBe(false);
  });
});
