'use strict';

/**
 * Seed data.
 *
 * Every value here is deliberately, obviously fake: business names read
 * "Test …"/"Sample …", EINs are `00-000000x`, SSN last-4s are `0000`, and bank
 * account numbers and routing numbers are placeholder zero-runs. Nothing in this
 * file is real, and none of it is derived from real people or businesses.
 */

function address(line1, city, state, postalCode) {
  return { line1, line2: '', city, state, postalCode, country: 'US' };
}

function owner(id, name, ownershipPct, dob, ssnLast4) {
  return { id, name, ownershipPct, dob, ssnLast4 };
}

function doc(id, name, type, uploadedAt, sizeKb, status) {
  return { id, name, type, uploadedAt, sizeKb, status };
}

/**
 * Returns a fresh deep copy of the seed applications on every call so that
 * `/debug/reset` can restore a clean slate.
 */
function createSeedApplications() {
  return [
    {
      id: 'app_1001',
      status: 'DRAFT',
      version: 3,
      businessName: 'Test Merchant LLC',
      createdBy: 'usr_sales',
      assignedReviewerId: undefined,
      updatedAt: '2026-09-28T14:30:00.000Z',
      business: {
        legalName: 'Test Merchant LLC',
        dba: 'Test Merchant',
        entityType: 'LLC',
        ein: '00-0000000',
        website: 'https://test-merchant.example.com',
        address: address('100 Test Street', 'Testville', 'WA', '00000'),
      },
      owners: [owner('own_1001', 'Test Owner One', 100, '1985-04-12', '0000')],
      banking: {
        bankName: 'Test Bank',
        routingNumber: '000000000',
        accountNumber: '000123456789',
        monthlyVolume: 250000,
        averageTicket: 120,
      },
      documents: [
        doc(
          'doc_2001',
          'sample-bank-statement.pdf',
          'BANK_STATEMENT',
          '2026-09-27T14:05:00.000Z',
          412,
          'PENDING',
        ),
      ],
      riskHistory: [],
    },
    {
      id: 'app_1002',
      status: 'DRAFT',
      version: 1,
      businessName: 'Sample Store Inc',
      createdBy: 'usr_sales',
      assignedReviewerId: undefined,
      updatedAt: '2026-10-02T09:15:00.000Z',
      business: {
        legalName: 'Sample Store Inc',
        dba: '',
        entityType: 'CORPORATION',
        ein: '00-0000001',
        website: 'https://sample-store.example.com',
        address: address('55 Sample Avenue', 'Sampletown', 'CA', '00001'),
      },
      owners: [
        owner('own_1002', 'Sample Owner A', 60, '1979-11-02', '0001'),
        owner('own_1003', 'Sample Owner B', 40, '1983-06-21', '0002'),
      ],
      banking: {
        bankName: 'Sample Credit Union',
        routingNumber: '000000000',
        accountNumber: '000555000111',
        monthlyVolume: 1000000,
        averageTicket: 450,
      },
      documents: [],
      riskHistory: [],
    },
    {
      id: 'app_1003',
      status: 'SUBMITTED',
      version: 5,
      businessName: 'Demo Diner LLC',
      createdBy: 'usr_sales',
      assignedReviewerId: 'usr_reviewer',
      updatedAt: '2026-10-05T16:40:00.000Z',
      business: {
        legalName: 'Demo Diner LLC',
        dba: 'Demo Diner',
        entityType: 'LLC',
        ein: '00-0000002',
        website: 'https://demo-diner.example.com',
        address: address('4120 Placeholder Lane', 'Demoville', 'TX', '00002'),
      },
      owners: [owner('own_1004', 'Demo Owner', 100, '1978-02-19', '0003')],
      banking: {
        bankName: 'Demo Bank',
        routingNumber: '000000000',
        accountNumber: '000123400987',
        monthlyVolume: 400000,
        averageTicket: 210,
      },
      documents: [
        doc(
          'doc_2002',
          'sample-voided-check.pdf',
          'VOIDED_CHECK',
          '2026-10-04T10:11:00.000Z',
          96,
          'PENDING',
        ),
        doc(
          'doc_2003',
          'sample-id-document.pdf',
          'ID_DOCUMENT',
          '2026-10-04T10:12:00.000Z',
          180,
          'PENDING',
        ),
      ],
      riskHistory: [],
    },
    {
      id: 'app_1004',
      status: 'IN_REVIEW',
      version: 6,
      businessName: 'Example Ecommerce Co',
      createdBy: 'usr_sales',
      assignedReviewerId: 'usr_reviewer',
      updatedAt: '2026-10-07T11:05:00.000Z',
      business: {
        legalName: 'Example Ecommerce Co',
        dba: 'Example Ecommerce',
        entityType: 'LLC',
        ein: '00-0000003',
        website: 'https://example-ecommerce.example.com',
        address: address('1 Example Way', 'Exampledale', 'IL', '00003'),
      },
      owners: [owner('own_1005', 'Example Owner', 100, '1965-08-30', '0004')],
      banking: {
        bankName: 'Example Bank',
        routingNumber: '000000000',
        accountNumber: '000444300111',
        monthlyVolume: 8000000,
        averageTicket: 1500,
      },
      documents: [
        doc(
          'doc_2004',
          'sample-bank-statement-q3.pdf',
          'BANK_STATEMENT',
          '2026-10-06T09:00:00.000Z',
          640,
          'VERIFIED',
        ),
        doc(
          'doc_2005',
          'sample-voided-check.pdf',
          'VOIDED_CHECK',
          '2026-10-06T09:01:00.000Z',
          88,
          'VERIFIED',
        ),
        doc(
          'doc_2006',
          'sample-processing-statement.pdf',
          'PROCESSING_STATEMENT',
          '2026-10-06T09:02:00.000Z',
          512,
          'PENDING',
        ),
      ],
      riskHistory: [
        {
          id: 'dec_1000',
          reviewerId: 'usr_reviewer',
          decision: 'APPROVE',
          reason: 'Pre-screen passed; volumes consistent with industry.',
          at: '2026-09-22T15:10:00.000Z',
        },
      ],
    },
    {
      id: 'app_1005',
      status: 'APPROVED',
      version: 8,
      businessName: 'Placeholder Partners LLC',
      createdBy: 'usr_sales',
      assignedReviewerId: 'usr_reviewer',
      updatedAt: '2026-09-30T08:00:00.000Z',
      business: {
        legalName: 'Placeholder Partners LLC',
        dba: 'Placeholder Partners',
        entityType: 'CORPORATION',
        ein: '00-0000004',
        website: 'https://placeholder.example.com',
        address: address('10 Placeholder Road', 'Placeholderton', 'AZ', '00004'),
      },
      owners: [owner('own_1006', 'Placeholder Owner', 100, '1970-01-15', '0005')],
      banking: {
        bankName: 'Placeholder Bank',
        routingNumber: '000000000',
        accountNumber: '000777100233',
        monthlyVolume: 300000,
        averageTicket: 90,
      },
      documents: [
        doc(
          'doc_2007',
          'sample-bank-statement-sep.pdf',
          'BANK_STATEMENT',
          '2026-09-28T12:00:00.000Z',
          398,
          'VERIFIED',
        ),
        doc(
          'doc_2008',
          'sample-voided-check.pdf',
          'VOIDED_CHECK',
          '2026-09-28T12:01:00.000Z',
          72,
          'VERIFIED',
        ),
        doc(
          'doc_2009',
          'sample-id-document.pdf',
          'ID_DOCUMENT',
          '2026-09-28T12:02:00.000Z',
          210,
          'VERIFIED',
        ),
      ],
      riskHistory: [
        {
          id: 'dec_1001',
          reviewerId: 'usr_reviewer',
          decision: 'APPROVE',
          reason: 'Clean file, low chargeback risk.',
          at: '2026-09-30T08:00:00.000Z',
        },
      ],
    },
    {
      id: 'app_1006',
      status: 'REJECTED',
      version: 4,
      businessName: 'Fake Freight LLC',
      createdBy: 'usr_sales',
      assignedReviewerId: 'usr_reviewer',
      updatedAt: '2026-09-25T13:20:00.000Z',
      business: {
        legalName: 'Fake Freight LLC',
        dba: 'Fake Freight',
        entityType: 'CORPORATION',
        ein: '00-0000005',
        website: 'https://fake-freight.example.com',
        address: address('1401 Placeholder Boulevard', 'Fakeville', 'CA', '00005'),
      },
      owners: [owner('own_1007', 'Fake Owner', 100, '1968-03-03', '0006')],
      banking: {
        bankName: 'Fake Bank',
        routingNumber: '000000000',
        accountNumber: '000999800111',
        monthlyVolume: 20000000,
        averageTicket: 5000,
      },
      documents: [
        doc(
          'doc_2010',
          'sample-bank-statement-aug.pdf',
          'BANK_STATEMENT',
          '2026-09-20T08:00:00.000Z',
          398,
          'VERIFIED',
        ),
      ],
      riskHistory: [
        {
          id: 'dec_1002',
          reviewerId: 'usr_reviewer',
          decision: 'REJECT',
          reason: 'Volumes are inconsistent with the stated business.',
          at: '2026-09-25T13:20:00.000Z',
        },
      ],
    },
  ];
}

module.exports = { createSeedApplications };
