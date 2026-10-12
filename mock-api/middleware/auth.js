'use strict';

const store = require('../data/store');

function unauthorized(res, reason) {
  res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
  return res.status(401).json({ error: 'unauthorized', reason });
}

/**
 * Validates the bearer token and attaches `req.user`. A 401 can be forced for
 * every request with `x-force-401: true`, or for everyone via
 * `POST /api/debug/force-401` — both drive the client's single-flight refresh.
 */
function authenticate(req, res, next) {
  if (req.get('x-force-401') === 'true') {
    return unauthorized(res, 'forced_401');
  }

  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return unauthorized(res, 'missing_token');
  }

  const user = store.resolveAccessToken(token);
  if (!user) {
    return unauthorized(res, 'invalid_token');
  }

  const { enabled, userId } = store.state.force401;
  if (enabled && (!userId || userId === user.id)) {
    return unauthorized(res, 'forced_401');
  }

  req.user = user;
  req.accessToken = token;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res, 'missing_token');
    if (roles.includes(req.user.role)) return next();
    return res
      .status(403)
      .json({ error: 'forbidden', message: `Requires one of: ${roles.join(', ')}` });
  };
}

module.exports = { authenticate, requireRole, unauthorized };
