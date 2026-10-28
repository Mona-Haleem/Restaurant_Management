import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ErrorStateService {
  private readonly _error = signal<Error | null>(null);

  /** The current unhandled error, or `null`. */
  readonly error = this._error.asReadonly();

  /** Whether an unhandled error is active. */
  readonly hasError = computed(() => this._error() !== null);

  /** Record an unhandled error to show the error boundary. */
  setError(error: Error): void {
    this._error.set(error);
  }

  /** Dismiss the error boundary and return to normal app state. */
  clearError(): void {
    this._error.set(null);
  }
}
