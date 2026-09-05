package com.resumeanalyser.resume;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * Writes uploaded resume files to local disk under {@code app.storage.resume-dir},
 * and reads them back for re-analysis. A stand-in for real object storage
 * (S3, GCS, ...) -- {@link Resume#getFileRef()} only ever stores the path this
 * class hands back, never the file bytes themselves, so swapping the backing
 * store later only means changing this one class.
 */
@Service
public class ResumeStorageService {

    private final Path rootDir;

    public ResumeStorageService(@Value("${app.storage.resume-dir}") String resumeDir) {
        this.rootDir = Path.of(resumeDir);
    }

    /**
     * Saves an uploaded resume's bytes under a path unique to this user and version.
     *
     * @param userId   the uploading account's id
     * @param version  this upload's version number (see {@link Resume#getVersion()})
     * @param filename the original filename, kept as a suffix for readability
     * @param bytes    the file's raw contents
     * @return the path the bytes were written to, stored as {@link Resume#getFileRef()}
     */
    public String store(UUID userId, int version, String filename, byte[] bytes) {
        try {
            Path userDir = rootDir.resolve(userId.toString());
            Files.createDirectories(userDir);

            String safeFilename = filename == null || filename.isBlank() ? "resume" : filename;
            Path target = userDir.resolve(version + "-" + safeFilename);
            Files.write(target, bytes);
            return target.toString();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to store resume file", e);
        }
    }

    /**
     * Reads back the bytes of a previously stored resume file.
     *
     * @param fileRef the path returned by a previous {@link #store} call
     * @return the file's raw contents
     */
    public byte[] read(String fileRef) {
        try {
            return Files.readAllBytes(Path.of(fileRef));
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read stored resume file: " + fileRef, e);
        }
    }
}
