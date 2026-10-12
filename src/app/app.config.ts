import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    // Material components (dialog, stepper, select, …) rely on animations.
    provideAnimationsAsync(),
    // Load Material Symbols (see index.html) rather than the legacy Material
    // Icons font, so `mat-icon` ligatures (paginator arrows, password toggle)
    // resolve against the font we actually ship.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    // errorInterceptor runs outermost so authInterceptor still sees raw 401s.
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};
