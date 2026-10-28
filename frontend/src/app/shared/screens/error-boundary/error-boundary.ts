import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorStateService } from '../../../core/services/error-state/error-state.service';

@Component({
  selector: 'app-error-boundary',
  imports: [TranslocoPipe],
  templateUrl: './error-boundary.html',
  styleUrl: './error-boundary.scss',
})
export class ErrorBoundary {
  protected readonly errorState = inject(ErrorStateService);

  /** Reload the page to give the user a fresh start. */
  tryAgain(): void {
    this.errorState.clearError();
    window.location.reload();
  }

  /** Navigate home using native navigation (router may be broken). */
  goHome(): void {
    this.errorState.clearError();
    window.location.href = '/';
  }

  switchToAccessDenied(): void {
    this.errorState.clearError();
    window.location.href = '/unauthorized';
  }

  switchToNotFound(): void {
    this.errorState.clearError();
    window.location.href = '/not-found';
  }
}
