export function formatError(err: string) {
  return err
    .split('\n')
    .map((line) => line.trim())
    .join('\n ');
}
