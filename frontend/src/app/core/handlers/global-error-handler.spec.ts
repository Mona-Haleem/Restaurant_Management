import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GlobalErrorHandler } from './global-error-handler';
import { ErrorStateService } from '../services/error-state/error-state.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let errorState: ErrorStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler],
    });

    handler = TestBed.inject(GlobalErrorHandler);
    errorState = TestBed.inject(ErrorStateService);
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
  });

  it('should set an Error instance on ErrorStateService', () => {
    const error = new Error('kaboom');
    handler.handleError(error);

    expect(errorState.hasError()).toBe(true);
    expect(errorState.error()?.message).toBe('kaboom');
  });

  it('should wrap non-Error values into an Error', () => {
    handler.handleError('string error');

    expect(errorState.hasError()).toBe(true);
    expect(errorState.error()?.message).toBe('string error');
  });

  it('should always log to console.error', () => {
    const error = new Error('logged');
    handler.handleError(error);

    expect(console.error).toHaveBeenCalledWith('[GlobalErrorHandler]', error);
  });

  it('should not recurse when handling errors during error processing', () => {
    const setErrorSpy = vi.spyOn(errorState, 'setError').mockImplementation(() => {
      // Simulate the error boundary itself throwing during re-render
      handler.handleError(new Error('recursive'));
    });

    handler.handleError(new Error('original'));

    // setError should be called once for the original, not for the recursive error
    expect(setErrorSpy).toHaveBeenCalledTimes(1);
  });
});
