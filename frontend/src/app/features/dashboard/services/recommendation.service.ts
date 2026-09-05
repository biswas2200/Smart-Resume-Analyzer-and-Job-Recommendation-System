import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { DashboardData } from '../models/dashboard.model';

/**
 * Fetches the candidate's dashboard: ATS score, ranked role recommendations, and a
 * coaching explanation for their most recently uploaded resume. Backed by the real
 * `GET /recommendations/dashboard` endpoint (com.resumeanalyser.recommendation.RecommendationController),
 * which assembles the view server-side from the persisted resume, parsed profile, and
 * recommendation rows produced by the ML service's `/analyze-file` at upload time.
 */
@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private readonly http = inject(HttpClient);

  /** Null means the candidate has no uploaded resume yet — the dashboard should prompt for one. */
  getDashboard(): Observable<DashboardData | null> {
    return this.http.get<DashboardData | null>(`${environment.apiBaseUrl}/recommendations/dashboard`);
  }
}
