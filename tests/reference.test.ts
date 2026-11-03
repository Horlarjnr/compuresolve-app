import { describe, expect, test } from 'vitest';
import { generateReference } from '../src/utils/reference';

describe('generateReference', () => {
  test('has the form CR-<CODE>-<YEAR>-<6 characters>', () => {
    const ref = generateReference('SWE', new Date('2026-11-02'));
    expect(ref).toMatch(/^CR-SWE-2026-[A-Z2-9]{6}$/);
  });

  test('uses FAC for faculty-level complaints', () => {
    expect(generateReference('FAC')).toMatch(/^CR-FAC-\d{4}-[A-Z2-9]{6}$/);
  });

  test('never contains easily confused characters (0, O, 1, I)', () => {
    for (let i = 0; i < 500; i += 1) {
      const suffix = generateReference('CPE').split('-')[3];
      expect(suffix).not.toMatch(/[01OI]/);
    }
  });

  test('is random: 2000 references have no repeats', () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateReference('CPE')));
    expect(set.size).toBe(2000);
  });
});
