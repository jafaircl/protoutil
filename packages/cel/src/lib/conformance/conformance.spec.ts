import { create, createMutableRegistry, fromJsonString } from '@bufbuild/protobuf';
import { DurationSchema } from '@bufbuild/protobuf/wkt';
import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { join } from 'path';
import { protoDeclToDecl } from '../cel/decls.js';
import { Env, Issues } from '../cel/env.js';
import { protoAsValue, valueAsProto } from '../cel/io.js';
import {
  container,
  crossTypeNumericComparisons,
  declarations,
  EnvOption,
  macros,
  types,
} from '../cel/options.js';
import { Adapter } from '../common/ref/provider.js';
import { RefVal } from '../common/ref/reference.js';
import { StringSource } from '../common/source.js';
import { ErrorRefVal, isErrorRefVal, unwrapError } from '../common/types/error.js';
import { isUnknownRefVal, mergeUnknowns, UnknownRefVal } from '../common/types/unknown.js';
import { AllMacros } from '../parser/macro.js';
import { TestAllTypesSchema as TestAllTypesSchemaProto2 } from '../protogen-exports/index_conformance_proto2.js';
import { TestAllTypesSchema as TestAllTypesSchemaProto3 } from '../protogen-exports/index_conformance_proto3.js';
import { SimpleTestFileSchema } from '../protogen/cel/expr/conformance/test/simple_pb.js';
import { ExprValue, ExprValueSchema } from '../protogen/cel/expr/eval_pb.js';

const skippedSuites: string[] = [
  'bindings_ext',
  'block_ext',
  'dynamic',
  'encoders_ext',
  'enums',
  'macros2',
  'math_ext',
  'optionals',
  'plumbing',
  'proto2',
  'proto2_ext',
  'proto3',
  'string_ext',
  'type_deduction',
  'unknowns',
];

const skippedTests: string[] = [
  'basic - self_eval_nonzeroish - self_eval_unicode_escape_eight',
  'basic - self_eval_nonzeroish - self_eval_bytes_invalid_utf8', // bytes parsing
  'basic - variables - self_eval_unbound_lookup', // throws 'no such attribute(s): x' instead
  'basic - functions - unbound', // throws 'no such overload: f_unknown' instead

  'comparisons - eq_literal - eq_bytes', // incorrect result
  'comparisons - eq_literal - eq_dyn_json_null', // incorrect result
  'comparisons - eq_wrapper - eq_proto2_any_unpack_equal', // illegal tag: field no 830 wire type 6
  'comparisons - eq_wrapper - eq_proto2_any_unpack_not_equal', // illegal tag: field no 0 wire type 0
  'comparisons - eq_wrapper - eq_proto2_any_unpack_bytewise_fallback_not_equal', // premature EOF
  'comparisons - eq_wrapper - eq_proto2_any_unpack_bytewise_fallback_equal', // premature EOF
  'comparisons - eq_wrapper - eq_proto3_any_unpack_equal', // illegal tag: field no 830 wire type 6
  'comparisons - eq_wrapper - eq_proto3_any_unpack_not_equal', // illegal tag: field no 0 wire type 0
  'comparisons - eq_wrapper - eq_proto3_any_unpack_bytewise_fallback_not_equal', // premature EOF
  'comparisons - eq_wrapper - eq_proto3_any_unpack_bytewise_fallback_equal', // premature EOF
  'comparisons - ne_literal - not_ne_bytes', // incorrect result
  'comparisons - ne_literal - ne_proto2_any_unpack', // illegal tag: field no 830 wire type 6
  'comparisons - ne_literal - ne_proto2_any_unpack_bytewise_fallback', // premature EOF
  'comparisons - ne_literal - ne_proto3_any_unpack', // illegal tag: field no 830 wire type 6
  'comparisons - ne_literal - ne_proto3_any_unpack_bytewise_fallback', // premature EOF
  'comparisons - lt_literal - lt_mixed_types_error', // no error
  'comparisons - lt_literal - not_lt_dyn_int_big_lossy_double', // invalid double literal. floats lose precision
  'comparisons - lt_literal - lt_dyn_int_big_lossy_double', // invalid double literal. floats lose precision
  'comparisons - lt_literal - not_lt_dyn_int_small_double', // invalid double literal. floats lose precision
  'comparisons - lt_literal - not_lt_dyn_int_small_lossy_double', // invalid double literal. floats lose precision
  'comparisons - lt_literal - lt_dyn_uint_big_double', // invalid double literal. floats lose precision
  'comparisons - lt_literal - not_lt_dyn_big_double_uint', // invalid double literal. floats lose precision
  'comparisons - lt_literal - not_lt_dyn_big_double_int', // invalid double literal. floats lose precision
  'comparisons - gt_literal - not_gt_bytes_sorting', // incorrect result
  'comparisons - gt_literal - gt_mixed_types_error', // no error
  'comparisons - gt_literal - not_gt_dyn_int_big_double', // invalid double literal. floats lose precision
  'comparisons - gt_literal - gt_dyn_int_small_lossy_double_greater', // invalid double literal. floats lose precision
  'comparisons - gt_literal - not_gt_dyn_uint_big_double', // invalid double literal. floats lose precision
  'comparisons - gt_literal - gt_dyn_big_double_uint', // invalid double literal. floats lose precision
  'comparisons - gt_literal - not_gt_dyn_big_double_int', // invalid double literal. floats lose precision
  'comparisons - lte_literal - lte_mixed_types_error', // no error
  'comparisons - lte_literal - lte_dyn_int_big_double', // invalid double literal. floats lose precision
  'comparisons - lte_literal - not_lte_dyn_int_small_lossy_double_less', // invalid double literal. floats lose precision
  'comparisons - lte_literal - lte_dyn_uint_big_double', // invalid double literal. floats lose precision
  'comparisons - lte_literal - not_lte_dyn_big_double_uint', // invalid double literal. floats lose precision
  'comparisons - lte_literal - lte_dyn_big_double_int', // invalid double literal. floats lose precision
  'comparisons - gte_literal - gte_mixed_types_error', // no error
  'comparisons - gte_literal - gte_dyn_int_big_lossy_double', // invalid double literal. floats lose precision
  'comparisons - gte_literal - not_gte_dyn_int_big_double', // invalid double literal. floats lose precision
  'comparisons - gte_literal - gte_dyn_int_small_lossy_double_equal', // incorrect result
  'comparisons - gte_literal - gte_dyn_int_small_lossy_double_greater', // invalid double literal. floats lose precision
  'comparisons - gte_literal - not_gte_dyn_uint_big_double', // invalid double literal. floats lose precision
  'comparisons - gte_literal - gte_dyn_big_double_uint', // invalid double literal. floats lose precision
  'comparisons - gte_literal - gte_dyn_big_double_int', // invalid double literal. floats lose precision

  'conversions - int - uint_range', // no error
  'conversions - int - double_int_max_range', // invalid double literal. floats lose precision
  'conversions - int - double_int_min_range', // no error
  'conversions - int - double_range', // invalid double literal. scientific notation
  'conversions - string - bytes_unicode', // wrong unicode value
  'conversions - string - bytes_invalid', // no error
  'conversions - uint - double_uint_max_range', // invalid double literal. floats lose precision
  'conversions - uint - double_range_beyond_uint', // invalid double literal. floats lose precision
  'conversions - bool - string_true_badcase', // no error
  'conversions - bool - string_false_badcase', // no error

  'fields - quoted_map_fields - field_access_slash', // unsupported syntax: '`'
  'fields - quoted_map_fields - field_access_dash', // unsupported syntax: '`'
  'fields - quoted_map_fields - field_access_dot', // unsupported syntax: '`'
  'fields - quoted_map_fields - has_field_slash', // unsupported syntax: '`'
  'fields - quoted_map_fields - has_field_dash', // unsupported syntax: '`'
  'fields - quoted_map_fields - has_field_dot', // unsupported syntax: '`'
  'fields - qualified_identifier_resolution - map_key_float', // no error
  'fields - qualified_identifier_resolution - map_key_null', // invalid qualifier type: null_type
  'fields - qualified_identifier_resolution - map_value_repeat_key', // no error
  'fields - qualified_identifier_resolution - map_value_repeat_key_heterogeneous', // no error

  'fp_math - fp_math - fp_overflow_positive', // throws 'overflow' instead
  'fp_math - fp_math - fp_overflow_negative', // throws 'overflow' instead

  'integer_math - int64_math - unary_minus_not_bool', // returns "true" instead of error

  'parse - repeat - select', // returns 0 int64 value instead of empty string
  'parse - nest - message_literal', // returns 0 int64 value instead of empty string

  'string - bytes_concat - left_unit',

  'timestamps - timestamp_conversions - toString_timestamp_nanos', // timestamp out of range error
  'timestamps - duration_converters - get_milliseconds', // only returns milliseconds, not seconds
  'timestamps - timestamp_selectors_tz - getDayOfYear', // throws 'invalid timezone' error
  'timestamps - timestamp_selectors_tz - getDayOfMonth_name_pos', // throws 'invalid timezone' error,
  'timestamps - timestamp_selectors - getMilliseconds', // off by one millisecond
  'timestamps - timestamp_selectors - getDayOfYear', // off by one day

  'wrappers - int32 - to_json', // case undefined
  'wrappers - int64 - to_json_number', // case undefined
  'wrappers - int64 - to_json_string', // case undefined
  'wrappers - uint32 - to_json', // case undefined
  'wrappers - uint64 - to_json_number', // case undefined
  'wrappers - uint64 - to_json_string', // case undefined
  'wrappers - float - to_json', // case undefined
  'wrappers - double - to_json', // case undefined
  'wrappers - bytes - to_json', // field type conversion error
  'wrappers - list_value - literal_to_any', // field type conversion error
  'wrappers - struct - literal_to_any', // field type conversion error
  'wrappers - field_mask - to_json', // field type conversion error
  'wrappers - duration - to_json', // field type conversion error
  'wrappers - timestamp - to_json', // field type conversion error
  'wrappers - empty - to_json', // field type conversion error
];

function isSkippedSuite(testFileName: string, skippedSuites: string[]): boolean {
  for (const skipped of skippedSuites) {
    if (testFileName.includes(skipped)) {
      return true;
    }
  }
  return false;
}

describe('conformance', () => {
  const files = globSync(join(__dirname, 'testdata', '*.json'));
  for (const filePath of files) {
    if (isSkippedSuite(filePath, skippedSuites)) {
      // console.log(`Skipping ${filePath}`);
      continue;
    }
    const file = readFileSync(filePath);
    const testFile = fromJsonString(SimpleTestFileSchema, file.toString(), {
      registry: createMutableRegistry(
        DurationSchema,
        TestAllTypesSchemaProto2,
        TestAllTypesSchemaProto3
      ),
      ignoreUnknownFields: true,
    });
    for (const section of testFile.section) {
      for (const test of section.test) {
        const testName = `${testFile.name} - ${section.name} - ${test.name}`;
        if (skippedTests.includes(testName)) {
          continue;
        }
        it(testName, () => {
          let env: Env;
          if (test.disableMacros) {
            env = new Env();
          } else {
            env = new Env(macros(...AllMacros));
          }
          const src = new StringSource(test.expr, test.name);
          let ast = env.parseSource(src);
          if (ast instanceof Issues) {
            throw ast.err();
          }
          expect(ast).not.toBeInstanceOf(Issues);

          const opts: EnvOption[] = [
            crossTypeNumericComparisons(true),
            types(TestAllTypesSchemaProto2, TestAllTypesSchemaProto3),
          ];
          if (test.container) {
            opts.push(container(test.container));
          }
          for (const d of test.typeEnv) {
            const decl = protoDeclToDecl(d);
            if (decl instanceof Error) {
              throw decl;
            }
            opts.push(declarations(decl));
          }
          env = env.extend(...opts);
          if (!test.disableCheck) {
            ast = env.check(ast);
            if (ast instanceof Issues) {
              throw ast.err();
            }
            expect(ast).not.toBeInstanceOf(Issues);
          }
          // if pb.GetCheckOnly() {
          // 	m, ok := pb.GetResultMatcher().(*testpb.SimpleTest_TypedResult)
          // 	if !ok {
          // 		t.Fatalf("unexpected matcher kind for check only test: %T", pb.GetResultMatcher())
          // 	}
          // 	if diff, err := diffType(m.TypedResult.DeducedType, ast.OutputType()); err != nil || diff != "" {
          // 		t.Errorf("env.Check() output type err: %v (-want +got):\n%s", err, diff)
          // 	}
          // 	return
          // }
          const program = env.program(ast);
          if (program instanceof Error) {
            throw program;
          }
          expect(program).not.toBeInstanceOf(Error);
          const act: Record<string, RefVal> = {};
          for (const [k, v] of Object.entries(test.bindings)) {
            act[k] = exprValueToRefValue(env.CELTypeAdapter(), v);
          }
          const [ret, , err] = program.eval(act);
          switch (test.resultMatcher.case) {
            case 'value':
              if (err) {
                throw err.value();
              }
              const val = refValueToExprValue(ret!);
              expect(val?.kind.value).toEqual(test.resultMatcher.value);
              break;
            case 'evalError':
              if (err === null && isErrorRefVal(ret)) {
                expect(unwrapError(ret)).toEqual(test.resultMatcher.value);
              } else {
                if (!err) {
                  console.error('Expected an error, but got none');
                  console.error('Return value:', ret);
                }
                expect(err).toBeInstanceOf(ErrorRefVal);
                // TODO: cel-go doesn't seem to check the actual message
                // expect(unwrapError(err!).message).toContain(
                //   test.resultMatcher.value.errors[0].message
                // );
              }
              break;
            default:
              throw new Error(`unknown result matcher: ${test.resultMatcher.case}`);
          }
        });
      }
    }
  }
});

function refValueToExprValue(res: RefVal): ExprValue | null {
  if (isUnknownRefVal(res)) {
    return create(ExprValueSchema, {
      kind: {
        case: 'unknown',
        // TODO: is this right
        value: { exprs: res.value() as unknown as bigint[] },
      },
    });
  }
  const v = valueAsProto(res);
  if (!v) {
    throw new Error(`valueAsProto failed for refVal: ${res}`);
  }
  return create(ExprValueSchema, {
    kind: { case: 'value', value: v },
  });
}

function exprValueToRefValue(adapter: Adapter, ev: ExprValue): RefVal {
  switch (ev.kind.case) {
    case 'value':
      return protoAsValue(adapter, ev.kind.value);
    case 'error':
      // An error ExprValue is a repeated set of statuspb.Status
      // messages, with no convention for the status details.
      // To convert this to a types.Err, we need to convert
      // these Status messages to a single string, and be
      // able to decompose that string on output so we can
      // round-trip arbitrary ExprValue messages.
      // TODO(jimlarson) make a convention for this.
      return new ErrorRefVal('XXX add details later');
    case 'unknown':
      let unk: UnknownRefVal | null = null;
      for (const id of ev.kind.value.exprs) {
        if (!unk) {
          unk = new UnknownRefVal(id);
        }
        unk = mergeUnknowns(new UnknownRefVal(id), unk);
      }
      return unk as UnknownRefVal;
    default:
      throw new Error(`unknown ExprValue kind: ${ev.kind.case}`);
  }
}
