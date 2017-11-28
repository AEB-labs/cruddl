import {ASTTransformer} from "../transformation-pipeline";
import {
    DirectiveNode,
    DocumentNode,
    FieldDefinitionNode, GraphQLBoolean, GraphQLFloat, GraphQLInt, GraphQLString,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from 'graphql';
import {
    buildNameNode,
    findDirectiveWithName, getEnumTypes,
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList, hasDirectiveWithName
} from '../../schema-utils';
import {
    ENUM_TYPE_DEFINITION,
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAME,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION,
    SCALAR_TYPE_DEFINITION
} from "graphql/language/kinds";
import {
    containsField,
    endsWithField,
    everyField,
    getFilterTypeName,
    gteField,
    gtField,
    inField,
    lteField,
    ltField,
    noneField,
    notContainsField,
    notEndsWithField,
    notField,
    notInField,
    notStartsWithField,
    someField,
    startsWithField
} from "../../../graphql/names";
import {compact, flatMap} from '../../../utils/utils';
import {
    ARGUMENT_AND,
    ARGUMENT_OR,
    INPUT_FIELD_CONTAINS,
    INPUT_FIELD_ENDS_WITH,
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_GT,
    INPUT_FIELD_GTE,
    INPUT_FIELD_IN,
    INPUT_FIELD_LT,
    INPUT_FIELD_LTE,
    INPUT_FIELD_NOT,
    INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_NOT_ENDS_WITH,
    INPUT_FIELD_NOT_IN,
    INPUT_FIELD_NOT_STARTS_WITH,
    INPUT_FIELD_STARTS_WITH,
    ROLES_DIRECTIVE,
    SCALAR_DATE,
    SCALAR_DATETIME, SCALAR_JSON,
    SCALAR_TIME
} from "../../schema-defaults";

export class AddFilterInputTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        ast.definitions.push(
            this.createStringFilterType(),
            this.createIntFilterType(),
            this.createFloatFilterType(),
            this.createBooleanFilterType(),
            this.createDateFilterType(),
            this.createTimeFilterType(),
            this.createDateTimeFilterType(),
            this.createJSONFilterType(),
            ...this.createEnumTypeFilters(ast)
        );
        getObjectTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createInputFilterTypeForObjectType(ast, objectType))
        })
    }

    protected createEnumTypeFilters(ast: DocumentNode): InputObjectTypeDefinitionNode[] {
        return getEnumTypes(ast).map(enumType => {
            return {
                kind: INPUT_OBJECT_TYPE_DEFINITION,
                name: buildNameNode(getFilterTypeName(enumType)),
                fields: [
                    this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, enumType.name.value),
                    this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, enumType.name.value),
                    this.buildListOfNamedTypeFieldForField(INPUT_FIELD_IN, enumType.name.value),
                    this.buildListOfNamedTypeFieldForField(INPUT_FIELD_NOT_IN, enumType.name.value),
                ]
            }
        })
    }

    protected createInputFilterTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
        const args = [
            ...flatMap(objectType.fields, field => this.createInputFilterTypeFields(ast, field, field.type)),
            this.buildListOfNamedTypeField(ARGUMENT_AND, getFilterTypeName(objectType)),
            this.buildListOfNamedTypeField(ARGUMENT_OR, getFilterTypeName(objectType)),
            // TODO add if supported: this.buildInputValueNamedType(ARGUMENT_NOT, getFilterTypeName(objectType))
        ];
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: {kind: "Name", value: getFilterTypeName(objectType)},
            fields: args,
            loc: objectType.loc
        }
    }

    // undefined currently means not supported.
    protected createInputFilterTypeFields(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode[] {
        const name = field.name.value;
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputFilterTypeFields(ast, field, type.type);
            case LIST_TYPE:
                const innerListType = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(type.type));
                return [
                    this.buildNamedTypeFieldForField(someField(name), getFilterTypeName(innerListType), field),
                    this.buildNamedTypeFieldForField(everyField(name), getFilterTypeName(innerListType), field),
                    this.buildNamedTypeFieldForField(noneField(name), getFilterTypeName(innerListType), field),
                ];
            case NAMED_TYPE:
                // get definition for named type
                const namedTypeDefinition = getNamedTypeDefinitionAST(ast, type.name.value);
                switch (namedTypeDefinition.kind) {
                    case SCALAR_TYPE_DEFINITION:
                        switch (namedTypeDefinition.name.value) {
                            case GraphQLString.name:
                                return [
                                    this.buildNamedTypeFieldForField(name, GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(notField(name), GraphQLString.name, field),
                                    this.buildListOfNamedTypeFieldForField(inField(name), GraphQLString.name, field),
                                    this.buildListOfNamedTypeFieldForField(notInField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(ltField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(lteField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(gtField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(gteField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(containsField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(notContainsField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(startsWithField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(notStartsWithField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(endsWithField(name), GraphQLString.name, field),
                                    this.buildNamedTypeFieldForField(notEndsWithField(name), GraphQLString.name, field),
                                ];
                            case SCALAR_TIME:
                            case SCALAR_DATE:
                            case SCALAR_DATETIME:
                            case GraphQLInt.name: // TODO: should't id have a reduced set? gt, lt, do they really make sense on ids?
                            case 'Float':
                            case 'ID':
                                return [
                                    this.buildNamedTypeFieldForField(name, namedTypeDefinition.name.value, field),
                                    this.buildNamedTypeFieldForField(notField(name), namedTypeDefinition.name.value, field),
                                    this.buildListOfNamedTypeFieldForField(inField(name), namedTypeDefinition.name.value, field),
                                    this.buildListOfNamedTypeFieldForField(notInField(name), namedTypeDefinition.name.value, field),
                                    this.buildNamedTypeFieldForField(ltField(name), namedTypeDefinition.name.value, field),
                                    this.buildNamedTypeFieldForField(lteField(name), namedTypeDefinition.name.value, field),
                                    this.buildNamedTypeFieldForField(gtField(name), namedTypeDefinition.name.value, field),
                                    this.buildNamedTypeFieldForField(gteField(name), namedTypeDefinition.name.value, field),
                                ];
                            case 'Boolean':
                                return [
                                    this.buildNamedTypeFieldForField(name, namedTypeDefinition.name.value, field),
                                ];
                            default:
                                return [];
                        }
                    case ENUM_TYPE_DEFINITION:
                        return [
                            this.buildNamedTypeFieldForField(name, namedTypeDefinition.name.value, field),
                            this.buildNamedTypeFieldForField(notField(name), namedTypeDefinition.name.value, field),
                            this.buildNamedTypeFieldForField(inField(name), namedTypeDefinition.name.value, field),
                            this.buildNamedTypeFieldForField(notInField(name), namedTypeDefinition.name.value, field),
                        ];
                    case OBJECT_TYPE_DEFINITION:
                        // use the embedded object filter
                        return [this.buildNamedTypeFieldForField(name, getFilterTypeName(namedTypeDefinition), field)];
                    default:
                        return []
                }
        }
    }

    protected buildNamedTypeFieldForField(name: string, typeName: string, sourceField?: FieldDefinitionNode): InputValueDefinitionNode {
        const directives = sourceField ? this.getDirectivesForField(sourceField) : [];
        return {
            kind: "InputValueDefinition",
            type: {kind: NAMED_TYPE, name: {kind: NAME, value: typeName}},
            name: {kind: NAME, value: name},
            directives: directives
        }
    }

    protected buildListOfNamedTypeField(name: string, innerListTypeName: string, directives?: DirectiveNode[]): InputValueDefinitionNode {
        return {
            kind: "InputValueDefinition",
            type: {
                kind: LIST_TYPE,
                type: {kind: NON_NULL_TYPE, type: {kind: NAMED_TYPE, name: {kind: NAME, value: innerListTypeName}}}
            },
            name: {kind: NAME, value: name},
            directives
        }
    }

    protected buildListOfNamedTypeFieldForField(name: string, typeName: string, sourceField?: FieldDefinitionNode): InputValueDefinitionNode {
        const directives = sourceField ? this.getDirectivesForField(sourceField) : [];
        return this.buildListOfNamedTypeField(name, typeName, directives);
    }

    protected getDirectivesForField(field: FieldDefinitionNode) {
        const directiveNames = [ROLES_DIRECTIVE];
        return compact(directiveNames.map(name => findDirectiveWithName(field, name)));
    }

    protected createStringFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(GraphQLString.name)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, GraphQLString.name),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_IN, GraphQLString.name),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_NOT_IN, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LT, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LTE, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GT, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GTE, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_CONTAINS, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT_CONTAINS, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_STARTS_WITH, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT_STARTS_WITH, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_ENDS_WITH, GraphQLString.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT_ENDS_WITH, GraphQLString.name),
            ]
        }
    }

    protected createIntFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(GraphQLInt.name)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, GraphQLInt.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, GraphQLInt.name),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_IN, GraphQLInt.name),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_NOT_IN, GraphQLInt.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LT, GraphQLInt.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LTE, GraphQLInt.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GT, GraphQLInt.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GTE, GraphQLInt.name),
            ]
        }
    }

    protected createDateFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(SCALAR_DATE)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, SCALAR_DATE),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, SCALAR_DATE),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_IN, SCALAR_DATE),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_NOT_IN, SCALAR_DATE),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LT, SCALAR_DATE),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LTE, SCALAR_DATE),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GT, SCALAR_DATE),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GTE, SCALAR_DATE),
            ]
        }
    }

    protected createTimeFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(SCALAR_TIME)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, SCALAR_TIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, SCALAR_TIME),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_IN, SCALAR_TIME),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_NOT_IN, SCALAR_TIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LT, SCALAR_TIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LTE, SCALAR_TIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GT, SCALAR_TIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GTE, SCALAR_TIME),
            ]
        }
    }

    protected createDateTimeFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(SCALAR_DATETIME)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, SCALAR_DATETIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, SCALAR_DATETIME),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_IN, SCALAR_DATETIME),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_NOT_IN, SCALAR_DATETIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LT, SCALAR_DATETIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LTE, SCALAR_DATETIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GT, SCALAR_DATETIME),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GTE, SCALAR_DATETIME),
            ]
        }
    }

    protected createFloatFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(GraphQLFloat.name)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, GraphQLFloat.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, GraphQLFloat.name),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_IN, GraphQLFloat.name),
                this.buildListOfNamedTypeFieldForField(INPUT_FIELD_NOT_IN, GraphQLFloat.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LT, GraphQLFloat.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_LTE, GraphQLFloat.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GT, GraphQLFloat.name),
                this.buildNamedTypeFieldForField(INPUT_FIELD_GTE, GraphQLFloat.name),
            ]
        }
    }

    protected createBooleanFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(GraphQLBoolean.name)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, GraphQLBoolean.name),
            ]
        }
    }

    protected createJSONFilterType(): InputObjectTypeDefinitionNode {
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: buildNameNode(getFilterTypeName(SCALAR_JSON)),
            fields: [
                this.buildNamedTypeFieldForField(INPUT_FIELD_EQUAL, SCALAR_JSON),
                this.buildNamedTypeFieldForField(INPUT_FIELD_NOT, SCALAR_JSON),
            ]
        }
    }

}