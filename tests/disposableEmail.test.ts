import { describe, it, expect } from 'vitest';
import { isDisposableEmail } from '../src/lib/server/services/disposableEmail';

describe('isDisposableEmail', () => {
  it('flags known disposable domains (case/space-insensitive)', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@YOPMAIL.com')).toBe(true);
    expect(isDisposableEmail('  y@temp-mail.org ')).toBe(true);
    expect(isDisposableEmail('z@guerrillamail.com')).toBe(true);
  });

  it('allows normal provider + custom domains', () => {
    expect(isDisposableEmail('owner@gmail.com')).toBe(false);
    expect(isDisposableEmail('hi@myshop.com')).toBe(false);
    expect(isDisposableEmail('viemind@vierank.com')).toBe(false);
  });

  it('returns false for malformed input', () => {
    expect(isDisposableEmail('not-an-email')).toBe(false);
    expect(isDisposableEmail('')).toBe(false);
  });
});
