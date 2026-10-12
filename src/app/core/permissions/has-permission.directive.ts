import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { Permission, PermissionService } from './permission.service';

/**
 * Structural directive that renders its host element only when the signed-in
 * user holds the given permission, e.g.
 *
 *   <button *hasPermission="'application:create'">New application</button>
 */
@Directive({ selector: '[hasPermission]' })
export class HasPermissionDirective {
  private readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionService);

  readonly hasPermission = input.required<Permission>();

  private hasView = false;

  constructor() {
    effect(() => {
      const allowed = this.permissions.can(this.hasPermission())();

      if (allowed && !this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
      } else if (!allowed && this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
    });
  }
}
