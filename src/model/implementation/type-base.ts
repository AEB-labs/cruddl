import { TypeDefinitionNode } from 'graphql';
import { TypeInput, TypeKind } from '../input';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from './validation';

export abstract class TypeBase implements ModelComponent {
    readonly name: string;
    readonly description: string | undefined;
    abstract readonly kind: TypeKind;
    readonly astNode: TypeDefinitionNode | undefined;

    protected constructor(input: TypeInput) {
        this.astNode = input.astNode;
        this.name = input.name;
        this.description = input.description;
    }

    validate(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Type declaration is missing name`, undefined, this.astNode));
        }
    }

    abstract readonly isObjectType: boolean;

}
