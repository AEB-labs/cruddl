import { GraphQLInputFieldConfig, GraphQLInputObjectType, GraphQLInputType } from 'graphql';
import { chain } from 'lodash';
import memorize from 'memorize-decorator';

export interface TypedInputFieldBase<TField extends TypedInputFieldBase<TField>> {
    readonly name: string
    readonly inputType: GraphQLInputType | TypedInputObjectType<TField>
}

export class TypedInputObjectType<TField extends TypedInputFieldBase<TField>> {
    private readonly fieldMap: ReadonlyMap<string, TField>;

    constructor(
        public readonly name: string,
        public readonly fields: ReadonlyArray<TField>
    ) {
        this.fieldMap = new Map(fields.map((field): [string, TField] => ([field.name, field])));
    }

    @memorize()
    getInputType(): GraphQLInputObjectType {
        return new GraphQLInputObjectType({
            name: this.name,
            fields: chain(this.fields)
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
}
