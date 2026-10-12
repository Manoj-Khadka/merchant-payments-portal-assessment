import { Injectable, Signal, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Role } from '../models/user.model';

export type Permission =
  | 'application:create'
  | 'application:edit'
  | 'application:review'
  | 'assignment:manage'
  | 'sensitive:reveal';

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SALES: new Set<Permission>(['application:create', 'application:edit']),
  REVIEWER: new Set<Permission>(['application:review', 'sensitive:reveal']),
  ADMIN: new Set<Permission>(['assignment:manage', 'sensitive:reveal']),
};

/**
 * Central role → permission map. `can()` returns a memoised computed so it is
 * reactive (re-evaluates when the signed-in role changes) and cheap to call from
 * templates or the `*hasPermission` directive.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);
  private readonly cache = new Map<Permission, Signal<boolean>>();

  can(permission: Permission): Signal<boolean> {
    let permissionSignal = this.cache.get(permission);
    if (!permissionSignal) {
      permissionSignal = computed(() => {
        const role = this.auth.role();
        return role !== null && ROLE_PERMISSIONS[role].has(permission);
      });
      this.cache.set(permission, permissionSignal);
    }
    return permissionSignal;
  }
}
