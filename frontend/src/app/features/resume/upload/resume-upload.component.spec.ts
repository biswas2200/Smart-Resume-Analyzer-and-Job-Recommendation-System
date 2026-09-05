import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ResumeUploadComponent } from './resume-upload.component';
import { ResumeService } from '../services/resume.service';
import { ParsedProfile, Resume } from '../models/resume.model';

describe('ResumeUploadComponent', () => {
  let fixture: ComponentFixture<ResumeUploadComponent>;
  let resumeServiceSpy: {
    validateFile: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    listVersions: ReturnType<typeof vi.fn>;
    getParsedProfile: ReturnType<typeof vi.fn>;
  };

  const uploadedResume: Resume = {
    id: 'resume-1',
    userId: 'user-1',
    fileRef: 'mock-storage/user-1/1-resume.pdf',
    version: 1,
    uploadedAt: '2026-01-01T00:00:00Z',
  };

  const parsedProfile: ParsedProfile = {
    id: 'profile-1',
    resumeId: 'resume-1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '',
    skills: ['TypeScript', 'Angular'],
    experience: [
      {
        title: 'Engineer',
        organization: 'Acme',
        duration: '2022-2026',
        description: 'Built things.',
      },
    ],
    education: [{ degree: 'B.S. CS', institution: 'State University', year: '2022' }],
  };

  function makeFile(name = 'resume.pdf', type = 'application/pdf'): File {
    return new File(['content'], name, { type });
  }

  beforeEach(async () => {
    resumeServiceSpy = {
      validateFile: vi.fn().mockReturnValue(null),
      upload: vi.fn().mockReturnValue(of(uploadedResume)),
      listVersions: vi.fn().mockReturnValue(of([])),
      getParsedProfile: vi.fn().mockReturnValue(of(parsedProfile)),
    };

    await TestBed.configureTestingModule({
      imports: [ResumeUploadComponent],
      providers: [{ provide: ResumeService, useValue: resumeServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(ResumeUploadComponent);
    fixture.detectChanges();
  });

  function selectFile(file: File): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="resume-file-input"]',
    );
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function clickUpload(): void {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="upload-submit"]',
    );
    button.click();
    fixture.detectChanges();
  }

  it('loads and displays existing resume versions on init', () => {
    resumeServiceSpy.listVersions.mockReturnValue(of([uploadedResume]));

    fixture = TestBed.createComponent(ResumeUploadComponent);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('[data-testid="resume-version-item"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('1');
  });

  it('shows a validation error and does not upload when the file is invalid', () => {
    resumeServiceSpy.validateFile.mockReturnValue('Only PDF or DOCX files are accepted.');

    selectFile(makeFile('resume.txt', 'text/plain'));
    clickUpload();

    expect(resumeServiceSpy.upload).not.toHaveBeenCalled();
    const error = fixture.nativeElement.querySelector('[data-testid="upload-error"]');
    expect(error?.textContent).toContain('PDF or DOCX');
  });

  it('uploads a valid file and renders the resulting parsed profile', () => {
    selectFile(makeFile());
    clickUpload();

    expect(resumeServiceSpy.upload).toHaveBeenCalledWith(expect.any(File));
    expect(resumeServiceSpy.getParsedProfile).toHaveBeenCalledWith(uploadedResume.id);

    const name = fixture.nativeElement.querySelector('[data-testid="profile-name"]');
    expect(name?.textContent).toContain('Jane Doe');
    const skills = fixture.nativeElement.querySelectorAll('[data-testid="profile-skill"]');
    expect(skills.length).toBe(2);
  });

  it('adds the new version to the version list after a successful upload', () => {
    selectFile(makeFile());
    clickUpload();

    const items = fixture.nativeElement.querySelectorAll('[data-testid="resume-version-item"]');
    expect(items.length).toBe(1);
  });

  it('shows an error message when the upload call fails', () => {
    resumeServiceSpy.upload.mockReturnValue(throwError(() => new Error('network down')));

    selectFile(makeFile());
    clickUpload();

    const error = fixture.nativeElement.querySelector('[data-testid="upload-error"]');
    expect(error?.textContent).toContain('Could not upload');
  });
});
