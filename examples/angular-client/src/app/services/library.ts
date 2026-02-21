import { computed, Injectable, signal } from "@angular/core";
import { create, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { createValidator } from "@bufbuild/protovalidate";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  LibraryService as ConnectLibraryService,
  CreateShelfRequestSchema,
  DeleteShelfRequestSchema,
  GetShelfRequestSchema,
  ListShelvesRequestSchema,
  type ListShelvesResponse,
  type Shelf,
} from "../../gen/library/v1/library_pb";

@Injectable({
  providedIn: "root",
})
export class LibraryService {
  private baseUrl = signal("http://localhost:8080");
  private transport = computed(() => {
    return createConnectTransport({
      baseUrl: this.baseUrl(),
    });
  });
  private client = computed(() => {
    return createClient(ConnectLibraryService, this.transport());
  });
  private validator = createValidator();
  private timeoutMs = 1000 * 60; // 1 minute

  private prepareRequest<Desc extends DescMessage>(schema: Desc, input: MessageInitShape<Desc>) {
    const request = create(schema, input);
    const validationResult = this.validator.validate(schema, request);
    switch (validationResult.kind) {
      case "error":
      case "invalid":
        throw validationResult.error;
      default:
        return request;
    }
  }

  async createShelf(
    input: MessageInitShape<typeof CreateShelfRequestSchema>,
    signal?: AbortSignal,
  ): Promise<Shelf> {
    const request = this.prepareRequest(CreateShelfRequestSchema, input);
    return this.client().createShelf(request, {
      signal,
      timeoutMs: this.timeoutMs,
    });
  }

  async getShelf(
    input: MessageInitShape<typeof GetShelfRequestSchema>,
    signal?: AbortSignal,
  ): Promise<Shelf> {
    const request = this.prepareRequest(GetShelfRequestSchema, input);
    return this.client().getShelf(request, {
      signal,
      timeoutMs: this.timeoutMs,
    });
  }

  async listShelves(
    input: MessageInitShape<typeof ListShelvesRequestSchema>,
    signal?: AbortSignal,
  ): Promise<ListShelvesResponse> {
    const request = this.prepareRequest(ListShelvesRequestSchema, input);
    return await this.client().listShelves(request, {
      signal,
      timeoutMs: this.timeoutMs,
    });
  }

  async deleteShelf(
    input: MessageInitShape<typeof DeleteShelfRequestSchema>,
    signal?: AbortSignal,
  ): Promise<void> {
    const request = this.prepareRequest(DeleteShelfRequestSchema, input);
    await this.client().deleteShelf(request, {
      signal,
      timeoutMs: this.timeoutMs,
    });
  }
}
