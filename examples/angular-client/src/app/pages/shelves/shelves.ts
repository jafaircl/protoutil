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
import { debounce, FormField, form } from "@angular/forms/signals";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatPaginator, MatPaginatorModule, type PageEvent } from "@angular/material/paginator";
import { MatSort, MatSortModule, type Sort } from "@angular/material/sort";
import { MatTableModule } from "@angular/material/table";
import { type Expr, ident, parse, STRING, unparse } from "@protoutil/aip/filtering";
import { Field, OrderBy, parseOrderBy } from "@protoutil/aip/orderby";
import {
  exprToFilterNode,
  type FilterNode,
  FilterTreeComponent,
  filterNodeToExpr,
  validateAipFilter,
} from "@protoutil/angular";
import { linkedQueryParam, paramToNumber } from "ngxtension/linked-query-param";
import type { ListShelvesResponse } from "../../../gen/library/v1/library_pb";
import { LibraryService } from "../../services/library";
import { DEFAULT_PAGE_SIZE } from "../../utils/defaults";
import { stringifyQueryParam } from "../../utils/query-params";

/**
 * Build a sample tree for demo purposes:
 *
 *   root (AND)
 *     ├── leaf: "status = ACTIVE"
 *     ├── branch (OR)
 *     │     ├── leaf: "region = US"
 *     │     └── leaf: "region = EU"
 *     ├── leaf: "priority > 3"
 *     └── leaf: "name.startsWith("foo")"
 */
function buildDemoTree(): FilterNode {
  return exprToFilterNode(
    parse(
      `status = ACTIVE AND (region = US OR region = EU) AND priority > 3 AND name.startsWith("foo")`,
    ).expr as Expr,
  );
}

@Component({
  selector: "app-shelves",
  templateUrl: "./shelves.html",
  styleUrls: ["./shelves.css"],
  imports: [
    FilterTreeComponent,
    FormField,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
  ],
})
export class ShelfListComponent implements AfterViewInit {
  library = inject(LibraryService);

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
  filterForm = form(signal(""), (path) => {
    // Debounce filter input to avoid excessive requests/validation while typing
    debounce(path, 300);
    validateAipFilter(path, this.decls);
  });
  filterParam = linkedQueryParam("filter", {
    source: linkedSignal(() => {
      const state = this.filterForm();
      if (!state.value() || state.invalid()) return null;
      return state.value();
    }),
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

  readonly displayedColumns = ["theme"] as const;
  paginator = viewChild.required(MatPaginator);
  sort = viewChild.required(MatSort);

  private initialized = false;

  filterEffect = effect(() => {
    // Track the filter param
    this.filterParam();
    // Reset to first page when filter changes, but only after initial load
    if (this.initialized) {
      this.skipParam.set(0);
    }
  });

  ngAfterViewInit() {
    this.setInitialFilter();
    this.setInitialOrderBy();
    this.initialized = true;
  }

  setInitialFilter() {
    this.filterForm().value.set(this.filter() ?? "");
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

  onFilterChange($event: unknown) {
    console.log({ $event });
    console.log(unparse(filterNodeToExpr($event as FilterNode)));
  }

  rootNode = signal<FilterNode>(buildDemoTree());
}
