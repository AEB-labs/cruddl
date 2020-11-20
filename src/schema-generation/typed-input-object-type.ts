import {
    GraphQLInputFieldConfig,
    GraphQLInputFieldConfigMap,
    GraphQLInputObjectType,
    GraphQLInputType,
    Thunk
} from 'graphql';
import { chain, uniqBy } from 'lodash';
import memorize from 'memorize-decorator';
import { Constructor } from '../utils/utils';
import { resolveThunk } from './query-node-object-type';

export interface TypedInputFieldBase<TField extends TypedInputFieldBase<TField>> {
    readonly name: string;
    readonly description?: string;
    readonly deprecationReason?: string;
    readonly inputType: GraphQLInputType | TypedInputObjectType<TField>;
}

export class TypedInputObjectType<TField extends TypedInputFieldBase<TField>> {
    constructor(
        public readonly name: string,
        private readonly _fields: Thunk<ReadonlyArray<TField>>,
        public readonly description?: string,
        public readonly deprecationReason?: string
    ) {}

    @memorize()
    getInputType(): GraphQLInputObjectType {
        let description = this.description;
        if (this.deprecationReason) {
            // Input types can not be deprecated officially
            description = description ? `${description}\n\n${this.deprecationReason}` : this.deprecationReason;
        }

        return new GraphQLInputObjectType({
            name: this.name,
            description,
            fields: () =>
                this.transformFieldConfigs(
                    chain(this.fields)
                        .keyBy(field => field.name)
                        .mapValues(
                            (field): GraphQLInputFieldConfig => {
                                let description = field.description;

                                if (field.deprecationReason) {
                                    // Input fields can not yet be deprecated (see https://github.com/graphql/graphql-spec/pull/525)
                                    description = description
                                        ? `${description}\n\n${field.deprecationReason}`
                                        : field.deprecationReason;
                                }

                                return {
                                    type:
                                        field.inputType instanceof TypedInputObjectType
                                            ? field.inputType.getInputType()
                                            : field.inputType,
                                    description
                                };
                            }
                        )
                        .value()
                )
        });
    }

    protected transformFieldConfigs(fields: GraphQLInputFieldConfigMap): GraphQLInputFieldConfigMap {
        return fields;
    }

    getFieldOrThrow<T extends TField>(name: string, clazz?: Constructor<T>): T {
        const field = this.fieldMap.get(name);
        if (!field) {
            throw new Error(`Expected field "${name}" to exist on input object type "${this.name}"`);
        }
        if (clazz && !(field instanceof clazz)) {
            throw new Error(
                `Expected input field "${this.name}.${name}" to be of type "${clazz.name}", but is of type "${field.constructor.name}"`
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
    thunk: Thunk<ReadonlyArray<TField>>,
    typeName: string
): ReadonlyArray<TField> {
    const fields = resolveThunk(thunk);
    if (uniqBy(fields, field => field.name).length !== fields.length) {
        throw new Error(
            `Input type "${typeName}" has duplicate fields (fields: ${fields.map(f => f.name).join(', ')})`
        );
    }
    return fields;
}
