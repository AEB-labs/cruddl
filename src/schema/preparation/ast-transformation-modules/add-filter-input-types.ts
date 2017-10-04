import {ASTTransformer} from "../ast-transformer";
import {
    DocumentNode,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from "graphql";
import {getNamedTypeDefinitionAST, getObjectTypes} from "../../schema-utils";
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
    getFilterTypeName,
    gteField,
    gtField,
    inField,
    lteField,
    ltField,
    not_starts_with_field,
    notContainsField,
    notEndsWithField,
    notField,
    notInField,
    starts_with_field
} from "../../../graphql/names";
import {ARGUMENT_AND, ARGUMENT_OR, SCALAR_DATE, SCALAR_DATETIME, SCALAR_TIME} from "../../schema-defaults";
import {flatMap} from "../../../utils/utils";

export class AddFilterInputTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createInputFilterTypeForObjectType(ast, objectType))
        })
    }

    /**
     * TODO
     * - supported filter types:
     *      string: equals, lt, gt, LIKE
     *      int/float/number,date/time/datetime: equals, lt, gt
     *      boolean: equals
     *      embedded: subfiltertype with scalars above
     *      lists: any, all, none, filters ob list object type
     * - AND, OR, NOT?
     *
     */

    protected createInputFilterTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
        const args = [
            ...flatMap(objectType.fields, field => this.createInputFilterTypeFields(ast, field.name.value, field.type)),
            this.buildInputValueListOfNamedType(ARGUMENT_AND,  getFilterTypeName(objectType)),
            this.buildInputValueListOfNamedType(ARGUMENT_OR, getFilterTypeName(objectType)),
            // TODO add if supported: this.buildInputValueNamedType(ARGUMENT_NOT, getFilterTypeName(objectType))
        ];
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: { kind: "Name", value: getFilterTypeName(objectType) },
            fields: args,
            loc: objectType.loc
        }
    }

    // undefined currently means not supported.
    protected createInputFilterTypeFields(ast: DocumentNode, name: string, type: TypeNode): InputValueDefinitionNode[] {
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputFilterTypeFields(ast, name, type.type);
            case LIST_TYPE:
                // TODO
                return [];
            case NAMED_TYPE:
                // get definition for named type
                const namedTypeDefinition = getNamedTypeDefinitionAST(ast, type.name.value);
                switch (namedTypeDefinition.kind) {
                    case SCALAR_TYPE_DEFINITION:
                        switch(namedTypeDefinition.name.value) {
                            case 'String':
                                return [
                                    this.buildInputValueNamedType(name, 'String'),
                                    this.buildInputValueNamedType(notField(name), 'String'),
                                    this.buildInputValueListType(inField(name), 'String'),
                                    this.buildInputValueListType(notInField(name), 'String'),
                                    this.buildInputValueNamedType(ltField(name), 'String'),
                                    this.buildInputValueNamedType(lteField(name), 'String'),
                                    this.buildInputValueNamedType(gtField(name), 'String'),
                                    this.buildInputValueNamedType(gteField(name), 'String'),
                                    this.buildInputValueNamedType(containsField(name), 'String'),
                                    this.buildInputValueNamedType(notContainsField(name), 'String'),
                                    this.buildInputValueNamedType(starts_with_field(name), 'String'),
                                    this.buildInputValueNamedType(not_starts_with_field(name), 'String'),
                                    this.buildInputValueNamedType(endsWithField(name), 'String'),
                                    this.buildInputValueNamedType(notEndsWithField(name), 'String'),
                                ];
                            case SCALAR_TIME:
                            case SCALAR_DATE:
                            case SCALAR_DATETIME:
                            case 'Int': // TODO: should't id have a reduced set? gt, lt, do they really make sense on ids?
                            case 'Float':
                            case 'ID':
                                return [
                                    this.buildInputValueNamedType(name, namedTypeDefinition.name.value),
                                    this.buildInputValueNamedType(notField(name), namedTypeDefinition.name.value),
                                    this.buildInputValueListType(inField(name), namedTypeDefinition.name.value),
                                    this.buildInputValueListType(notInField(name), namedTypeDefinition.name.value),
                                    this.buildInputValueNamedType(ltField(name), namedTypeDefinition.name.value),
                                    this.buildInputValueNamedType(lteField(name), namedTypeDefinition.name.value),
                                    this.buildInputValueNamedType(gtField(name), namedTypeDefinition.name.value),
                                    this.buildInputValueNamedType(gteField(name), namedTypeDefinition.name.value),
                                ];
                            case 'Boolean':
                                return [
                                    this.buildInputValueNamedType(name, namedTypeDefinition.name.value),
                                ];
                            default:
                                return [];
                        }
                    case ENUM_TYPE_DEFINITION:
                        return [
                            this.buildInputValueNamedType(name, namedTypeDefinition.name.value),
                            this.buildInputValueNamedType(notField(name), namedTypeDefinition.name.value),
                            this.buildInputValueNamedType(inField(name), namedTypeDefinition.name.value),
                            this.buildInputValueNamedType(notInField(name), namedTypeDefinition.name.value),
                        ];
                    case OBJECT_TYPE_DEFINITION:
                        // use the embedded object filter
                        return [this.buildInputValueNamedType(name, getFilterTypeName(namedTypeDefinition))];
                    default:
                        return []
                }
        }
    }

    protected buildInputValueListOfNamedType(name: string, typeName: string): InputValueDefinitionNode {
        return {
            kind: "InputValueDefinition",
            type: { kind: LIST_TYPE, type: { kind: NAMED_TYPE, name: { kind: NAME, value: typeName } } },
            name: { kind: NAME, value: name }
        }
    }

    protected buildInputValueNamedType(name: string, typeName: string): InputValueDefinitionNode {
        return {
            kind: "InputValueDefinition",
            type: { kind: NAMED_TYPE, name: { kind: NAME, value: typeName } },
            name: { kind: NAME, value: name }
        }
    }

    protected buildInputValueListType(name: string, innerListTypeName: string): InputValueDefinitionNode {
        return {
            kind: "InputValueDefinition",
            type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: { kind: NAME, value: innerListTypeName } } } },
            name: { kind: NAME, value: name }
        }
    }


}