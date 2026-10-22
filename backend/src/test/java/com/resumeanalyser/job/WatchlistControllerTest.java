package com.resumeanalyser.job;

import com.resumeanalyser.account.User;
import com.resumeanalyser.account.UserRepository;
import com.resumeanalyser.auth.JwtAuthenticationFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web-layer tests for {@link WatchlistController}: every call needs a signed-in
 * user and acts on that user's own watchlist. The JWT filter is excluded as in
 * {@code SkillVectorControllerTest}; auth comes from {@code @WithMockUser}.
 */
@WebMvcTest(
        controllers = WatchlistController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = JwtAuthenticationFilter.class)
)
class WatchlistControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private WatchlistService watchlistService;

    @MockBean
    private UserRepository userRepository;

    @Test
    void list_needsASignedInUser() throws Exception {
        mockMvc.perform(get("/watchlist")).andExpect(status().isUnauthorized());
        verifyNoInteractions(watchlistService);
    }

    @Test
    @WithMockUser(username = "asha@example.com")
    void list_readsTheSignedInUsersWatchlist() throws Exception {
        User asha = new User();
        when(userRepository.findByEmail("asha@example.com")).thenReturn(Optional.of(asha));
        when(watchlistService.list(asha)).thenReturn(List.of());

        mockMvc.perform(get("/watchlist")).andExpect(status().isOk());

        verify(watchlistService).list(asha);
    }

    @Test
    @WithMockUser(username = "asha@example.com")
    void unwatch_answersNoContent() throws Exception {
        User asha = new User();
        UUID companyId = UUID.randomUUID();
        when(userRepository.findByEmail("asha@example.com")).thenReturn(Optional.of(asha));

        mockMvc.perform(delete("/watchlist/{id}", companyId).with(csrf())).andExpect(status().isNoContent());

        verify(watchlistService).unwatch(asha, companyId);
    }
}
