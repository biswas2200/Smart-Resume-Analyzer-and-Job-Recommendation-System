package com.resumeanalyser.job;

import com.resumeanalyser.account.User;
import com.resumeanalyser.common.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WatchlistServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-22T10:00:00Z");

    @Mock private WatchedCompanyRepository watched;
    @Mock private CompanyRepository companies;
    @Mock private JobPostingRepository postings;

    private WatchlistService service;
    private final User user = new User();
    private Company company;

    @BeforeEach
    void setUp() {
        service = new WatchlistService(watched, companies, postings, Clock.fixed(NOW, ZoneOffset.UTC));
        company = new Company();
        company.setId(UUID.randomUUID());
        company.setName("Groww");
        company.setDomain("groww.in");
        company.setStatus(CompanyStatus.ACTIVE);
    }

    @Test
    void watchingACompany_addsItWithItsJobCounts() {
        when(companies.findById(company.getId())).thenReturn(Optional.of(company));
        when(watched.findByUserAndCompany(user, company)).thenReturn(Optional.empty());
        when(watched.save(any(WatchedCompany.class))).thenAnswer(inv -> inv.getArgument(0));
        when(postings.countByCompanyAndActiveTrue(company)).thenReturn(12L);
        when(postings.countByCompanyAndActiveTrueAndFirstSeenAtAfter(company, NOW.minus(WatchlistService.NEW_FOR)))
                .thenReturn(3L);

        var dto = service.watch(user, company.getId());

        assertThat(dto.name()).isEqualTo("Groww");
        assertThat(dto.openJobs()).isEqualTo(12);
        assertThat(dto.newJobs()).isEqualTo(3);
        assertThat(dto.addedAt()).isEqualTo(NOW);
    }

    @Test
    void watchingAgain_keepsTheFirstEntry() {
        WatchedCompany existing = entry(Instant.parse("2026-10-01T00:00:00Z"));
        when(companies.findById(company.getId())).thenReturn(Optional.of(company));
        when(watched.findByUserAndCompany(user, company)).thenReturn(Optional.of(existing));

        var dto = service.watch(user, company.getId());

        assertThat(dto.addedAt()).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
        verify(watched, never()).save(any());
    }

    @Test
    void watchingAMissingCompany_isNotFound() {
        UUID missing = UUID.randomUUID();
        when(companies.findById(missing)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.watch(user, missing)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void list_returnsTheUsersCompaniesInOrder() {
        when(watched.findByUserOrderByAddedAtDesc(user)).thenReturn(List.of(entry(NOW)));

        assertThat(service.list(user)).extracting("domain").containsExactly("groww.in");
    }

    @Test
    void unwatching_deletesOnlyThatUsersEntry() {
        WatchedCompany existing = entry(NOW);
        when(companies.findById(company.getId())).thenReturn(Optional.of(company));
        when(watched.findByUserAndCompany(user, company)).thenReturn(Optional.of(existing));

        service.unwatch(user, company.getId());

        verify(watched).delete(existing);
    }

    @Test
    void search_marksCompaniesAlreadyWatched() {
        Company other = new Company();
        other.setId(UUID.randomUUID());
        other.setName("Groww Pay");
        when(watched.findByUserOrderByAddedAtDesc(user)).thenReturn(List.of(entry(NOW)));
        when(companies.findTop20ByNameContainingIgnoreCaseOrderByNameAsc("grow")).thenReturn(List.of(company, other));

        var options = service.search(user, "  grow ");

        assertThat(options).extracting("name", "watched")
                .containsExactly(tuple("Groww", true),
                        tuple("Groww Pay", false));
    }

    @Test
    void search_withABlankQuery_findsNothing() {
        assertThat(service.search(user, "  ")).isEmpty();
        verifyNoInteractions(companies);
    }

    private WatchedCompany entry(Instant addedAt) {
        WatchedCompany entry = new WatchedCompany();
        entry.setUser(user);
        entry.setCompany(company);
        entry.setAddedAt(addedAt);
        return entry;
    }
}
