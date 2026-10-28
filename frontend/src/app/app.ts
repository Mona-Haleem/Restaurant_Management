import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ErrorBoundary } from './shared/screens/error-boundary/error-boundary';
import { ErrorStateService } from './core/services/error-state/error-state.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ErrorBoundary],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('frontend');
  protected readonly errorState = inject(ErrorStateService);
}
