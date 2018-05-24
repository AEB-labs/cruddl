import { GraphQLEnumType, Thunk } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { EnumType, Field, ScalarType, Type } from '../../model/index';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, NullQueryNode, QueryNode
} from '../../query-tree';
import { INPUT_FIELD_EQUAL } from '../../schema/schema-defaults';
import { AnyValue, objectEntries } from '../../utils/utils';
import { EnumTypeGenerator } from '../enum-type-generator';
import { TypedInputObjectType } from '../typed-input-object-type';
import { and, ENUM_FILTER_FIELDS, FILTER_FIELDS_BY_TYPE, FILTER_OPERATORS, QUANTIFIERS } from './constants';
import {
    FilterField, ListFilterField, NestedObjectFilterField, QuantifierFilterField, ScalarOrEnumFieldFilterField,
    ScalarOrEnumFilterField
} from './filter-fields';

export class FilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        name: string,
        fields: Thunk<ReadonlyArray<FilterField>>,
    ) {
        super(name, fields);
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue)
            .map(([name, value]) => this.getFieldOrThrow(name).getFilterNode(sourceNode, value));
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);
    }
}

export class FilterTypeGenerator {

    constructor(private enumTypeGenerator: EnumTypeGenerator) {
    }

    @memorize()
    generate(type: Type): FilterObjectType {
        if (type instanceof ScalarType) {
            return new FilterObjectType(`${type.name}Filter`, this.buildScalarFilterFields(type))
        }
        if (type instanceof EnumType) {
            return new FilterObjectType(`${type.name}Filter`, this.buildEnumFilterFields(type))
        }
        return new FilterObjectType(`${type.name}Filter`,
            () => flatMap(type.fields, (field: Field) => this.generateFieldFilterFields(field)));
    }

    private generateFieldFilterFields(field: Field): FilterField[] {
        if (field.isList) {
            return this.generateListFieldFilterFields(field);
        }
        if (field.type.isScalarType) {
            return this.generateFilterFieldsForNonListScalar(field);
        }
        if (field.type.isObjectType) {
            const inputType = this.generate(field.type);
            return [new NestedObjectFilterField(field, inputType)];
        }
        if (field.type.isEnumType) {
            const graphQLEnumType = this.enumTypeGenerator.generate(field.type);
            return this.generateFilterFieldsForEnumField(field, graphQLEnumType);
        }
        return [];
    }

    private generateFilterFieldsForNonListScalar(field: Field): FilterField[] {
        if (field.isList || !field.type.isScalarType) {
            return [];
        }

        const inputType = field.type.graphQLScalarType;
        return FILTER_FIELDS_BY_TYPE[field.type.graphQLScalarType.name]
            .map(name => new ScalarOrEnumFieldFilterField(field, FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, inputType));
    }

    private generateFilterFieldsForEnumField(field: Field, graphQLEnumType: GraphQLEnumType): FilterField[] {
        if (field.isList || !field.type.isEnumType) {
            return [];
        }

        return ENUM_FILTER_FIELDS.map(name =>
            new ScalarOrEnumFieldFilterField(field, FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, graphQLEnumType));
    }

    private generateListFieldFilterFields(field: Field): ListFilterField[] {
        const inputType = this.generate(field.type);
        return QUANTIFIERS.map((quantifierName) => new QuantifierFilterField(field, quantifierName, inputType));
    }

    private buildScalarFilterFields(type: ScalarType): ScalarOrEnumFilterField[] {
        return FILTER_FIELDS_BY_TYPE[type.name].map(name => new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, type.graphQLScalarType))
    }

    private buildEnumFilterFields(type: EnumType) {
        return ENUM_FILTER_FIELDS.map(name => new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, this.enumTypeGenerator.generate(type)))
    }
}
