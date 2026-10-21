package com.resumeanalyser.resume;

import com.resumeanalyser.account.User;
import com.resumeanalyser.account.UserRepository;
import com.resumeanalyser.auth.JwtAuthenticationFilter;
import com.resumeanalyser.resume.dto.JdMatchResponse;
import com.resumeanalyser.resume.mapper.ParsedProfileMapper;
import com.resumeanalyser.resume.mapper.ResumeMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web-layer tests for {@code POST /resumes/{id}/jd-match}: the service's
 * Premium refusal (FR-12.2; see ResumeServiceTest) becomes a 403, body
 * validation, and the pass-through of the service's result.
 */
@WebMvcTest(
        controllers = ResumeController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = JwtAuthenticationFilter.class)
)
class ResumeControllerJdMatchTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ResumeService resumeService;
    @MockBean
    private UserRepository userRepository;
    @MockBean
    private ResumeMapper resumeMapper;
    @MockBean
    private ParsedProfileMapper parsedProfileMapper;

    private final UUID resumeId = UUID.randomUUID();

    @Test
    @WithMockUser(username = "free@example.com", roles = "USER")
    void jdMatch_isForbidden_whenTheServiceRefusesAFreeAccount() throws Exception {
        User user = new User();
        user.setId(UUID.randomUUID());
        when(userRepository.findByEmail("free@example.com")).thenReturn(Optional.of(user));
        when(resumeService.matchJobDescription(eq(user), eq(resumeId), any()))
                .thenThrow(new AccessDeniedException("JD match is a Premium feature"));

        mockMvc.perform(post("/resumes/{id}/jd-match", resumeId).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jdText\":\"Java, Spring Boot, SQL\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "premium@example.com", roles = "PREMIUM_USER")
    void jdMatch_returnsTheMatchForAPremiumAccount() throws Exception {
        User user = new User();
        user.setId(UUID.randomUUID());
        when(userRepository.findByEmail("premium@example.com")).thenReturn(Optional.of(user));
        when(resumeService.matchJobDescription(eq(user), eq(resumeId), eq("Java, Spring Boot, SQL")))
                .thenReturn(new JdMatchResponse(resumeId, 0.68, 0.54, 0.9,
                        List.of("Java", "Spring Boot", "SQL"), List.of("Java", "SQL"), List.of("Spring Boot"),
                        new JdMatchResponse.ClosestRole("Backend Software Engineer", "", "engineering", 0.9),
                        "covers 2 of 3"));

        mockMvc.perform(post("/resumes/{id}/jd-match", resumeId).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jdText\":\"Java, Spring Boot, SQL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.score").value(0.68))
                .andExpect(jsonPath("$.missingSkills[0]").value("Spring Boot"))
                .andExpect(jsonPath("$.closestRole.title").value("Backend Software Engineer"));
    }

    @Test
    @WithMockUser(username = "admin@example.com", roles = "ADMIN")
    void jdMatch_rejectsABlankJobDescription() throws Exception {
        mockMvc.perform(post("/resumes/{id}/jd-match", resumeId).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jdText\":\"   \"}"))
                .andExpect(status().isBadRequest());
    }
}
