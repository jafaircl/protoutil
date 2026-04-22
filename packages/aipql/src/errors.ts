/**
 * Thrown when a checked AIP-160 expression cannot be translated into the
 * target backend query language.
 */
export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationError";
  }
}
