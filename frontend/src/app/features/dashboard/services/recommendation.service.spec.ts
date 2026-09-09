import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { RecommendationService } from './recommendation.service';
import { environment } from '../../../../environments/environment';
import { DashboardData } from '../models/dashboard.model';

describe('RecommendationService', () => {
  let service: RecommendationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RecommendationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the dashboard via a GET to /recommendations/dashboard', () => {
    const fakeDashboard: DashboardData = {
      atsScore: {
        score: 60,
        max_score: 70,
        checks: [{ name: 'contact_email', passed: true, detail: 'Email found.' }],
      },
      recommendations: [
        {
          recommendationId: 'rec-1',
          role: { id: 'role-1', title: 'Frontend Developer', description: '' },
          matchScore: 0.8,
          createdAt: '2026-01-01T00:00:00Z',
          matchedSkills: ['Angular'],
          missingSkills: ['CSS'],
        },
      ],
      explanation: 'You are a strong match.',
    };
    let result: DashboardData | null | undefined;

    service.getDashboard().subscribe((data) => (result = data));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/recommendations/dashboard`);
    expect(req.request.method).toBe('GET');
    req.flush(fakeDashboard);

    expect(result).toEqual(fakeDashboard);
  });

  it('resolves to null when the candidate has not uploaded a resume yet (backend responds 204)', () => {
    let result: DashboardData | null | undefined;

    service.getDashboard().subscribe((data) => (result = data));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/recommendations/dashboard`);
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(result).toBeNull();
  });
});
