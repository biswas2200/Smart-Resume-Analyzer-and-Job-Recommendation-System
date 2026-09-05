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

  describe('when using the mock API', () => {
    it('records helpful/not-helpful feedback for a recommendation', () => {
      let feedback!: Feedback;

      service.submit('rec-1', true).subscribe((f) => (feedback = f));

      expect(feedback.recommendationId).toBe('rec-1');
      expect(feedback.helpful).toBe(true);
    });

    it('remembers the most recent feedback given for a recommendation', () => {
      let stored!: Feedback | null;

      service.submit('rec-1', false).subscribe();
      service.getFeedbackFor('rec-1').subscribe((f) => (stored = f));

      expect(stored?.helpful).toBe(false);
    });

    it('returns null when no feedback has been given yet for a recommendation', () => {
      let stored: Feedback | null | undefined;

      service.getFeedbackFor('never-rated').subscribe((f) => (stored = f));

      expect(stored).toBeNull();
    });

    it('overwrites earlier feedback when the candidate changes their answer', () => {
      let stored!: Feedback | null;

      service.submit('rec-1', true).subscribe();
      service.submit('rec-1', false).subscribe();
      service.getFeedbackFor('rec-1').subscribe((f) => (stored = f));

      expect(stored?.helpful).toBe(false);
    });
  });

  describe('when the mock API is disabled', () => {
    const originalFlag = environment.useMockApiForUnimplementedFeatures;

    afterEach(() => {
      environment.useMockApiForUnimplementedFeatures = originalFlag;
    });

    it('submits via a real POST to /feedback', () => {
      environment.useMockApiForUnimplementedFeatures = false;

      service.submit('rec-1', true).subscribe();

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/feedback`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ recommendationId: 'rec-1', helpful: true });
    });
  });
});
