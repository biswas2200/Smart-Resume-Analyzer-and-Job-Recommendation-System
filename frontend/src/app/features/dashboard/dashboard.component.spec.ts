import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { DashboardComponent } from './dashboard.component';
import { RecommendationService } from './services/recommendation.service';
import { FeedbackService } from './services/feedback.service';
import { DashboardData } from './models/dashboard.model';
import { Feedback } from './models/feedback.model';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let recommendationServiceSpy: { getDashboard: ReturnType<typeof vi.fn> };
  let feedbackServiceSpy: {
    submit: ReturnType<typeof vi.fn>;
    getFeedbackFor: ReturnType<typeof vi.fn>;
  };

  const dashboardData: DashboardData = {
    atsScore: {
      score: 55,
      max_score: 70,
      checks: [
        { name: 'contact_email', passed: true, detail: 'Email found.' },
        { name: 'contact_phone', passed: false, detail: 'No phone number found.' },
      ],
    },
    recommendations: [
      {
        recommendationId: 'rec-1',
        role: { id: 'role-frontend', title: 'Frontend Developer', description: 'Builds UIs.' },
        matchScore: 0.8,
        createdAt: '2026-01-01T00:00:00Z',
        matchedSkills: ['JavaScript', 'Angular'],
        missingSkills: ['CSS'],
      },
    ],
    explanation: 'Based on your profile, you are a strong match for Frontend Developer.',
  };

  async function createFixture(
    data: DashboardData | null,
    existingFeedback: Feedback | null = null,
  ): Promise<void> {
    recommendationServiceSpy = { getDashboard: vi.fn().mockReturnValue(of(data)) };
    feedbackServiceSpy = {
      submit: vi.fn().mockImplementation((recommendationId: string, helpful: boolean) =>
        of({
          id: 'feedback-1',
          recommendationId,
          skillVectorVersionId: null,
          helpful,
          createdAt: '2026-01-01T00:00:00Z',
        }),
      ),
      getFeedbackFor: vi.fn().mockReturnValue(of(existingFeedback)),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: RecommendationService, useValue: recommendationServiceSpy },
        { provide: FeedbackService, useValue: feedbackServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  it('prompts to upload a resume when there is no dashboard data yet', async () => {
    await createFixture(null);

    expect(fixture.nativeElement.querySelector('[data-testid="upload-prompt"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="ats-score"]')).toBeFalsy();
  });

  it('renders the ATS score and its checks', async () => {
    await createFixture(dashboardData);

    const scoreEl = fixture.nativeElement.querySelector('[data-testid="ats-score"]');
    expect(scoreEl.textContent).toContain('55');
    expect(scoreEl.textContent).toContain('70');

    const checks = fixture.nativeElement.querySelectorAll('[data-testid="ats-check"]');
    expect(checks.length).toBe(2);
    expect(checks[0].textContent).toContain('contact_email');
  });

  it('renders each role recommendation with matched and missing skills', async () => {
    await createFixture(dashboardData);

    const cards = fixture.nativeElement.querySelectorAll('[data-testid="recommendation-card"]');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('Frontend Developer');
    expect(cards[0].textContent).toContain('80%');
    expect(cards[0].textContent).toContain('JavaScript');
    expect(cards[0].textContent).toContain('CSS');
  });

  it('renders the coaching explanation', async () => {
    await createFixture(dashboardData);

    const explanation = fixture.nativeElement.querySelector('[data-testid="explanation"]');
    expect(explanation.textContent).toContain('strong match for Frontend Developer');
  });

  it('submits helpful feedback and marks the button as selected', async () => {
    await createFixture(dashboardData);

    const card = fixture.nativeElement.querySelector('[data-testid="recommendation-card"]');
    const helpfulButton: HTMLButtonElement = card.querySelector('[data-testid="feedback-helpful"]');
    helpfulButton.click();
    fixture.detectChanges();

    expect(feedbackServiceSpy.submit).toHaveBeenCalledWith('rec-1', true);
    expect(helpfulButton.classList).toContain('selected');
  });

  it('submits not-helpful feedback and marks that button as selected', async () => {
    await createFixture(dashboardData);

    const card = fixture.nativeElement.querySelector('[data-testid="recommendation-card"]');
    const notHelpfulButton: HTMLButtonElement = card.querySelector(
      '[data-testid="feedback-not-helpful"]',
    );
    notHelpfulButton.click();
    fixture.detectChanges();

    expect(feedbackServiceSpy.submit).toHaveBeenCalledWith('rec-1', false);
    expect(notHelpfulButton.classList).toContain('selected');
  });

  it('shows previously submitted feedback as already selected on load', async () => {
    await createFixture(dashboardData, {
      id: 'feedback-0',
      recommendationId: 'rec-1',
      skillVectorVersionId: null,
      helpful: true,
      createdAt: '2026-01-01T00:00:00Z',
    });

    const card = fixture.nativeElement.querySelector('[data-testid="recommendation-card"]');
    const helpfulButton: HTMLButtonElement = card.querySelector('[data-testid="feedback-helpful"]');
    expect(helpfulButton.classList).toContain('selected');
  });
});
