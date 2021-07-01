import { GraphQLEnumType, GraphQLScalarType, GraphQLString, Thunk } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { EnumType, Field, ScalarType, Type } from '../../model/index';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    NullQueryNode,
    QueryNode
} from '../../query-tree';
import { INPUT_FIELD_EQUAL } from '../../schema/constants';
import { getFilterTypeName } from '../../schema/names';
import { GraphQLI18nString, GraphQLStringMap } from '../../schema/scalars/string-map';
import { AnyValue, objectEntries } from '../../utils/utils';
import { EnumTypeGenerator } from '../enum-type-generator';
import { resolveThunk } from '../query-node-object-type';
import { TypedInputObjectType } from '../typed-input-object-type';
import { and } from '../utils/input-types';
import {
    ENUM_FILTER_FIELDS,
    FILTER_FIELDS_BY_TYPE,
    FILTER_OPERATORS,
    NUMERIC_FILTER_FIELDS,
    QUANTIFIERS
} from './constants';
import {
    AndFilterField,
    EntityExtensionFilterField,
    FilterField,
    ListFilterField,
    NestedObjectFilterField,
    OrFilterField,
    QuantifierFilterField,
    ScalarOrEnumFieldFilterField,
    ScalarOrEnumFilterField,
    StringMapEntryFilterField,
    StringMapSomeValueFilterField
} from './filter-fields';

export class FilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(typeName: string, fields: Thunk<ReadonlyArray<FilterField>>, description?: string) {
        super(
            getFilterTypeName(typeName),
            fields,
            `${description ||
                `Filter type for ${typeName}`}.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.`
        );
    }

    getFilterNode(sourceNode: QueryNode, filterValue: AnyValue): QueryNode {
        if (typeof filterValue !== 'object' || filterValue === null) {
            return new BinaryOperationQueryNode(sourceNode, BinaryOperator.EQUAL, NullQueryNode.NULL);
        }
        const filterNodes = objectEntries(filterValue as any).map(([name, value]) =>
            this.getFieldOrThrow(name).getFilterNode(sourceNode, value)
        );
        return filterNodes.reduce(and, ConstBoolQueryNode.TRUE);
    }
}

export class FilterTypeGenerator {
    constructor(private enumTypeGenerator: EnumTypeGenerator) {}

    @memorize()
    generate(type: Type): FilterObjectType {
        if (type instanceof ScalarType) {
            return this.generateFilterType(type.name, this.buildScalarFilterFields(type));
        }
        if (type instanceof EnumType) {
            return this.generateFilterType(type.name, this.buildEnumFilterFields(type));
        }
        return this.generateFilterType(type.name, () =>
            flatMap(type.fields, (field: Field) => this.generateFieldFilterFields(field))
        );
    }

    @memorize()
    private generateStringMapEntryFilterType(type: Type) {
        const keyName = type.name === GraphQLI18nString.name ? 'language' : 'key';

        return this.generateFilterType(
            type.name + 'Entry',
            () => [
                ...this.generateFilterFieldsForStringMapEntry('key', keyName),
                ...this.generateFilterFieldsForStringMapEntry('value', 'value')
            ],
            `Filter type for entries in a ${type.name}`
        );
    }

    private generateFilterType(
        typeName: string,
        fields: Thunk<ReadonlyArray<FilterField>>,
        description?: string
    ): FilterObjectType {
        function getFields(): ReadonlyArray<FilterField> {
            return [...resolveThunk(fields), new AndFilterField(filterType), new OrFilterField(filterType)];
        }

        const filterType = new FilterObjectType(typeName, getFields, description);
        return filterType;
    }

    private generateFieldFilterFields(field: Field): FilterField[] {
        if (field.isCollectField || field.isRootField || field.isParentField) {
            // traversal fields can't be used to filter
            return [];
        }
        if (field.isList) {
            return this.generateListFieldFilterFields(field);
        }
        if (field.type.isScalarType) {
            if (field.type.name == GraphQLStringMap.name || field.type.name === GraphQLI18nString.name) {
                return this.generateFilterFieldsForStringMap(field);
            }
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
        const filterFields = this.getFilterFieldsByType(field.type);
        return filterFields.map(
            name =>
                new ScalarOrEnumFieldFilterField(
                    field,
                    FILTER_OPERATORS[name],
                    name === INPUT_FIELD_EQUAL ? undefined : name,
                    inputType
                )
        );
    }

    private generateFilterFieldsForStringMapEntry(kind: 'key' | 'value', fieldName: string) {
        const inputType = GraphQLString;
        const filterFields = FILTER_FIELDS_BY_TYPE[inputType.name] || [];
        return filterFields.map(
            name =>
                new StringMapEntryFilterField(
                    kind,
                    fieldName,
                    FILTER_OPERATORS[name],
                    name === INPUT_FIELD_EQUAL ? undefined : name,
                    inputType
                )
        );
    }

    private generateFilterFieldsForEnumField(field: Field, graphQLEnumType: GraphQLEnumType): FilterField[] {
        if (field.isList || !field.type.isEnumType) {
            throw new Error(`Expected "${field.name}" to be a non-list enum`);
        }

        return ENUM_FILTER_FIELDS.map(
            name =>
                new ScalarOrEnumFieldFilterField(
                    field,
                    FILTER_OPERATORS[name],
                    name === INPUT_FIELD_EQUAL ? undefined : name,
                    graphQLEnumType
                )
        );
    }

    private generateListFieldFilterFields(field: Field): ListFilterField[] {
        const inputType = this.generate(field.type);
        return QUANTIFIERS.map(quantifierName => new QuantifierFilterField(field, quantifierName, inputType));
    }

    private buildScalarFilterFields(type: ScalarType): ScalarOrEnumFilterField[] {
        const filterFields = this.getFilterFieldsByType(type);
        return filterFields.map(
            name => new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, type, type.graphQLScalarType)
        );
    }

    private buildEnumFilterFields(type: EnumType) {
        return ENUM_FILTER_FIELDS.map(
            name =>
                new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, type, this.enumTypeGenerator.generate(type))
        );
    }

    private generateFilterFieldsForStringMap(field: Field) {
        return [new StringMapSomeValueFilterField(field, this.generateStringMapEntryFilterType(field.type))];
    }

    private getFilterFieldsByType(type: Type) {
        if (type.isScalarType && type.isNumberType) {
            return NUMERIC_FILTER_FIELDS;
        }
        return FILTER_FIELDS_BY_TYPE[type.name] || [];
    }
}
