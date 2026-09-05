import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ResumeService } from './resume.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';
import { ParsedProfile, Resume } from '../models/resume.model';

function makeFile(name: string, sizeBytes: number, type: string): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe('ResumeService', () => {
  let service: ResumeService;
  let httpMock: HttpTestingController;
  let authServiceSpy: { currentUser: () => { id: string; email: string } | null };

  beforeEach(() => {
    authServiceSpy = { currentUser: () => ({ id: 'user-1', email: 'jane@example.com' }) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });
    service = TestBed.inject(ResumeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('validateFile', () => {
    it('accepts a PDF under 5 MB', () => {
      const file = makeFile('resume.pdf', 1024, 'application/pdf');
      expect(service.validateFile(file)).toBeNull();
    });

    it('accepts a DOCX under 5 MB', () => {
      const file = makeFile(
        'resume.docx',
        1024,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(service.validateFile(file)).toBeNull();
    });

    it('rejects an unsupported file type', () => {
      const file = makeFile('resume.txt', 1024, 'text/plain');
      expect(service.validateFile(file)).toContain('PDF or DOCX');
    });

    it('rejects a file larger than 5 MB', () => {
      const file = makeFile('resume.pdf', 5 * 1024 * 1024 + 1, 'application/pdf');
      expect(service.validateFile(file)).toContain('5 MB');
    });
  });

  describe('when using the mock API (environment.useMockApiForUnimplementedFeatures = true)', () => {
    it('uploads a resume and assigns version 1 to the first upload for a user', () => {
      const file = makeFile('resume.pdf', 1024, 'application/pdf');
      let uploaded!: Resume;

      service.upload(file).subscribe((resume) => (uploaded = resume));

      expect(uploaded.version).toBe(1);
      expect(uploaded.userId).toBe('user-1');
      expect(uploaded.fileRef).toContain('resume.pdf');
    });

    it('increments the version on each subsequent upload', () => {
      const first = makeFile('resume-v1.pdf', 1024, 'application/pdf');
      const second = makeFile('resume-v2.pdf', 1024, 'application/pdf');
      let secondUpload!: Resume;

      service.upload(first).subscribe();
      service.upload(second).subscribe((resume) => (secondUpload = resume));

      expect(secondUpload.version).toBe(2);
    });

    it('lists previously uploaded versions in ascending version order', () => {
      const first = makeFile('resume-v1.pdf', 1024, 'application/pdf');
      const second = makeFile('resume-v2.pdf', 1024, 'application/pdf');
      let versions!: Resume[];

      service.upload(first).subscribe();
      service.upload(second).subscribe();
      service.listVersions().subscribe((v) => (versions = v));

      expect(versions.map((v) => v.version)).toEqual([1, 2]);
    });

    it('returns a fabricated parsed profile for an uploaded resume', () => {
      const file = makeFile('resume.pdf', 1024, 'application/pdf');
      let uploaded!: Resume;
      let profile!: ParsedProfile;

      service.upload(file).subscribe((resume) => (uploaded = resume));
      service.getParsedProfile(uploaded.id).subscribe((p) => (profile = p));

      expect(profile.resumeId).toBe(uploaded.id);
      expect(profile.skills.length).toBeGreaterThan(0);
    });
  });

  describe('when the mock API is disabled', () => {
    const originalFlag = environment.useMockApiForUnimplementedFeatures;

    afterEach(() => {
      environment.useMockApiForUnimplementedFeatures = originalFlag;
    });

    it('uploads via a real multipart POST to /resumes', () => {
      environment.useMockApiForUnimplementedFeatures = false;
      const file = makeFile('resume.pdf', 1024, 'application/pdf');

      service.upload(file).subscribe();

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/resumes`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);
    });

    it('lists versions via a real GET to /resumes', () => {
      environment.useMockApiForUnimplementedFeatures = false;

      service.listVersions().subscribe();

      const req = httpMock.expectOne(`${environment.apiBaseUrl}/resumes`);
      expect(req.request.method).toBe('GET');
    });
  });
});
