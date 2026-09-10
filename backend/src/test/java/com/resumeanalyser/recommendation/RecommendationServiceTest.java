package com.resumeanalyser.recommendation;

import com.resumeanalyser.account.User;
import com.resumeanalyser.client.dto.RoleMatchDto;
import com.resumeanalyser.resume.ParsedProfileRepository;
import com.resumeanalyser.resume.Resume;
import com.resumeanalyser.resume.ResumeRepository;
import com.resumeanalyser.skillvector.SkillVectorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RecommendationService}, focused on the skill-vector
 * initialization it triggers so a freshly matched role/skill pair always has
 * a vector row (at the default weight) before any feedback ever arrives.
 */
@ExtendWith(MockitoExtension.class)
class RecommendationServiceTest {

    @Mock
    private RoleRepository roleRepository;

    @Mock
    private RecommendationRepository recommendationRepository;

    @Mock
    private ResumeRepository resumeRepository;

    @Mock
    private ParsedProfileRepository parsedProfileRepository;

    @Mock
    private SkillVectorService skillVectorService;

    private RecommendationService recommendationService;

    @BeforeEach
    void setUp() {
        recommendationService = new RecommendationService(
                roleRepository, recommendationRepository, resumeRepository, parsedProfileRepository, skillVectorService);
    }

    @Test
    void persistFromAnalysis_ensuresASkillVectorExists_forEveryMatchedAndMissingSkill() {
        User user = new User();
        user.setId(UUID.randomUUID());

        Resume resume = new Resume();
        resume.setId(UUID.randomUUID());

        Role role = new Role();
        role.setId(UUID.randomUUID());
        role.setTitle("Backend Software Engineer");
        when(roleRepository.findByTitle("Backend Software Engineer")).thenReturn(Optional.of(role));
        when(recommendationRepository.save(any(Recommendation.class))).thenAnswer(inv -> inv.getArgument(0));

        RoleMatchDto match = new RoleMatchDto(
                "Backend Software Engineer", 0.9, List.of("java", "sql"), List.of("kafka"));

        recommendationService.persistFromAnalysis(user, resume, List.of(match));

        verify(skillVectorService).ensureInitialized(role, Set.of("java", "sql", "kafka"));
    }
}
