import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { HeaderComponent } from './shared/components/header/header.component';

/** Application shell: the persistent header plus the routed page content. */
@Component({
  imports: [RouterOutlet, HeaderComponent],
  selector: 'app-root',
  styleUrl: './app.component.scss',
  templateUrl: './app.component.html',
})
export class App {}
