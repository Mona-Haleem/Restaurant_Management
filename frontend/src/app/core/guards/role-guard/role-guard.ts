import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';
import { UserRole } from '../../../shared/constants/types';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = route.data['roles'] as UserRole[];
  const user = authService.currentUser();

  if (!user) {
    return router.createUrlTree(['/login']);
  }

  return allowedRoles.includes(user.role) ? true : router.createUrlTree(['/unauthorized']);
};
