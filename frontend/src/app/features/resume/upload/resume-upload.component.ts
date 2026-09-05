import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { ResumeService } from '../services/resume.service';
import { ParsedProfile, Resume } from '../models/resume.model';

/**
 * Resume upload page: lets the candidate pick a PDF/DOCX file, upload it as a new
 * version (FR-1.5), and see the profile extracted from it plus their full upload history.
 */
@Component({
  selector: 'app-resume-upload',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './resume-upload.component.html',
  styleUrl: './resume-upload.component.scss',
})
export class ResumeUploadComponent implements OnInit {
  private readonly resumeService = inject(ResumeService);

  protected readonly versions = signal<Resume[]>([]);
  protected readonly latestParsedProfile = signal<ParsedProfile | null>(null);
  protected readonly isUploading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private selectedFile: File | null = null;

  ngOnInit(): void {
    this.resumeService.listVersions().subscribe((versions) => this.versions.set(versions));
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
    this.errorMessage.set(null);
  }

  protected upload(): void {
    if (!this.selectedFile) {
      this.errorMessage.set('Choose a file first.');
      return;
    }

    const validationError = this.resumeService.validateFile(this.selectedFile);
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    this.errorMessage.set(null);
    this.isUploading.set(true);

    this.resumeService.upload(this.selectedFile).subscribe({
      next: (resume) => {
        this.versions.update((current) => [...current, resume]);
        this.resumeService.getParsedProfile(resume.id).subscribe((profile) => {
          this.latestParsedProfile.set(profile);
          this.isUploading.set(false);
        });
      },
      error: () => {
        this.isUploading.set(false);
        this.errorMessage.set('Could not upload the resume. Please try again.');
      },
    });
  }
}
