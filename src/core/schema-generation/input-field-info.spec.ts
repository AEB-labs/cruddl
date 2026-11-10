import type { GraphQLSchema } from 'graphql';
import { GraphQLEnumType, GraphQLInputObjectType, printSchema } from 'graphql';
import { beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAdapter } from '../../inmemory/inmemory-adapter.js';
import { Project } from '../project/project.js';
import { ProjectSource } from '../project/source.js';
import { getFilterFieldInfo, getOrderByValueInfo } from './input-field-info.js';

describe('input field info', () => {
    let schema: GraphQLSchema;

    beforeAll(() => {
        const project = new Project({
            sources: [
                new ProjectSource(
                    'schema.graphqls',
                    `
                    type Delivery @rootEntity(flexSearch: true) @roles(readWrite: "user") {
                        deliveryNumber: String @key @flexSearch
                        created_at: DateTime @flexSearch
                        tags: [String] @flexSearch
                        customer: Customer @reference
                        address: Address @flexSearch
                        extension: Extension @flexSearch
                        items: [Item] @flexSearch
                        description: I18nString @flexSearch
                        handlingUnits: [HandlingUnit] @relation
                        metadata: StringMap
                    }

                    type Customer @rootEntity @roles(readWrite: "user") {
                        customerNumber: String @key
                        name: String
                    }

                    type HandlingUnit @rootEntity @roles(readWrite: "user") {
                        huNumber: String
                    }

                    type Address @valueObject {
                        city: String @flexSearch
                    }

                    type Extension @entityExtension {
                        note: String @flexSearch
                    }

                    type Item @childEntity {
                        itemNumber: String @flexSearch
                    }
                `,
                ),
            ],
        });
        schema = project.createSchema(new InMemoryAdapter());
    });

    function getFilterInfo(typeName: string, fieldName: string) {
        const type = schema.getType(typeName);
        if (!(type instanceof GraphQLInputObjectType)) {
            throw new Error(`Expected ${typeName} to be an input object type`);
        }
        const field = type.getFields()[fieldName];
        if (!field) {
            throw new Error(`Expected ${typeName}.${fieldName} to exist`);
        }
        return getFilterFieldInfo(field);
    }

    function getOrderByInfo(typeName: string, valueName: string) {
        const type = schema.getType(typeName);
        if (!(type instanceof GraphQLEnumType)) {
            throw new Error(`Expected ${typeName} to be an enum type`);
        }
        const value = type.getValue(valueName);
        if (!value) {
            throw new Error(`Expected ${typeName}.${valueName} to exist`);
        }
        return getOrderByValueInfo(value);
    }

    describe('filter', () => {
        it('describes scalar field filters', () => {
            expect(getFilterInfo('DeliveryFilter', 'deliveryNumber')).toEqual({
                kind: 'field',
                fieldName: 'deliveryNumber',
                operator: 'equal',
            });
            expect(getFilterInfo('DeliveryFilter', 'deliveryNumber_not_starts_with')).toEqual({
                kind: 'field',
                fieldName: 'deliveryNumber',
                operator: 'not_starts_with',
            });
        });

        it('does not need to parse field names with underscores', () => {
            expect(getFilterInfo('DeliveryFilter', 'created_at_gt')).toEqual({
                kind: 'field',
                fieldName: 'created_at',
                operator: 'gt',
            });
        });

        it('describes quantifiers and the values of scalar lists', () => {
            expect(getFilterInfo('DeliveryFilter', 'handlingUnits_some')).toEqual({
                kind: 'quantifier',
                fieldName: 'handlingUnits',
                quantifier: 'some',
            });
            expect(getFilterInfo('DeliveryFilter', 'items_every')).toEqual({
                kind: 'quantifier',
                fieldName: 'items',
                quantifier: 'every',
            });
            expect(getFilterInfo('DeliveryFilter', 'tags_none')).toEqual({
                kind: 'quantifier',
                fieldName: 'tags',
                quantifier: 'none',
            });
            expect(getFilterInfo('StringFilter', 'starts_with')).toEqual({
                kind: 'value',
                operator: 'starts_with',
            });
            expect(getFilterInfo('DeliveryFilter', 'items_empty')).toEqual({
                kind: 'empty',
                fieldName: 'items',
            });
        });

        it('describes nested filters', () => {
            expect(getFilterInfo('DeliveryFilter', 'customer')).toEqual({
                kind: 'object',
                fieldName: 'customer',
            });
            expect(getFilterInfo('DeliveryFilter', 'address')).toEqual({
                kind: 'object',
                fieldName: 'address',
            });
            expect(getFilterInfo('DeliveryFilter', 'extension')).toEqual({
                kind: 'object',
                fieldName: 'extension',
            });
        });

        it('describes AND and OR', () => {
            expect(getFilterInfo('DeliveryFilter', 'AND')).toEqual({ kind: 'and' });
            expect(getFilterInfo('DeliveryFilter', 'OR')).toEqual({ kind: 'or' });
        });

        it('describes string map filters', () => {
            expect(getFilterInfo('DeliveryFilter', 'metadata_some')).toEqual({
                kind: 'quantifier',
                fieldName: 'metadata',
                quantifier: 'some',
            });
            expect(getFilterInfo('StringMapEntryFilter', 'key_in')).toEqual({
                kind: 'stringMapEntry',
                part: 'key',
                operator: 'in',
            });
        });
    });

    describe('flexSearchFilter', () => {
        it('describes scalar field filters', () => {
            expect(getFilterInfo('DeliveryFlexSearchFilter', 'deliveryNumber_in')).toEqual({
                kind: 'field',
                fieldName: 'deliveryNumber',
                operator: 'in',
            });
        });

        it('describes aggregations', () => {
            expect(getFilterInfo('DeliveryFlexSearchFilter', 'tags_aggregation_equal')).toEqual({
                kind: 'field',
                fieldName: 'tags',
                operator: 'equal',
                aggregation: true,
            });
            expect(getFilterInfo('DeliveryFlexSearchFilter', 'itemsAggregation')).toEqual({
                kind: 'object',
                fieldName: 'items',
                aggregation: true,
            });
        });

        it('describes nested and localized filters', () => {
            expect(getFilterInfo('DeliveryFlexSearchFilter', 'address')).toEqual({
                kind: 'object',
                fieldName: 'address',
            });
            expect(getFilterInfo('DeliveryFlexSearchFilter', 'description_localized')).toEqual({
                kind: 'localized',
                fieldName: 'description',
            });
            expect(getFilterInfo('DeliveryFlexSearchFilter', 'OR')).toEqual({ kind: 'or' });
        });
    });

    describe('orderBy', () => {
        it('describes the sorted field path and direction', () => {
            expect(getOrderByInfo('DeliveryOrderBy', 'created_at_ASC')).toEqual({
                fieldPath: ['created_at'],
                direction: 'ASCENDING',
            });
            expect(getOrderByInfo('DeliveryOrderBy', 'customer_name_DESC')).toEqual({
                fieldPath: ['customer', 'name'],
                direction: 'DESCENDING',
            });
        });
    });

    it('does not change the SDL', () => {
        expect(printSchema(schema)).not.toContain('cruddl');
    });
});
