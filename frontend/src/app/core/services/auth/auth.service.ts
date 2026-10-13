import { Injectable, signal } from '@angular/core';
import { UserRole } from '../../../shared/constants/types';

interface User {
  token: string;
  role: UserRole;
  name: string;
  email: string;
}
// const dummyUser: User = {
//   token: 'dummy',
//   role: 'manager',
//   name: 'John Doe',
//   email: 'user@test.com',
// }

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  currentUser = signal<User | null>(null);
  isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }
}
