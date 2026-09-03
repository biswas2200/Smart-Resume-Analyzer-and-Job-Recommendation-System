package com.resumeanalyser.resume;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "parsed_profiles")
@Getter
@Setter
public class ParsedProfile {

    @Id
    @GeneratedValue
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "resume_id", nullable = false, unique = true)
    private Resume resume;

    @Column(nullable = false)
    private String name = "";

    @Column(nullable = false)
    private String email = "";

    @Column(nullable = false)
    private String phone = "";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private List<String> skills;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private List<ExperienceEntry> experience;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private List<EducationEntry> education;

    public record ExperienceEntry(String title, String organization, String duration, String description) {}
    public record EducationEntry(String degree, String institution, String year) {}
}
