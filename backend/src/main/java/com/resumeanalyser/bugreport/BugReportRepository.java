package com.resumeanalyser.bugreport;

import com.resumeanalyser.account.User;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Persistence for {@link BugReport}. */
public interface BugReportRepository extends JpaRepository<BugReport, UUID> {

    List<BugReport> findByUserOrderByCreatedAtDesc(User user);

    /** The review queue (or any one status), oldest first, with the reporter loaded. */
    @EntityGraph(attributePaths = "user")
    List<BugReport> findByStatusOrderByCreatedAtAsc(BugReportStatus status);

    long countByUserAndCreatedAtAfter(User user, Instant since);
}
