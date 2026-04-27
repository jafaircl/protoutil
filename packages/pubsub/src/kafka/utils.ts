/** Decode a Kafka record key into a UTF-8 string when present. */
export function keyString(key: Buffer | null | string | undefined): string | undefined {
  if (!key) {
    return undefined;
  }
  return Buffer.isBuffer(key) ? key.toString("utf8") : key;
}
