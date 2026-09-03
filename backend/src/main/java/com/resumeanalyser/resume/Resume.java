package com.resumeanalyser.resume;

import com.resumeanalyser.account.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "resumes", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "version"}))
@Getter
@Setter
public class Resume {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "file_ref", nullable = false, columnDefinition = "TEXT")
    private String fileRef;

    @Column(nullable = false)
    private int version;

    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt = Instant.now();
}
