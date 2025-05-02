import { Wildcard } from './wildcard.js';

/**
 * RevisionSeparator is the separator character used to separate resource IDs from revision IDs.
 */
export const RevisionSeparator = '@';

/**
 * Segment is a segment of a resource name or a resource name pattern.
 *
 * EBNF
 *
 *  Segment  = Literal | Variable ;
 *  Variable = "{" Literal "}" ;
 */
export class Segment {
  constructor(public readonly value: string) {}

  /**
   * IsVariable reports whether the segment is a variable segment.
   */
  isVariable() {
    return (
      this.value.length > 2 && this.value[0] === '{' && this.value[this.value.length - 1] === '}'
    );
  }

  /**
   * Literal returns the literal value of the segment. For variables, the literal value is the
   * name of the variable.
   */
  literal() {
    if (this.isVariable()) {
      return new Literal(this.value.substring(1, this.value.length - 1));
    }
    return new Literal(this.value);
  }

  /**
   * IsWildcard reports whether the segment is a wildcard.
   */
  isWildcard() {
    return this.value === Wildcard;
  }
}

/**
 * Literal is the literal part of a resource name segment.
 *
 * EBNF
 *
 *  Literal  = RESOURCE_ID | RevisionLiteral ;
 *  RevisionLiteral = RESOURCE_ID "@" REVISION_ID ;
 */
export class Literal {
  constructor(public readonly value: string) {}

  /**
   * ResourceID returns the literal's resource ID.
   */
  resourceId() {
    if (!this.hasRevision()) {
      return this.value;
    }
    const revisionSeparatorIndex = this.value.indexOf(RevisionSeparator);
    return this.value.substring(0, revisionSeparatorIndex);
  }

  /**
   * RevisionID returns the literal's revision ID.
   */
  revisionId() {
    if (!this.hasRevision()) {
      return '';
    }
    const revisionSeparatorIndex = this.value.indexOf(RevisionSeparator);
    return this.value.substring(revisionSeparatorIndex + 1);
  }

  /**
   * HasRevision returns true if the literal has a valid revision.
   */
  hasRevision() {
    const revisionSeparatorIndex = this.value.indexOf(RevisionSeparator);
    if (revisionSeparatorIndex < 1 || revisionSeparatorIndex >= this.value.length - 1) {
      return false; // must have content on each side of the revision marker
    }
    if (this.value.substring(revisionSeparatorIndex + 1).indexOf(RevisionSeparator) != -1) {
      return false; // multiple revision markers means no valid revision
    }
    return true;
  }
}
