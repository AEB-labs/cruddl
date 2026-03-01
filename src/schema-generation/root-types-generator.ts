import { memorize } from 'memorize-decorator';
import { SchemaOptions } from '../config/interfaces.js';
import { Model } from '../model/index.js';
import { BillingTypeGenerator } from './billing-type-generator.js';
import { CreateInputTypeGenerator } from './create-input-types/index.js';
import { EnumTypeGenerator } from './enum-type-generator.js';
import { FilterAugmentation } from './filter-augmentation.js';
import { FilterTypeGenerator } from './filter-input-types/index.js';
import { FlexSearchFilterTypeGenerator } from './flex-search-filter-input-types/index.js';
import { FlexSearchGenerator } from './flex-search-generator.js';
import { FlexSearchPostFilterAugmentation } from './flex-search-post-filter-augmentation.js';
import { MetaFirstAugmentation } from './limit-augmentation.js';
import { ListAugmentation } from './list-augmentation.js';
import { MetaTypeGenerator } from './meta-type-generator.js';
import { MutationTypeGenerator } from './mutation-type-generator.js';
import { OrderByAndPaginationAugmentation } from './order-by-and-pagination-augmentation.js';
import { OrderByEnumGenerator } from './order-by-enum-generator.js';
import { OutputTypeGenerator } from './output-type-generator.js';
import { QueryNodeObjectType } from './query-node-object-type/index.js';
import { QueryTypeGenerator } from './query-type-generator.js';
import { RootFieldHelper } from './root-field-helper.js';
import { UniqueFieldArgumentsGenerator } from './unique-field-arguments-generator.js';
import { UpdateInputTypeGenerator } from './update-input-types/index.js';

export class RootTypesGenerator {
    private readonly enumTypeGenerator: EnumTypeGenerator;
    private readonly filterTypeGenerator: FilterTypeGenerator;
    private readonly flexSearchFilterTypeGenerator: FlexSearchFilterTypeGenerator;
    private readonly orderByEnumGenerator: OrderByEnumGenerator;
    private readonly rootFieldHelper: RootFieldHelper;
    private readonly orderByAugmentation: OrderByAndPaginationAugmentation;
    private readonly filterAugmentation: FilterAugmentation;
    private readonly flexSearchFilterAugmentation: FlexSearchPostFilterAugmentation;
    private readonly listAugmentation: ListAugmentation;
    private readonly metaFirstAugmentation: MetaFirstAugmentation;
    private readonly uniqueFieldArgumentsGenerator: UniqueFieldArgumentsGenerator;

    private readonly metaTypeGenerator: MetaTypeGenerator;
    private readonly outputTypeGenerator: OutputTypeGenerator;
    private readonly flexSearchGenerator: FlexSearchGenerator;
    private readonly createTypeGenerator: CreateInputTypeGenerator;
    private readonly updateTypeGenerator: UpdateInputTypeGenerator;
    private readonly queryTypeGenerator: QueryTypeGenerator;

    private readonly billingTypeGenerator: BillingTypeGenerator;
    private readonly mutationTypeGenerator: MutationTypeGenerator;

    constructor(private readonly options: SchemaOptions = {}) {
        this.enumTypeGenerator = new EnumTypeGenerator();
        this.filterTypeGenerator = new FilterTypeGenerator(this.enumTypeGenerator);
        this.flexSearchFilterTypeGenerator = new FlexSearchFilterTypeGenerator(
            this.enumTypeGenerator,
        );
        this.orderByEnumGenerator = new OrderByEnumGenerator({
            maxRootEntityDepth: this.options.maxOrderByRootEntityDepth,
        });
        this.rootFieldHelper = new RootFieldHelper();
        this.orderByAugmentation = new OrderByAndPaginationAugmentation(
            this.orderByEnumGenerator,
            this.rootFieldHelper,
        );
        this.filterAugmentation = new FilterAugmentation(
            this.filterTypeGenerator,
            this.rootFieldHelper,
        );
        this.flexSearchFilterAugmentation = new FlexSearchPostFilterAugmentation(
            this.filterTypeGenerator,
            this.rootFieldHelper,
            {
                omitDeprecatedOldPostFilterVariant: this.options.omitDeprecatedOldPostFilterVariant,
            },
        );
        this.listAugmentation = new ListAugmentation(
            this.filterAugmentation,
            this.orderByAugmentation,
        );
        this.metaFirstAugmentation = new MetaFirstAugmentation();
        this.uniqueFieldArgumentsGenerator = new UniqueFieldArgumentsGenerator(
            this.enumTypeGenerator,
        );

        this.metaTypeGenerator = new MetaTypeGenerator();
        this.outputTypeGenerator = new OutputTypeGenerator(
            this.listAugmentation,
            this.filterAugmentation,
            this.enumTypeGenerator,
            this.orderByEnumGenerator,
            this.metaTypeGenerator,
            this.rootFieldHelper,
        );
        this.flexSearchGenerator = new FlexSearchGenerator(
            this.flexSearchFilterTypeGenerator,
            this.outputTypeGenerator,
            this.flexSearchFilterAugmentation,
            this.orderByAugmentation,
        );
        this.createTypeGenerator = new CreateInputTypeGenerator(this.enumTypeGenerator);
        this.updateTypeGenerator = new UpdateInputTypeGenerator(
            this.enumTypeGenerator,
            this.createTypeGenerator,
        );
        this.queryTypeGenerator = new QueryTypeGenerator(
            this.outputTypeGenerator,
            this.listAugmentation,
            this.filterAugmentation,
            this.metaFirstAugmentation,
            this.metaTypeGenerator,
            this.flexSearchGenerator,
            this.uniqueFieldArgumentsGenerator,
        );

        this.billingTypeGenerator = new BillingTypeGenerator(this.outputTypeGenerator);
        this.mutationTypeGenerator = new MutationTypeGenerator(
            this.outputTypeGenerator,
            this.createTypeGenerator,
            this.updateTypeGenerator,
            this.listAugmentation,
            this.billingTypeGenerator,
            this.uniqueFieldArgumentsGenerator,
        );
    }

    @memorize()
    generateQueryType(model: Model): QueryNodeObjectType {
        return this.queryTypeGenerator.generate(model.rootNamespace);
    }

    @memorize()
    generateMutationType(model: Model): QueryNodeObjectType {
        return this.mutationTypeGenerator.generate(model.rootNamespace);
    }
}
