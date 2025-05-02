import { resourceNameHasParent } from './hasparent.js';

describe('hasparent', () => {
  describe('resourceNameHasParent()', () => {
    const testCases = [
      {
        test: 'valid parent and child',
        name: 'shippers/1/sites/1',
        parent: 'shippers/1',
        expected: true,
      },
      {
        test: 'not parent of self',
        name: 'shippers/1/sites/1/settings',
        parent: 'shippers/1/sites/1/settings',
        expected: false,
      },
      {
        test: 'empty parent',
        name: 'shippers/1/sites/1',
        parent: '',
        expected: false,
      },
      {
        test: 'empty child and empty parent',
        name: '',
        parent: '',
        expected: false,
      },
      {
        test: 'singleton child',
        name: 'shippers/1/sites/1/settings',
        parent: 'shippers/1/sites/1',
        expected: true,
      },
      {
        test: 'wildcard parent',
        name: 'shippers/1/sites/1',
        parent: 'shippers/-',
        expected: true,
      },
      {
        test: 'full child',
        name: '//freight-example.einride.tech/shippers/1/sites/1',
        parent: 'shippers/-',
        expected: true,
      },
      {
        test: 'full parent',
        name: 'shippers/1/sites/1',
        parent: '//freight-example.einride.tech/shippers/-',
        expected: true,
      },
      {
        test: 'full parent',
        name: 'shippers/1/sites/1',
        parent: '//freight-example.einride.tech/shippers/-',
        expected: true,
      },
      {
        test: 'full parent and child with different service names',
        name: '//other-example.einride.tech/shippers/1/sites/1',
        parent: '//freight-example.einride.tech/shippers/-',
        expected: false,
      },
      {
        test: 'revisioned child',
        name: 'shippers/1/sites/1@beef',
        parent: 'shippers/1/sites/1',
        expected: true,
      },
      {
        test: 'revisioned child with other revision',
        name: 'shippers/1/sites/1@beef',
        parent: 'shippers/1/sites/1@dead',
        expected: false,
      },
      {
        test: 'identical revisioned child',
        name: 'shippers/1/sites/1@beef',
        parent: 'shippers/1/sites/1@beef',
        expected: false,
      },
      {
        test: 'revisioned parent',
        parent: 'datasets/1@beef',
        name: 'datasets/1@beef/tables/1',
        expected: true,
      },
      {
        test: 'revisioned parent with non-revisoned child',
        parent: 'datasets/1@beef',
        name: 'datasets/1/tables/1',
        expected: false,
      },
      {
        test: 'revisioned parent with non-matching revision child',
        parent: 'datasets/1@beef',
        name: 'datasets/1@dead/tables/1',
        expected: false,
      },
      {
        test: 'non-revisioned parent with revisioned child',
        parent: 'datasets/1',
        name: 'datasets/1@beef/tables/1',
        expected: true,
      },
    ];
    for (const tc of testCases) {
      it(tc.test, () => {
        const result = resourceNameHasParent(tc.name, tc.parent);
        expect(result).toEqual(tc.expected);
      });
    }
  });
});
