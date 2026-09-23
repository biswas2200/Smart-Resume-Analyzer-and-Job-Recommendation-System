import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

/**
 * App-wide top navigation bar. Shows sign-in/create-account links when signed out, or the
 * signed-in user's email plus the main feature links and a logout control when signed in.
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
