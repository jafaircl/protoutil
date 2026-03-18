import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { parse } from "@protoutil/aip/orderby";
import { LibraryService, ShelfSchema } from "./gen/library/v1/library_pb.js";
import { db as sqlitedb } from "./kysely.js";

const dummyShelves = new Array(10)
  .fill(0)
  .map((_, i) => create(ShelfSchema, { name: `shelf${i}`, theme: `theme ${i}` }));

export default (router: ConnectRouter) => {
  router.service(LibraryService, {
    listShelves: async (req) => {
      const shelves = await sqlitedb.selectFrom("library_v1_shelf").selectAll().execute();
      console.log({ shelves });
      const orderBy = parse(req.orderBy);
      if (orderBy.fields.length > 0) {
        console.log(
          `Ordering by ${orderBy.fields[0].path} in ${orderBy.fields[0].desc ? "descending" : "ascending"} order`,
        );
      }
      return {
        shelves: dummyShelves,
        totalSize: dummyShelves.length * 10,
      };
    },
  });
};
