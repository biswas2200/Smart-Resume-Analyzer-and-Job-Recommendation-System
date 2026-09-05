package com.resumeanalyser.feedback;

import com.resumeanalyser.recommendation.Recommendation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

/** Persistence for {@link Feedback}. */
public interface FeedbackRepository extends JpaRepository<Feedback, UUID> {

    /** The most recent feedback given for a recommendation, if any (latest answer wins). */
    Optional<Feedback> findTopByRecommendationOrderByCreatedAtDesc(Recommendation recommendation);
}
