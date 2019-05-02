import {EnumType, Field, ObjectType, RootEntityType, ScalarType, Type} from "../../model/implementation";
import {AnyValue, flatMap, objectEntries} from "../../utils/utils";
import memorize from "memorize-decorator";
import {EnumTypeGenerator} from "../enum-type-generator";
import {GraphQLEnumType, Thunk} from "graphql";
import {resolveThunk} from "../query-node-object-type";
import {TypedInputObjectType} from "../typed-input-object-type";
import {getQuickSearchFilterTypeName, getQuickSearchGlobalFilterTypeName} from "../../schema/names";
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    NullQueryNode,
    OrderDirection,
    QueryNode
} from "../../query-tree";
import {
    AndFilterField,
    EntityExtensionFilterField,
    FilterField,
    NestedObjectFilterField,
    OrFilterField,
    ScalarOrEnumFieldFilterField,
    ScalarOrEnumFilterField
} from "../filter-input-types/filter-fields";
import {
    and,
    QUICK_SEARCH_FILTER_FIELDS_BY_TYPE,
    QUICK_SEARCH_FILTER_OPERATORS,
    STRING_TEXT_ANALYZER_FILTER_FIELDS
} from "./constants";
import {ENUM_FILTER_FIELDS, FILTER_OPERATORS} from "../filter-input-types/constants";
import {INPUT_FIELD_EQUAL} from "../../schema/constants";
import {OrderByEnumValue} from "../order-by-enum-generator";
import {SystemFieldOrderByEnumType} from "../quick-search-augmentation";

export class QuickSearchFilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        type: Type,
        fields: Thunk<ReadonlyArray<FilterField>>
    ) {
        super(getQuickSearchFilterTypeName(type.name), fields, `QuickSearchFilter type for \`${type.name}\`.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.`);
        // @MSF TODO: description
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

export class QuickSearchGlobalFilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        fields: Thunk<ReadonlyArray<FilterField>>,
    ) {
        super(getQuickSearchGlobalFilterTypeName(), fields, `QuickSearchFilter type for global-quick-search.\n\nAll fields in this type are *and*-combined; see the \`or\` field for *or*-combination.`);
        // @MSF TODO: description
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



export class QuickSearchFilterTypeGenerator {

    constructor(private enumTypeGenerator: EnumTypeGenerator) {
    }

    @memorize()
    generate(type: Type): QuickSearchFilterObjectType {
        if (type instanceof ScalarType) {
            return this.generateQuickSearchFilterType(type, this.buildScalarFilterFields(type))
        }
        if (type instanceof EnumType) {
            return this.generateQuickSearchFilterType(type, this.buildEnumFilterFields(type))
        }
        return this.generateQuickSearchFilterType(type, () => {
            return flatMap(
                type.fields.filter(value => value.isQuickSearchIndexed || value.isSystemField),
                (field: Field) => this.generateFieldQuickSearchFilterFields(field)
            )
        });

    }

    private generateQuickSearchFilterType(type: Type, fields: Thunk<ReadonlyArray<FilterField>>): QuickSearchFilterObjectType {
        function getFields(): ReadonlyArray<FilterField> {
            return [
                ...resolveThunk(fields),
                new AndFilterField(filterType),
                new OrFilterField(filterType),
            ]
        }

        const filterType = new QuickSearchFilterObjectType(type, getFields);
        return filterType;
    }

    private generateQuickSearchGlobalFilterType(fields: Thunk<ReadonlyArray<FilterField>>): QuickSearchFilterObjectType {
        function getFields(): ReadonlyArray<FilterField> {
            return [
                ...resolveThunk(fields),
                new AndFilterField(filterType),
                new OrFilterField(filterType),
            ]
        }

        const filterType = new QuickSearchGlobalFilterObjectType(getFields);
        return filterType;
    }

    private generateFieldQuickSearchFilterFields(field: Field): FilterField[] {
        if (field.isList) {
            return this.generateListFieldFilterFields(field,[]);
        }
        if (field.type.isScalarType) {
            return this.generateFilterFieldsForNonListScalar(field);
        }
        if (field.type.isObjectType) {
            const inputType = this.generate(field.type);
            if (field.type.isEntityExtensionType) {
                return [new EntityExtensionFilterField(field, inputType)];
            } else {
                return [new NestedObjectFilterField(field, inputType)];
            }
        }
        if (field.type.isEnumType) {
            const graphQLEnumType = this.enumTypeGenerator.generate(field.type);
            return this.generateFilterFieldsForEnumField(field, graphQLEnumType);
        }
        return [];
    }

    private generateFilterFieldsForNonListScalar(field: Field): FilterField[] {
        // @MSF TODO: validate languages only for strings
        if (field.isList || !field.type.isScalarType) {
            throw new Error(`Expected "${field.name}" to be a non-list scalar`);
        }

        const inputType = field.type.graphQLScalarType;
        const filterFields = QUICK_SEARCH_FILTER_FIELDS_BY_TYPE[field.type.graphQLScalarType.name] || [];
        let scalarFields = filterFields.map(name => new ScalarOrEnumFieldFilterField(field, QUICK_SEARCH_FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, inputType));
        field.languages.forEach(value => {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(name => new ScalarOrEnumFieldFilterField(field,QUICK_SEARCH_FILTER_OPERATORS[name], name+"_"+value.toLowerCase(), inputType))
            )
        })

        return scalarFields;
    }

    private generateFilterFieldsForEnumField(field: Field, graphQLEnumType: GraphQLEnumType): FilterField[] {
        if (field.isList || !field.type.isEnumType) {
            throw new Error(`Expected "${field.name}" to be a non-list enum`);
        }

        return ENUM_FILTER_FIELDS.map(name =>
            new ScalarOrEnumFieldFilterField(field, FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, graphQLEnumType));
    }

    private generateListFieldFilterFields(field: Field, prefix: string[]): FilterField[] {

        if(field.type instanceof ScalarType){
           return this.buildScalarFilterFields(field.type,prefix.concat([field.name,"some"]));
        }else if(field.type instanceof EnumType){
            return this.buildEnumFilterFields(field.type,prefix.concat([field.name,"some"]));
        }else{
            return flatMap(field.type.fields.filter(nestedField => nestedField.isQuickSearchIndexed || nestedField.isSystemField),(nestedField) => {
                return this.generateListFieldFilterFields(nestedField, prefix.concat([field.name]))
                // @MSF TODO: prevent endless recursion
            });
        }
    }



    private buildScalarFilterFields(type: ScalarType, prefix: string[] = []): ScalarOrEnumFilterField[] {
        const filterFields = QUICK_SEARCH_FILTER_FIELDS_BY_TYPE[type.name] || [];
        let fields = filterFields.map(name => new ScalarOrEnumFilterField(QUICK_SEARCH_FILTER_OPERATORS[name], prefix.concat([name]).join("_"), type.graphQLScalarType));

        return fields;
    }

    private buildEnumFilterFields(type: EnumType, prefix: string[] = []) {
        return ENUM_FILTER_FIELDS.map(name => new ScalarOrEnumFilterField(QUICK_SEARCH_FILTER_OPERATORS[name],  prefix.concat([name]).join("_"), this.enumTypeGenerator.generate(type)))
    }


    @memorize()
    generateGlobal(types: ReadonlyArray<RootEntityType>): QuickSearchFilterObjectType {
        return this.generateQuickSearchGlobalFilterType(() => {
            let fields = flatMap(types, type => type.fields.filter(value => value.isQuickSearchIndexed || value.isSystemField));
            fields = fields.filter((value, index, array) => {
                return !array.find((value1, index1) => value.name === value1.name && index1 < index)
            });
            return flatMap(
                fields,
                (field: Field) => this.generateFieldQuickSearchFilterFields(field) // @MSF TODO: fix languages and description (only language and description of first found field count right now)
            )
        });

    }

    @memorize()
    generateSystemFieldOrderByEnum(type: RootEntityType): SystemFieldOrderByEnumType {
        // @MSF TODO look for cleaner solution to select system fields instead of using the first type
        const systemfields = type.fields.filter(value => value.isSystemField);
        function mapToOrderByEnumValues(value: Field) {
            return [new OrderByEnumValue([value], OrderDirection.ASCENDING),new OrderByEnumValue([value], OrderDirection.DESCENDING)];
        }
        return new SystemFieldOrderByEnumType(flatMap(systemfields, mapToOrderByEnumValues));
    }

    private getValues(type: ObjectType, path: ReadonlyArray<Field>): ReadonlyArray<OrderByEnumValue> {
        return flatMap(type.fields, field => this.getValuesForField(field, path));
    }

    private getValuesForField(field: Field, path: ReadonlyArray<Field>) {
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
            return this.getValues(field.type, newPath);
        } else {
            // currently, all scalars and enums are ordered types
            return [
                new OrderByEnumValue(newPath, OrderDirection.ASCENDING),
                new OrderByEnumValue(newPath, OrderDirection.DESCENDING),
            ]
        }
    }
}