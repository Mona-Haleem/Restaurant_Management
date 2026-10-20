import { Router } from '@angular/router';

export function isActive(route: string, router: Router) {
  //     const target = route.split('/').filter(Boolean);
  //     const current = router.url.split(/[/?#]/).filter(Boolean);
  //     return target.some(segment => current.includes(segment));
  return router.url.includes(route);
}
