import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthResponse } from '../../../core/models/auth.model';

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let authServiceSpy: { register: ReturnType<typeof vi.fn> };
  let router: Router;

  const fakeAuthResponse: AuthResponse = {
    token: 'fake-jwt-token',
    tokenType: 'Bearer',
    expiresAt: '2099-01-01T00:00:00Z',
    user: { id: 'u1', email: 'jane@example.com', role: 'USER', createdAt: '2026-01-01T00:00:00Z' },
  };

  beforeEach(async () => {
    authServiceSpy = { register: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
  });

  function setFieldValue(testId: string, value: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    );
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submitForm(): void {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('does not call AuthService.register when the form is invalid', () => {
    submitForm();

    expect(authServiceSpy.register).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters, matching the backend constraint', () => {
    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'short');
    setFieldValue('confirm-password-input', 'short');
    submitForm();

    expect(authServiceSpy.register).not.toHaveBeenCalled();
    const message = fixture.nativeElement.querySelector('[data-testid="password-error"]');
    expect(message?.textContent).toContain('at least 8 characters');
  });

  it('rejects mismatched password confirmation', () => {
    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'password123');
    setFieldValue('confirm-password-input', 'password456');
    submitForm();

    expect(authServiceSpy.register).not.toHaveBeenCalled();
    const message = fixture.nativeElement.querySelector('[data-testid="confirm-password-error"]');
    expect(message?.textContent).toContain('do not match');
  });

  it('registers and navigates to the dashboard on success, without sending the confirmation field', () => {
    authServiceSpy.register.mockReturnValue(of(fakeAuthResponse));

    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'password123');
    setFieldValue('confirm-password-input', 'password123');
    submitForm();

    expect(authServiceSpy.register).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'password123',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the backend error message (e.g. duplicate email) and does not navigate', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: {
        timestamp: '2026-01-01T00:00:00Z',
        status: 409,
        message: 'Email already in use',
        fieldErrors: null,
      },
    });
    authServiceSpy.register.mockReturnValue(throwError(() => error));

    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'password123');
    setFieldValue('confirm-password-input', 'password123');
    submitForm();

    const banner = fixture.nativeElement.querySelector('[data-testid="register-error"]');
    expect(banner?.textContent).toContain('Email already in use');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('announces the error banner to screen readers via role="alert"', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: {
        timestamp: '2026-01-01T00:00:00Z',
        status: 409,
        message: 'Email already in use',
        fieldErrors: null,
      },
    });
    authServiceSpy.register.mockReturnValue(throwError(() => error));

    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'password123');
    setFieldValue('confirm-password-input', 'password123');
    submitForm();

    const banner: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="register-error"]',
    );
    expect(banner.getAttribute('role')).toBe('alert');
  });

  it('marks mismatched confirm-password as invalid for assistive tech', () => {
    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'password123');
    setFieldValue('confirm-password-input', 'different');
    const confirmInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="confirm-password-input"]',
    );
    confirmInput.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(confirmInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = confirmInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(fixture.nativeElement.querySelector(`#${describedBy}`)).toBeTruthy();
  });
});
