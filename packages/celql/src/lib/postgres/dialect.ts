import { ListType, StringType } from '@bearclaw/cel';
import { Expr, Expr_CreateList } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import { unwrapBoolConstant } from '../common.js';
import { DefaultDialect } from '../default/dialect.js';
import { Unparser } from '../unparser.js';

export class PostgresDialect extends DefaultDialect {
  override createList(unparser: Unparser, listExpr: Expr_CreateList): void {
    const elems = listExpr.elements;
    unparser.writeString('ARRAY[');
    for (let i = 0; i < elems.length; i++) {
      if (i > 0) {
        unparser.writeString(', ');
      }
      unparser.visit(elems[i]);
    }
    unparser.writeString(']');
  }

  override listDataType(elemType?: string): string {
    if (!elemType) {
      return 'JSON';
    }
    return `${elemType}[]`;
  }

  override castToList(unparser: Unparser, expr: Expr): boolean {
    const type = unparser.getType(expr);
    switch (type?.kind()) {
      case ListType.kind():
        unparser.visit(expr);
        return true;
      case StringType.kind():
        unparser.writeString(`string_to_array(`);
        unparser.visit(expr);
        unparser.writeString(`, ',')`);
        return true;
      default:
        throw unparser.formatError(
          expr,
          `cannot cast expression of type ${type?.typeName()} to list`
        );
    }
  }

  override stringDataType(): string {
    return 'TEXT';
  }

  override stringLike(
    unparser: Unparser,
    expr: Expr,
    pattern: Expr,
    caseInsensitive?: Expr
  ): boolean {
    const type = unparser.getType(expr);
    if (type?.kind() !== StringType.kind()) {
      throw unparser.formatError(
        expr,
        `cannot apply 'like' function to expression of type ${type?.typeName()}`
      );
    }
    const isCaseInsensitive = caseInsensitive && unwrapBoolConstant(caseInsensitive) === true;
    unparser.visit(expr);
    if (isCaseInsensitive) {
      unparser.writeString(` ILIKE `);
    } else {
      unparser.writeString(` LIKE `);
    }
    unparser.visit(pattern);
    return true;
  }

  override functionToSqlOverrides(unparser: Unparser, functionName: string, args: Expr[]): boolean {
    switch (functionName) {
      default:
        return super.functionToSqlOverrides(unparser, functionName, args);
    }
  }
}
