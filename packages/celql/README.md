# @protoutil/celql

A set of utilities for validating and converting CEL expressions to SQL WHERE clauses to be used in queries.

## Install

Use your configured package manager to install the `@protoutil/celql` package. i.e. install from npm using `npm install @protoutil/celql`.

## Usage

First, you will need to let the CEL environment know about your columns. This can be done by defining a CEL `Env` instance. You can define each column with its CEL-equivalent type individually:

```typescript
import { variable } from '@bearclaw/cel';
import { DefaultEnv } from '@protoutil/celql';

const env = new DefaultEnv(
  variable('name', StringType),
  ...
);
```

Or, if you have a protobuf representation of your database table, you can define them all in one go with `declareContextProto`:

```typescript

import { declareContextProto } from '@bearclaw/cel';
import { DefaultEnv } from '@protoutil/celql';
import { MySchema } from './gen/myschema_pb.js';

const env = new DefaultEnv(
  declareContextProto(MySchema),
  ...
);
```

Now, you can convert your CEL expressions to SQL:

```typescript
import { postgres } from '@protoutil/celql';

const whereClause = postgres('my_column == "foo"', env);
// Will output { sql: 'my_column = $1', vars: ['foo'] }
```

SQL output is separated into a query clause and an array of variables. This is done so user input can be sanitized using a parameterized query. The exception is that `Timestamp` values will be printed as ISO strings. String parsing of `Timestamp` values will throw an error with invalid inputs which should disallow any unsanitized user input.

If you want to validate your expression before sending it to the server to be converted, you can do that with the `compile` function:

```typescript
import { compile } from '@protoutil/celql';

try {
  // This will fail because it uses an invalid column and does not evaluate to a boolean expression
  compile('invalid_column + 1', env);
} catch (e) {
  // Handle your error
}
```

### Expressions

The `CelqlEnv` supports most default CEL expressions. But, the purpose of this library is to translate expressions to SQL clauses. As a result, some functionality is either not implemented or may have different signatures. There are also built-in SQL-specific functions.

#### Not Implemented

TODO: Document functionality that is not implemented

#### Modified Functions

##### String Functions

The string `contains`, `endsWith`, and `startsWith` member functions can optionally take a boolean `ignoreCase` parameter to control case sensitivity. Passing `true` will make their searches case insensitive. It is important to note that this parameter may cause the `LOWER` function to be called. So, creating a lower-case index of string columns may significantly improve performance for these queries.

```typescript
my_column.contains('foo', true); // Will output a case-insensitive query i.e. ILIKE for PostgreSQL
my_column.contains('foo', false); // Will output a case-sensitive query i.e. LIKE for PostgreSQL
```

#### New Functions

##### Date

**Signatures:**

- `date(date) -> date` (identity)
- `date(string) -> date` converts a string to a `Date`
- `date(timestamp) -> date` converts a `Timestamp` to a `Date`

```typescript
date(my_column) == date('2023-10-01'); // Will output { sql: 'DATE(my_column) = DATE($1)', vars: ['2023-10-01'] }
```

##### Timezones

**atTimeZone** \- Converts a `Timestamp` to the specified time zone.

```typescript
my_column.atTimeZone('America/New_York'); // Will output { sql: 'my_column AT TIME ZONE $1', vars: ['America/New_York'] }
```

##### String Functions

**lower** \- Converts a string to lower case.

```typescript
my_column.lower(); // Will output { sql: 'LOWER(my_column)', vars: [] }
```

**upper** \- Converts a string to upper case.

```typescript
my_column.upper(); // Will output { sql: 'UPPER(my_column)', vars: [] }
```

**trim** \- Trims whitespace from a string.

```typescript
my_column.trim(); // Will output { sql: 'TRIM(my_column)', vars: [] }
```

**like** \- Tests whether the operand matches a pattern. Uses the `LIKE` logical operator and can optionally take a boolean `ignoreCase` parameter to control case sensitivity. It is important to note that this parameter may not have an effect on all databases. For example, MySQL `LIKE` queries are case-insensitive by default.

```typescript
my_column.like('foobar'); // Will output { sql: 'my_column LIKE $1', vars: ['foobar'] }
my_column.like('foobar', true); // Will output { sql: 'my_column ILIKE $1', vars: ['foobar'] } for PostgreSQL
!my_column.like('foobar'); // Will output { sql: 'NOT my_column LIKE $1', vars: ['foobar'] }
```

### Custom Dialects

You are able to define your own `Dialect` class and add functions by extending the CEL environment:

```typescript
import { CelqlEnv, Dialect, sql } from '@protoutil/celql';
import { BoolType, func, overload, StringType } from '@bearclaw/cel';

const myFuncOverload = 'myFunc';

class MyDialect extends Dialect {
  override functionToSqlOverrides(unparser: Unparser, functionName: string, args: Expr[]): boolean {
    switch (functionName) {
      case myFuncOverload:
        unparser.visit(args[0]);
        unparser.writeString(' MY_CUSTOM_OPERATOR ');
        unparser.visit(args[1]);
        return true;
      default:
        return super.functionToSqlOverrides(unparser, functionName, args);
    }
  }
}

const env = new CelqlEnv(
  ...,
  func(myFuncOverload, overload(myFuncOverload, [StringType, StringType], BoolType))
)

sql(`myFunc('a', 'b')`, env, new MyDialect());
// Will output: { sql: '$1 MY_CUSTOM_OPERATOR $2', vars: ['a', 'b'] }
```

## Contributing

### Building

Run `nx build celql` to build the library.

### Running unit tests

Run `nx test celql` to execute the unit tests via [Jest](https://jestjs.io).
