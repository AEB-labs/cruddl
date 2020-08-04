import { GraphQLEnumType, GraphQLEnumValueConfig } from 'graphql';
import { chain } from 'lodash';
import memorize from 'memorize-decorator';
import { Field, ObjectType, Type } from '../model';
import { OrderClause, OrderDirection, PropertyAccessQueryNode, QueryNode } from '../query-tree';
import { ORDER_BY_ASC_SUFFIX, ORDER_BY_DESC_SUFFIX } from '../schema/constants';
import { getOrderByTypeName } from '../schema/names';
import { GraphQLOffsetDateTime, TIMESTAMP_PROPERTY } from '../schema/scalars/offset-date-time';
import { flatMap } from '../utils/utils';
import { createFieldNode } from './field-nodes';

export class OrderByEnumType {
    constructor(public readonly objectType: ObjectType, public readonly values: ReadonlyArray<OrderByEnumValue>) {}

    get name() {
        return getOrderByTypeName(this.objectType.name);
    }

    @memorize()
    private get valueMap(): Map<string, OrderByEnumValue> {
        return new Map(this.values.map((v): [string, OrderByEnumValue] => [v.name, v]));
    }

    getValue(name: string): OrderByEnumValue | undefined {
        return this.valueMap.get(name);
    }

    getValueOrThrow(name: string): OrderByEnumValue {
        const value = this.valueMap.get(name);
        if (!value) {
            throw new Error(`Expected "${this.name}" to have value "${name}"`);
        }
        return value;
    }

    @memorize()
    getEnumType(): GraphQLEnumType {
        return new GraphQLEnumType({
            name: this.name,
            values: chain(this.values)
                .keyBy(value => value.name)
                .mapValues(
                    (value): GraphQLEnumValueConfig => ({
                        value: value.name,
                        deprecationReason: value.deprecationReason
                    })
                )
                .value()
        });
    }
}

export class OrderByEnumValue {
    constructor(
        public readonly path: ReadonlyArray<Field>,
        public readonly direction: OrderDirection,
        readonly rootEntityDepth?: number
    ) {}

    get underscoreSeparatedPath(): string {
        return this.path.map(field => field.name).join('_');
    }

    get name() {
        return (
            this.underscoreSeparatedPath +
            (this.direction == OrderDirection.ASCENDING ? ORDER_BY_ASC_SUFFIX : ORDER_BY_DESC_SUFFIX)
        );
    }

    get lastSegment(): Field {
        return this.path[this.path.length - 1];
    }

    get deprecationReason(): string | undefined {
        if (this.rootEntityDepth) {
            return `OrderBy values that include relations or references are deprecated`;
        }
        if (this.path.length === 1) {
            return this.path[0].deprecationReason;
        }
        const deprecations = this.path
            .filter(f => f.deprecationReason)
            .map(f => `${f.declaringType.name}.${f.name}: ${f.deprecationReason}`);
        if (deprecations.length) {
            return deprecations.join(', ');
        }
        return undefined;
    }

    getValueNode(itemNode: QueryNode): QueryNode {
        const valueNode = this.path.reduce((node, field) => createFieldNode(field, node), itemNode);
        const lastField = this.path[this.path.length - 1];
        if (lastField && lastField.type.isScalarType && lastField.type.graphQLScalarType === GraphQLOffsetDateTime) {
            return new PropertyAccessQueryNode(valueNode, TIMESTAMP_PROPERTY);
        }
        return valueNode;
    }

    getClause(itemNode: QueryNode): OrderClause {
        return new OrderClause(this.getValueNode(itemNode), this.direction);
    }
}

export interface OrderByEnumGeneratorConfig {
    readonly maxRootEntityDepth?: number;
}

interface RecursionOptions {
    readonly path?: ReadonlyArray<Field>;
    readonly rootEntityDepth?: number;
}

export class OrderByEnumGenerator {
    constructor(private readonly config: OrderByEnumGeneratorConfig = {}) {}

    /**
     * Generate the OrderBy type for an object type, or undefined if has not any fields to order by
     */
    @memorize()
    generate(objectType: ObjectType): OrderByEnumType | undefined {
        const values = this.getValues(objectType);
        if (!values.length) {
            return undefined;
        }
        return new OrderByEnumType(objectType, values);
    }

    private getValues(type: ObjectType, options?: RecursionOptions): ReadonlyArray<OrderByEnumValue> {
        return flatMap(type.fields, field => this.getValuesForField(field, options));
    }

    private getValuesForField(field: Field, { path = [], rootEntityDepth = 0 }: RecursionOptions = {}) {
        // Don't recurse
        if (path.includes(field)) {
            return [];
        }

        // can't sort by list value
        if (field.isList) {
            return [];
        }

        const newPath = [...path, field];
        if (field.type.isObjectType) {
            const newRootEntityDepth = field.type.isRootEntityType ? rootEntityDepth + 1 : rootEntityDepth;
            if (this.config.maxRootEntityDepth != undefined && newRootEntityDepth > this.config.maxRootEntityDepth) {
                return [];
            }
            return this.getValues(field.type, { path: newPath, rootEntityDepth: newRootEntityDepth });
        }

        // currently, all scalars and enums are ordered types
        return [
            new OrderByEnumValue(newPath, OrderDirection.ASCENDING, rootEntityDepth),
            new OrderByEnumValue(newPath, OrderDirection.DESCENDING, rootEntityDepth)
        ];
    }
}
