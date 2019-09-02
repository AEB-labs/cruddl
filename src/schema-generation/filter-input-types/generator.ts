import { GraphQLEnumType, Thunk } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { EnumType, Field, ScalarType, Type } from '../../model/index';
import { BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, NullQueryNode, QueryNode } from '../../query-tree';
import { INPUT_FIELD_EQUAL } from '../../schema/constants';
import { getFilterTypeName } from '../../schema/names';
import { AnyValue, objectEntries } from '../../utils/utils';
import { EnumTypeGenerator } from '../enum-type-generator';
import { resolveThunk } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import { and } from '../utils/input-types';
import { ENUM_FILTER_FIELDS, FILTER_FIELDS_BY_TYPE, FILTER_OPERATORS, QUANTIFIERS } from './constants';
import { AndFilterField, EntityExtensionFilterField, FilterField, ListFilterField, NestedObjectFilterField, OrFilterField, QuantifierFilterField, ScalarOrEnumFieldFilterField, ScalarOrEnumFilterField } from './filter-fields';

export class FilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        type: Type,
        fields: Thunk<ReadonlyArray<FilterField>>
    ) {
        super(getFilterTypeName(type.name), fields, `Filter type for \`${type.name}\`.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.`);
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue as any)
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
            return this.generateFilterType(type, this.buildScalarFilterFields(type));
        }
        if (type instanceof EnumType) {
            return this.generateFilterType(type, this.buildEnumFilterFields(type));
        }
        return this.generateFilterType(type,
            () => flatMap(type.fields, (field: Field) => this.generateFieldFilterFields(field)));
    }

    private generateFilterType(type: Type, fields: Thunk<ReadonlyArray<FilterField>>): FilterObjectType {
        function getFields(): ReadonlyArray<FilterField> {
            return [
                ...resolveThunk(fields),
                new AndFilterField(filterType),
                new OrFilterField(filterType)
            ];
        }

        const filterType = new FilterObjectType(type, getFields);
        return filterType;
    }

    private generateFieldFilterFields(field: Field): FilterField[] {
        if (field.isCollectField || field.isCollectField) {
            // traversal and aggregation fields can't be used to filter
            return [];
        }
        if (field.isList) {
            return this.generateListFieldFilterFields(field);
        }
        if (field.type.isScalarType) {
            return this.generateFilterFieldsForNonListScalar(field);
        }
        if (field.type.isObjectType) {
            const inputType = this.generate(field.type);
            if (field.type.isEntityExtensionType) {
                return [new EntityExtensionFilterField(field, inputType)];
            }

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
            throw new Error(`Expected "${field.name}" to be a non-list scalar`);
        }

        const inputType = field.type.graphQLScalarType;
        const filterFields = FILTER_FIELDS_BY_TYPE[field.type.graphQLScalarType.name] || [];
        return filterFields.map(name => new ScalarOrEnumFieldFilterField(field, FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, inputType));
    }

    private generateFilterFieldsForEnumField(field: Field, graphQLEnumType: GraphQLEnumType): FilterField[] {
        if (field.isList || !field.type.isEnumType) {
            throw new Error(`Expected "${field.name}" to be a non-list enum`);
        }

        return ENUM_FILTER_FIELDS.map(name =>
            new ScalarOrEnumFieldFilterField(field, FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, graphQLEnumType));
    }

    private generateListFieldFilterFields(field: Field): ListFilterField[] {
        const inputType = this.generate(field.type);
        return QUANTIFIERS.map((quantifierName) => new QuantifierFilterField(field, quantifierName, inputType));
    }

    private buildScalarFilterFields(type: ScalarType): ScalarOrEnumFilterField[] {
        const filterFields = FILTER_FIELDS_BY_TYPE[type.name] || [];
        return filterFields.map(name => new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, type.graphQLScalarType));
    }

    private buildEnumFilterFields(type: EnumType) {
        return ENUM_FILTER_FIELDS.map(name => new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, this.enumTypeGenerator.generate(type)));
    }
}
