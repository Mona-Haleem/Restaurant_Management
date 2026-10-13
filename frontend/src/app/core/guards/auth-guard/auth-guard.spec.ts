import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authGuard } from './auth-guard';
import { AuthService } from '../../services/auth/auth.service';

describe('authGuard', () => {
  let mockAuthService: {
    isAuthenticated: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;

  beforeEach(() => {
    mockAuthService = {
      isAuthenticated: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: mockAuthService }],
    });

    router = TestBed.inject(Router);
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should allow access when the user is authenticated', () => {
    mockAuthService.isAuthenticated.mockReturnValue(true);

    const result = executeGuard(dummyRoute, dummyState);

    expect(result).toBe(true);
    expect(mockAuthService.isAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('should redirect to "/" when the user is not authenticated', () => {
    mockAuthService.isAuthenticated.mockReturnValue(false);

    const result = executeGuard(dummyRoute, dummyState);

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
    expect(mockAuthService.isAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('should call router.createUrlTree with ["/"] when unauthenticated', () => {
    mockAuthService.isAuthenticated.mockReturnValue(false);
    const createUrlTreeSpy = vi.spyOn(router, 'createUrlTree');

    executeGuard(dummyRoute, dummyState);

    expect(createUrlTreeSpy).toHaveBeenCalledWith(['/']);
  });
});
