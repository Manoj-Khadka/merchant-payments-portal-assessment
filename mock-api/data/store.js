'use strict';

const crypto = require('node:crypto');
const { users } = require('./users');
const { createSeedApplications } = require('./applications');

// Short-lived access tokens (30s by default) make the refresh flow easy to demo.
const ACCESS_TOKEN_TTL_MS = Number(process.env.MOCK_ACCESS_TTL_MS || 30_000);
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function seedDecisions() {
  return createSeedApplications().flatMap((application) => application.riskHistory || []);
}

const state = {
  applications: createSeedApplications(),
  decisions: seedDecisions(),
  accessTokens: new Map(),
  refreshTokens: new Map(),
  force401: { enabled: false, userId: null },
  chaos: { delayMs: 0, failRate: 0 },
  // Audit trail for sensitive-data reveals. Stores *who* saw *what*, never the
  // revealed values themselves.
  audit: [],
  sequence: 2000,
};

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function nextId(prefix) {
  state.sequence += 1;
  return `${prefix}_${state.sequence}`;
}

function findUserByEmail(email) {
  const needle = String(email || '').toLowerCase();
  return users.find(
    (user) =>
      user.email.toLowerCase() === needle ||
      (user.aliases || []).some((alias) => alias.toLowerCase() === needle),
  );
}

function findUserById(id) {
  return users.find((user) => user.id === id);
}

function publicUser(user) {
  return user
    ? { id: user.id, name: user.name, email: user.email, role: user.role }
    : null;
}

function listUsers(role) {
  return users
    .filter((user) => !role || user.role === role)
    .map((user) => publicUser(user));
}

// --- sessions -----------------------------------------------------------------

function issueSession(user, familyId) {
  const family = familyId || randomToken();
  const accessToken = randomToken();
  state.accessTokens.set(accessToken, {
    userId: user.id,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  });

  const refreshToken = randomToken();
  state.refreshTokens.set(refreshToken, {
    userId: user.id,
    familyId: family,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    used: false,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    tokenType: 'Bearer',
  };
}

function revokeFamily(familyId) {
  for (const [token, record] of state.refreshTokens) {
    if (record.familyId === familyId) state.refreshTokens.delete(token);
  }
}

function rotateSession(refreshToken) {
  const record = state.refreshTokens.get(refreshToken);
  if (!record) return { error: 'invalid_refresh_token' };

  if (record.expiresAt <= Date.now()) {
    state.refreshTokens.delete(refreshToken);
    return { error: 'expired_refresh_token' };
  }

  // A rotated (already-used) token being presented again signals theft: revoke
  // the whole family so neither the attacker nor the victim can continue.
  if (record.used) {
    revokeFamily(record.familyId);
    return { error: 'refresh_token_reuse' };
  }

  const user = findUserById(record.userId);
  if (!user) return { error: 'invalid_refresh_token' };

  record.used = true;
  return { session: issueSession(user, record.familyId), user };
}

function revokeRefreshToken(refreshToken) {
  state.refreshTokens.delete(refreshToken);
}

function resolveAccessToken(token) {
  const record = state.accessTokens.get(token);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    state.accessTokens.delete(token);
    return null;
  }
  return findUserById(record.userId) || null;
}

function revokeAccessToken(token) {
  state.accessTokens.delete(token);
}

function expireAccessTokens(userId) {
  let expired = 0;
  for (const [token, record] of state.accessTokens) {
    if (!userId || record.userId === userId) {
      record.expiresAt = 0;
      expired += 1;
    }
  }
  return expired;
}

// --- authorization ------------------------------------------------------------

function canView(application, user) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'SALES') return application.createdBy === user.id;
  if (user.role === 'REVIEWER') return application.assignedReviewerId === user.id;
  return false;
}

function canReveal(application, user) {
  // Only roles granted `sensitive:reveal` (ADMIN, or the assigned REVIEWER) may
  // reveal. The owning SALES user sees real values only while editing their own
  // draft (see `shouldMask`), so they never need — and never get — the reveal
  // endpoint.
  if (user.role === 'ADMIN') return true;
  if (user.role === 'REVIEWER') return application.assignedReviewerId === user.id;
  return false;
}

/**
 * Only the owning SALES user, and only while the application is still a draft
 * they are editing, sees real values. Drafts round-trip through autosave, so
 * masking them would echo masked strings back to the server. Once submitted,
 * everyone — including the owner — receives masked values and must use the
 * audited reveal endpoint.
 */
function shouldMask(application, user) {
  const ownsDraft =
    user.role === 'SALES' &&
    application.createdBy === user.id &&
    application.status === 'DRAFT';
  return !ownsDraft;
}

/**
 * Records that a user unmasked the named fields of an application. The payload
 * intentionally excludes the revealed values — an audit trail should never
 * become a second copy of the data it is protecting.
 */
function recordReveal(application, user, fieldKeys) {
  const entry = {
    id: nextId('aud'),
    at: nowIso(),
    userId: user.id,
    role: user.role,
    applicationId: application.id,
    fields: [...fieldKeys],
    ip: null,
  };
  state.audit.push(entry);
  return entry;
}

function listAudit(applicationId) {
  const entries = applicationId
    ? state.audit.filter((entry) => entry.applicationId === applicationId)
    : state.audit;
  return entries.map((entry) => ({ ...entry }));
}

// --- masking ------------------------------------------------------------------

function maskValue(value) {
  const text = String(value == null ? '' : value);
  if (!text) return text;
  return `\u2022\u2022\u2022\u2022${text.slice(-4)}`;
}

function serializeApplication(application, mask) {
  const copy = JSON.parse(JSON.stringify(application));
  const masked = { ...copy };

  if (mask) {
    masked.business = { ...masked.business, ein: maskValue(masked.business.ein) };
    masked.banking = {
      ...masked.banking,
      routingNumber: maskValue(masked.banking.routingNumber),
      accountNumber: maskValue(masked.banking.accountNumber),
    };
    masked.owners = (masked.owners || []).map((entry) => ({
      ...entry,
      ssnLast4: maskValue(entry.ssnLast4),
    }));
  }

  return masked;
}

// --- applications -------------------------------------------------------------

function findApplication(id) {
  return state.applications.find((application) => application.id === id);
}

function listApplications({ user, page, pageSize, status, q, sort }) {
  let items = state.applications.filter((application) => canView(application, user));

  if (status) {
    items = items.filter((application) => application.status === status);
  }

  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter(
      (application) =>
        (application.businessName || '').toLowerCase().includes(needle) ||
        (application.business?.legalName || '').toLowerCase().includes(needle),
    );
  }

  const [field = 'updatedAt', direction = 'desc'] = String(sort || 'updatedAt,desc').split(',');
  const factor = direction === 'asc' ? 1 : -1;
  items = [...items].sort((a, b) => {
    const left = a[field] == null ? '' : a[field];
    const right = b[field] == null ? '' : b[field];
    if (left < right) return -1 * factor;
    if (left > right) return 1 * factor;
    return 0;
  });

  const total = items.length;
  const safeSize = Math.max(1, Math.min(100, Number(pageSize) || 10));
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * safeSize;

  return {
    total,
    page: safePage,
    pageSize: safeSize,
    items: items
      .slice(start, start + safeSize)
      .map((application) => serializeApplication(application, shouldMask(application, user))),
  };
}

function createApplication(user) {
  const application = {
    id: nextId('app'),
    status: 'DRAFT',
    version: 1,
    businessName: 'Untitled application',
    createdBy: user.id,
    assignedReviewerId: undefined,
    updatedAt: nowIso(),
    business: {
      legalName: '',
      dba: '',
      entityType: 'LLC',
      ein: '',
      website: '',
      address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'US' },
    },
    owners: [owner({})],
    banking: {
      bankName: '',
      routingNumber: '',
      accountNumber: '',
      monthlyVolume: 0,
      averageTicket: 0,
    },
    documents: [],
    riskHistory: [],
  };

  state.applications.unshift(application);
  return application;
}

function owner(entry) {
  return {
    id: entry.id || nextId('own'),
    name: entry.name || '',
    ownershipPct: Number(entry.ownershipPct) || 0,
    dob: entry.dob || '',
    ssnLast4: entry.ssnLast4 || '',
  };
}

function updateDraft(application, body) {
  if (body.business) application.business = { ...application.business, ...body.business };
  if (body.banking) application.banking = { ...application.banking, ...body.banking };
  if (Array.isArray(body.owners)) {
    application.owners = body.owners.map((entry) => owner(entry));
  }

  application.businessName =
    application.business.legalName || application.business.dba || 'Untitled application';
  application.version += 1;
  application.updatedAt = nowIso();
  return application;
}

function submitApplication(application) {
  const fields = [];
  if (!application.business.legalName) fields.push('business.legalName');
  if (!/^\d{2}-\d{7}$/.test(application.business.ein || '')) fields.push('business.ein');
  if (!application.banking.accountNumber) fields.push('banking.accountNumber');

  const total = (application.owners || []).reduce(
    (sum, entry) => sum + (Number(entry.ownershipPct) || 0),
    0,
  );
  if (application.owners.length === 0 || total !== 100) fields.push('owners');

  if (fields.length > 0) return { fields };

  application.status = 'SUBMITTED';
  application.version += 1;
  application.updatedAt = nowIso();
  return { application };
}

function recordDecision(application, user, decision, reason) {
  const entry = {
    id: nextId('dec'),
    reviewerId: user.id,
    decision,
    reason,
    at: nowIso(),
  };

  state.decisions.push(entry);
  application.riskHistory = [entry, ...(application.riskHistory || [])];
  application.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  application.assignedReviewerId = application.assignedReviewerId || user.id;
  application.version += 1;
  application.updatedAt = nowIso();
  return application;
}

function assignApplication(application, reviewerId) {
  application.assignedReviewerId = reviewerId || undefined;
  if (application.status === 'SUBMITTED' && reviewerId) {
    application.status = 'IN_REVIEW';
  }
  application.version += 1;
  application.updatedAt = nowIso();
  return application;
}

// --- debug --------------------------------------------------------------------

function reset() {
  state.applications = createSeedApplications();
  state.decisions = createSeedDecisions();
  state.accessTokens.clear();
  state.refreshTokens.clear();
  state.force401 = { enabled: false, userId: null };
  state.chaos = { delayMs: 0, failRate: 0 };
  state.audit = [];
  state.sequence = 2000;
}

function snapshot() {
  return {
    applications: state.applications.length,
    decisions: state.decisions.length,
    accessTokens: state.accessTokens.size,
    refreshTokens: state.refreshTokens.size,
    auditEvents: state.audit.length,
    force401: { ...state.force401 },
    chaos: { ...state.chaos },
  };
}

module.exports = {
  state,
  findUserByEmail,
  findUserById,
  publicUser,
  listUsers,
  issueSession,
  rotateSession,
  revokeRefreshToken,
  resolveAccessToken,
  revokeAccessToken,
  expireAccessTokens,
  canView,
  canReveal,
  shouldMask,
  recordReveal,
  listAudit,
  serializeApplication,
  findApplication,
  listApplications,
  createApplication,
  updateDraft,
  submitApplication,
  recordDecision,
  assignApplication,
  reset,
  snapshot,
};
