package com.resumeanalyser.skillvector;

import com.resumeanalyser.recommendation.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence for {@link SkillVector}. */
public interface SkillVectorRepository extends JpaRepository<SkillVector, UUID> {

    /** The active version of one role's skill weight, if it's ever been written. */
    Optional<SkillVector> findByRoleAndSkillAndCurrentTrue(Role role, String skill);

    /** Every currently-active skill weight for a role -- one row per distinct skill. */
    List<SkillVector> findByRoleAndCurrentTrue(Role role);
}
