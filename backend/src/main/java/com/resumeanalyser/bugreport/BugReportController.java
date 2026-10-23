package com.resumeanalyser.bugreport;

import com.resumeanalyser.account.User;
import com.resumeanalyser.account.UserRepository;
import com.resumeanalyser.bugreport.dto.ApproveRequest;
import com.resumeanalyser.bugreport.dto.BugReportDto;
import com.resumeanalyser.bugreport.dto.BugReportRequest;
import com.resumeanalyser.bugreport.dto.LinkRequest;
import com.resumeanalyser.bugreport.dto.RejectRequest;
import com.resumeanalyser.common.ResourceNotFoundException;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.UUID;

/**
 * Bug reports: signed-in users send and follow their own; administrators
 * review the queue ({@code /admin/**}, ADMIN only) and decide which reach GitHub.
 */
@RestController
public class BugReportController {

    private final BugReportService service;
    private final UserRepository users;

    public BugReportController(BugReportService service, UserRepository users) {
        this.service = service;
        this.users = users;
    }

    /** Sends a report; it waits, private, until an administrator reviews it. */
    @PostMapping("/bug-reports")
    @ResponseStatus(HttpStatus.CREATED)
    public BugReportDto submit(@Valid @RequestBody BugReportRequest request,
                               @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
                               Authentication authentication) {
        return service.submit(currentUser(authentication), request, userAgent);
    }

    /** The user's own reports, newest first, with where each stands. */
    @GetMapping("/bug-reports/mine")
    public List<BugReportDto> mine(Authentication authentication) {
        return service.mine(currentUser(authentication));
    }

    @GetMapping("/admin/bug-reports")
    @PreAuthorize("hasRole('ADMIN')")
    public List<BugReportDto> queue(@RequestParam(defaultValue = "PENDING") BugReportStatus status) {
        return service.queue(status);
    }

    /** Opens a GitHub issue for the report. */
    @PostMapping("/admin/bug-reports/{id}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public BugReportDto approve(@PathVariable UUID id, @Valid @RequestBody ApproveRequest request,
                                Authentication authentication) {
        return service.approve(currentUser(authentication), id, request.title());
    }

    /** Points the report at a GitHub issue that already covers it. */
    @PostMapping("/admin/bug-reports/{id}/link")
    @PreAuthorize("hasRole('ADMIN')")
    public BugReportDto link(@PathVariable UUID id, @Valid @RequestBody LinkRequest request,
                             Authentication authentication) {
        return service.link(currentUser(authentication), id, request.issue(), request.note());
    }

    /** Keeps the report off GitHub. */
    @PostMapping("/admin/bug-reports/{id}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    public BugReportDto reject(@PathVariable UUID id, @Valid @RequestBody(required = false) RejectRequest request,
                               Authentication authentication) {
        return service.reject(currentUser(authentication), id, request == null ? null : request.note());
    }

    private User currentUser(Authentication authentication) {
        return users.findByEmail(authentication.getName())
                .orElseThrow(() -> new ResourceNotFoundException("No user with email " + authentication.getName()));
    }
}
