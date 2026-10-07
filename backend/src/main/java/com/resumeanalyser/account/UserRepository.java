package com.resumeanalyser.account;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;
import java.util.UUID;

/**
 * Database access for {@link User} accounts.
 * Spring Data JPA generates the implementation of this interface automatically;
 * the two extra methods below are resolved from their method names by that
 * same mechanism (no hand-written query code needed).
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Looks up an account by its login email.
     *
     * @param email the email to search for
     * @return the matching user, or empty if no account has that email
     */
    Optional<User> findByEmail(String email);

    /**
     * Checks whether an account with the given email already exists.
     * Used at registration time to reject duplicate sign-ups.
     *
     * @param email the email to check
     * @return true if an account with that email already exists
     */
    boolean existsByEmail(String email);

    /**
     * Starts a new AI-allowance month for an account: resets the counter and
     * stamps the period. Idempotent for the same period.
     *
     * @param id     the account
     * @param period the calendar month, {@code "YYYY-MM"}
     */
    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.aiPeriod = :period, u.aiAnalysesUsed = 0 "
            + "WHERE u.id = :id AND u.aiPeriod <> :period")
    int startAiPeriod(@Param("id") UUID id, @Param("period") String period);

    /**
     * Spends one AI analysis if the account still has one left in
     * {@code period} -- a single conditional update, so concurrent uploads
     * cannot both take the last credit.
     *
     * @return 1 if a credit was spent, 0 if the allowance was already used up
     *         (or the period does not match)
     */
    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.aiAnalysesUsed = u.aiAnalysesUsed + 1 "
            + "WHERE u.id = :id AND u.aiPeriod = :period AND u.aiAnalysesUsed < :quota")
    int consumeAiAnalysis(@Param("id") UUID id, @Param("period") String period, @Param("quota") int quota);
}
