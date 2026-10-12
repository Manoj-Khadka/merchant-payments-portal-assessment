'use strict';

/**
 * Seeded users: one per role. `password` is intentionally trivial — this is a
 * mock API for local development and automated tests, never production.
 *
 *   sales@example.com     → SALES    (alias: sales@test.com)
 *   reviewer@example.com  → REVIEWER (alias: reviewer@test.com)
 *   reviewer2@example.com → REVIEWER
 *   admin@example.com     → ADMIN    (alias: admin@test.com)
 *
 * The `@test.com` aliases exist so the addresses named in the brief work too.
 */
const users = [
  {
    id: 'usr_sales',
    name: 'Sam Sales',
    email: 'sales@example.com',
    aliases: ['sales@test.com'],
    password: 'password',
    role: 'SALES',
  },
  {
    id: 'usr_reviewer',
    name: 'Rita Reviewer',
    email: 'reviewer@example.com',
    aliases: ['reviewer@test.com'],
    password: 'password',
    role: 'REVIEWER',
  },
  {
    id: 'usr_reviewer2',
    name: 'Rob Reviewer',
    email: 'reviewer2@example.com',
    aliases: [],
    password: 'password',
    role: 'REVIEWER',
  },
  {
    id: 'usr_admin',
    name: 'Avery Admin',
    email: 'admin@example.com',
    aliases: ['admin@test.com'],
    password: 'password',
    role: 'ADMIN',
  },
];

module.exports = { users };
