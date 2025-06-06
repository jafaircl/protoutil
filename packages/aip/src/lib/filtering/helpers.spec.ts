import { isMessage } from '@bufbuild/protobuf';
import { CheckedExprSchema } from '../gen/google/api/expr/v1alpha1/checked_pb.js';
import { ParsedExprSchema } from '../gen/google/api/expr/v1alpha1/syntax_pb.js';
import { newIdentDeclaration } from './declarations.js';
import { extendStandardFilterDeclarations, parseAndCheckFilter, parseFilter } from './helpers.js';
import { TypeInt } from './types.js';

describe('helpers', () => {
  it('parse should return a ParsedExpr object', () => {
    const parsed = parseFilter('a = 1');
    expect(isMessage(parsed, ParsedExprSchema)).toBeTruthy();
  });

  it('parse should throw an error for invalid input', () => {
    expect(() => parseFilter('=')).toThrowError('unexpected token =');
  });

  it('parseAndCheck should return a CheckedExpr object', () => {
    const checked = parseAndCheckFilter(
      'a = 1',
      extendStandardFilterDeclarations([newIdentDeclaration('a', TypeInt)])
    );
    expect(isMessage(checked, CheckedExprSchema)).toBeTruthy();
  });

  it('parseAndCheck should throw an error for invalid input', () => {
    expect(() => parseAndCheckFilter('a = 1')).toThrowError(`undeclared identifier 'a'`);
  });
});
