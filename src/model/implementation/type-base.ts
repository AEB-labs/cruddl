import { NameNode, TypeDefinitionNode } from 'graphql';
import { TypeConfig, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';

export abstract class TypeBase implements ModelComponent {
    readonly name: string;
    readonly description: string | undefined;
    abstract readonly kind: TypeKind;
    readonly astNode: TypeDefinitionNode | undefined;
    readonly nameASTNode: NameNode | undefined;

    protected constructor(input: TypeConfig) {
        this.astNode = input.astNode;
        this.nameASTNode = input.astNode ? input.astNode.name : undefined;
        this.name = input.name;
        this.description = input.description;
    }

    validate(context: ValidationContext) {
        this.validateName(context);
    }

    private validateName(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Type name is empty.`, undefined, this.nameASTNode));
            return;
        }

        // Leading underscores are reserved for internal names
        if (this.name.startsWith('_')) {
            context.addMessage(ValidationMessage.error(`Type names should not start with an underscore.`, undefined, this.nameASTNode));
            return;
        }

        // Especially forbid leading underscores. This is more of a linter rule, but it also ensures there are no collisions with internal collections, introspection or the like
        if (!this.name.match(/^[a-zA-Z][a-zA-Z0-9]+$/)) {
            context.addMessage(ValidationMessage.warn(`Type names should only contain alphanumeric characters.`, undefined, this.nameASTNode));
            return;
        }

        // this is a linter rule
        if (!this.name.match(/^[A-Z]/)) {
            context.addMessage(ValidationMessage.warn(`Type names should start with an uppercase character.`, undefined, this.nameASTNode));
        }
    }

    abstract readonly isObjectType: boolean = false;
    abstract readonly isRootEntityType: boolean = false;
    abstract readonly isChildEntityType: boolean = false;
    abstract readonly isEntityExtensionType: boolean = false;
    abstract readonly isValueObjectType: boolean = false;
    abstract readonly isScalarType: boolean = false;
    abstract readonly isEnumType: boolean = false;
}
