import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ParsedProfile, Resume } from '../models/resume.model';

// FR-1.1/FR-1.3 (docs/process-flow.md §2): only PDF/DOCX, up to 5 MB, is accepted.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Resume upload and retrieval. The backend's `resume` module has an entity and DTO
 * (`ResumeDto`/`ParsedProfileDto`) but no controller yet (docs/lld.md §7), so every method
 * here serves an in-memory mock implementation while `environment.useMockApiForUnimplementedFeatures`
 * is true, and falls back to the real REST calls the moment that flag is flipped.
 */
@Injectable({ providedIn: 'root' })
export class ResumeService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  // In-memory mock store — resets on page reload, since there is no real backend persistence
  // to fall back on yet. Keyed by resume id for O(1) profile lookup.
  private readonly mockResumesByUser = new Map<string, Resume[]>();
  private readonly mockProfilesByResumeId = new Map<string, ParsedProfile>();

  /**
   * Checks the file against FR-1.1/FR-1.3 before it's ever sent anywhere.
   * @returns a user-facing error message, or null when the file is acceptable.
   */
  validateFile(file: File): string | null {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return 'Only PDF or DOCX files are accepted.';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return 'File is too large — the maximum size is 5 MB.';
    }
    return null;
  }

  /** Uploads a new resume version. Assumes {@link validateFile} has already been checked. */
  upload(file: File): Observable<Resume> {
    if (environment.useMockApiForUnimplementedFeatures) {
      return of(this.mockUpload(file));
    }

    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<Resume>(`${environment.apiBaseUrl}/resumes`, formData);
  }

  /** Lists every resume version uploaded by the current user, oldest first (FR-1.5). */
  listVersions(): Observable<Resume[]> {
    if (environment.useMockApiForUnimplementedFeatures) {
      return of([...(this.mockResumesByUser.get(this.currentUserId()) ?? [])]);
    }

    return this.http.get<Resume[]>(`${environment.apiBaseUrl}/resumes`);
  }

  /** Fetches the structured profile extracted from a given resume version. */
  getParsedProfile(resumeId: string): Observable<ParsedProfile> {
    if (environment.useMockApiForUnimplementedFeatures) {
      const profile = this.mockProfilesByResumeId.get(resumeId);
      if (!profile) {
        throw new Error(`No mock parsed profile for resume id ${resumeId}`);
      }
      return of(profile);
    }

    return this.http.get<ParsedProfile>(`${environment.apiBaseUrl}/resumes/${resumeId}/profile`);
  }

  private mockUpload(file: File): Resume {
    const userId = this.currentUserId();
    const existing = this.mockResumesByUser.get(userId) ?? [];
    const resume: Resume = {
      id: crypto.randomUUID(),
      userId,
      fileRef: `mock-storage/${userId}/${existing.length + 1}-${file.name}`,
      version: existing.length + 1,
      uploadedAt: new Date().toISOString(),
    };

    this.mockResumesByUser.set(userId, [...existing, resume]);
    this.mockProfilesByResumeId.set(resume.id, this.fabricateParsedProfile(resume));
    return resume;
  }

  // There is no real text-extraction/parsing happening here — the mock exists only so the
  // dashboard and profile-view screens have something realistic to render while the backend's
  // `resume` module and the ML service's /parse call aren't wired together yet.
  private fabricateParsedProfile(resume: Resume): ParsedProfile {
    const displayName = this.authService.currentUser()?.email.split('@')[0] ?? 'Candidate';
    return {
      id: crypto.randomUUID(),
      resumeId: resume.id,
      name: displayName,
      email: this.authService.currentUser()?.email ?? '',
      phone: '',
      skills: ['JavaScript', 'TypeScript', 'Angular', 'REST APIs', 'SQL'],
      experience: [
        {
          title: 'Software Engineer',
          organization: 'Sample Company',
          duration: '2022-2026',
          description: 'Sample entry — replace once resume parsing is implemented.',
        },
      ],
      education: [
        { degree: 'B.S. Computer Science', institution: 'Sample University', year: '2022' },
      ],
    };
  }

  private currentUserId(): string {
    return this.authService.currentUser()?.id ?? 'unknown-user';
  }
}
