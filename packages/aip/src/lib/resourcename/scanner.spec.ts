import { Scanner } from './scanner.js';
import { Segment } from './segment.js';

describe('scanner', () => {
  describe('Scanner', () => {
    const testCases: {
      name: string;
      input: string;
      full?: boolean;
      serviceName?: string;
      segments: Segment[];
    }[] = [
      {
        name: 'empty',
        input: '',
        segments: [],
      },
      {
        name: 'singleton',
        input: 'singleton',
        segments: [new Segment('singleton')],
      },
      {
        name: 'two segments',
        input: 'shippers/1',
        segments: [new Segment('shippers'), new Segment('1')],
      },
      {
        name: 'three segments',
        input: 'shippers/1/settings',
        segments: [new Segment('shippers'), new Segment('1'), new Segment('settings')],
      },
      {
        name: 'wildcard segment',
        input: 'shippers/1/shipments/-',
        segments: [
          new Segment('shippers'),
          new Segment('1'),
          new Segment('shipments'),
          new Segment('-'),
        ],
      },
      {
        name: 'empty middle segment',
        input: 'shippers//shipments',
        segments: [new Segment('shippers'), new Segment(''), new Segment('shipments')],
      },
      {
        name: 'empty end segment',
        input: 'shippers/',
        segments: [new Segment('shippers'), new Segment('')],
      },
      {
        name: 'full',
        input: '//library.googleapis.com/publishers/123/books/les-miserables',
        full: true,
        serviceName: 'library.googleapis.com',
        segments: [
          new Segment('publishers'),
          new Segment('123'),
          new Segment('books'),
          new Segment('les-miserables'),
        ],
      },
      {
        name: 'full without segments',
        input: '//library.googleapis.com',
        full: true,
        serviceName: 'library.googleapis.com',
        segments: [],
      },
      {
        name: 'full without service name',
        input: '//',
        full: true,
        serviceName: '',
        segments: [],
      },
    ];

    for (const tc of testCases) {
      it(`should scan ${tc.name}`, () => {
        const scanner = new Scanner(tc.input);
        const actualSegments: Segment[] = [];
        while (scanner.scan()) {
          actualSegments.push(scanner.segment());
        }
        expect(scanner.full()).toBe(tc.full ?? false);
        expect(scanner.serviceName()).toBe(tc.serviceName ?? '');
        expect(actualSegments.length).toBe(tc.segments.length);
        for (let i = 0; i < actualSegments.length; i++) {
          expect(actualSegments[i].value).toBe(tc.segments[i].value);
        }
      });
    }
  });
});
