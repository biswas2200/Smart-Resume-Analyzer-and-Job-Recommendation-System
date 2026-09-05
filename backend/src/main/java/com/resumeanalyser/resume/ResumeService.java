package com.resumeanalyser.resume;

import com.resumeanalyser.account.User;
import com.resumeanalyser.client.MlServiceClient;
import com.resumeanalyser.client.dto.AnalyzeResponseDto;
import com.resumeanalyser.client.dto.ResumeProfileDto;
import com.resumeanalyser.common.ResourceNotFoundException;
import com.resumeanalyser.recommendation.RecommendationService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.UUID;

/**
 * Orchestrates a resume upload end to end: validates the file (FR-1.1/1.3),
 * stores it, runs it through the ML service's full analysis pipeline in one
 * call, and persists the results -- the {@link Resume} and its
 * {@link ParsedProfile} here, and the resulting role {@link com.resumeanalyser.recommendation.Recommendation}
 * rows via {@link RecommendationService} (which owns that entity).
 * <p>
 * A single ML call ({@code POST /analyze-file}) covers parsing, ATS scoring,
 * role matching, and explanation -- calling it once here (rather than once per
 * module) avoids re-uploading/re-extracting the same file twice.
 */
@Service
public class ResumeService {

    private static final long MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
    private static final int TOP_N_MATCHES = 3;

    private final ResumeRepository resumeRepository;
    private final ParsedProfileRepository parsedProfileRepository;
    private final ResumeStorageService storageService;
    private final MlServiceClient mlServiceClient;
    private final RecommendationService recommendationService;

    public ResumeService(
            ResumeRepository resumeRepository,
            ParsedProfileRepository parsedProfileRepository,
            ResumeStorageService storageService,
            MlServiceClient mlServiceClient,
            RecommendationService recommendationService
    ) {
        this.resumeRepository = resumeRepository;
        this.parsedProfileRepository = parsedProfileRepository;
        this.storageService = storageService;
        this.mlServiceClient = mlServiceClient;
        this.recommendationService = recommendationService;
    }

    /**
     * Validates, stores, and analyzes a newly uploaded resume file, persisting
     * it as the user's next version (FR-1.5).
     *
     * @param user the uploading account
     * @param file the uploaded resume file
     * @return the newly created resume version
     * @throws InvalidResumeFileException if the file is empty or over 5 MB
     * @throws com.resumeanalyser.client.MlServiceException if the ML service rejects
     *         the file's format or is unreachable
     */
    public Resume upload(User user, MultipartFile file) {
        validate(file);

        int nextVersion = resumeRepository.countByUser(user) + 1;
        byte[] bytes = readBytes(file);
        String fileRef = storageService.store(user.getId(), nextVersion, file.getOriginalFilename(), bytes);

        Resume resume = new Resume();
        resume.setUser(user);
        resume.setFileRef(fileRef);
        resume.setVersion(nextVersion);
        resumeRepository.save(resume);

        AnalyzeResponseDto analysis = mlServiceClient.analyzeFile(bytes, file.getOriginalFilename(), TOP_N_MATCHES);
        parsedProfileRepository.save(toParsedProfile(resume, analysis));
        recommendationService.persistFromAnalysis(user, resume, analysis.matches());

        return resume;
    }

    /** Every version a user has uploaded, oldest first (FR-1.5). */
    public List<Resume> listVersions(User user) {
        return resumeRepository.findByUserOrderByVersionAsc(user);
    }

    /**
     * The structured profile extracted from one of the user's resume versions.
     *
     * @throws ResourceNotFoundException if the resume doesn't exist, doesn't belong to
     *         this user, or hasn't been analyzed yet
     */
    public ParsedProfile getParsedProfile(User user, UUID resumeId) {
        Resume resume = resumeRepository.findById(resumeId)
                .filter(r -> r.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Resume not found: " + resumeId));

        return parsedProfileRepository.findByResume(resume)
                .orElseThrow(() -> new ResourceNotFoundException("No parsed profile for resume: " + resumeId));
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidResumeFileException("The uploaded file is empty");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new InvalidResumeFileException("File is too large — the maximum size is 5 MB");
        }
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read uploaded file", e);
        }
    }

    private ParsedProfile toParsedProfile(Resume resume, AnalyzeResponseDto analysis) {
        ResumeProfileDto profile = analysis.profile();

        ParsedProfile entity = new ParsedProfile();
        entity.setResume(resume);
        entity.setName(profile.name());
        entity.setEmail(profile.email());
        entity.setPhone(profile.phone());
        entity.setSkills(profile.skills());
        entity.setExperience(profile.experience().stream()
                .map(e -> new ParsedProfile.ExperienceEntry(e.title(), e.organization(), e.duration(), e.description()))
                .toList());
        entity.setEducation(profile.education().stream()
                .map(e -> new ParsedProfile.EducationEntry(e.degree(), e.institution(), e.year()))
                .toList());
        entity.setAtsScore(analysis.atsScore().score());
        entity.setAtsMaxScore(analysis.atsScore().maxScore());
        entity.setAtsChecks(analysis.atsScore().checks().stream()
                .map(c -> new ParsedProfile.AtsCheckEntry(c.name(), c.passed(), c.detail()))
                .toList());
        entity.setExplanation(analysis.explanation());
        return entity;
    }
}
