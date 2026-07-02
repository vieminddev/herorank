/**
 * Disposable / temporary email blocking for sign-up.
 *
 * A curated set of the most common throwaway-mail domains. It is intentionally a static bundle (no
 * network call) so the check is instant and works offline on Workers. It won't catch every provider
 * — combined with email verification (services/email.ts) it raises the bar enough to stop casual
 * free-credit farming. Extend `DISPOSABLE_DOMAINS` as new ones surface.
 */

export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '0-mail.com', '10minutemail.com', '10minutemail.net', '20minutemail.com', '33mail.com',
  'anonbox.net', 'anonymbox.com', 'binkmail.com', 'bobmail.info', 'bugmenot.com',
  'burnermail.io', 'byom.de', 'crazymailing.com', 'cuvox.de', 'dayrep.com',
  'deadaddress.com', 'despam.it', 'discard.email', 'discardmail.com', 'discardmail.de',
  'dispostable.com', 'dropmail.me', 'dudmail.com', 'einrot.com', 'emailondeck.com',
  'emailtemporanea.net', 'emailtemporar.ro', 'emailthe.net', 'emltmp.com', 'fakeinbox.com',
  'fakemail.net', 'fakemailgenerator.com', 'fastmail.fm', 'fleckens.hu', 'gemx.org',
  'getairmail.com', 'getnada.com', 'gishpuppy.com', 'grr.la', 'guerrillamail.biz',
  'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com', 'hidemail.de',
  'incognitomail.com', 'inboxalias.com', 'inboxbear.com', 'jetable.org', 'kasmail.com',
  'koszmail.pl', 'kurzepost.de', 'maildrop.cc', 'maileater.com', 'mailexpire.com',
  'mailforspam.com', 'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailmetrash.com',
  'mailnesia.com', 'mailnull.com', 'mailsac.com', 'mailtemp.info', 'mailtothis.com',
  'mfsa.ru', 'mintemail.com', 'mohmal.com', 'moakt.com', 'mt2015.com',
  'mytemp.email', 'mytrashmail.com', 'nada.email', 'nowmymail.com', 'nwytg.net',
  'objectmail.com', 'odnorazovoe.ru', 'one-time.email', 'onewaymail.com', 'owlymail.com',
  'pokemail.net', 'put2.net', 'rcpt.at', 'rhyta.com', 'rppkn.com',
  'shieldedmail.com', 'sharklasers.com', 'sneakemail.com', 'spam4.me', 'spamavert.com',
  'spambog.com', 'spambox.us', 'spamgourmet.com', 'spamherelots.com', 'spammotel.com',
  'tafmail.com', 'temp-mail.io', 'temp-mail.org', 'tempail.com', 'tempemail.com',
  'tempinbox.com', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempr.email',
  'thankyou2010.com', 'throwam.com', 'throwawaymail.com', 'tmail.ws', 'tmailinator.com',
  'trash-mail.com', 'trashmail.com', 'trashmail.de', 'trashmail.me', 'trashmail.net',
  'trbvm.com', 'tyldd.com', 'vomoto.com', 'wegwerfmail.de', 'wh4f.org',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'zetmail.com', 'zippymail.info',
]);

/** True when the email's domain is a known disposable/temp-mail provider. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
