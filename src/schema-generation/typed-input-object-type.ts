import {
    GraphQLInputFieldConfig,
    GraphQLInputFieldConfigMap,
    GraphQLInputObjectType,
    GraphQLInputType,
    resolveReadonlyArrayThunk,
} from 'graphql';
import { ThunkReadonlyArray } from 'graphql/type/definition';
import { chain, uniqBy } from 'lodash';
import memorize from 'memorize-decorator';
import { Constructor } from '../utils/utils';

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

    @memorize()
    getInputType(): GraphQLInputObjectType {
        return new GraphQLInputObjectType({
            name: this.name,
            description: this.description,
            fields: () =>
                this.transformFieldConfigs(
                    chain(this.fields)
                        .keyBy((field) => field.name)
                        .mapValues(
                            (field): GraphQLInputFieldConfig => ({
                                type:
                                    field.inputType instanceof TypedInputObjectType
                                        ? field.inputType.getInputType()
                                        : field.inputType,
                                description: field.description,
                                deprecationReason: field.deprecationReason,
                            }),
                        )
                        .value(),
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

    @memorize()
    private get fieldMap() {
        return new Map(this.fields.map((field): [string, TField] => [field.name, field]));
    }

    @memorize()
    public get fields(): ReadonlyArray<TField> {
        return resolveAndCheckFields(this._fields, this.name);
    }
}

function resolveAndCheckFields<TField extends TypedInputFieldBase<TField>>(
    thunk: ThunkReadonlyArray<TField>,
    typeName: string,
): ReadonlyArray<TField> {
    const fields = resolveReadonlyArrayThunk(thunk);
    if (uniqBy(fields, (field) => field.name).length !== fields.length) {
        throw new Error(
            `Input type "${typeName}" has duplicate fields (fields: ${fields
                .map((f) => f.name)
                .join(', ')})`,
        );
    }
    return fields;
}
