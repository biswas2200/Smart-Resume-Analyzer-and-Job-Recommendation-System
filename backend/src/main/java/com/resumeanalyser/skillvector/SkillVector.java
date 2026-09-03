package com.resumeanalyser.skillvector;

import com.resumeanalyser.recommendation.Role;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "skill_vectors")
@Getter
@Setter
public class SkillVector {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    @Column(nullable = false)
    private String skill;

    @Column(nullable = false)
    private double weight;

    @Column(name = "version_timestamp", nullable = false)
    private Instant versionTimestamp = Instant.now();

    @Column(nullable = false)
    private boolean current = true;
}
