import { GraphQLInputFieldConfig, GraphQLInputObjectType, GraphQLInputType, Thunk } from 'graphql';
import { chain } from 'lodash';
import memorize from 'memorize-decorator';
import { resolveThunk } from './query-node-object-type';

export interface TypedInputFieldBase<TField extends TypedInputFieldBase<TField>> {
    readonly name: string
    readonly inputType: GraphQLInputType | TypedInputObjectType<TField>
}

export class TypedInputObjectType<TField extends TypedInputFieldBase<TField>> {
    constructor(
        public readonly name: string,
        private readonly _fields: Thunk<ReadonlyArray<TField>>
    ) {
    }

    @memorize()
    getInputType(): GraphQLInputObjectType {
        return new GraphQLInputObjectType({
            name: this.name,
            fields: () => chain(this.fields)
                .keyBy(field => field.name)
                .mapValues((field): GraphQLInputFieldConfig => ({
                    type: field.inputType instanceof TypedInputObjectType ? field.inputType.getInputType() : field.inputType
                }))
                .value()
        });
    }

    getFieldOrThrow(name: string): TField {
        const field = this.fieldMap.get(name);
        if (!field) {
            throw new Error(`Expected field "${name}" to exist on input object type "${this.name}"`);
        }
        return field;
    }

    @memorize()
    private get fieldMap() {
        return new Map(this.fields.map((field): [string, TField] => ([field.name, field])));
    }

    public get fields(): ReadonlyArray<TField> {
        return resolveThunk(this._fields);
    }
}
