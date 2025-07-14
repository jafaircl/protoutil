import { Container, name } from '../common/container.js';
import { Registry } from '../common/types/provider.js';
import { isUnknownRefVal } from '../common/types/unknown.js';
import { EmptyActivation, PartActivation } from './activation.js';
import { AttributePattern, PartialAttributeFactory } from './attribute-patterns.js';
import { Attribute, AttributeFactory } from './attributes.js';

interface attr {
  // unchecked indicates whether the attribute has not been type-checked and thus not gone
  // the variable and function resolution step.
  unchecked?: boolean;
  // container simulates the expression container and is only relevant on 'unchecked' test inputs
  // as the container is used to resolve the potential fully qualified variable names represented
  // by an identifier or select expression.
  container?: string;
  // variable name, fully qualified unless the attr is marked as unchecked=true
  name: string;
  // quals contains a list of static qualifiers.
  quals?: any[];
}

interface patternTest {
  pattern: AttributePattern;
  matches: attr[];
  misses: attr[];
}

describe('AttributePatterns', () => {
  const testCases: Record<string, patternTest> = {
    var: {
      pattern: new AttributePattern('var'),
      matches: [{ name: 'var' }, { name: 'var', quals: ['field'] }],
      misses: [{ name: 'ns.var' }],
    },
    var_namespace: {
      pattern: new AttributePattern('ns.app.var'),
      matches: [
        { name: 'ns.app.var' },
        { name: 'ns.app.var', quals: [0n] },
        {
          name: 'ns',
          quals: ['app', 'var', 'foo'],
          container: 'ns.app',
          unchecked: true,
        },
      ],
      misses: [
        { name: 'ns.var' },
        {
          name: 'ns',
          quals: ['var'],
          container: 'ns.app',
          unchecked: true,
        },
      ],
    },
    var_field: {
      pattern: new AttributePattern('var').qualString('field'),
      matches: [
        { name: 'var' },
        { name: 'var', quals: ['field'] },
        { name: 'var', quals: ['field'], unchecked: true },
        { name: 'var', quals: ['field', 1n] },
      ],
      misses: [{ name: 'var', quals: ['other'] }],
    },
    var_index: {
      pattern: new AttributePattern('var').qualInt(0n),
      matches: [
        { name: 'var' },
        { name: 'var', quals: [0] },
        { name: 'var', quals: [0.0] },
        { name: 'var', quals: [0, false] },
        { name: 'var', quals: [0n] },
      ],
      misses: [{ name: 'var', quals: [1, false] }],
    },
    var_index_uint: {
      pattern: new AttributePattern('var').qualUint(1n),
      matches: [
        { name: 'var' },
        { name: 'var', quals: [1n] },
        { name: 'var', quals: [1n, true] },
        { name: 'var', quals: [1, false] },
      ],
      misses: [{ name: 'var', quals: [0n] }],
    },
    var_index_bool: {
      pattern: new AttributePattern('var').qualBool(true),
      matches: [
        { name: 'var' },
        { name: 'var', quals: [true] },
        { name: 'var', quals: [true, 'name'] },
      ],
      misses: [{ name: 'var', quals: [false] }, { name: 'none' }],
    },
    var_wildcard: {
      pattern: new AttributePattern('ns.var').wildcard(),
      matches: [
        { name: 'ns.var' },
        {
          name: 'var',
          quals: [true],
          container: 'ns',
          unchecked: true,
        },
        {
          name: 'var',
          quals: ['name'],
          container: 'ns',
          unchecked: true,
        },
        {
          name: 'var',
          quals: ['name'],
          container: 'ns',
          unchecked: true,
        },
      ],
      misses: [{ name: 'var', quals: [false] }, { name: 'none' }],
    },
    var_wildcard_field: {
      pattern: new AttributePattern('var').wildcard().qualString('field'),
      matches: [
        { name: 'var' },
        { name: 'var', quals: [true] },
        { name: 'var', quals: [10, 'field'] },
      ],
      misses: [{ name: 'var', quals: [10, 'other'] }],
    },
    var_wildcard_wildcard: {
      pattern: new AttributePattern('var').wildcard().wildcard(),
      matches: [
        { name: 'var' },
        { name: 'var', quals: [true] },
        { name: 'var', quals: [10, 'field'] },
      ],
      misses: [{ name: 'none' }],
    },
  };
  for (const [nm, tc] of Object.entries(testCases)) {
    const reg = new Registry();
    for (const m of tc.matches) {
      it(`should match pattern '${nm}' -> ${m.name} ${m.quals} ${m.unchecked}`, () => {
        let cont = new Container();
        if (m.unchecked && m.container) {
          cont = new Container(name(m.container));
        }
        const fac = new PartialAttributeFactory(cont, reg, reg);
        const attr = genAttr(fac, m);
        const partVars = new PartActivation(new EmptyActivation(), [tc.pattern]);
        const val = attr.resolve(partVars);
        expect(isUnknownRefVal(val)).toBe(true);
      });
    }
    for (const m of tc.misses) {
      it(`should not match pattern '${nm}' -> ${m.name} ${m.quals} ${m.unchecked}`, () => {
        let cont = new Container();
        if (m.unchecked) {
          cont = new Container(name(m.container || ''));
        }
        const fac = new PartialAttributeFactory(cont, reg, reg);
        const attr = genAttr(fac, m);
        const partVars = new PartActivation(new EmptyActivation(), [tc.pattern]);
        const val = attr.resolve(partVars);
        expect(val).toBeInstanceOf(Error);
      });
    }
  }
});

function genAttr(fac: AttributeFactory, a: attr): Attribute {
  let id = 1n;
  let attr: Attribute;
  if (a.unchecked) {
    attr = fac.maybeAttribute(1n, a.name);
  } else {
    attr = fac.absoluteAttribute(1n, a.name);
  }
  for (const q of a.quals || []) {
    const qual = fac.newQualifier(null, id, q, false);
    attr.addQualifier(qual as Attribute);
    id++;
  }
  return attr;
}
