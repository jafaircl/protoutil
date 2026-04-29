/**
 * ConnectRPC service implementation for the Library API.
 *
 * Implements 9 of 11 LibraryService RPCs using @protoutil/repo for
 * database access. Shelves are persisted in Postgres, Books in MongoDB —
 * the repository API is identical for both.
 *
 * This implementation also publishes events via @protoutil/pubsub when
 * resources are created, enabling downstream event handlers.
 */

import { randomUUID } from "node:crypto";
import { createValidator } from "@bufbuild/protovalidate";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { StatusError } from "@protoutil/aip/errors";
import { parse as parsePageToken } from "@protoutil/aip/pagination";
import { getResourceNamePatterns, print, scan } from "@protoutil/aip/resourcename";
import {
  BookSchema,
  LibraryService,
  ListBooksRequestSchema,
  ListShelvesRequestSchema,
  ShelfSchema,
} from "./gen/library/v1/library_pb.js";
import { getEventsPublisher } from "./pubsub.js";
import { bookRepo, shelfRepo } from "./repositories.js";

// Read resource name patterns directly from the proto annotations
const SHELF_PATTERN = getResourceNamePatterns(ShelfSchema)![0]; // "shelves/{shelf_id}"
const BOOK_PATTERN = getResourceNamePatterns(BookSchema)![0]; // "shelves/{shelf}/books/{book}"

const validator = createValidator();

/**
 * Validate a protobuf request message using protovalidate.
 * Throws a ConnectError with INVALID_ARGUMENT if validation fails.
 */
function validateRequest<T extends Parameters<typeof validator.validate>[1]>(
  schema: Parameters<typeof validator.validate>[0],
  message: T,
) {
  const result = validator.validate(schema, message);
  if (result.kind === "error" || result.kind === "invalid") {
    throw new ConnectError(result.error.message, Code.InvalidArgument);
  }
}

/**
 * Convert @protoutil/aip StatusErrors to ConnectRPC errors.
 * Both use the gRPC status code space, so codes map directly.
 */
function toConnectError(err: unknown): never {
  if (err instanceof StatusError) {
    throw new ConnectError(err.message, err.code as number);
  }
  throw err;
}

export default (router: ConnectRouter) => {
  router.service(LibraryService, {
    // ─── Shelf RPCs (backed by Postgres) ──────────────────────────

    createShelf: async (req) => {
      validateRequest(LibraryService.method.createShelf.input, req);
      const name = print(SHELF_PATTERN, { shelf_id: randomUUID() });
      let created: typeof req.shelf;
      try {
        created = await shelfRepo.create({ name, theme: req.shelf!.theme });
      } catch (err) {
        toConnectError(err);
      }

      // Publish a shelf.created event for downstream handlers
      await getEventsPublisher().shelfCreated({
        name,
        theme: created!.theme,
      });

      return created!;
    },

    getShelf: async (req) => {
      validateRequest(LibraryService.method.getShelf.input, req);
      try {
        return await shelfRepo.get({ name: req.name });
      } catch (err) {
        toConnectError(err);
      }
    },

    listShelves: async (req) => {
      validateRequest(LibraryService.method.listShelves.input, req);
      // parsePageToken handles page_token + skip in a single call
      const pageToken = parsePageToken(ListShelvesRequestSchema, req);
      const result = await shelfRepo.list(req.filter || undefined, {
        pageSize: req.pageSize || undefined,
        pageToken,
        orderBy: req.orderBy || undefined,
        showTotalSize: true,
      });
      return {
        shelves: result.results,
        nextPageToken: result.nextPageToken,
        totalSize: result.totalSize ?? 0,
      };
    },

    deleteShelf: async (req) => {
      validateRequest(LibraryService.method.deleteShelf.input, req);
      try {
        await shelfRepo.delete({ name: req.name });
      } catch (err) {
        toConnectError(err);
      }

      // Cascade-delete books on this shelf (cross-database: Postgres → MongoDB)
      const { shelf_id } = scan(req.name, SHELF_PATTERN);
      const bookList = await bookRepo.list(`name = "shelves/${shelf_id}/books/*"`);
      for (const book of bookList.results) {
        await bookRepo.delete({ name: book.name });
      }

      return {};
    },

    // ─── Book RPCs (backed by MongoDB) ────────────────────────────

    createBook: async (req) => {
      validateRequest(LibraryService.method.createBook.input, req);

      // Verify the parent shelf exists (cross-database lookup: MongoDB → Postgres)
      try {
        await shelfRepo.get({ name: req.parent });
      } catch (err) {
        toConnectError(err);
      }

      const { shelf_id } = scan(req.parent, SHELF_PATTERN);
      const name = print(BOOK_PATTERN, { shelf: shelf_id, book: randomUUID() });
      let created: typeof req.book;
      try {
        created = await bookRepo.create({
          name,
          author: req.book!.author,
          title: req.book!.title,
          read: req.book!.read,
        });
      } catch (err) {
        toConnectError(err);
      }

      // Publish a book.created event for downstream handlers
      await getEventsPublisher().bookCreated({
        name,
        shelf: req.parent,
        title: created!.title,
        author: created!.author,
      });

      return created!;
    },

    getBook: async (req) => {
      validateRequest(LibraryService.method.getBook.input, req);
      try {
        return await bookRepo.get({ name: req.name });
      } catch (err) {
        toConnectError(err);
      }
    },

    listBooks: async (req) => {
      validateRequest(LibraryService.method.listBooks.input, req);

      // Verify the parent shelf exists
      try {
        await shelfRepo.get({ name: req.parent });
      } catch (err) {
        toConnectError(err);
      }

      // Scope books to the parent shelf using the resource name prefix
      const { shelf_id } = scan(req.parent, SHELF_PATTERN);
      let filter = `name = "shelves/${shelf_id}/books/*"`;
      if (req.filter) {
        filter = `${filter} AND (${req.filter})`;
      }

      const pageToken = parsePageToken(ListBooksRequestSchema, req);
      const result = await bookRepo.list(filter, {
        pageSize: req.pageSize || undefined,
        pageToken,
        orderBy: req.orderBy || undefined,
        showTotalSize: true,
      });
      return {
        books: result.results,
        nextPageToken: result.nextPageToken,
        totalSize: result.totalSize ?? 0,
      };
    },

    deleteBook: async (req) => {
      validateRequest(LibraryService.method.deleteBook.input, req);
      try {
        await bookRepo.delete({ name: req.name });
        // Publish a book.created event for downstream handlers
        await getEventsPublisher().bookDeleted({
          name: req.name,
        });
      } catch (err) {
        toConnectError(err);
      }
      return {};
    },

    updateBook: async (req) => {
      validateRequest(LibraryService.method.updateBook.input, req);
      try {
        return await bookRepo.update({ name: req.book!.name }, req.book!, {
          updateMask: req.updateMask,
        });
      } catch (err) {
        toConnectError(err);
      }
    },
  });
};
