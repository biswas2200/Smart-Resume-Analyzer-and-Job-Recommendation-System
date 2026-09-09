import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { Feedback } from '../models/feedback.model';

/**
 * Submits and looks up "helpful / not helpful" feedback on a recommendation (FR-10.1),
 * backed by the real `POST/GET /feedback` endpoints (com.resumeanalyser.feedback.FeedbackController).
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly http = inject(HttpClient);

  /** Records whether the candidate found a given recommendation helpful. */
  submit(recommendationId: string, helpful: boolean): Observable<Feedback> {
    return this.http.post<Feedback>(`${environment.apiBaseUrl}/feedback`, {
      recommendationId,
      helpful,
    });
  }

  /**
   * The most recent feedback given for a recommendation, or null if none has been given yet
   * (the backend responds 204 No Content, which Angular's HttpClient resolves to a null body).
   */
  getFeedbackFor(recommendationId: string): Observable<Feedback | null> {
    return this.http.get<Feedback | null>(`${environment.apiBaseUrl}/feedback/${recommendationId}`);
  }
}
