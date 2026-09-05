import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { FeedbackService } from './feedback.service';
import { environment } from '../../../../environments/environment';
import { Feedback } from '../models/feedback.model';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FeedbackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('submits via a POST to /feedback', () => {
    const fakeFeedback: Feedback = {
      id: 'feedback-1',
      recommendationId: 'rec-1',
      skillVectorVersionId: null,
      helpful: true,
      createdAt: '2026-01-01T00:00:00Z',
    };
    let feedback: Feedback | undefined;

    service.submit('rec-1', true).subscribe((f) => (feedback = f));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/feedback`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ recommendationId: 'rec-1', helpful: true });
    req.flush(fakeFeedback);

    expect(feedback).toEqual(fakeFeedback);
  });

  it('fetches the latest feedback for a recommendation via a GET to /feedback/{id}', () => {
    const fakeFeedback: Feedback = {
      id: 'feedback-1',
      recommendationId: 'rec-1',
      skillVectorVersionId: null,
      helpful: false,
      createdAt: '2026-01-01T00:00:00Z',
    };
    let stored: Feedback | null | undefined;

    service.getFeedbackFor('rec-1').subscribe((f) => (stored = f));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/feedback/rec-1`);
    expect(req.request.method).toBe('GET');
    req.flush(fakeFeedback);

    expect(stored).toEqual(fakeFeedback);
  });

  it('resolves to null when no feedback has been given yet (backend responds 204)', () => {
    let stored: Feedback | null | undefined;

    service.getFeedbackFor('never-rated').subscribe((f) => (stored = f));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/feedback/never-rated`);
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(stored).toBeNull();
  });
});
