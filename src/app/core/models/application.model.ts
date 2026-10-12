export type AppStatus = 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface BusinessSection {
  legalName: string;
  dba?: string;
  entityType: string;
  ein: string;
  website?: string;
  address: Address;
}

/**
 * A principal/owner. `ssnLast4` is the only part of the SSN the portal ever
 * holds; the mock API masks it for anyone other than the owning SALES user, and
 * releases it through the audited reveal endpoint.
 */
export interface Owner {
  id: string;
  name: string;
  dob: string;
  ownershipPct: number;
  ssnLast4: string;
}

export interface BankingSection {
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  monthlyVolume: number;
  averageTicket: number;
}

export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface ApplicationDocument {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  sizeKb: number;
  status: DocumentStatus;
}

export interface RiskDecision {
  id: string;
  reviewerId: string;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
  at: string;
}

export interface MerchantApplication {
  id: string;
  status: AppStatus;
  version: number;
  businessName: string;
  createdBy: string;
  assignedReviewerId?: string | null;
  updatedAt: string;
  business: BusinessSection;
  owners: Owner[];
  banking: BankingSection;
  documents?: ApplicationDocument[];
  riskHistory?: RiskDecision[];
}

export interface ApplicationQuery {
  page: number;
  pageSize: number;
  status: AppStatus | null;
  q: string;
  sort: string;
}

/** Payload of `POST /applications/:id/reveal` (server-authorised + audited). */
export interface RevealedFields {
  ein: string;
  routingNumber: string;
  accountNumber: string;
  owners: Array<{ id: string; ssnLast4?: string }>;
}
