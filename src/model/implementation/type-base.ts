import { TypeDefinitionNode } from 'graphql';
import { TypeConfig, TypeKind } from '../config';
import { LocationLike, ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';

export abstract class TypeBase implements ModelComponent {
    readonly name: string;
    readonly description: string | undefined;
    abstract readonly kind: TypeKind;
    readonly astNode: TypeDefinitionNode | undefined;

    protected constructor(input: TypeConfig) {
        this.astNode = input.astNode;
        this.name = input.name;
        this.description = input.description;
    }

    validate(context: ValidationContext) {
        this.validateName(context);
    }

    private validateName(context: ValidationContext) {
        let location = this.getValidationLocation();

        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Type name is empty.`, undefined, location));
            return;
        }

        // Leading underscores are reserved for internal names
        if (this.name.startsWith('_')) {
            context.addMessage(ValidationMessage.error(`Type names should not start with an underscore.`, undefined, location));
            return;
        }

        // Especially forbid leading underscores. This is more of a linter rule, but it also ensures there are no collisions with internal collections, introspection or the like
        if (!this.name.match(/^[a-zA-Z][a-zA-Z0-9]+$/)) {
            context.addMessage(ValidationMessage.warn(`Type names should only contain alphanumeric characters.`, undefined, location));
            return;
        }

        // this is a linter rule
        if (!this.name.match(/^[A-Z]/)) {
            context.addMessage(ValidationMessage.warn(`Type names should start with an uppercase character.`, undefined, location));
        }
    }

    protected getValidationLocation(): LocationLike | undefined {
        let location: LocationLike | undefined;
        if (this.astNode && this.astNode.loc) {
            location = this.astNode.loc;
        }
        if (this.astNode && this.astNode.name) {
            location = this.astNode.name.loc;
        }
        return location;
    }

    abstract readonly isObjectType: boolean = false;
    abstract readonly isRootEntityType: boolean = false;
    abstract readonly isChildEntityType: boolean = false;
    abstract readonly isEntityExtensionType: boolean = false;
    abstract readonly isValueObjectType: boolean = false;
    abstract readonly isScalarType: boolean = false;
    abstract readonly isEnumType: boolean = false;
}
