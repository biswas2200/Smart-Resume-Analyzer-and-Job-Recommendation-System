import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';

// The backend (RegisterRequest) enforces 8-72 characters; bcrypt silently ignores anything
// past 72 bytes, so the upper bound is a real constraint, not just an arbitrary UI limit.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

/** Cross-field check that "confirm password" matches "password" — client-side only. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

/** Account-creation form, backed by the real `POST /auth/register` endpoint. */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.formBuilder.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(MIN_PASSWORD_LENGTH),
          Validators.maxLength(MAX_PASSWORD_LENGTH),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  /** Set while the register request is in flight, so the submit button can't be double-clicked. */
  protected readonly isSubmitting = signal(false);

  /** Message from the most recent failed registration attempt, or null when there isn't one. */
  protected readonly errorMessage = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    const { email, password } = this.form.getRawValue();

    this.authService.register({ email, password }).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(
          extractApiErrorMessage(error, 'Could not create the account. Please try again.'),
        );
      },
    });
  }
}
