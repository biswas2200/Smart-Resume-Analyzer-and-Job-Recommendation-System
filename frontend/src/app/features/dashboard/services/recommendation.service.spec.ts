import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { RecommendationService } from './recommendation.service';
import { ResumeService } from '../../resume/services/resume.service';
import { ParsedProfile, Resume } from '../../resume/models/resume.model';
import { DashboardData } from '../models/dashboard.model';

describe('RecommendationService', () => {
  let service: RecommendationService;
  let resumeServiceSpy: {
    listVersions: ReturnType<typeof vi.fn>;
    getParsedProfile: ReturnType<typeof vi.fn>;
  };

  const resume: Resume = {
    id: 'resume-1',
    userId: 'user-1',
    fileRef: 'mock-storage/user-1/1-resume.pdf',
    version: 1,
    uploadedAt: '2026-01-01T00:00:00Z',
  };

  function profileWith(skills: string[], overrides: Partial<ParsedProfile> = {}): ParsedProfile {
    return {
      id: 'profile-1',
      resumeId: resume.id,
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-0100',
      skills,
      experience: [
        {
          title: 'Engineer',
          organization: 'Acme',
          duration: '2022-2026',
          description: 'Built things.',
        },
      ],
      education: [{ degree: 'B.S. CS', institution: 'State University', year: '2022' }],
      ...overrides,
    };
  }

  beforeEach(() => {
    resumeServiceSpy = { listVersions: vi.fn(), getParsedProfile: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: ResumeService, useValue: resumeServiceSpy }],
    });
    service = TestBed.inject(RecommendationService);
  });

  it('returns null when the user has not uploaded a resume yet', () => {
    resumeServiceSpy.listVersions.mockReturnValue(of([]));
    let result: DashboardData | null | undefined;

    service.getDashboard().subscribe((data) => (result = data));

    expect(result).toBeNull();
  });

  it('ranks roles by how many required skills the candidate has, most first', () => {
    resumeServiceSpy.listVersions.mockReturnValue(of([resume]));
    resumeServiceSpy.getParsedProfile.mockReturnValue(
      of(profileWith(['JavaScript', 'TypeScript', 'Angular', 'CSS', 'HTML'])),
    );
    let result!: DashboardData;

    service.getDashboard().subscribe((data) => (result = data as DashboardData));

    expect(result.recommendations.length).toBeGreaterThan(0);
    const scores = result.recommendations.map((r) => r.matchScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result.recommendations[0].role.title).toBe('Frontend Developer');
    expect(result.recommendations[0].matchedSkills).toEqual(
      expect.arrayContaining(['JavaScript', 'TypeScript', 'Angular', 'CSS', 'HTML']),
    );
    expect(result.recommendations[0].missingSkills).toEqual([]);
  });

  it('lists a role required skill as missing when the candidate does not have it', () => {
    resumeServiceSpy.listVersions.mockReturnValue(of([resume]));
    resumeServiceSpy.getParsedProfile.mockReturnValue(of(profileWith(['JavaScript'])));
    let result!: DashboardData;

    service.getDashboard().subscribe((data) => (result = data as DashboardData));

    const frontend = result.recommendations.find((r) => r.role.title === 'Frontend Developer');
    expect(frontend?.missingSkills).toEqual(expect.arrayContaining(['Angular', 'CSS', 'HTML']));
  });

  it('marks ATS checks passed based on which profile fields are present', () => {
    resumeServiceSpy.listVersions.mockReturnValue(of([resume]));
    resumeServiceSpy.getParsedProfile.mockReturnValue(
      of(profileWith(['JavaScript'], { phone: '', education: [] })),
    );
    let result!: DashboardData;

    service.getDashboard().subscribe((data) => (result = data as DashboardData));

    const byName = Object.fromEntries(result.atsScore.checks.map((c) => [c.name, c.passed]));
    expect(byName['contact_email']).toBe(true);
    expect(byName['contact_phone']).toBe(false);
    expect(byName['section_education']).toBe(false);
    expect(byName['section_skills']).toBe(true);
  });

  it('includes the top-ranked role in the explanation text', () => {
    resumeServiceSpy.listVersions.mockReturnValue(of([resume]));
    resumeServiceSpy.getParsedProfile.mockReturnValue(
      of(profileWith(['JavaScript', 'TypeScript', 'Angular', 'CSS', 'HTML'])),
    );
    let result!: DashboardData;

    service.getDashboard().subscribe((data) => (result = data as DashboardData));

    expect(result.explanation).toContain('Frontend Developer');
  });
});
