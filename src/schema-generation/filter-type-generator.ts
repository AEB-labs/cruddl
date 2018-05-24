import { flatMap } from 'lodash';
import { GraphQLInputType, GraphQLString, Thunk } from 'graphql';
import memorize from 'memorize-decorator';
import { EnumType, Field, ScalarType, Type } from '../model';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, CountQueryNode, FieldQueryNode, LiteralQueryNode,
    NullQueryNode,
    QueryNode,
    TransformListQueryNode, VariableQueryNode
} from '../query-tree';
import { createListFieldValueNode } from '../query/fields';
import { createFilterNode } from '../query/filtering';
import {
    FILTER_ARG, INPUT_FIELD_EQUAL, INPUT_FIELD_EVERY, INPUT_FIELD_NONE, INPUT_FIELD_SOME
} from '../schema/schema-defaults';
import { AnyValue, decapitalize, objectEntries } from '../utils/utils';
import {
    and, FILTER_FIELDS_BY_TYPE, FILTER_OPERATORS, FilterField, ListFilterField, QuantifierFilterField,
    ScalarOrEnumFieldFilterField,
    ScalarOrEnumFilterField
} from './filter-fields';
import { buildTransformListQueryNode } from './query-node-object-type';
import { TypedInputObjectType } from './typed-input-object-type';

export class FilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        name: string,
        fields: Thunk<ReadonlyArray<FilterField>>
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
    @memorize()
    generate(type: Type): FilterObjectType {
        if (type instanceof ScalarType) {
            return new FilterObjectType(`${type.name}Filter`, this.buildScalarFilterFields(type))
        }
        if (type instanceof EnumType) {
            throw new Error('unimplemented');
        }
        return new FilterObjectType(`${type.name}Filter`,
            () => flatMap(type.fields, (field: Field) => this.generateFieldFilterFields(field)));
    }

    private generateFieldFilterFields(field: Field): FilterField[] {
        if (field.type.isScalarType) {
            if (!field.isList) {
                return this.generateFilterFieldsForNonListScalar(field);
            } else {
                return this.generateListFieldFilterFields(field);
            }
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

    private generateListFieldFilterFields(field: Field): ListFilterField[] {
        const inputType = this.generate(field.type);
        return [INPUT_FIELD_SOME, INPUT_FIELD_EVERY, INPUT_FIELD_NONE]
            .map((quantifierName) => new QuantifierFilterField(field, quantifierName, inputType));
    }

    private buildScalarFilterFields(type: ScalarType): ScalarOrEnumFilterField[] {
        return FILTER_FIELDS_BY_TYPE[type.name].map(name => new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, type.graphQLScalarType))
    }

}
