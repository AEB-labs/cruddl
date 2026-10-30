import type { StringValueNode } from 'graphql';
import { parse, Source, visit } from 'graphql';
import { describe, expect, it } from 'vitest';
import { ProjectSource } from '../../project/source.js';
import { locationWithinStringArgument, MessageLocation } from './location.js';

describe('locationWithinStringArgument', () => {
    function getText(body: string, value: string, offset: number, length: number) {
        const source = new ProjectSource('test', body);
        const start = body.indexOf(value);
        const location = locationWithinStringArgument(
            new MessageLocation(source, start, start + value.length),
            offset,
            length,
        );
        return body.slice(location!.start.offset, location!.end.offset);
    }

    it('works with JSON strings', () => {
        expect(getText(`{ "field": "items.name" }`, `"items.name"`, 6, 4)).to.equal('name');
    });

    it('works with plain YAML scalars', () => {
        expect(getText(`cascadeFields:\n  - items.name\n`, `items.name`, 6, 4)).to.equal('name');
    });

    it('works with YAML map entries', () => {
        expect(getText(`field: items.name\n`, `field: items.name`, 6, 4)).to.equal('name');
    });

    it('works with quoted YAML map entries', () => {
        expect(getText(`"field": 'items.name'\n`, `"field": 'items.name'`, 0, 5)).to.equal('items');
    });

    it('works with YAML values on the next line', () => {
        expect(getText(`field:\n  items.name\n`, `field:\n  items.name`, 6, 4)).to.equal('name');
    });

    it('works with tagged YAML values', () => {
        expect(getText(`field: !!str items.name\n`, `field: !!str items.name`, 6, 4)).to.equal(
            'name',
        );
    });

    it('works with YAML block scalars', () => {
        expect(getText(`field: >-\n  items.name\n`, `field: >-\n  items.name`, 6, 4)).to.equal(
            'name',
        );
    });

    it('works with GraphQL strings', () => {
        const source = new Source(`type T @collect(path: "items.name")`);
        expect(getGraphQLText(source, 6, 4)).to.equal('name');
    });

    it('works with GraphQL block strings', () => {
        const source = new Source(`type T @collect(path: """items.name""")`);
        expect(getGraphQLText(source, 6, 4)).to.equal('name');
    });

    it('returns the whole GraphQL string if it contains escape sequences', () => {
        const source = new Source(`type T @collect(path: "items.n\\u0061me")`);
        expect(getGraphQLText(source, 6, 4)).to.equal('"items.n\\u0061me"');
    });

    function getGraphQLText(source: Source, offset: number, length: number) {
        let stringNode: StringValueNode | undefined;
        visit(parse(source), {
            StringValue(node) {
                stringNode = node;
            },
        });
        const location = locationWithinStringArgument(stringNode!, offset, length);
        return source.body.slice(location!.start.offset, location!.end.offset);
    }
});
