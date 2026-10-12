import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Blocks navigation away from the wizard when a save is in flight or has failed,
 * complementing the `beforeunload` handler on the wizard page.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  return window.confirm('You have unsaved changes that could not be saved. Leave anyway?');
};
