import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Feedback } from '../models/feedback.model';

/**
 * Submits and looks up "helpful / not helpful" feedback on a recommendation (FR-10.1).
 * The backend's `feedback` module has an entity and DTO but no controller yet (docs/lld.md §7),
 * so this serves an in-memory mock while `environment.useMockApiForUnimplementedFeatures` is
 * true, and falls back to the real REST call the moment that flag is flipped.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly http = inject(HttpClient);

  // Keyed by recommendationId — one row per recommendation, latest answer wins, mirroring how
  // a user would expect changing their mind on a card to behave.
  private readonly mockFeedbackByRecommendationId = new Map<string, Feedback>();

  /** Records whether the candidate found a given recommendation helpful. */
  submit(recommendationId: string, helpful: boolean): Observable<Feedback> {
    if (environment.useMockApiForUnimplementedFeatures) {
      const feedback: Feedback = {
        id: crypto.randomUUID(),
        recommendationId,
        skillVectorVersionId: null,
        helpful,
        createdAt: new Date().toISOString(),
      };
      this.mockFeedbackByRecommendationId.set(recommendationId, feedback);
      return of(feedback);
    }

    return this.http.post<Feedback>(`${environment.apiBaseUrl}/feedback`, {
      recommendationId,
      helpful,
    });
  }

  /** The most recent feedback given for a recommendation, or null if none has been given yet. */
  getFeedbackFor(recommendationId: string): Observable<Feedback | null> {
    if (environment.useMockApiForUnimplementedFeatures) {
      return of(this.mockFeedbackByRecommendationId.get(recommendationId) ?? null);
    }

    return this.http.get<Feedback | null>(`${environment.apiBaseUrl}/feedback/${recommendationId}`);
  }
}
