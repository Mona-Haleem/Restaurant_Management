import { ErrorHandler, Injectable, inject, Injector, NgZone } from '@angular/core';
import { ErrorStateService } from '../services/error-state/error-state.service';

/**
 * Catches uncaught errors across the app and routes them to
 * the ErrorStateService so the error-boundary UI can render.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  /** Guard against recursive errors (e.g. the error boundary itself throws). */
  private isProcessing = false;

  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    // Always log to the console for debugging
    console.error('[GlobalErrorHandler]', error);

    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    const wrapped = error instanceof Error ? error : new Error(String(error));

    try {
      const zone = this.injector.get(NgZone);
      const errorState = this.injector.get(ErrorStateService);

      zone.run(() => errorState.setError(wrapped));
    } catch {
      // If DI isn't ready yet, the console.error above is the best we can do.
    } finally {
      this.isProcessing = false;
    }
  }
}
