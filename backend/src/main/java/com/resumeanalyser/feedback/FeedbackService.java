package com.resumeanalyser.feedback;

import com.resumeanalyser.account.User;
import com.resumeanalyser.common.ResourceNotFoundException;
import com.resumeanalyser.recommendation.Recommendation;
import com.resumeanalyser.recommendation.RecommendationRepository;
import org.springframework.stereotype.Service;
import java.util.Optional;
import java.util.UUID;

/**
 * Records and looks up a candidate's helpful/not-helpful verdict on a
 * recommendation (FR-10.1). Does not touch {@code SkillVector} -- the EMA
 * weight update the feedback eventually feeds (FR-7.3) is a separate,
 * not-yet-implemented job, so {@link Feedback#getSkillVectorVersion()} is
 * always null for now.
 */
@Service
public class FeedbackService {

    private final FeedbackRepository feedbackRepository;
    private final RecommendationRepository recommendationRepository;

    public FeedbackService(FeedbackRepository feedbackRepository, RecommendationRepository recommendationRepository) {
        this.feedbackRepository = feedbackRepository;
        this.recommendationRepository = recommendationRepository;
    }

    /**
     * Records the candidate's verdict on one of their own recommendations.
     *
     * @throws ResourceNotFoundException if the recommendation doesn't exist or
     *         doesn't belong to {@code user}
     */
    public Feedback submit(User user, UUID recommendationId, boolean helpful) {
        Recommendation recommendation = ownedRecommendation(user, recommendationId);

        Feedback feedback = new Feedback();
        feedback.setRecommendation(recommendation);
        feedback.setHelpful(helpful);
        return feedbackRepository.save(feedback);
    }

    /**
     * The most recent feedback given for one of the user's own recommendations.
     *
     * @throws ResourceNotFoundException if the recommendation doesn't exist or
     *         doesn't belong to {@code user}
     */
    public Optional<Feedback> getLatestFeedback(User user, UUID recommendationId) {
        Recommendation recommendation = ownedRecommendation(user, recommendationId);
        return feedbackRepository.findTopByRecommendationOrderByCreatedAtDesc(recommendation);
    }

    private Recommendation ownedRecommendation(User user, UUID recommendationId) {
        return recommendationRepository.findById(recommendationId)
                .filter(r -> r.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Recommendation not found: " + recommendationId));
    }
}
