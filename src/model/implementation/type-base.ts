import { NameNode, TypeDefinitionNode } from 'graphql';
import memorize from 'memorize-decorator';
import pluralize from 'pluralize';
import { FlexSearchLanguage, TypeConfig, TypeKind } from '../config';
import { ValidationMessage } from '../validation';
import { ModelComponent, ValidationContext } from '../validation/validation-context';
import { TypeLocalization } from './i18n';
import { Model } from './model';
import { Namespace } from './namespace';
import { EffectiveModuleSpecification } from './modules/effective-module-specification';
import { MODULES_DIRECTIVE } from '../../schema/constants';
import { TypeModuleSpecification } from './modules/type-module-specification';
import { Type } from './type';
import { WarningCode } from '../../schema/message-codes';

export abstract class TypeBase implements ModelComponent {
    readonly name: string;
    readonly namespacePath: ReadonlyArray<string>;
    readonly pluralName: string;
    readonly description: string | undefined;
    abstract readonly kind: TypeKind;
    readonly astNode: TypeDefinitionNode | undefined;
    readonly nameASTNode: NameNode | undefined;
    readonly flexSearchLanguage: FlexSearchLanguage | undefined;
    readonly moduleSpecification?: TypeModuleSpecification;

    /**
     * Indicates if this is type that is built into cruddl instead of being declared by the schema author
     */
    readonly isBuiltinType: boolean;

    protected constructor(
        input: TypeConfig,
        public readonly model: Model,
    ) {
        this.astNode = input.astNode;
        this.nameASTNode = input.astNode ? input.astNode.name : undefined;
        this.name = input.name;
        this.isBuiltinType = input.isBuiltinType ?? false;
        this.namespacePath = input.namespacePath || [];
        this.description = input.description;
        this.pluralName = pluralize(this.name);
        this.flexSearchLanguage = input.flexSearchLanguage || FlexSearchLanguage.EN;

        if (input.moduleSpecification) {
            this.moduleSpecification = new TypeModuleSpecification(
                input.moduleSpecification,
                // the second parameter of the constructor expects a "Type", but we are a "TypeBase"
                // "Type" is an exhaustive union, other sublcasses of TypeBase are not expected,
                // so we can safely do this cast
                this as any as Type,
            );
        }
    }

    validate(context: ValidationContext) {
        // we still validate builtin types because the schema author can sometimes override parts of it (e.g. @key)
        // our tests should catch if a validation rule fails for a builtin type.

        this.validateName(context);
        this.validateModuleDeclaration(context);
    }

    private validateName(context: ValidationContext) {
        if (!this.name) {
            context.addMessage(ValidationMessage.error(`Type name is empty.`, this.nameASTNode));
            return;
        }

        // Leading underscores are reserved for internal names
        if (this.name.startsWith('_')) {
            context.addMessage(
                ValidationMessage.error(
                    `Type names cannot start with an underscore.`,
                    this.nameASTNode,
                ),
            );
            return;
        }

        // some naming convention rules

        if (this.name.includes('_')) {
            context.addMessage(
                ValidationMessage.suppressableWarning(
                    'NAMING',
                    `Type names should not include underscores.`,
                    this.astNode,
                    { location: this.nameASTNode },
                ),
            );
            return;
        }

        if (!this.name.match(/^[A-Z]/)) {
            context.addMessage(
                ValidationMessage.suppressableWarning(
                    'NAMING',
                    `Type names should start with an uppercase character.`,
                    this.astNode,
                    { location: this.nameASTNode },
                ),
            );
        }
    }

    private validateModuleDeclaration(context: ValidationContext) {
        if (this.moduleSpecification) {
            this.moduleSpecification.validate(context);
        }

        const withModuleDefinitions = this.model.options?.withModuleDefinitions ?? false;
        if (withModuleDefinitions && !this.isBuiltinType && !this.moduleSpecification) {
            context.addMessage(
                ValidationMessage.error(
                    `Type "${this.name}" is missing a module specification. Add @${MODULES_DIRECTIVE}(in: ...) to specify the modules.`,
                    this.nameASTNode,
                ),
            );
        }
    }

    public getLocalization(resolutionOrder: ReadonlyArray<string>): TypeLocalization {
        return this.model.i18n.getTypeLocalization(this, resolutionOrder);
    }

    @memorize()
    get namespace(): Namespace {
        return this.model.getNamespaceByPathOrThrow(this.namespacePath);
    }

    @memorize()
    get label(): Record<string, string> {
        const res: Record<string, string> = {};
        for (const [lang, localization] of Object.entries(this.model.i18n.getTypeI18n(this))) {
            if (localization.label) {
                res[lang] = localization.label;
            }
        }
        return res;
    }

    @memorize()
    get labelPlural(): Record<string, string> {
        const res: Record<string, string> = {};
        for (const [lang, localization] of Object.entries(this.model.i18n.getTypeI18n(this))) {
            if (localization.labelPlural) {
                res[lang] = localization.labelPlural;
            }
        }
        return res;
    }

    @memorize()
    get hint(): Record<string, string> {
        const res: Record<string, string> = {};
        for (const [lang, localization] of Object.entries(this.model.i18n.getTypeI18n(this))) {
            if (localization.hint) {
                res[lang] = localization.hint;
            }
        }
        return res;
    }

    @memorize()
    get effectiveModuleSpecification(): EffectiveModuleSpecification {
        return new EffectiveModuleSpecification({
            // clauses being undefined is an error state, recover gracefully
            orCombinedClauses: this.moduleSpecification?.clauses ?? [],
        }).simplify();
    }

    abstract readonly isObjectType: boolean;
    abstract readonly isRootEntityType: boolean;
    abstract readonly isChildEntityType: boolean;
    abstract readonly isEntityExtensionType: boolean;
    abstract readonly isValueObjectType: boolean;
    abstract readonly isScalarType: boolean;
    abstract readonly isEnumType: boolean;
}
