/**
 * Public-facing view of an uploaded resume version.
 * Mirrors the backend's `resume.dto.ResumeDto` field-for-field (see
 * backend/src/main/java/com/resumeanalyser/resume/dto/ResumeDto.java).
 */
export interface Resume {
  id: string;
  userId: string;

  /** Object-storage pointer to the actual file — not the file bytes themselves. */
  fileRef: string;

  /** This upload's position in the user's upload history (FR-1.5: never overwritten). */
  version: number;

  /** ISO-8601 instant this version was uploaded. */
  uploadedAt: string;
}

/** One entry in a candidate's work history. Mirrors `ParsedProfileDto.ExperienceEntryDto`. */
export interface ExperienceEntry {
  title: string;
  organization: string;
  duration: string;
  description: string;
}

/** One entry in a candidate's education history. Mirrors `ParsedProfileDto.EducationEntryDto`. */
export interface EducationEntry {
  degree: string;
  institution: string;
  year: string;
}

/**
 * Structured profile extracted from one resume version.
 * Mirrors the backend's planned `resume.dto.ParsedProfileDto` field-for-field.
 */
export interface ParsedProfile {
  id: string;
  resumeId: string;
  name: string;
  email: string;
  phone: string;

  /** Raw, unnormalized skill names, as extracted — normalization happens at match time. */
  skills: string[];

  experience: ExperienceEntry[];
  education: EducationEntry[];
}
