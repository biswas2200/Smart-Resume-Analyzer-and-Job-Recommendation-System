import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RecommendationService } from './services/recommendation.service';
import { FeedbackService } from './services/feedback.service';
import { DashboardData } from './models/dashboard.model';

/**
 * Recommendation dashboard: the candidate's ATS score breakdown, ranked role matches with
 * their matched/missing skills, a coaching explanation, and a helpful/not-helpful control per
 * recommendation (FR-10.1) — served by {@link RecommendationService} and {@link FeedbackService}.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly recommendationService = inject(RecommendationService);
  private readonly feedbackService = inject(FeedbackService);

  protected readonly data = signal<DashboardData | null>(null);
  protected readonly isLoading = signal(true);

  /** Maps recommendationId -> the candidate's current helpful/not-helpful answer, if any. */
  protected readonly feedbackByRecommendationId = signal<Record<string, boolean>>({});

  ngOnInit(): void {
    this.recommendationService.getDashboard().subscribe((data) => {
      this.data.set(data);
      this.isLoading.set(false);
      data?.recommendations.forEach((recommendation) =>
        this.loadExistingFeedback(recommendation.recommendationId),
      );
    });
  }

  protected asPercent(score: number): number {
    return Math.round(score * 100);
  }

  protected rateRecommendation(recommendationId: string, helpful: boolean): void {
    this.feedbackService.submit(recommendationId, helpful).subscribe((feedback) => {
      this.feedbackByRecommendationId.update((current) => ({
        ...current,
        [recommendationId]: feedback.helpful,
      }));
    });
  }

  private loadExistingFeedback(recommendationId: string): void {
    this.feedbackService.getFeedbackFor(recommendationId).subscribe((feedback) => {
      if (feedback) {
        this.feedbackByRecommendationId.update((current) => ({
          ...current,
          [recommendationId]: feedback.helpful,
        }));
      }
    });
  }
}
