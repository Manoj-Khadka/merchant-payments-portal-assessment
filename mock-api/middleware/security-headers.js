'use strict';

/**
 * Security headers for the mock API.
 *
 * The API only ever returns JSON, so a strict, locked-down policy is safe here.
 * A real deployment would also apply these headers to the HTML document served
 * by the web tier (see the "Content Security Policy" section of the README for
 * the full explanation and an example policy).
 *
 * `CSP_MODE=dev` relaxes the policy so the Angular dev server / Vite HMR
 * (which injects inline scripts and uses eval + websockets) keeps working. The
 * strict policy is the default and is what you would ship.
 */

const STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Dev-only relaxation: allows the dev server's inline bootstrap + HMR websocket.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws: http://localhost:*",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

module.exports = function securityHeaders(req, res, next) {
  const mode = process.env.CSP_MODE || 'strict';
  res.set('Content-Security-Policy', mode === 'dev' ? DEV_CSP : STRICT_CSP);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

module.exports.STRICT_CSP = STRICT_CSP;
module.exports.DEV_CSP = DEV_CSP;
