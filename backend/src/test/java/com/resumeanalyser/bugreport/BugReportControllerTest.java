package com.resumeanalyser.bugreport;

import com.resumeanalyser.account.User;
import com.resumeanalyser.account.UserRepository;
import com.resumeanalyser.auth.JwtAuthenticationFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Web layer: the AI-tools confirmation and section limits are enforced, and review is ADMIN-only. */
@WebMvcTest(
        controllers = BugReportController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = JwtAuthenticationFilter.class)
)
@Import(BugReportControllerTest.MethodSecurityConfig.class)
class BugReportControllerTest {

    @Autowired private MockMvc mockMvc;
    @MockBean private BugReportService service;
    @MockBean private UserRepository users;

    @Test
    @WithMockUser(username = "u@example.com")
    void aReportWithoutTheWrittenByMeConfirmation_isRejected() throws Exception {
        mockMvc.perform(post("/bug-reports").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"whatHappened\":\"The Save button does nothing\",\"expected\":\"It saves\",\"writtenByUser\":false}"))
                .andExpect(status().isBadRequest());
        verify(service, never()).submit(any(), any(), any());
    }

    @Test
    @WithMockUser(username = "u@example.com")
    void anOverlongSection_isRejected() throws Exception {
        String long_ = "x".repeat(1_501);
        mockMvc.perform(post("/bug-reports").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"whatHappened\":\"" + long_ + "\",\"expected\":\"It saves\",\"writtenByUser\":true}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(username = "u@example.com")
    void aValidReport_isAccepted() throws Exception {
        User user = new User();
        user.setId(UUID.randomUUID());
        when(users.findByEmail("u@example.com")).thenReturn(Optional.of(user));
        mockMvc.perform(post("/bug-reports").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"whatHappened\":\"The Save button does nothing\",\"expected\":\"It saves\",\"writtenByUser\":true}"))
                .andExpect(status().isCreated());
        verify(service).submit(any(), any(), any());
    }

    @Test
    @WithMockUser(username = "u@example.com", roles = "USER")
    void theReviewQueue_isAdminOnly() throws Exception {
        mockMvc.perform(get("/admin/bug-reports")).andExpect(status().isForbidden());
        mockMvc.perform(post("/admin/bug-reports/{id}/approve", UUID.randomUUID()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}"))
                .andExpect(status().isForbidden());
        verify(service, never()).approve(any(), any(), any());
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class MethodSecurityConfig {}
}
