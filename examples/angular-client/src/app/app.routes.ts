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
  {
    path: "shelves/:shelfId",
    loadComponent: () =>
      import("./pages/shelf-detail/shelf-detail").then((m) => m.ShelfDetailComponent),
  },
];
