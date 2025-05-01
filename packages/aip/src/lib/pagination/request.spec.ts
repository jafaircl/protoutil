import { create } from '@bufbuild/protobuf';
import { compileMessage } from '@bufbuild/protocompile';
import { calculateRequestCheckSum } from './request.js';

const TestPaginationRequestSchema = compileMessage(`
  syntax = "proto3";
  
  message TestPaginationRequest {
    string parent = 1;
  
    int32 page_size = 2;
  
    string page_token = 3;
  
    int32 skip = 4;
  }
`);

describe('request', () => {
  it('should calculate checksum', () => {
    const checkSum = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1' })
    );
    expect(checkSum).not.toBe(0);
  });

  it('should calculate a different checksum for different requests', () => {
    const checkSum1 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1' })
    );
    const checkSum2 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/2' })
    );
    expect(checkSum1).not.toEqual(checkSum2);
  });

  it('should calculate the same checksum for the same request', () => {
    const checkSum1 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1' })
    );
    const checkSum2 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1' })
    );
    expect(checkSum1).toEqual(checkSum2);
  });

  it('should calculate the same checksum for fields with different pageTokens', () => {
    const checkSum1 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1', pageToken: 'a' })
    );
    const checkSum2 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1', pageToken: 'b' })
    );
    expect(checkSum1).toEqual(checkSum2);
  });

  it('should calculate the same checksum for fields with different pageSizes', () => {
    const checkSum1 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1', pageSize: 1 })
    );
    const checkSum2 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1', pageSize: 2 })
    );
    expect(checkSum1).toEqual(checkSum2);
  });

  it('should calculate the same checksum for fields with different skips', () => {
    const checkSum1 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1', skip: 1 })
    );
    const checkSum2 = calculateRequestCheckSum(
      TestPaginationRequestSchema,
      create(TestPaginationRequestSchema, { parent: 'shelves/1', skip: 2 })
    );
    expect(checkSum1).toEqual(checkSum2);
  });
});
