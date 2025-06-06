import { create } from '@bufbuild/protobuf';
import { fieldMask } from '@protoutil/core';
import { TestImmutableFieldBehaviorSchema } from '../gen/protoutil/aip/v1/fieldbehavior_pb.js';
import { validateImmutableFields, validateImmutableFieldsWithMask } from './immutable.js';

describe('immutable', () => {
  it('validateImmutableFields should not throw if an immutable field is not set', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).not.toThrow();
  });

  it('validateImmutableFields should throw if an immutable field is set', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      immutable: 'immutable',
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).toThrow(
      'field is immutable: immutable'
    );
  });

  it('validateImmutableFields should not throw if an immutable field is not set in a repeated field', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }, { normal: 'normal' }],
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).not.toThrow();
  });

  it('validateImmutableFields should throw if an immutable field is set in a repeated field', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }, { immutable: 'immutable' }],
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).toThrow(
      'field is immutable: repeated_child.1.immutable'
    );
  });

  it('validateImmtableFields should not throw if an immutable field is not set in a map field', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: { key1: { normal: 'normal' }, key2: { normal: 'normal' } },
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).not.toThrow();
  });

  it('validateImmutableFields should throw if an immutable field is set in a map field', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: {
        key1: { normal: 'normal' },
        key2: { immutable: 'immutable' },
      },
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).toThrow(
      'field is immutable: map_child.key2.immutable'
    );
  });

  it('validateImmutableFields should not throw if an immutable field is not set in a nested message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      child: {
        normal: 'normal',
      },
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).not.toThrow();
  });

  it('validateImmutableFields should throw if an immutable field is set in a nested message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      child: {
        normal: 'normal',
        immutable: 'immutable',
      },
    });
    expect(() => validateImmutableFields(TestImmutableFieldBehaviorSchema, message)).toThrow(
      'field is immutable: child.immutable'
    );
  });

  it('should not throw if an immutable field is not set', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['*'], false)
      )
    ).not.toThrow();
  });

  it('should not throw when the immutable field is not part of the field mask', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      immutable: 'immutable',
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['normal'])
      )
    ).not.toThrow();
  });

  it('should throw when a wildcard field mask is used', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      immutable: 'immutable',
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['*'], false)
      )
    ).toThrow('field is immutable: immutable');
  });

  it('should error when the field mask includes the immutable field', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      immutable: 'immutable',
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['immutable'])
      )
    ).toThrow('field is immutable: immutable');
  });

  it('should error when the immutable field is set in a nested message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      child: {
        normal: 'normal',
        immutable: 'immutable',
      },
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['child'])
      )
    ).toThrow('field is immutable: child.immutable');
  });

  it('should not throw when the immutable field is not set in a nested message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      child: {
        normal: 'normal',
      },
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['child'])
      )
    ).not.toThrow();
  });

  it('should not throw when the immutable field is not set in a repeated message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }, { normal: 'normal' }],
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['repeated_child'])
      )
    ).not.toThrow();
  });

  it('should throw when the immutable field is set in a repeated message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }, { immutable: 'immutable' }],
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['repeated_child'])
      )
    ).toThrow('field is immutable: repeated_child.1.immutable');
  });

  it('should throw when the immutable field is set in a repeated message with a wildcard', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }, { immutable: 'immutable' }],
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['repeated_child.*'], false)
      )
    ).toThrow('field is immutable: repeated_child.1.immutable');
  });

  it('should throw when the immutable field is set in a repeated message with a wildcard plus field', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }, { immutable: 'immutable' }],
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['repeated_child.*.immutable'], false)
      )
    ).toThrow('field is immutable: repeated_child.1.immutable');
  });

  it('should not throw when the immutable field is not set in a map message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: { key1: { normal: 'normal' }, key2: { normal: 'normal' } },
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['map_child'])
      )
    ).not.toThrow();
  });

  it('should throw when the immutable field is set in a map message', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: {
        key1: { normal: 'normal' },
        key2: { immutable: 'immutable' },
      },
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['map_child'])
      )
    ).toThrow('field is immutable: map_child.key2.immutable');
  });

  it('should throw when the immutable field is set in a map message with a wildcard', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: {
        key1: { normal: 'normal' },
        key2: { immutable: 'immutable' },
      },
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['map_child.*'], false)
      )
    ).toThrow('field is immutable: map_child.key2.immutable');
  });

  it('should throw when the immutable field is set in a map message with a wildcard plus field', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: {
        key1: { normal: 'normal' },
        key2: { immutable: 'immutable' },
      },
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['map_child.*.immutable'], false)
      )
    ).toThrow('field is immutable: map_child.key2.immutable');
  });

  it('should throw for a nested message when the field mask ends with the parent and the parent is set', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
      child: {
        normal: 'normal',
        immutable: 'immutable',
      },
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['child'])
      )
    ).toThrow('field is immutable: child.immutable');
  });

  it('should not throw an error for a nested message when the field mask ends with the parent and the parent is not set', () => {
    const message = create(TestImmutableFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() =>
      validateImmutableFieldsWithMask(
        TestImmutableFieldBehaviorSchema,
        message,
        fieldMask(TestImmutableFieldBehaviorSchema, ['child'])
      )
    ).not.toThrow();
  });
});
