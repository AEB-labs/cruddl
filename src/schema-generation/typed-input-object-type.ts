import type {
    GraphQLInputFieldConfig,
    GraphQLInputFieldConfigMap,
    GraphQLInputType,
    ThunkReadonlyArray,
} from 'graphql';
import { GraphQLInputObjectType, resolveReadonlyArrayThunk } from 'graphql';
import { memoize } from '../utils/memoize.js';
import type { Constructor } from '../utils/utils.js';

export interface TypedInputFieldBase<TField extends TypedInputFieldBase<TField>> {
    readonly name: string;
    readonly description?: string;
    readonly deprecationReason?: string;
    readonly inputType: GraphQLInputType | TypedInputObjectType<TField>;
}

export class TypedInputObjectType<TField extends TypedInputFieldBase<TField>> {
    constructor(
        public readonly name: string,
        private readonly _fields: ThunkReadonlyArray<TField>,
        public readonly description?: string,
    ) {}

    @memoize()
    getInputType(): GraphQLInputObjectType {
        return new GraphQLInputObjectType({
            name: this.name,
            description: this.description,
            fields: () =>
                this.transformFieldConfigs(
                    Object.fromEntries(
                        this.fields.map((field): [string, GraphQLInputFieldConfig] => [
                            field.name,
                            {
                                type:
                                    field.inputType instanceof TypedInputObjectType
                                        ? field.inputType.getInputType()
                                        : field.inputType,
                                description: field.description,
                                deprecationReason: field.deprecationReason,
                            },
                        ]),
                    ),
                ),
        });
    }

    protected transformFieldConfigs(
        fields: GraphQLInputFieldConfigMap,
    ): GraphQLInputFieldConfigMap {
        return fields;
    }

    getFieldOrThrow<T extends TField>(name: string, clazz?: Constructor<T>): T {
        const field = this.fieldMap.get(name);
        if (!field) {
            throw new Error(
                `Expected field "${name}" to exist on input object type "${this.name}"`,
            );
        }
        if (clazz && !(field instanceof clazz)) {
            throw new Error(
                `Expected input field "${this.name}.${name}" to be of type "${clazz.name}", but is of type "${field.constructor.name}"`,
            );
        }
        return field as T;
    }

    @memoize()
    private get fieldMap() {
        return new Map(this.fields.map((field): [string, TField] => [field.name, field]));
    }

    @memoize()
    public get fields(): ReadonlyArray<TField> {
        return resolveAndCheckFields(this._fields, this.name);
    }
}

function resolveAndCheckFields<TField extends TypedInputFieldBase<TField>>(
    thunk: ThunkReadonlyArray<TField>,
    typeName: string,
): ReadonlyArray<TField> {
    const fields = resolveReadonlyArrayThunk(thunk);
    if (new Set(fields.map((field) => field.name)).size !== fields.length) {
        throw new Error(
            `Input type "${typeName}" has duplicate fields (fields: ${fields
                .map((f) => f.name)
                .join(', ')})`,
        );
    }
    return fields;
}
