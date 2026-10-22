package com.resumeanalyser.job;

import com.resumeanalyser.account.User;
import com.resumeanalyser.common.ResourceNotFoundException;
import com.resumeanalyser.job.dto.CompanyOptionDto;
import com.resumeanalyser.job.dto.WatchedCompanyDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** The companies a user watches for new jobs, and finding companies to add. */
@Service
public class WatchlistService {

    /** A job counts as new for this long after we first see it. */
    static final Duration NEW_FOR = Duration.ofDays(7);

    private final WatchedCompanyRepository watched;
    private final CompanyRepository companies;
    private final JobPostingRepository postings;
    private final Clock clock;

    public WatchlistService(WatchedCompanyRepository watched, CompanyRepository companies,
                            JobPostingRepository postings, Clock clock) {
        this.watched = watched;
        this.companies = companies;
        this.postings = postings;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<WatchedCompanyDto> list(User user) {
        Instant newSince = clock.instant().minus(NEW_FOR);
        return watched.findByUserOrderByAddedAtDesc(user).stream()
                .map(entry -> toDto(entry, newSince))
                .toList();
    }

    /**
     * Adds a company to the watchlist; adding it again changes nothing.
     *
     * @throws ResourceNotFoundException if there is no such company
     */
    @Transactional
    public WatchedCompanyDto watch(User user, UUID companyId) {
        Company company = companies.findById(companyId)
                .orElseThrow(() -> new ResourceNotFoundException("No company with id " + companyId));
        WatchedCompany entry = watched.findByUserAndCompany(user, company).orElseGet(() -> {
            WatchedCompany created = new WatchedCompany();
            created.setUser(user);
            created.setCompany(company);
            created.setAddedAt(clock.instant());
            return watched.save(created);
        });
        return toDto(entry, clock.instant().minus(NEW_FOR));
    }

    /** Removes a company from the watchlist; nothing happens if it wasn't there. */
    @Transactional
    public void unwatch(User user, UUID companyId) {
        companies.findById(companyId).flatMap(company -> watched.findByUserAndCompany(user, company))
                .ifPresent(watched::delete);
    }

    /** Up to 20 companies whose name contains {@code query}, by name, each marked if the user already watches it. */
    @Transactional(readOnly = true)
    public List<CompanyOptionDto> search(User user, String query) {
        String q = query == null ? "" : query.trim();
        if (q.isEmpty()) {
            return List.of();
        }
        Set<UUID> mine = watched.findByUserOrderByAddedAtDesc(user).stream()
                .map(entry -> entry.getCompany().getId())
                .collect(Collectors.toSet());
        return companies.findTop20ByNameContainingIgnoreCaseOrderByNameAsc(q).stream()
                .map(company -> CompanyOptionDto.of(company, mine.contains(company.getId())))
                .toList();
    }

    private WatchedCompanyDto toDto(WatchedCompany entry, Instant newSince) {
        Company company = entry.getCompany();
        return WatchedCompanyDto.of(company, postings.countByCompanyAndActiveTrue(company),
                postings.countByCompanyAndActiveTrueAndFirstSeenAtAfter(company, newSince), entry.getAddedAt());
    }
}
