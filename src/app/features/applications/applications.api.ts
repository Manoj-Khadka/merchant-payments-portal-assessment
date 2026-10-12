import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/http/api.config';
import {
  ApplicationDocument,
  ApplicationQuery,
  MerchantApplication,
  RevealedFields,
  RiskDecision,
} from '../../core/models/application.model';
import { Page } from '../../core/models/page.model';
import { User } from '../../core/models/user.model';

@Injectable({ providedIn: 'root' })
export class ApplicationsApi {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);

  list(query: ApplicationQuery): Observable<Page<MerchantApplication>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize)
      .set('sort', query.sort);

    if (query.status) params = params.set('status', query.status);
    if (query.q.trim()) params = params.set('q', query.q.trim());

    return this.http.get<Page<MerchantApplication>>(`${this.apiBase}/applications`, { params });
  }

  get(id: string): Observable<MerchantApplication> {
    return this.http.get<MerchantApplication>(`${this.apiBase}/applications/${id}`);
  }

  create(): Observable<MerchantApplication> {
    return this.http.post<MerchantApplication>(`${this.apiBase}/applications`, {});
  }

  saveDraft(id: string, value: unknown, version: number): Observable<MerchantApplication> {
    return this.http.put<MerchantApplication>(`${this.apiBase}/applications/${id}/draft`, {
      version,
      ...(value as Record<string, unknown>),
    });
  }

  submit(id: string): Observable<MerchantApplication> {
    return this.http.post<MerchantApplication>(`${this.apiBase}/applications/${id}/submit`, {});
  }

  decide(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    reason: string,
  ): Observable<MerchantApplication> {
    return this.http.post<MerchantApplication>(`${this.apiBase}/applications/${id}/decision`, {
      decision,
      reason,
    });
  }

  assign(id: string, reviewerId: string): Observable<MerchantApplication> {
    return this.http.put<MerchantApplication>(`${this.apiBase}/applications/${id}/assignment`, {
      reviewerId,
    });
  }

  reveal(id: string): Observable<RevealedFields> {
    return this.http.post<RevealedFields>(`${this.apiBase}/applications/${id}/reveal`, {});
  }

  riskHistory(id: string): Observable<RiskDecision[]> {
    return this.http.get<RiskDecision[]>(`${this.apiBase}/applications/${id}/risk-history`);
  }

  documents(id: string): Observable<ApplicationDocument[]> {
    return this.http.get<ApplicationDocument[]>(`${this.apiBase}/applications/${id}/documents`);
  }

  listReviewers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiBase}/users`, {
      params: new HttpParams().set('role', 'REVIEWER'),
    });
  }
}
