/**
 * Transactional email (password reset + email verification).
 *
 * Single `sendEmail()` over `fetch` (Cloudflare Workers — no SMTP). Uses Resend's HTTP API when
 * configured; swap the one `deliver()` call to point at any provider. All flows that send mail first
 * check `isEmailConfigured(env)` and degrade to a no-op when email isn't set up yet — so the app
 * still runs (just without reset/verification) before the secrets exist.
 */
import type { Env } from '../env';

export function isEmailConfigured(env: Pick<Env, 'RESEND_API_KEY' | 'EMAIL_FROM'>): boolean {
  return !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Deliver an email. Returns false (and logs) on failure — callers must not throw the auth flow. */
export async function sendEmail(
  env: Pick<Env, 'RESEND_API_KEY' | 'EMAIL_FROM'>,
  params: SendEmailParams
): Promise<boolean> {
  if (!isEmailConfigured(env)) {
    console.warn('[email] not configured — skipping send to', params.to);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
      }),
    });
    if (!res.ok) {
      console.error('[email] send failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send error', (err as Error).message);
    return false;
  }
}

/** Derive the public origin from an action link so the email logo isn't a hardcoded domain. */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'https://vierank.com';
  }
}

/**
 * Minimal, brand-consistent HTML shell shared by the templates. Header shows the butterfly mascot
 * (static PNG — email clients don't run CSS/SVG) next to the wordmark; the wordmark stays as the
 * fallback when a client blocks images.
 */
function shell(heading: string, bodyHtml: string, origin: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2a24">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px">
    <div style="margin-bottom:20px">
      <img src="${origin}/vierank-logo.png" alt="" width="28" height="28" style="vertical-align:middle;margin-right:8px;border:0" />
      <span style="font-size:18px;font-weight:700;color:#0f766e;vertical-align:middle">VieRank</span>
    </div>
    <div style="background:#fff;border:1px solid #e6e9e5;border-radius:14px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 12px">${heading}</h1>
      ${bodyHtml}
    </div>
    <p style="font-size:11px;color:#8a948e;margin-top:20px">© 2026 VieRank · Etsy SEO tools. If you didn't request this, you can safely ignore this email.</p>
  </div></body></html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px;margin:8px 0">${label}</a>
  <p style="font-size:12px;color:#8a948e;margin-top:14px;word-break:break-all">Or paste this link: ${url}</p>`;
}

export function resetPasswordEmail(url: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Reset your VieRank password',
    html: shell(
      'Reset your password',
      `<p style="font-size:14px;line-height:1.6;color:#3c463f">We received a request to reset your VieRank password. This link expires in 1 hour.</p>${button(url, 'Reset password')}`,
      originOf(url)
    ),
    text: `Reset your VieRank password (expires in 1 hour): ${url}`,
  };
}

export function verifyEmail(url: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Verify your VieRank email',
    html: shell(
      'Confirm your email',
      `<p style="font-size:14px;line-height:1.6;color:#3c463f">Welcome to VieRank! Confirm your email address to activate your account and your 30 free credits.</p>${button(url, 'Verify email')}`,
      originOf(url)
    ),
    text: `Verify your VieRank email: ${url}`,
  };
}
