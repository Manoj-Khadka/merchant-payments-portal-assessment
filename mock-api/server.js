'use strict';

const express = require('express');
const store = require('./data/store');
const { authenticate, requireRole, unauthorized } = require('./middleware/auth');
const cors = require('./middleware/cors');
const requestLogger = require('./middleware/request-logger');
const securityHeaders = require('./middleware/security-headers');

const PORT = Number(process.env.MOCK_API_PORT || 3000);

// Debug tooling is opt-in: pass `--debug` (the `mock-api` npm script does) or set
// ENABLE_DEBUG=1. Keeping it off the default path means a plain
// `node mock-api/server.js` never exposes token-expiry, chaos or reset routes,
// and the flag works the same on Windows, macOS and Linux.
const DEBUG = process.argv.includes('--debug') || process.env.ENABLE_DEBUG === '1';

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(requestLogger);
app.use(cors);
app.use(express.json({ limit: '1mb' }));

const api = express.Router();

api.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- auth ---------------------------------------------------------------------

api.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = store.findUserByEmail(email);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'invalid_grant', message: 'Invalid email or password.' });
  }

  const session = store.issueSession(user);
  res.json({ ...session, user: store.publicUser(user) });
});

api.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ error: 'invalid_request', message: 'refreshToken is required.' });
  }

  const result = store.rotateSession(refreshToken);
  if (result.error) return unauthorized(res, result.error);

  res.json({ ...result.session, user: store.publicUser(result.user) });
});

api.post('/auth/logout', (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) store.revokeRefreshToken(refreshToken);

  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) store.revokeAccessToken(header.slice(7));

  res.status(204).end();
});

api.get('/auth/me', authenticate, (req, res) => res.json({ user: store.publicUser(req.user) }));

// --- debug controls -----------------------------------------------------------
//
// These routes can expire tokens, inject failures and reset the whole in-memory
// database, so they are only mounted when the server is started with `--debug`
// (the `mock-api` npm script) or ENABLE_DEBUG=1. They are never available by
// default.

if (DEBUG) {
  api.post('/debug/expire-tokens', (req, res) => {
    const userId = (req.body && req.body.userId) || req.query.userId || null;
    res.json({ expired: store.expireAccessTokens(userId) });
  });

  api.post('/debug/force-401', (req, res) => {
    const { enabled = true, userId = null } = req.body || {};
    store.state.force401 = { enabled: Boolean(enabled), userId: userId || null };
    res.json({ force401: { ...store.state.force401 } });
  });

  api.post('/debug/slow', (req, res) => {
    const { delayMs = 0, failRate = 0 } = req.body || {};
    store.state.chaos = {
      delayMs: Math.max(0, Number(delayMs) || 0),
      failRate: Math.min(1, Math.max(0, Number(failRate) || 0)),
    };
    res.json({ chaos: { ...store.state.chaos } });
  });

  api.post('/debug/reset', (_req, res) => {
    store.reset();
    res.json({ status: 'reset' });
  });

  api.get('/debug/state', (_req, res) => res.json(store.snapshot()));

  // Reveals are audited (who saw which fields, when) but the values are never
  // written to the audit log or to stdout.
  api.get('/debug/audit', (req, res) =>
    res.json({ entries: store.listAudit(req.query.applicationId) }),
  );
}

// --- artificial latency / injected failures for loading & error demos ---------

api.use('/applications', (req, res, next) => {
  const { delayMs, failRate } = store.state.chaos;

  const proceed = () => {
    if (failRate > 0 && Math.random() < failRate) {
      return res
        .status(500)
        .json({ error: 'server_error', message: 'Injected failure (debug flag).' });
    }
    next();
  };

  if (delayMs > 0) {
    setTimeout(proceed, delayMs);
  } else {
    proceed();
  }
});

// --- applications -------------------------------------------------------------

api.get('/applications', authenticate, (req, res) => {
  res.json(
    store.listApplications({
      user: req.user,
      page: req.query.page,
      pageSize: req.query.pageSize,
      status: req.query.status,
      q: req.query.q,
      sort: req.query.sort,
    }),
  );
});

api.post('/applications', authenticate, requireRole('SALES'), (req, res) => {
  const application = store.createApplication(req.user);
  res.status(201).json(store.serializeApplication(application, false));
});

api.get('/applications/:id', authenticate, (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });
  if (!store.canView(application, req.user)) {
    return res
      .status(403)
      .json({ error: 'forbidden', message: 'You cannot view this application.' });
  }
  res.json(store.serializeApplication(application, store.shouldMask(application, req.user)));
});

api.put('/applications/:id/draft', authenticate, (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });

  if (!(req.user.role === 'SALES' && application.createdBy === req.user.id)) {
    return res
      .status(403)
      .json({ error: 'forbidden', message: 'Only the owning sales user can edit this draft.' });
  }

  if (application.status !== 'DRAFT') {
    return res.status(409).json({ error: 'invalid_state', message: 'Only drafts can be saved.' });
  }

  const version = Number((req.body || {}).version);
  if (Number.isFinite(version) && version !== application.version) {
    return res.status(409).json({
      error: 'version_conflict',
      message: 'This draft was updated elsewhere.',
      currentVersion: application.version,
    });
  }

  const updated = store.updateDraft(application, req.body || {});
  res.json(store.serializeApplication(updated, false));
});

api.post('/applications/:id/submit', authenticate, (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });

  if (!(req.user.role === 'SALES' && application.createdBy === req.user.id)) {
    return res
      .status(403)
      .json({ error: 'forbidden', message: 'Only the owning sales user can submit.' });
  }

  if (application.status !== 'DRAFT') {
    return res
      .status(409)
      .json({ error: 'invalid_state', message: 'Only drafts can be submitted.' });
  }

  const result = store.submitApplication(application);
  if (result.fields) {
    return res.status(400).json({
      error: 'invalid_application',
      message: 'Complete all required sections before submitting.',
      fields: result.fields,
    });
  }

  res.json(store.serializeApplication(result.application, false));
});

api.post('/applications/:id/decision', authenticate, (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });

  // Authorisation comes first: a user who is not the assigned reviewer always
  // gets 403, never a 400 about the shape of the request body.
  const isAssignedReviewer =
    req.user.role === 'REVIEWER' && application.assignedReviewerId === req.user.id;
  if (!isAssignedReviewer) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Only the assigned reviewer can decide.',
    });
  }

  const { decision, reason } = req.body || {};
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    return res
      .status(400)
      .json({ error: 'invalid_request', message: 'decision must be APPROVE or REJECT.' });
  }
  // A rejection must be justified; an approval may optionally carry a comment.
  const trimmedReason = String(reason || '').trim();
  if (decision === 'REJECT' && trimmedReason.length < 5) {
    return res
      .status(400)
      .json({ error: 'reason_required', message: 'A rejection must include a reason.' });
  }

  if (application.status !== 'SUBMITTED' && application.status !== 'IN_REVIEW') {
    return res
      .status(409)
      .json({ error: 'invalid_state', message: 'This application is not awaiting a decision.' });
  }

  const updated = store.recordDecision(
    application,
    req.user,
    decision,
    trimmedReason || 'Approved without comment.',
  );
  res.json(store.serializeApplication(updated, store.shouldMask(application, req.user)));
});

api.put('/applications/:id/assignment', authenticate, requireRole('ADMIN'), (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });

  const { reviewerId } = req.body || {};
  if (reviewerId) {
    const reviewer = store.findUserById(reviewerId);
    if (!reviewer || reviewer.role !== 'REVIEWER') {
      return res
        .status(400)
        .json({ error: 'invalid_reviewer', message: 'reviewerId must reference a reviewer.' });
    }
  }

  const updated = store.assignApplication(application, reviewerId);
  res.json(store.serializeApplication(updated, store.shouldMask(application, req.user)));
});

api.post('/applications/:id/reveal', authenticate, (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });

  if (!store.canReveal(application, req.user)) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'You cannot reveal sensitive data for this application.',
    });
  }

  // Audit before responding — an access log that can be skipped isn't an audit.
  const fieldKeys = ['business.ein', 'banking.routingNumber', 'banking.accountNumber'];
  for (const entry of application.owners || []) {
    fieldKeys.push(`owners.${entry.id}.ssnLast4`);
  }
  store.recordReveal(application, req.user, fieldKeys);

  res.json({
    ein: application.business.ein,
    routingNumber: application.banking.routingNumber,
    accountNumber: application.banking.accountNumber,
    owners: (application.owners || []).map((entry) => ({ id: entry.id, ssnLast4: entry.ssnLast4 })),
  });
});

api.get('/applications/:id/risk-history', authenticate, (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });
  if (!store.canView(application, req.user)) {
    return res.status(403).json({ error: 'forbidden', message: 'You cannot view this application.' });
  }
  res.json([...(application.riskHistory || [])]);
});

api.get('/applications/:id/documents', authenticate, (req, res) => {
  const application = store.findApplication(req.params.id);
  if (!application) return res.status(404).json({ error: 'not_found' });
  if (!store.canView(application, req.user)) {
    return res.status(403).json({ error: 'forbidden', message: 'You cannot view this application.' });
  }
  res.json([...(application.documents || [])]);
});

// --- users (for the admin assignment dropdown) --------------------------------

api.get('/users', authenticate, requireRole('ADMIN'), (req, res) => {
  res.json(store.listUsers(req.query.role));
});

api.use((req, res) =>
  res
    .status(404)
    .json({ error: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` }),
);

app.use('/api', api);

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  console.error('[mock-api]', error);
  res.status(500).json({ error: 'server_error', message: 'Unexpected mock API error.' });
});

app.listen(PORT, () => {
  console.log(`[mock-api] listening on http://localhost:${PORT}`);
  console.log(`[mock-api] CSP mode: ${process.env.CSP_MODE || 'strict'} (set CSP_MODE=dev to relax for HMR)`);
  console.log('[mock-api] accounts (password: "password"):');
  console.log('  sales@example.com     SALES    (sales@test.com)');
  console.log('  reviewer@example.com  REVIEWER (reviewer@test.com, assigned in seed)');
  console.log('  reviewer2@example.com REVIEWER');
  console.log('  admin@example.com     ADMIN    (admin@test.com)');
});

module.exports = app;
