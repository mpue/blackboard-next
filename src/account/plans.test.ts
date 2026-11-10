import { describe, expect, it } from 'vitest';
import { checkoutUrl, DEFAULT_PLANS, euro, lastFreeDay, longDate, proFree } from './plans.ts';

describe('plans', () => {
  it('know when the launch phase of Professional ends, by the German day', () => {
    const s = { ...DEFAULT_PLANS, proFreeUntil: '2027-02-01' };
    expect(proFree(s, Date.parse('2027-01-31T22:59:00Z'))).toBe(true);
    // midnight in Germany is 23:00 UTC in winter
    expect(proFree(s, Date.parse('2027-01-31T23:00:00Z'))).toBe(false);
    expect(longDate(lastFreeDay(s), 'de')).toBe('31. Januar 2027');
    expect(longDate(s.proFreeUntil, 'en')).toBe('February 1, 2027');
  });

  it('give the payment link the account along', () => {
    const u = checkoutUrl('https://buy.stripe.com/abc', { id: 'u1', email: 'ada@example.com' });
    expect(u).toBe('https://buy.stripe.com/abc?client_reference_id=u1&prefilled_email=ada%40example.com');
    expect(checkoutUrl('https://buy.stripe.com/abc')).toBe('https://buy.stripe.com/abc');
    expect(checkoutUrl('', { id: 'u1', email: 'a@b.c' })).toBe('');
  });

  it('write prices like people do', () => {
    expect(euro(6, 'de')).toBe('6 €');
    expect(euro(6.5, 'de')).toBe('6,5 €');
    expect(euro(29, 'en')).toBe('29 €');
  });
});
