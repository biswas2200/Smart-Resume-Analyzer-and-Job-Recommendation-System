import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ResumeService } from './resume.service';
import { environment } from '../../../../environments/environment';
import { ParsedProfile, Resume } from '../models/resume.model';

function makeFile(name: string, sizeBytes: number, type: string): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe('ResumeService', () => {
  let service: ResumeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
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

  it('uploads via a multipart POST to /resumes', () => {
    const file = makeFile('resume.pdf', 1024, 'application/pdf');
    const fakeResume: Resume = {
      id: 'resume-1',
      userId: 'user-1',
      fileRef: 'data/resumes/user-1/1-resume.pdf',
      version: 1,
      uploadedAt: '2026-01-01T00:00:00Z',
    };
    let uploaded: Resume | undefined;

    service.upload(file).subscribe((resume) => (uploaded = resume));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/resumes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush(fakeResume);

    expect(uploaded).toEqual(fakeResume);
  });

  it('lists versions via a GET to /resumes', () => {
    service.listVersions().subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/resumes`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('fetches a parsed profile via a GET to /resumes/{id}/profile', () => {
    const fakeProfile: ParsedProfile = {
      id: 'profile-1',
      resumeId: 'resume-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '',
      skills: ['TypeScript'],
      experience: [],
      education: [],
    };
    let profile: ParsedProfile | undefined;

    service.getParsedProfile('resume-1').subscribe((p) => (profile = p));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/resumes/resume-1/profile`);
    expect(req.request.method).toBe('GET');
    req.flush(fakeProfile);

    expect(profile).toEqual(fakeProfile);
  });
});
