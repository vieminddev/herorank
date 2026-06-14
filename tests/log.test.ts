/**
 * Tests for the shared observability log helper (Phase 5 O1/O2, INFRA-EDGE).
 *
 * Verifies the STABLE contract INFRA-JOBS imports: logEvent/logError shapes, JSON console
 * output, PII/secret redaction, and best-effort Analytics Engine write.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { logEvent, logError, newRequestId } from '../src/lib/server/observability/log';

afterEach(() => vi.restoreAllMocks());

function captureConsole(method: 'log' | 'warn' | 'error') {
  return vi.spyOn(console, method).mockImplementation(() => {});
}

describe('logEvent', () => {
  it('emits a single JSON line with level + ts + fields', () => {
    const spy = captureConsole('log');
    logEvent('info', { event: 'request', path: '/api/me', status: 200, latency_ms: 12 });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('info');
    expect(parsed.path).toBe('/api/me');
    expect(parsed.status).toBe(200);
    expect(typeof parsed.ts).toBe('string');
  });

  it('routes warn/error to the matching console method', () => {
    const warn = captureConsole('warn');
    const error = captureConsole('error');
    logEvent('warn', { event: 'x' });
    logEvent('error', { event: 'y' });
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('redacts PII/secret-looking keys', () => {
    const spy = captureConsole('log');
    logEvent('info', {
      user_id: 'u1',
      email: 'secret@user.com',
      authToken: 'abc',
      STRIPE_SECRET_KEY: 'sk_live_x',
      body: { password: 'hunter2' },
    });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.user_id).toBe('u1'); // safe id kept
    expect(parsed.email).toBe('[redacted]');
    expect(parsed.authToken).toBe('[redacted]');
    expect(parsed.STRIPE_SECRET_KEY).toBe('[redacted]');
    expect(parsed.body).toBe('[redacted]');
  });

  it('writes a metric to the Analytics Engine binding when present', () => {
    captureConsole('log');
    const writeDataPoint = vi.fn();
    logEvent('info', { tool: 'echo', latency_ms: 5, credits_delta: -1 }, { writeDataPoint });
    expect(writeDataPoint).toHaveBeenCalledOnce();
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.indexes).toEqual(['echo']);
    expect(point.doubles).toEqual([5, -1]);
  });

  it('never throws when the Analytics write fails', () => {
    captureConsole('log');
    const writeDataPoint = vi.fn(() => {
      throw new Error('AE down');
    });
    expect(() => logEvent('info', { tool: 't' }, { writeDataPoint })).not.toThrow();
  });
});

describe('logError', () => {
  it('normalizes an Error and includes request context', () => {
    const spy = captureConsole('error');
    logError(new TypeError('boom'), { request_id: 'r1', path: '/api/x' });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.error_name).toBe('TypeError');
    expect(parsed.error_message).toBe('boom');
    expect(parsed.request_id).toBe('r1');
  });

  it('handles non-Error throwables', () => {
    const spy = captureConsole('error');
    logError('string failure');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.error_name).toBe('NonError');
    expect(parsed.error_message).toBe('string failure');
  });

  it('does not leak ANALYTICS binding into the logged fields', () => {
    const spy = captureConsole('error');
    const writeDataPoint = vi.fn();
    logError(new Error('e'), { ANALYTICS: { writeDataPoint }, user_id: 'u' });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.ANALYTICS).toBeUndefined();
    expect(parsed.user_id).toBe('u');
    expect(writeDataPoint).toHaveBeenCalled();
  });
});

describe('newRequestId', () => {
  it('returns a unique uuid each call', () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});
