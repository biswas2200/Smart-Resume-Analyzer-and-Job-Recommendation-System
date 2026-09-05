import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ParsedProfile, Resume } from '../models/resume.model';

// FR-1.1/FR-1.3 (docs/process-flow.md §2): only PDF/DOCX, up to 5 MB, is accepted.
// The backend (com.resumeanalyser.resume.ResumeService) enforces the same size limit
// server-side; this check just gives the user faster feedback before any upload starts.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Resume upload and retrieval, backed by the real `POST/GET /resumes` and
 * `GET /resumes/{id}/profile` endpoints (com.resumeanalyser.resume.ResumeController).
 */
@Injectable({ providedIn: 'root' })
export class ResumeService {
  private readonly http = inject(HttpClient);

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
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<Resume>(`${environment.apiBaseUrl}/resumes`, formData);
  }

  /** Lists every resume version uploaded by the current user, oldest first (FR-1.5). */
  listVersions(): Observable<Resume[]> {
    return this.http.get<Resume[]>(`${environment.apiBaseUrl}/resumes`);
  }

  /** Fetches the structured profile extracted from a given resume version. */
  getParsedProfile(resumeId: string): Observable<ParsedProfile> {
    return this.http.get<ParsedProfile>(`${environment.apiBaseUrl}/resumes/${resumeId}/profile`);
  }
}
