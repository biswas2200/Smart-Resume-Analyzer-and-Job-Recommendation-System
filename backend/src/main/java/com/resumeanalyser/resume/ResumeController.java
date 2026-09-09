package com.resumeanalyser.resume;

import com.resumeanalyser.account.User;
import com.resumeanalyser.account.UserRepository;
import com.resumeanalyser.common.ResourceNotFoundException;
import com.resumeanalyser.resume.dto.ParsedProfileDto;
import com.resumeanalyser.resume.dto.ResumeDto;
import com.resumeanalyser.resume.mapper.ParsedProfileMapper;
import com.resumeanalyser.resume.mapper.ResumeMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.UUID;

/** Resume upload, version history, and parsed-profile retrieval (FR-1.1–1.5). */
@RestController
@RequestMapping("/resumes")
public class ResumeController {

    private final ResumeService resumeService;
    private final UserRepository userRepository;
    private final ResumeMapper resumeMapper;
    private final ParsedProfileMapper parsedProfileMapper;

    public ResumeController(
            ResumeService resumeService,
            UserRepository userRepository,
            ResumeMapper resumeMapper,
            ParsedProfileMapper parsedProfileMapper
    ) {
        this.resumeService = resumeService;
        this.userRepository = userRepository;
        this.resumeMapper = resumeMapper;
        this.parsedProfileMapper = parsedProfileMapper;
    }

    /**
     * Uploads a new resume version, running it through the ML service's full
     * analysis pipeline before returning.
     *
     * @param file           the uploaded resume file (PDF today -- see ml-service's
     *                       document_extraction/registry.py for supported formats)
     * @param authentication the signed-in user, injected by Spring Security
     * @return 201 Created with the new resume version
     */
    @PostMapping
    public ResponseEntity<ResumeDto> upload(
            @RequestParam("file") MultipartFile file, Authentication authentication) {
        Resume resume = resumeService.upload(currentUser(authentication), file);
        return ResponseEntity.status(HttpStatus.CREATED).body(resumeMapper.toDto(resume));
    }

    /** Every resume version the signed-in user has uploaded, oldest first (FR-1.5). */
    @GetMapping
    public List<ResumeDto> listVersions(Authentication authentication) {
        return resumeService.listVersions(currentUser(authentication)).stream()
                .map(resumeMapper::toDto)
                .toList();
    }

    /** The structured profile extracted from one of the signed-in user's resume versions. */
    @GetMapping("/{id}/profile")
    public ParsedProfileDto getParsedProfile(@PathVariable UUID id, Authentication authentication) {
        return parsedProfileMapper.toDto(resumeService.getParsedProfile(currentUser(authentication), id));
    }

    private User currentUser(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new ResourceNotFoundException("No user with email " + authentication.getName()));
    }
}
