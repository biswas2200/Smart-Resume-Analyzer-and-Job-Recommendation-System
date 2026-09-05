import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';

import { ResumeService } from '../../resume/services/resume.service';
import { ParsedProfile, Resume } from '../../resume/models/resume.model';
import { AtsCheck, DashboardData, RoleRecommendation } from '../models/dashboard.model';

interface CuratedRole {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
}

// A small stand-in for the ml-service's role_skills.json curated dataset (docs/lld.md §1) —
// enough roles to demonstrate ranking/gap-analysis behavior without the real /match endpoint.
const ROLE_CATALOG: CuratedRole[] = [
  {
    id: 'role-frontend',
    title: 'Frontend Developer',
    description: 'Builds user-facing web applications.',
    requiredSkills: ['JavaScript', 'TypeScript', 'Angular', 'CSS', 'HTML'],
  },
  {
    id: 'role-backend',
    title: 'Backend Software Engineer',
    description: 'Builds and operates server-side APIs and services.',
    requiredSkills: ['Java', 'Spring Boot', 'SQL', 'REST APIs', 'PostgreSQL'],
  },
  {
    id: 'role-fullstack',
    title: 'Full-Stack Engineer',
    description: 'Works across both the frontend and backend of a product.',
    requiredSkills: ['JavaScript', 'TypeScript', 'Angular', 'SQL', 'REST APIs'],
  },
  {
    id: 'role-data-analyst',
    title: 'Data Analyst',
    description: 'Turns raw data into actionable business insight.',
    requiredSkills: ['SQL', 'Python', 'Excel', 'Data Visualization', 'Statistics'],
  },
  {
    id: 'role-devops',
    title: 'DevOps Engineer',
    description: 'Builds and maintains CI/CD and cloud infrastructure.',
    requiredSkills: ['Docker', 'Kubernetes', 'CI/CD', 'AWS', 'Linux'],
  },
];

const TOP_N_RECOMMENDATIONS = 3;

/**
 * Assembles the dashboard's role recommendations, gap breakdown, and ATS score.
 *
 * The backend's `recommendation` module (and the composite "dashboard read endpoint" LLD §7
 * mentions) doesn't exist yet, and neither does a live connection to the ml-service's
 * `/analyze`. This service fabricates an equivalent view from the resume the candidate has
 * already uploaded (via {@link ResumeService}, itself mocked for the same reason), using the
 * same ranking idea as `matcher.py` — required-skill overlap — so the UI and its tests describe
 * real target behavior rather than a hardcoded screen.
 */
@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private readonly resumeService = inject(ResumeService);

  /** Null means the candidate has no uploaded resume yet — the dashboard should prompt for one. */
  getDashboard(): Observable<DashboardData | null> {
    return this.resumeService.listVersions().pipe(
      switchMap((versions) => {
        const latest = this.mostRecent(versions);
        if (!latest) {
          return of(null);
        }
        return this.resumeService
          .getParsedProfile(latest.id)
          .pipe(map((profile) => this.buildDashboard(profile)));
      }),
    );
  }

  private mostRecent(versions: Resume[]): Resume | null {
    return versions.reduce<Resume | null>(
      (latest, candidate) => (!latest || candidate.version > latest.version ? candidate : latest),
      null,
    );
  }

  private buildDashboard(profile: ParsedProfile): DashboardData {
    const recommendations = this.rankRoles(profile.skills);
    return {
      atsScore: this.scoreAts(profile),
      recommendations,
      explanation: this.explain(recommendations),
    };
  }

  private rankRoles(candidateSkills: string[]): RoleRecommendation[] {
    const candidateSet = new Set(candidateSkills.map((skill) => skill.toLowerCase()));

    return ROLE_CATALOG.map((role) => {
      const matchedSkills = role.requiredSkills.filter((skill) =>
        candidateSet.has(skill.toLowerCase()),
      );
      const missingSkills = role.requiredSkills.filter(
        (skill) => !candidateSet.has(skill.toLowerCase()),
      );
      const matchScore =
        Math.round((matchedSkills.length / role.requiredSkills.length) * 10000) / 10000;

      const recommendation: RoleRecommendation = {
        recommendationId: `mock-recommendation-${role.id}`,
        role: { id: role.id, title: role.title, description: role.description },
        matchScore,
        createdAt: new Date().toISOString(),
        matchedSkills,
        missingSkills,
      };
      return recommendation;
    })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, TOP_N_RECOMMENDATIONS);
  }

  // Mirrors the rubric in docs/lld.md §5 (names/weights), applied to the parsed profile's
  // fields rather than raw resume text, since the frontend never sees the raw text.
  private scoreAts(profile: ParsedProfile): {
    score: number;
    max_score: number;
    checks: AtsCheck[];
  } {
    const checks: AtsCheck[] = [
      {
        name: 'contact_email',
        passed: profile.email.length > 0,
        detail: profile.email.length > 0 ? 'Email found.' : 'No email found.',
      },
      {
        name: 'contact_phone',
        passed: profile.phone.length > 0,
        detail: profile.phone.length > 0 ? 'Phone number found.' : 'No phone number found.',
      },
      {
        name: 'section_experience',
        passed: profile.experience.length > 0,
        detail: `${profile.experience.length} experience entr${profile.experience.length === 1 ? 'y' : 'ies'} found.`,
      },
      {
        name: 'section_education',
        passed: profile.education.length > 0,
        detail: `${profile.education.length} education entr${profile.education.length === 1 ? 'y' : 'ies'} found.`,
      },
      {
        name: 'section_skills',
        passed: profile.skills.length > 0,
        detail: `${profile.skills.length} skill(s) found.`,
      },
    ];
    const weights: Record<string, number> = {
      contact_email: 15,
      contact_phone: 10,
      section_experience: 15,
      section_education: 15,
      section_skills: 15,
    };
    const score = checks.reduce(
      (total, check) => total + (check.passed ? weights[check.name] : 0),
      0,
    );

    return { score, max_score: 70, checks };
  }

  private explain(recommendations: RoleRecommendation[]): string {
    const [top] = recommendations;
    if (!top) {
      return 'Upload a resume to see personalized role recommendations.';
    }
    const missing = top.missingSkills.length
      ? ` Focus on closing these gaps: ${top.missingSkills.join(', ')}.`
      : ' You already have every required skill for this role.';
    return `Based on your profile, you're a strong match for ${top.role.title} (${Math.round(top.matchScore * 100)}% skill overlap).${missing}`;
  }
}
