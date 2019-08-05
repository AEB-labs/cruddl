import { NameNode, TypeDefinitionNode } from 'graphql';
import memorize from 'memorize-decorator';
import * as pluralize from 'pluralize';
import { FlexSearchLanguage, TypeConfig, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { TypeLocalization } from './i18n';
import { Model } from './model';
import { Namespace } from './namespace';

export abstract class TypeBase implements ModelComponent {
    readonly name: string;
    readonly namespacePath: ReadonlyArray<string>;
    readonly pluralName: string;
    readonly description: string | undefined;
    abstract readonly kind: TypeKind;
    readonly astNode: TypeDefinitionNode | undefined;
    readonly nameASTNode: NameNode | undefined;
    private _flexSearchLanguage: FlexSearchLanguage | undefined;

    protected constructor(input: TypeConfig, public readonly model: Model) {
        this.astNode = input.astNode;
        this.nameASTNode = input.astNode ? input.astNode.name : undefined;
        this.name = input.name;
        this.namespacePath = input.namespacePath || [];
        this.description = input.description;
        this.pluralName = pluralize(this.name);
        this._flexSearchLanguage = input.flexSearchLanguage;
    }

    validate(context: ValidationContext) {
        this.validateName(context);
    }

    private validateName(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Type name is empty.`, this.nameASTNode));
            return;
        }

        // Leading underscores are reserved for internal names
        if (this.name.startsWith('_')) {
            context.addMessage(ValidationMessage.error(`Type names cannot start with an underscore.`, this.nameASTNode));
            return;
        }

        // some naming convention rules

        if (this.name.includes('_')) {
            context.addMessage(ValidationMessage.warn(`Type names should not include underscores.`, this.nameASTNode));
            return;
        }

        if (!this.name.match(/^[A-Z]/)) {
            context.addMessage(ValidationMessage.warn(`Type names should start with an uppercase character.`, this.nameASTNode));
        }
    }

    public getLocalization(resolutionOrder: ReadonlyArray<string>): TypeLocalization {
        return this.model.i18n.getTypeLocalization(this, resolutionOrder);
    }

    @memorize()
    get namespace(): Namespace {
        return this.model.getNamespaceByPathOrThrow(this.namespacePath);
    }

    get flexSearchLanguage(): FlexSearchLanguage | undefined{
        return this._flexSearchLanguage
    }

    abstract readonly isObjectType: boolean = false;
    abstract readonly isRootEntityType: boolean = false;
    abstract readonly isChildEntityType: boolean = false;
    abstract readonly isEntityExtensionType: boolean = false;
    abstract readonly isValueObjectType: boolean = false;
    abstract readonly isScalarType: boolean = false;
    abstract readonly isEnumType: boolean = false;
}
