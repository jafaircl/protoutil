import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { MAT_ICON_DEFAULT_OPTIONS } from "@angular/material/icon";
import { provideRouter } from "@angular/router";

import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: "material-symbols-outlined" } },
  ],
};
