import { Thunk } from 'graphql';
import { flatMap } from 'lodash';
import memorize from 'memorize-decorator';
import { EnumType, Field, ScalarType, Type } from '../model';
import { BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, NullQueryNode, QueryNode } from '../query-tree';
import { INPUT_FIELD_EQUAL } from '../schema/schema-defaults';
import { AnyValue, objectEntries } from '../utils/utils';
import {
    and, FILTER_FIELDS_BY_TYPE, FILTER_OPERATORS, FilterField, ListFilterField, QuantifierFilterField, QUANTIFIERS,
    ScalarOrEnumFieldFilterField, ScalarOrEnumFilterField
} from './filter-fields';
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
        if (field.isList) {
            return this.generateListFieldFilterFields(field);
        }
        if (field.type.isScalarType) {
            return this.generateFilterFieldsForNonListScalar(field);
        }
        if (field.type.isObjectType) {
            // TODO
        }
        if (field.type.isEnumType) {
            // TODO
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
        return QUANTIFIERS.map((quantifierName) => new QuantifierFilterField(field, quantifierName, inputType));
    }

    private buildScalarFilterFields(type: ScalarType): ScalarOrEnumFilterField[] {
        return FILTER_FIELDS_BY_TYPE[type.name].map(name => new ScalarOrEnumFilterField(FILTER_OPERATORS[name], name, type.graphQLScalarType))
    }

}
