import {
  type AfterViewInit,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginator, MatPaginatorModule, type PageEvent } from "@angular/material/paginator";
import { MatSort, MatSortModule, type Sort } from "@angular/material/sort";
import { MatTableModule } from "@angular/material/table";
import { Router } from "@angular/router";
import { BOOL, check, ident, parse, STRING, unparse } from "@protoutil/aip/filtering";
import { Field, OrderBy, parse as parseOrderBy } from "@protoutil/aip/orderby";
import { exprToFilterNode, type FilterNode, filterNodeToExpr } from "@protoutil/angular";
import { linkedQueryParam, paramToNumber } from "ngxtension/linked-query-param";
import type { Book, ListBooksResponse } from "../../../gen/library/v1/library_pb";
import { LibraryService } from "../../services/library";
import { DEFAULT_PAGE_SIZE } from "../../utils/defaults";
import { stringifyQueryParam } from "../../utils/query-params";
import { FilterDialogComponent, type FilterDialogData } from "../shelves/filter-dialog";
import { CreateBookDialogComponent, type CreateBookDialogData } from "./create-book-dialog";
import { DeleteBookDialogComponent, type DeleteBookDialogData } from "./delete-book-dialog";
import { EditBookDialogComponent, type EditBookDialogData } from "./edit-book-dialog";

@Component({
  selector: "app-shelf-detail",
  standalone: true,
  templateUrl: "./shelf-detail.html",
  styleUrls: ["./shelf-detail.css"],
  imports: [
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
  ],
})
export class ShelfDetailComponent implements AfterViewInit {
  private library = inject(LibraryService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  // Route param bound via withComponentInputBinding()
  shelfId = input.required<string>();
  shelfName = computed(() => `shelves/${this.shelfId()}`);

  // Shelf header
  shelfResource = resource({
    params: () => ({ name: this.shelfName() }),
    loader: ({ params, abortSignal }) => this.library.getShelf(params, abortSignal),
  });
  shelf = computed(() => this.shelfResource.value());

  // Books table — same pattern as shelves list
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
  decls = signal([ident("author", STRING), ident("title", STRING), ident("read", BOOL)]);
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
      return undefined;
    }
    return undefined;
  });

  pageSize = computed(() => this.pageSizeParam() ?? DEFAULT_PAGE_SIZE);
  pageIndex = computed(() => Math.floor(this.skip() / this.pageSize()));
  skip = computed(() => this.skipParam() ?? 0);
  orderBy = computed(() => this.orderByParam()?.toString());
  filter = computed(() => this.filterParam() ?? "");

  booksResource = resource({
    params: () => ({
      parent: this.shelfName(),
      pageSize: this.pageSize(),
      skip: this.skip(),
      orderBy: this.orderBy(),
      filter: this.filter(),
    }),
    loader: ({ params, abortSignal }) => this.library.listBooks(params, abortSignal),
  });
  booksResponse = linkedSignal({
    source: () => ({
      value: this.booksResource.value(),
      isLoading: this.booksResource.isLoading(),
    }),
    computation: (current, previous): ListBooksResponse | undefined => {
      if (current.isLoading && previous) return previous.value;
      return current.value;
    },
  });
  books = computed(() => this.booksResponse()?.books ?? []);
  totalSize = computed(() => this.booksResponse()?.totalSize ?? 0);

  hasActiveFilter = computed(() => !!this.filterParam());

  readonly displayedColumns = ["title", "author", "read", "actions"] as const;
  paginator = viewChild.required(MatPaginator);
  sort = viewChild.required(MatSort);

  private initialized = false;

  filterEffect = effect(() => {
    this.filterParam();
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
    if (this.initialized) this.skipParam.set(0);
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

  navigateBack(): void {
    this.router.navigate(["/shelves"]);
  }

  openCreateBookDialog(): void {
    const data: CreateBookDialogData = { parent: this.shelfName() };
    this.dialog
      .open(CreateBookDialogComponent, { data, width: "480px" })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.library.createBook(result).then(() => this.booksResource.reload());
        }
      });
  }

  openEditBookDialog(book: Book): void {
    const data: EditBookDialogData = { book };
    this.dialog
      .open(EditBookDialogComponent, { data, width: "480px" })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.library.updateBook(result).then(() => this.booksResource.reload());
        }
      });
  }

  openDeleteBookDialog(book: Book): void {
    const data: DeleteBookDialogData = { bookName: book.name, bookTitle: book.title };
    this.dialog
      .open(DeleteBookDialogComponent, { data, width: "400px" })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.library.deleteBook({ name: book.name }).then(() => this.booksResource.reload());
        }
      });
  }
}
