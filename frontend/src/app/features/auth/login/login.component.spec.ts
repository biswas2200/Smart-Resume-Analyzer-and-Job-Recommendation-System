import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthResponse } from '../../../core/models/auth.model';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let authServiceSpy: { login: ReturnType<typeof vi.fn> };
  let router: Router;

  const fakeAuthResponse: AuthResponse = {
    token: 'fake-jwt-token',
    tokenType: 'Bearer',
    expiresAt: '2099-01-01T00:00:00Z',
    user: { id: 'u1', email: 'jane@example.com', role: 'USER', createdAt: '2026-01-01T00:00:00Z' },
  };

  beforeEach(async () => {
    authServiceSpy = { login: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
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

  it('does not call AuthService.login when the form is invalid', () => {
    submitForm();

    expect(authServiceSpy.login).not.toHaveBeenCalled();
  });

  it('shows a validation message for a malformed email once the field has been touched', () => {
    const emailInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="email-input"]',
    );
    emailInput.value = 'not-an-email';
    emailInput.dispatchEvent(new Event('input'));
    emailInput.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    const message = fixture.nativeElement.querySelector('[data-testid="email-error"]');
    expect(message?.textContent).toContain('valid email');
  });

  it('logs in and navigates to the dashboard on success', () => {
    authServiceSpy.login.mockReturnValue(of(fakeAuthResponse));

    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'password123');
    submitForm();

    expect(authServiceSpy.login).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'password123',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the backend error message and does not navigate when login fails', () => {
    const error = new HttpErrorResponse({
      status: 401,
      error: {
        timestamp: '2026-01-01T00:00:00Z',
        status: 401,
        message: 'Invalid credentials',
        fieldErrors: null,
      },
    });
    authServiceSpy.login.mockReturnValue(throwError(() => error));

    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'wrong-password');
    submitForm();

    const banner = fixture.nativeElement.querySelector('[data-testid="login-error"]');
    expect(banner?.textContent).toContain('Invalid credentials');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('announces the error banner to screen readers via role="alert"', () => {
    authServiceSpy.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: {
              timestamp: '2026-01-01T00:00:00Z',
              status: 401,
              message: 'Invalid credentials',
              fieldErrors: null,
            },
          }),
      ),
    );

    setFieldValue('email-input', 'jane@example.com');
    setFieldValue('password-input', 'wrong-password');
    submitForm();

    const banner: HTMLElement = fixture.nativeElement.querySelector('[data-testid="login-error"]');
    expect(banner.getAttribute('role')).toBe('alert');
  });

  it('marks the email field as invalid for assistive tech once touched with a bad value', () => {
    const emailInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="email-input"]',
    );
    emailInput.value = 'not-an-email';
    emailInput.dispatchEvent(new Event('input'));
    emailInput.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = emailInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(fixture.nativeElement.querySelector(`#${describedBy}`)).toBeTruthy();
  });
});
