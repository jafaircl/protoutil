import { Decl } from '@buf/googleapis_googleapis.bufbuild_es/google/api/expr/v1alpha1/checked_pb.js';
import {
  EnumDecl,
  newFunctionDeclaration,
  newFunctionOverload,
  newIdentDeclaration,
} from './declarations.js';
import { standardFunctionDeclarations } from './functions.js';
import { parseFilter } from './helpers.js';
import { TypeBool, typeList, TypeString, TypeTimestamp } from './types.js';
import { Unparser } from './unparser.js';

describe('unparser', () => {
  const testCases: {
    name: string;
    filter: string;
    declarations: (Decl | EnumDecl)[];
    expected: string;
    errorContains?: string;
  }[] = [
    {
      name: 'simple flag',
      filter: 'read ',
      declarations: [newIdentDeclaration('read', TypeBool)],
      expected: 'read',
    },
    {
      name: 'negated simple flag',
      filter: 'NOT read',
      declarations: [...standardFunctionDeclarations(), newIdentDeclaration('read', TypeBool)],
      expected: 'NOT read',
    },
    {
      name: 'string equality and flag',
      filter: `author = "Karin Boye" AND    NOT read`,
      declarations: [
        ...standardFunctionDeclarations(),
        newIdentDeclaration('author', TypeString),
        newIdentDeclaration('read', TypeBool),
      ],
      expected: `(author = "Karin Boye") AND (NOT read)`,
    },
    {
      name: 'string negated equality',
      filter: `author   != "Karin Boye"`,
      declarations: [
        ...standardFunctionDeclarations(),
        newIdentDeclaration('author', TypeString),
        newIdentDeclaration('read', TypeBool),
      ],
      expected: `author != "Karin Boye"`,
    },
    {
      name: 'timestamp',
      filter: `create_time > timestamp("2021-02-14T14:49:34+01:00")`,
      declarations: [
        ...standardFunctionDeclarations(),
        newIdentDeclaration('create_time', TypeTimestamp),
      ],
      expected: `create_time > timestamp("2021-02-14T14:49:34+01:00")`,
    },
    // TODO: enums
    // {
    //   name: 'enum equality',
    //   filter: `example_enum = FOO`,
    //   declarations: [newEnumDeclaration('example_num', TestAllTypes_NestedEnumSchema)],
    //   expected: `example_enum = FOO`,
    // },
    // {
    //   name: 'enum negated equality',
    //   filter: `example_enum != BAR`,
    //   declarations: [newEnumDeclaration('example_num', TestAllTypes_NestedEnumSchema)],
    //   expected: `example_enum != BAR`,
    // },
    {
      name: 'has: repeated string',
      filter: `repeated_string:"value"`,
      declarations: [
        ...standardFunctionDeclarations(),
        newIdentDeclaration('repeated_string', typeList(TypeString)),
      ],
      expected: `repeated_string:"value"`,
    },
    // {
    //   name: 'empty filter',
    //   filter: ``,
    //   declarations: [],
    //   expected: ``,
    // },
    // ebnf examples
    {
      name: 'ebnf 1',
      filter: `a b AND c AND d`,
      declarations: [
        ...standardFunctionDeclarations(),
        newIdentDeclaration('a', TypeBool),
        newIdentDeclaration('b', TypeBool),
        newIdentDeclaration('c', TypeBool),
        newIdentDeclaration('d', TypeBool),
      ],
      expected: `((a b) AND c) AND d`,
    },
    {
      name: 'ebnf 2',
      filter: `New York Giants OR Yankees`,
      declarations: [...standardFunctionDeclarations()],
      expected: `(New York) (Giants OR Yankees)`,
    },
    {
      name: 'ebnf 3',
      filter: `a < 10 OR a >= 100`,
      declarations: [...standardFunctionDeclarations()],
      expected: `(a < 10) OR (a >= 100)`,
    },
    {
      name: 'ebnf 4',
      filter: `NOT (a OR b)`,
      declarations: [...standardFunctionDeclarations()],
      expected: `NOT (a OR b)`,
    },
    {
      name: 'ebnf 5',
      filter: `-file:".java"`,
      declarations: [...standardFunctionDeclarations()],
      expected: `NOT (file:".java")`,
    },
    {
      name: 'ebnf 6',
      filter: `-30`,
      declarations: [...standardFunctionDeclarations()],
      expected: `-30`,
    },
    {
      name: 'ebnf 7',
      filter: `package=com.google`,
      declarations: [...standardFunctionDeclarations()],
      expected: `package = com.google`,
    },
    {
      name: 'ebnf 8',
      filter: `msg != 'hello'`,
      declarations: [...standardFunctionDeclarations()],
      expected: `msg != "hello"`,
    },
    {
      name: 'ebnf 9',
      filter: `1 > 0`,
      declarations: [...standardFunctionDeclarations()],
      expected: `1 > 0`,
    },
    {
      name: 'ebnf 10',
      filter: `2.5 >= 2.4`,
      declarations: [...standardFunctionDeclarations()],
      expected: `2.5 >= 2.4`,
    },
    {
      name: 'ebnf 11',
      filter: `yesterday < request.time`,
      declarations: [...standardFunctionDeclarations()],
      expected: `yesterday < request.time`,
    },
    {
      name: 'ebnf 12',
      filter: `experiment.rollout <= cohort(request.user)`,
      declarations: [...standardFunctionDeclarations()],
      expected: `experiment.rollout <= cohort(request.user)`,
    },
    // TODO: returns `map:"key"`
    // {
    //   name: 'ebnf 13',
    //   filter: `map:key`,
    //  declarations: [...standardFunctionDeclarations()],
    //   expected: `map:key`,
    // },
    {
      name: 'ebnf 14',
      filter: `prod`,
      declarations: [...standardFunctionDeclarations()],
      expected: `prod`,
    },
    {
      name: 'ebnf 15',
      filter: `expr.type_map.1.type`,
      declarations: [...standardFunctionDeclarations()],
      expected: `expr.type_map.1.type`,
    },
    {
      name: 'ebnf 16',
      filter: `regex(m.key, '^.*prod.*$')`,
      declarations: [...standardFunctionDeclarations()],
      expected: `regex(m.key, "^.*prod.*$")`,
    },
    {
      name: 'ebnf 17',
      filter: `math.mem('30mb')`,
      declarations: [...standardFunctionDeclarations()],
      expected: `math.mem("30mb")`,
    },
    // TODO: member calls do not work like expected
    {
      name: 'ebnf 18',
      filter: `(msg.endsWith('world') AND retries < 10)`,
      declarations: [
        ...standardFunctionDeclarations(),
        newIdentDeclaration('msg', TypeString),
        newFunctionDeclaration(
          'msg.endsWith',
          newFunctionOverload('msg.endsWith', TypeBool, TypeString, TypeString)
        ),
      ],
      expected: `msg.endsWith("world") AND (retries < 10)`,
    },
  ];
  for (const tc of testCases) {
    it(`unparses ${tc.name}`, () => {
      const parsed = parseFilter(tc.filter);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const unparser = new Unparser(parsed.expr!);
      if (tc.errorContains) {
        expect(() => unparser.unparse()).toThrow(tc.errorContains);
        return;
      }
      const result = unparser.unparse();
      expect(result).toEqual(tc.expected);
    });
  }
});
