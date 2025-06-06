import { create } from '@bufbuild/protobuf';
import { fieldMask } from '@protoutil/core';
import { TestRequiredFieldBehaviorSchema } from '../gen/protoutil/aip/v1/fieldbehavior_pb.js';
import { validateRequiredFields, validateRequiredFieldsWithFieldMask } from './required.js';

describe('required', () => {
  it('should not throw an error if no required fields are missing', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      required: 'required',
    });
    expect(() => {
      validateRequiredFields(TestRequiredFieldBehaviorSchema, message);
    }).not.toThrow();
  });

  it('should throw an error if a required field is missing', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() => {
      validateRequiredFields(TestRequiredFieldBehaviorSchema, message);
    }).toThrow('missing required field: required');
  });

  it('should throw an error with a nested message', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      required: 'required',
      child: {
        normal: 'normal',
      },
    });
    expect(() => {
      validateRequiredFields(TestRequiredFieldBehaviorSchema, message);
    }).toThrow('missing required field: child.required');
  });

  it('should throw an error with a repeated message', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      required: 'required',
      repeatedChild: [{ required: 'required' }, { normal: 'normal' }],
    });
    expect(() => {
      validateRequiredFields(TestRequiredFieldBehaviorSchema, message);
    }).toThrow('missing required field: repeated_child.1.required');
  });

  it('should throw an error with a map message', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      required: 'required',
      mapChild: { key1: { normal: 'normal' }, key2: { required: 'required' } },
    });
    expect(() => {
      validateRequiredFields(TestRequiredFieldBehaviorSchema, message);
    }).toThrow('missing required field: map_child.key1.required');
  });

  it('should not throw an error with a field mask with no paths', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      required: 'required',
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, [])
      );
    }).not.toThrow();
  });

  it('should not throw an error for a wildcard field mask and valid message', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      required: 'required',
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['*'], false)
      );
    }).not.toThrow();
  });

  it('should throw an error for a wildcard field mask and invalid message', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['*'], false)
      );
    }).toThrow('missing required field: required');
  });

  it('should not throw an error for a missing field that is not in the field mask', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['normal'])
      );
    }).not.toThrow();
  });

  it('should throw an error with a field mask with a single path', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['required'])
      );
    }).toThrow('missing required field: required');
  });

  it('should throw an error with a field mask with multiple paths', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['normal', 'required'])
      );
    }).toThrow('missing required field: required');
  });

  it('should throw an error for a field mask with repeated fields', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }],
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['repeated_child.*.required'], false)
      );
    }).toThrow('missing required field: repeated_child.0.required');
  });

  it('should throw an error for a field mask that ends with a wildcard for repeated fields', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }],
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['repeated_child.*'], false)
      );
    }).toThrow('missing required field: repeated_child.0.required');
  });

  it('should throw an error for a field mask that ends with a parent for repeated fields', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      repeatedChild: [{ normal: 'normal' }],
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['repeated_child'])
      );
    }).toThrow('missing required field: repeated_child.0.required');
  });

  it('should throw an error for a field mask with map fields', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: { key1: { normal: 'normal' } },
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['map_child.*.required'], false)
      );
    }).toThrow('missing required field: map_child.key1.required');
  });

  it('should throw an error for a field mask that ends with a wildcard for map fields', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: { key1: { normal: 'normal' } },
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['map_child.*'], false)
      );
    }).toThrow('missing required field: map_child.key1.required');
  });

  it('should throw an error for a field mask that ends with a parent for map fields', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      mapChild: { key1: { normal: 'normal' } },
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['map_child'])
      );
    }).toThrow('missing required field: map_child.key1.required');
  });

  it('should throw an error for a required field with a parent field mask', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      child: {
        normal: 'normal',
      },
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['child'])
      );
    }).toThrow('missing required field: child.required');
  });

  it('should throw an error for a nested message when the field mask ends with the parent', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
      child: {
        normal: 'normal',
      },
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['child'])
      );
    }).toThrow('missing required field: child.required');
  });

  it('should not throw an error for a nested message when the field mask ends with the parent and the parent is not set', () => {
    const message = create(TestRequiredFieldBehaviorSchema, {
      normal: 'normal',
    });
    expect(() => {
      validateRequiredFieldsWithFieldMask(
        TestRequiredFieldBehaviorSchema,
        message,
        fieldMask(TestRequiredFieldBehaviorSchema, ['child'])
      );
    }).not.toThrow();
  });
});
