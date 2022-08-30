import memorize from 'memorize-decorator';
import { SchemaOptions } from '../config/interfaces';
import { Model } from '../model';
import { BillingTypeGenerator } from './billing-type-generator';
import { CreateInputTypeGenerator } from './create-input-types';
import { EnumTypeGenerator } from './enum-type-generator';
import { FilterAugmentation } from './filter-augmentation';
import { FilterTypeGenerator } from './filter-input-types';
import { FlexSearchPostFilterAugmentation } from './flex-search-post-filter-augmentation';
import { FlexSearchFilterTypeGenerator } from './flex-search-filter-input-types';
import { FlexSearchGenerator } from './flex-search-generator';
import { MetaFirstAugmentation } from './limit-augmentation';
import { ListAugmentation } from './list-augmentation';
import { MetaTypeGenerator } from './meta-type-generator';
import { MutationTypeGenerator } from './mutation-type-generator';
import { OrderByAndPaginationAugmentation } from './order-by-and-pagination-augmentation';
import { OrderByEnumGenerator } from './order-by-enum-generator';
import { OutputTypeGenerator } from './output-type-generator';
import { QueryNodeObjectType } from './query-node-object-type';
import { QueryTypeGenerator } from './query-type-generator';
import { RootFieldHelper } from './root-field-helper';
import { UniqueFieldArgumentsGenerator } from './unique-field-arguments-generator';
import { UpdateInputTypeGenerator } from './update-input-types';

export class RootTypesGenerator {
    constructor(private readonly options: SchemaOptions = {}) {}

    private readonly enumTypeGenerator = new EnumTypeGenerator();
    private readonly filterTypeGenerator = new FilterTypeGenerator(this.enumTypeGenerator);
    private readonly flexSearchFilterTypeGenerator = new FlexSearchFilterTypeGenerator(
        this.enumTypeGenerator,
    );
    private readonly orderByEnumGenerator = new OrderByEnumGenerator({
        maxRootEntityDepth: this.options.maxOrderByRootEntityDepth,
    });
    private readonly rootFieldHelper = new RootFieldHelper();
    private readonly orderByAugmentation = new OrderByAndPaginationAugmentation(
        this.orderByEnumGenerator,
        this.rootFieldHelper,
    );
    private readonly filterAugmentation = new FilterAugmentation(
        this.filterTypeGenerator,
        this.rootFieldHelper,
    );
    private readonly flexSearchFilterAugmentation = new FlexSearchPostFilterAugmentation(
        this.filterTypeGenerator,
        this.rootFieldHelper,
    );
    private readonly listAugmentation = new ListAugmentation(
        this.filterAugmentation,
        this.orderByAugmentation,
    );
    private readonly metaFirstAugmentation = new MetaFirstAugmentation();
    private readonly uniqueFieldArgumentsGenerator = new UniqueFieldArgumentsGenerator(
        this.enumTypeGenerator,
    );

    private readonly metaTypeGenerator = new MetaTypeGenerator();
    private readonly outputTypeGenerator = new OutputTypeGenerator(
        this.listAugmentation,
        this.filterAugmentation,
        this.enumTypeGenerator,
        this.orderByEnumGenerator,
        this.metaTypeGenerator,
        this.rootFieldHelper,
    );
    private readonly flexSearchGenerator = new FlexSearchGenerator(
        this.flexSearchFilterTypeGenerator,
        this.outputTypeGenerator,
        this.flexSearchFilterAugmentation,
        this.orderByAugmentation,
    );
    private readonly createTypeGenerator = new CreateInputTypeGenerator(this.enumTypeGenerator);
    private readonly updateTypeGenerator = new UpdateInputTypeGenerator(
        this.enumTypeGenerator,
        this.createTypeGenerator,
    );
    private readonly queryTypeGenerator = new QueryTypeGenerator(
        this.outputTypeGenerator,
        this.listAugmentation,
        this.filterAugmentation,
        this.metaFirstAugmentation,
        this.metaTypeGenerator,
        this.flexSearchGenerator,
        this.uniqueFieldArgumentsGenerator,
    );

    private readonly billingTypeGenerator = new BillingTypeGenerator(this.outputTypeGenerator);
    private readonly mutationTypeGenerator = new MutationTypeGenerator(
        this.outputTypeGenerator,
        this.createTypeGenerator,
        this.updateTypeGenerator,
        this.listAugmentation,
        this.billingTypeGenerator,
        this.uniqueFieldArgumentsGenerator,
    );

    @memorize()
    generateQueryType(model: Model): QueryNodeObjectType {
        return this.queryTypeGenerator.generate(model.rootNamespace);
    }

    @memorize()
    generateMutationType(model: Model): QueryNodeObjectType {
        return this.mutationTypeGenerator.generate(model.rootNamespace);
    }
}
