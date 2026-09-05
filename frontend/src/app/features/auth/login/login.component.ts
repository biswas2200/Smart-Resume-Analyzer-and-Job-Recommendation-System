import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';

/** Sign-in form for an existing account, backed by the real `POST /auth/login` endpoint. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  /** Set while the login request is in flight, so the submit button can't be double-clicked. */
  protected readonly isSubmitting = signal(false);

  /** Message from the most recent failed login attempt, or null when there isn't one. */
  protected readonly errorMessage = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(
          extractApiErrorMessage(error, 'Could not sign in. Please try again.'),
        );
      },
    });
  }
}
