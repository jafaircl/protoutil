import type { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "shelves",
  },
  {
    path: "shelves",
    loadComponent: () => import("./pages/shelves/shelves").then((m) => m.ShelfListComponent),
  },
];
