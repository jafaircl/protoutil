import { sanitizeProtoName } from './utils.js';

describe('utils', () => {
  it('sanitizeProtoName', () => {
    expect(sanitizeProtoName(' foo  ')).toEqual('foo');
    expect(sanitizeProtoName('foo.bar.baz')).toEqual('foo.bar.baz');
    expect(sanitizeProtoName('.foo.bar.baz')).toEqual('foo.bar.baz');
  });
});
