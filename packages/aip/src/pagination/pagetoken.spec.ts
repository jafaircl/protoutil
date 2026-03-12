import { create } from "@bufbuild/protobuf";
import { compileMessage } from "@bufbuild/protocompile";
import { describe, expect, it } from "vitest";
import { decode, encode, PageToken, parse } from "./pagetoken.js";

const TestPaginationRequestSchema = compileMessage(`
  syntax = "proto3";

  message TestPaginationRequest {
    string parent = 1;

    int32 page_size = 2;

    string page_token = 3;

    int32 skip = 4;
  }
`);

describe("pagetoken", () => {
  it("should encode and decode page token struct", () => {
    const token = new PageToken(10, 123);
    const encoded = encode(token);
    const decoded = decode(encoded);
    expect(decoded).toEqual(token);
  });

  it("encode should be pure", () => {
    expect(encode(new PageToken(20, 789))).toEqual(encode(new PageToken(20, 789)));
  });

  it("encode should be idempotent wrt the PageToken", () => {
    const token = new PageToken(30, 456);
    const encoded = encode(token);
    expect(encode(token)).toEqual(encoded);
  });

  it("encode should return different strings for different PageTokens", () => {
    const token1 = new PageToken(40, 123);
    const encoded1 = encode(token1);
    const token2 = new PageToken(50, 345);
    const encoded2 = encode(token2);
    expect(encoded1).not.toEqual(encoded2);
  });

  it("decode should throw an error if invalid token", () => {
    const token = "invalid_token";
    expect(() => decode(token)).toThrow("invalid page token");
  });

  it("decode should return a PageToken with 0 offset and empty checksum if the encoded string does not have them", () => {
    const token = Buffer.from(JSON.stringify({})).toString("base64");
    const decoded = decode(token);
    expect(decoded).toEqual(new PageToken(0, 0));
  });

  it("parse - valid checksums", () => {
    const request1 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 10,
    });
    const pageToken1 = parse(TestPaginationRequestSchema, request1);
    const request2 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 20,
      pageToken: pageToken1.next(10).toString(),
    });
    const pageToken2 = parse(TestPaginationRequestSchema, request2);
    expect(pageToken2.offset).toEqual(10);
    const request3 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 50,
      pageToken: pageToken2.next(20).toString(),
    });
    const pageToken3 = parse(TestPaginationRequestSchema, request3);
    expect(pageToken3.offset).toEqual(30);
  });

  it("parse - skip - docs example 1", () => {
    // From https://google.aip.dev/158:
    // A request with no page token and a skip value of 30 returns a single
    // page of results starting with the 31st result.
    const request = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      skip: 30,
    });
    const pageToken = parse(TestPaginationRequestSchema, request);
    expect(pageToken.offset).toEqual(30);
  });

  it("parse - skip - docs example 2", () => {
    // From https://google.aip.dev/158:
    // A request with a page token corresponding to the 51st result (because
    // the first 50 results were returned on the first page) and a skip value
    // of 30 returns a single page of results starting with the 81st result.
    const request1 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 50,
    });
    const pageToken1 = parse(TestPaginationRequestSchema, request1);
    const request2 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      skip: 30,
      pageSize: 50,
      pageToken: pageToken1.next(50).toString(),
    });
    const pageToken2 = parse(TestPaginationRequestSchema, request2);
    expect(pageToken2.offset).toEqual(80);
  });

  it("parse - skip - handle empty token with skip", () => {
    const request1 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      skip: 30,
      pageSize: 20,
    });
    const pageToken1 = parse(TestPaginationRequestSchema, request1);
    expect(pageToken1.offset).toEqual(30);
  });

  it("parse - skip - handle existing token with another skip", () => {
    const request1 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      skip: 50,
      pageSize: 20,
    });
    const pageToken1 = parse(TestPaginationRequestSchema, request1);
    expect(pageToken1.offset).toEqual(50);
    const request2 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      skip: 30,
      pageSize: 0,
      pageToken: pageToken1.toString(),
    });
    const pageToken2 = parse(TestPaginationRequestSchema, request2);
    const pageToken3 = pageToken2.next(0);
    expect(pageToken3.offset).toEqual(80);
  });

  it("parse - skip - handle existing token with pagesize and skip", () => {
    const request1 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      skip: 50,
      pageSize: 20,
    });
    const pageToken1 = parse(TestPaginationRequestSchema, request1);
    expect(pageToken1.offset).toEqual(50);

    const request2 = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      skip: 30,
      pageSize: 20,
      pageToken: pageToken1.toString(),
    });
    const pageToken2 = parse(TestPaginationRequestSchema, request2);
    const pageToken3 = pageToken2.next(20);
    expect(pageToken3.offset).toEqual(100);
  });

  it("invalid format", () => {
    const request = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 10,
      pageToken: "invalid",
    });
    expect(() => parse(TestPaginationRequestSchema, request)).toThrow("invalid page token");
  });

  it("invalid checksum", () => {
    const request = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 10,
      pageToken: encode(new PageToken(100, 1234)),
    });
    expect(() => parse(TestPaginationRequestSchema, request)).toThrow("checksum mismatch");
  });

  it("previous should not return negative offset", () => {
    const request = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 10,
    });
    const pageToken = parse(TestPaginationRequestSchema, request);
    const previousPageToken = pageToken.previous(10);
    expect(previousPageToken.offset).toEqual(0);
  });

  it("previous should return correct offset", () => {
    const request = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 10,
    });
    const pageToken = parse(TestPaginationRequestSchema, request);
    const nextPageToken = pageToken.next(10);
    expect(nextPageToken.offset).toEqual(10);
    const previousPageToken = nextPageToken.previous(10);
    expect(previousPageToken.offset).toEqual(0);
  });

  it("previous should return correct offset with skip and pageSize", () => {
    const request = create(TestPaginationRequestSchema, {
      parent: "shelves/1",
      pageSize: 10,
      skip: 30,
    });
    const pageToken = parse(TestPaginationRequestSchema, request);
    const nextPageToken = pageToken.next(10);
    expect(nextPageToken.offset).toEqual(40);
    const previousPageToken = nextPageToken.previous(10);
    expect(previousPageToken.offset).toEqual(30);
  });

  it("toString should return the same string for the same PageToken", () => {
    const token1 = new PageToken(50, 789);
    const token2 = new PageToken(50, 789);
    expect(token1.toString()).toEqual(token2.toString());
  });
});
