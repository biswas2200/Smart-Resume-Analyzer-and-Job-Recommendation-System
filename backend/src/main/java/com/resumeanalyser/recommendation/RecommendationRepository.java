package com.resumeanalyser.recommendation;

import com.resumeanalyser.resume.Resume;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

/** Persistence for {@link Recommendation}. */
public interface RecommendationRepository extends JpaRepository<Recommendation, UUID> {

    /** Every recommendation produced by one resume version's analysis run, best match first. */
    List<Recommendation> findByResumeOrderByMatchScoreDesc(Resume resume);
}
