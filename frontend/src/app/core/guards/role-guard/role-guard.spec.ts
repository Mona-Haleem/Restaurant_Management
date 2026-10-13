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

import { roleGuard } from './role-guard';
import { AuthService } from '../../services/auth/auth.service';
import { UserRole } from '../../../shared/constants/types';

describe('roleGuard', () => {
  let mockAuthService: {
    currentUser: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => roleGuard(...guardParameters));

  const dummyState = {} as RouterStateSnapshot;

  const createRouteSnapshot = (roles: UserRole[] = []): ActivatedRouteSnapshot =>
    ({
      data: { roles },
    }) as unknown as ActivatedRouteSnapshot;

  beforeEach(() => {
    mockAuthService = {
      currentUser: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: mockAuthService }],
    });

    router = TestBed.inject(Router);
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  describe('when user is unauthenticated', () => {
    it('should redirect to "/login" when currentUser is null', () => {
      mockAuthService.currentUser.mockReturnValue(null);
      const route = createRouteSnapshot(['manager']);

      const result = executeGuard(route, dummyState);

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/login');
      expect(mockAuthService.currentUser).toHaveBeenCalledTimes(1);
    });

    it('should redirect to "/login" when currentUser is undefined', () => {
      mockAuthService.currentUser.mockReturnValue(undefined);
      const route = createRouteSnapshot(['manager']);

      const result = executeGuard(route, dummyState);

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/login');
    });

    it('should call router.createUrlTree with ["/login"]', () => {
      mockAuthService.currentUser.mockReturnValue(null);
      const createUrlTreeSpy = vi.spyOn(router, 'createUrlTree');
      const route = createRouteSnapshot(['manager']);

      executeGuard(route, dummyState);

      expect(createUrlTreeSpy).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('when user has an allowed role', () => {
    it('should allow access when user role matches a single allowed role', () => {
      mockAuthService.currentUser.mockReturnValue({ role: 'manager' });
      const route = createRouteSnapshot(['manager']);

      const result = executeGuard(route, dummyState);

      expect(result).toBe(true);
      expect(mockAuthService.currentUser).toHaveBeenCalledTimes(1);
    });

    it('should allow access when user role is included in multiple allowed roles', () => {
      mockAuthService.currentUser.mockReturnValue({ role: 'worker' });
      const route = createRouteSnapshot(['worker', 'manager', 'admin']);

      const result = executeGuard(route, dummyState);

      expect(result).toBe(true);
    });

    it('should allow access for customer when customer role is allowed', () => {
      mockAuthService.currentUser.mockReturnValue({ role: 'customer' });
      const route = createRouteSnapshot(['customer']);

      const result = executeGuard(route, dummyState);

      expect(result).toBe(true);
    });
  });

  describe('when user does not have an allowed role', () => {
    it('should redirect to "/unauthorized" when user role is not in allowed roles', () => {
      mockAuthService.currentUser.mockReturnValue({ role: 'customer' });
      const route = createRouteSnapshot(['manager', 'admin']);

      const result = executeGuard(route, dummyState);

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/unauthorized');
      expect(mockAuthService.currentUser).toHaveBeenCalledTimes(1);
    });

    it('should redirect to "/unauthorized" when allowed roles array is empty', () => {
      mockAuthService.currentUser.mockReturnValue({ role: 'manager' });
      const route = createRouteSnapshot([]);

      const result = executeGuard(route, dummyState);

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/unauthorized');
    });

    it('should call router.createUrlTree with ["/unauthorized"]', () => {
      mockAuthService.currentUser.mockReturnValue({ role: 'worker' });
      const createUrlTreeSpy = vi.spyOn(router, 'createUrlTree');
      const route = createRouteSnapshot(['manager']);

      executeGuard(route, dummyState);

      expect(createUrlTreeSpy).toHaveBeenCalledWith(['/unauthorized']);
    });
  });
});
