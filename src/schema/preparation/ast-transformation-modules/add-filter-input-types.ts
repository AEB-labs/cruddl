import {ASTTransformer} from "../ast-transformer";
import {
    DirectiveNode,
    DocumentNode, FieldDefinitionNode,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from 'graphql';
import { findDirectiveWithName, getNamedTypeDefinitionAST, getObjectTypes } from '../../schema-utils';
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
import {
    ARGUMENT_AND, ARGUMENT_OR, ROLES_DIRECTIVE, SCALAR_DATE, SCALAR_DATETIME, SCALAR_TIME
} from '../../schema-defaults';
import { compact, flatMap } from '../../../utils/utils';

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
            ...flatMap(objectType.fields, field => this.createInputFilterTypeFields(ast, field, field.type)),
            this.buildListOfNamedTypeField(ARGUMENT_AND,  getFilterTypeName(objectType)),
            this.buildListOfNamedTypeField(ARGUMENT_OR, getFilterTypeName(objectType)),
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
    protected createInputFilterTypeFields(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode[] {
        const name = field.name.value;
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputFilterTypeFields(ast, field, type.type);
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
                                    this.buildNamedTypeFieldForField(name, 'String', field),
                                    this.buildNamedTypeFieldForField(notField(name), 'String', field),
                                    this.buildListOfNamedTypeFieldForField(inField(name), 'String', field),
                                    this.buildListOfNamedTypeFieldForField(notInField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(ltField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(lteField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(gtField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(gteField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(containsField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(notContainsField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(starts_with_field(name), 'String', field),
                                    this.buildNamedTypeFieldForField(not_starts_with_field(name), 'String', field),
                                    this.buildNamedTypeFieldForField(endsWithField(name), 'String', field),
                                    this.buildNamedTypeFieldForField(notEndsWithField(name), 'String', field),
                                ];
                            case SCALAR_TIME:
                            case SCALAR_DATE:
                            case SCALAR_DATETIME:
                            case 'Int': // TODO: should't id have a reduced set? gt, lt, do they really make sense on ids?
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
                        // TODO relations and references @roles (but maybe do this in advance in a separate module?)
                        return [this.buildNamedTypeFieldForField(name, getFilterTypeName(namedTypeDefinition), field)];
                    default:
                        return []
                }
        }
    }

    protected buildNamedTypeFieldForField(name: string, typeName: string, sourceField: FieldDefinitionNode): InputValueDefinitionNode {
        return {
            kind: "InputValueDefinition",
            type: { kind: NAMED_TYPE, name: { kind: NAME, value: typeName } },
            name: { kind: NAME, value: name },
            directives: this.getDirectivesForField(sourceField)
        }
    }

    protected buildListOfNamedTypeField(name: string, innerListTypeName: string, directives?: DirectiveNode[]): InputValueDefinitionNode {
        return {
            kind: "InputValueDefinition",
            type: { kind: LIST_TYPE, type: { kind: NON_NULL_TYPE, type: { kind: NAMED_TYPE, name: { kind: NAME, value: innerListTypeName } } } },
            name: { kind: NAME, value: name },
            directives
        }
    }

    protected buildListOfNamedTypeFieldForField(name: string, typeName: string, sourceField: FieldDefinitionNode): InputValueDefinitionNode {
        return this.buildListOfNamedTypeField(name, typeName, this.getDirectivesForField(sourceField));
    }

    protected getDirectivesForField(field: FieldDefinitionNode) {
        const directiveNames = [ROLES_DIRECTIVE];
        return compact(directiveNames.map(name => findDirectiveWithName(field, name)));
    }


}