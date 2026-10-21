package com.resumeanalyser.admin;

import com.resumeanalyser.account.UserRole;
import com.resumeanalyser.account.dto.UserDto;
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

import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web-layer tests for {@link AdminController}: the whole surface is ADMIN-only
 * via {@code @PreAuthorize} (see {@code SkillVectorControllerTest} for why the
 * JWT filter is excluded from this slice).
 */
@WebMvcTest(
        controllers = AdminController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = JwtAuthenticationFilter.class)
)
@Import(AdminControllerTest.MethodSecurityConfig.class)
class AdminControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AdminService adminService;

    private final UUID userId = UUID.randomUUID();

    @Test
    @WithMockUser(roles = "USER")
    void findUser_isForbidden_forANonAdminRole() throws Exception {
        mockMvc.perform(get("/admin/users").param("email", "a@b.c"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "PREMIUM_USER")
    void updateRole_isForbidden_forAPremiumUser() throws Exception {
        mockMvc.perform(patch("/admin/users/{id}/role", userId).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"PREMIUM_USER\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void updateRole_isAllowed_forTheAdminRole() throws Exception {
        when(adminService.updateRole(userId, UserRole.PREMIUM_USER))
                .thenReturn(new UserDto(userId, "a@b.c", UserRole.PREMIUM_USER, Instant.now(), null));

        mockMvc.perform(patch("/admin/users/{id}/role", userId).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"PREMIUM_USER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("PREMIUM_USER"));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void updateRole_rejectsAnUnknownRole() throws Exception {
        mockMvc.perform(patch("/admin/users/{id}/role", userId).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"GOLD\"}"))
                .andExpect(status().isBadRequest());
    }

    /** Enables {@code @PreAuthorize} evaluation inside this web-layer-only test slice. */
    @TestConfiguration
    @EnableMethodSecurity
    static class MethodSecurityConfig {}
}
