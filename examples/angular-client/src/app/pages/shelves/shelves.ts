import {
  type AfterViewInit,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginator, MatPaginatorModule, type PageEvent } from "@angular/material/paginator";
import { MatSort, MatSortModule, type Sort } from "@angular/material/sort";
import { MatTableModule } from "@angular/material/table";
import { check, ident, parse, STRING, unparse } from "@protoutil/aip/filtering";
import { Field, OrderBy, parse as parseOrderBy } from "@protoutil/aip/orderby";
import { exprToFilterNode, type FilterNode, filterNodeToExpr } from "@protoutil/angular";
import { Router } from "@angular/router";
import { linkedQueryParam, paramToNumber } from "ngxtension/linked-query-param";
import type { ListShelvesResponse, Shelf } from "../../../gen/library/v1/library_pb";
import { LibraryService } from "../../services/library";
import { DEFAULT_PAGE_SIZE } from "../../utils/defaults";
import { stringifyQueryParam } from "../../utils/query-params";
import { CreateShelfDialogComponent } from "./create-shelf-dialog";
import { DeleteShelfDialogComponent, type DeleteShelfDialogData } from "./delete-shelf-dialog";
import { FilterDialogComponent, type FilterDialogData } from "./filter-dialog";

@Component({
  selector: "app-shelves",
  templateUrl: "./shelves.html",
  styleUrls: ["./shelves.css"],
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
  ],
})
export class ShelfListComponent implements AfterViewInit {
  library = inject(LibraryService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  pageSizeParam = linkedQueryParam("page_size", {
    parse: paramToNumber({ defaultValue: DEFAULT_PAGE_SIZE }),
    stringify: stringifyQueryParam({ defaultValue: DEFAULT_PAGE_SIZE }),
  });
  skipParam = linkedQueryParam("skip", {
    parse: paramToNumber({ defaultValue: 0 }),
    stringify: stringifyQueryParam({ defaultValue: 0 }),
  });
  orderByParam = linkedQueryParam("order_by", {
    parse: (str) => (!str ? null : parseOrderBy(str)),
    stringify: (param) => (!param ? null : param.toString()),
  });
  decls = signal([ident("theme", STRING)]);
  filterParam = linkedQueryParam("filter");
  filterTree = computed<FilterNode | undefined>(() => {
    const filterStr = this.filterParam();
    if (!filterStr) return undefined;
    try {
      const parsed = parse(filterStr);
      const { checkedExpr, errors } = check(parsed, { decls: this.decls(), source: filterStr });
      if (checkedExpr.expr && errors.length === 0) {
        return exprToFilterNode(checkedExpr.expr);
      }
    } catch {
      // Invalid filter in URL — ignore
    }
    return undefined;
  });

  pageSize = computed(() => this.pageSizeParam() ?? DEFAULT_PAGE_SIZE);
  pageIndex = computed(() => Math.floor(this.skip() / this.pageSize()));
  skip = computed(() => this.skipParam() ?? 0);
  orderBy = computed(() => this.orderByParam()?.toString());
  filter = computed(() => this.filterParam() ?? "");

  shelvesResource = resource({
    params: () => ({
      pageSize: this.pageSize(),
      skip: this.skip(),
      orderBy: this.orderBy(),
      filter: this.filter(),
    }),
    loader: ({ params, abortSignal }) => this.library.listShelves(params, abortSignal),
  });
  shelvesResponse = linkedSignal({
    source: () => ({
      value: this.shelvesResource.value(),
      isLoading: this.shelvesResource.isLoading(),
    }),
    computation: (current, previous): ListShelvesResponse | undefined => {
      // While loading, return the previous value so the table doesn't flash empty
      if (current.isLoading && previous) return previous.value;
      return current.value;
    },
  });
  shelves = computed(() => this.shelvesResponse()?.shelves ?? []);
  nextPagetoken = computed(() => this.shelvesResponse()?.nextPageToken ?? null);
  previousPagetoken = computed(() => this.shelvesResponse()?.previousPageToken ?? null);
  totalSize = computed(() => this.shelvesResponse()?.totalSize ?? 0);

  hasActiveFilter = computed(() => !!this.filterParam());

  readonly displayedColumns = ["theme", "actions"] as const;
  paginator = viewChild.required(MatPaginator);
  sort = viewChild.required(MatSort);

  private initialized = false;

  filterEffect = effect(() => {
    this.filterParam(); // track
    // Reset to first page when filter changes, but only after initial load
    if (this.initialized) {
      this.skipParam.set(0);
    }
  });

  ngAfterViewInit() {
    this.setInitialOrderBy();
    this.initialized = true;
  }

  setInitialOrderBy() {
    const orderBy = this.orderByParam();
    if (!orderBy || orderBy.fields.length === 0) return;
    const field = orderBy.fields[0];
    this.sort().sort({
      id: field.path,
      start: field.desc ? "desc" : "asc",
      disableClear: true,
    });
  }

  handlePageEvent(event: PageEvent) {
    this.skipParam.set(event.pageIndex * event.pageSize);
    this.pageSizeParam.set(event.pageSize);
  }

  handleSortChangeEvent(state: Sort) {
    if (this.initialized) {
      this.skipParam.set(0);
    }
    if (!state.active || !state.direction) {
      this.orderByParam.set(null);
      return;
    }
    this.orderByParam.set(new OrderBy([new Field(state.active, state.direction === "desc")]));
  }

  openFilterDialog(initialField?: string | null): void {
    const data: FilterDialogData = {
      declarations: this.decls(),
      initialTree: this.filterTree(),
      initialField: initialField ?? null,
    };

    this.dialog
      .open(FilterDialogComponent, { data, width: "600px", maxHeight: "80vh" })
      .afterClosed()
      .subscribe((result: FilterNode | undefined) => {
        if (result !== undefined) {
          const expr = filterNodeToExpr(result);
          this.filterParam.set(expr ? unparse(expr) : null);
        }
      });
  }

  openFilterForField(fieldName: string): void {
    this.openFilterDialog(fieldName);
  }

  navigateToShelf(shelf: Shelf): void {
    const shelfId = shelf.name.split("/")[1];
    this.router.navigate(["/shelves", shelfId]);
  }

  openCreateShelfDialog(): void {
    this.dialog
      .open(CreateShelfDialogComponent, { width: "480px" })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.library.createShelf(result).then(() => this.shelvesResource.reload());
        }
      });
  }

  openDeleteShelfDialog(shelf: Shelf, event: Event): void {
    event.stopPropagation();
    const data: DeleteShelfDialogData = { shelfName: shelf.name, shelfTheme: shelf.theme };
    this.dialog
      .open(DeleteShelfDialogComponent, { data, width: "400px" })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.library.deleteShelf({ name: shelf.name }).then(() => this.shelvesResource.reload());
        }
      });
  }
}
