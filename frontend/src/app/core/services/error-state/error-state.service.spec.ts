import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { ErrorStateService } from './error-state.service';

describe('ErrorStateService', () => {
  let service: ErrorStateService;

  beforeEach(() => {
    service = TestBed.inject(ErrorStateService);
  });

  it('should start with no error', () => {
    expect(service.error()).toBeNull();
    expect(service.hasError()).toBe(false);
  });

  it('should store an error when setError is called', () => {
    const error = new Error('test error');
    service.setError(error);

    expect(service.error()).toBe(error);
    expect(service.hasError()).toBe(true);
  });

  it('should clear the error when clearError is called', () => {
    service.setError(new Error('test'));
    service.clearError();

    expect(service.error()).toBeNull();
    expect(service.hasError()).toBe(false);
  });

  it('should replace a previous error with a new one', () => {
    service.setError(new Error('first'));
    service.setError(new Error('second'));

    expect(service.error()?.message).toBe('second');
    expect(service.hasError()).toBe(true);
  });
});
