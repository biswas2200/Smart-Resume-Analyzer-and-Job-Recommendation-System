package com.resumeanalyser.job;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

/** Persistence for {@link JobPosting}. */
public interface JobPostingRepository extends JpaRepository<JobPosting, UUID> {

    List<JobPosting> findByCompany(Company company);

    /** Open postings, newest first, with their company loaded for the list view. */
    @EntityGraph(attributePaths = "company")
    Page<JobPosting> findByActiveTrueOrderByFirstSeenAtDesc(Pageable pageable);

    long countByActiveTrue();

    /** The next postings whose skills haven't been extracted yet. */
    List<JobPosting> findTop50ByActiveTrueAndSkillsIsNullOrderByFirstSeenAtAsc();

    /** Every open posting with its company, newest first (the ranking's candidates). */
    @EntityGraph(attributePaths = "company")
    List<JobPosting> findAllByActiveTrueOrderByFirstSeenAtDesc(Pageable pageable);

    long countByCompanyAndActiveTrue(Company company);
}
