import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';

import { HeaderComponent } from './header.component';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/user.model';

describe('HeaderComponent', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  let authServiceSpy: {
    currentUser: () => User | null;
    isAuthenticated: () => boolean;
    logout: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  function createFixture(user: User | null): void {
    const userSignal = signal(user);
    authServiceSpy = {
      currentUser: userSignal,
      isAuthenticated: () => userSignal() !== null,
      logout: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceSpy }],
    });

    fixture = TestBed.createComponent(HeaderComponent);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
  }

  it('shows sign-in links and no logout button when signed out', () => {
    createFixture(null);

    expect(fixture.nativeElement.querySelector('[data-testid="login-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="logout-button"]')).toBeFalsy();
  });

  it('shows the user email, nav links, and a logout button when signed in', () => {
    createFixture({
      id: 'u1',
      email: 'jane@example.com',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00Z',
    });

    expect(
      fixture.nativeElement.querySelector('[data-testid="current-user-email"]')?.textContent,
    ).toContain('jane@example.com');
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="upload-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="logout-button"]')).toBeTruthy();
  });

  it('labels the navigation region for assistive tech', () => {
    createFixture(null);

    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    expect(nav.getAttribute('aria-label')).toBeTruthy();
  });

  it('logs out and redirects to login when the logout button is clicked', () => {
    createFixture({
      id: 'u1',
      email: 'jane@example.com',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00Z',
    });

    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="logout-button"]',
    );
    button.click();

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
