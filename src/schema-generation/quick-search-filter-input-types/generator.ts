import {EnumType, Field, ObjectType, RootEntityType, ScalarType, Type} from "../../model/implementation";
import {AnyValue, flatMap, objectEntries} from "../../utils/utils";
import memorize from "memorize-decorator";
import {EnumTypeGenerator} from "../enum-type-generator";
import {GraphQLEnumType, Thunk} from "graphql";
import {resolveThunk} from "../query-node-object-type";
import {TypedInputObjectType} from "../typed-input-object-type";
import {getQuickSearchFilterTypeName} from "../../schema/names";
import {BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, NullQueryNode, QueryNode} from "../../query-tree";
import {
    AndFilterField,
    EntityExtensionFilterField,
    FilterField, ListFilterField, NestedObjectFilterField,
    OrFilterField, QuantifierFilterField, ScalarOrEnumFieldFilterField, ScalarOrEnumFilterField
} from "../filter-input-types/filter-fields";
import {
    and,
    QUICK_SEARCH_FILTER_FIELDS_BY_TYPE,
    QUICK_SEARCH_FILTER_OPERATORS,
    STRING_TEXT_ANALYZER_FILTER_FIELDS
} from "./constants";
import {
    ENUM_FILTER_FIELDS,
    FILTER_FIELDS_BY_TYPE,
    FILTER_OPERATORS,
    QUANTIFIERS
} from "../filter-input-types/constants";
import {INPUT_FIELD_EQUAL} from "../../schema/constants";
import {QuickSearchLanguage} from "../../model/config";

export class QuickSearchFilterObjectType extends TypedInputObjectType<FilterField> {
    constructor(
        type: Type,
        fields: Thunk<ReadonlyArray<FilterField>>,
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
                type.fields.filter(value => value.isQuickSearchIndexed),
                (field: Field) => this.generateFieldQuickSearchFilterFields(field, field.languages)
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

    private generateFieldQuickSearchFilterFields(field: Field, languages: ReadonlyArray<QuickSearchLanguage>): FilterField[] {
        if (field.isList) {
            return this.generateListFieldFilterFields(field,[]);
        }
        if (field.type.isScalarType) {
            return this.generateFilterFieldsForNonListScalar(field, languages);
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

    private generateFilterFieldsForNonListScalar(field: Field, languages: ReadonlyArray<QuickSearchLanguage>): FilterField[] {
        // @MSF TODO: validate languages only for strings
        if (field.isList || !field.type.isScalarType) {
            throw new Error(`Expected "${field.name}" to be a non-list scalar`);
        }

        const inputType = field.type.graphQLScalarType;
        const filterFields = QUICK_SEARCH_FILTER_FIELDS_BY_TYPE[field.type.graphQLScalarType.name] || [];
        let scalarFields = filterFields.map(name => new ScalarOrEnumFieldFilterField(field, QUICK_SEARCH_FILTER_OPERATORS[name], name === INPUT_FIELD_EQUAL ? undefined : name, inputType));
        languages.forEach(value => {
            scalarFields = scalarFields.concat(
                STRING_TEXT_ANALYZER_FILTER_FIELDS.map(name => new ScalarOrEnumFieldFilterField(field,QUICK_SEARCH_FILTER_OPERATORS[name], name+"_"+value.toLowerCase(), inputType))
            )
            // @MSF TODO: generate node for languages instead
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
            return flatMap(field.type.fields.filter(nestedField => nestedField.isQuickSearchIndexed),(nestedField) => {
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

}