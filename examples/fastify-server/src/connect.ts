import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { LibraryService, ShelfSchema } from "./gen/library/v1/library_pb.js";

const dummyShelves = new Array(10)
  .fill(0)
  .map((_, i) => create(ShelfSchema, { name: `shelf${i}`, theme: `theme ${i}` }));

export default (router: ConnectRouter) => {
  router.service(LibraryService, {
    listShelves: async () => {
      return {
        shelves: dummyShelves,
        totalSize: dummyShelves.length * 10,
      };
    },
  });
};
