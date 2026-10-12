import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // The portal is entirely behind authentication, and the session lives in
    // browser storage that the server-side renderer cannot see. Rendering the
    // server side would redirect every protected URL to /login before the
    // browser gets a chance to restore the session, so everything is rendered
    // in the browser instead.
    path: '**',
    renderMode: RenderMode.Client,
  },
];
