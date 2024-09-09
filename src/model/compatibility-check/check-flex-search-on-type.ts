import { RootEntityType } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';
import { ArgumentNode, Kind, ListValueNode, ObjectValueNode, print } from 'graphql';
import { OrderDirection } from '../implementation/order';
import { FLEX_SEARCH_ORDER_ARGUMENT } from '../../schema/constants';
import { FlexSearchPrimarySortClause } from '../implementation/flex-search';

export function checkFlexSearchOnType(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    if (baselineType.isFlexSearchIndexed && !typeToCheck.isFlexSearchIndexed) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FLEX_SEARCH',
                `Type "${
                    baselineType.name
                }" needs to be enable flexSearch${getRequiredBySuffix(baselineType)}.`,
                typeToCheck.astNode,
                { location: typeToCheck.isFlexSearchIndexedAstNode ?? typeToCheck.nameASTNode },
            ),
        );
    }

    if (!baselineType.isFlexSearchIndexed || !typeToCheck.isFlexSearchIndexed) {
        // it's ok to enable flexSearch if the baseline does not
        return;
    }

    checkPrimarySort(typeToCheck, baselineType, context);
}

function checkPrimarySort(
    typeToCheck: RootEntityType,
    baselineType: RootEntityType,
    context: ValidationContext,
) {
    // using flexSearchPrimarySort, and not flexSearchPrimarySortAstNode, because the astNode
    // might not always be there
    const expectedValueNode = flexSearchSortToGraphQl(baselineType.flexSearchPrimarySort);
    const actualValueNode = flexSearchSortToGraphQl(typeToCheck.flexSearchPrimarySort);

    // check whether the effective sort configuration equals
    if (print(actualValueNode) === print(expectedValueNode)) {
        return;
    }

    // we now know that something is off. Try to figure out how the project to check should author it

    // If the baseline type has an astNode for the directive, but not for the primary sort, it's
    // likely that the baseline type did not specify the argument
    if (baselineType.kindAstNode && !baselineType.flexSearchPrimarySortAstNode) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FLEX_SEARCH_ORDER',
                `Type "${
                    baselineType.name
                }" should not specify a custom ${FLEX_SEARCH_ORDER_ARGUMENT}${getRequiredBySuffix(baselineType)}.`,
                typeToCheck.astNode,
                { location: typeToCheck.flexSearchPrimarySortAstNode ?? typeToCheck.nameASTNode },
            ),
        );
        return;
    }

    // Use the authored baselineType.flexSearchPrimarySortAstNode if present because the constructed
    // expectedValueNode can include additional fields that are added to make it unique
    // (but fall back in case the ast node is not present)
    const expectedArgumentNode: ArgumentNode = baselineType.flexSearchPrimarySortAstNode ?? {
        kind: Kind.ARGUMENT,
        name: {
            kind: Kind.NAME,
            value: FLEX_SEARCH_ORDER_ARGUMENT,
        },
        value: expectedValueNode,
    };

    context.addMessage(
        ValidationMessage.suppressableCompatibilityIssue(
            'FLEX_SEARCH_ORDER',
            `Type "${
                baselineType.name
            }" should specify ${print(expectedArgumentNode)}${getRequiredBySuffix(baselineType)}.`,
            typeToCheck.astNode,
            {
                // if the user specified the argument, report it there (suggesting to change it)
                // otherwise, report it on the @rootEntity (suggesting to add the argument)
                location:
                    typeToCheck.flexSearchPrimarySortAstNode ??
                    typeToCheck.kindAstNode ??
                    typeToCheck.nameASTNode,
            },
        ),
    );
}

function flexSearchSortToGraphQl(
    clauses: ReadonlyArray<FlexSearchPrimarySortClause>,
): ListValueNode {
    return {
        kind: Kind.LIST,
        values: clauses.map(
            (clause): ObjectValueNode => ({
                kind: Kind.OBJECT,
                fields: [
                    {
                        kind: Kind.OBJECT_FIELD,
                        name: {
                            kind: Kind.NAME,
                            value: 'fields',
                        },
                        value: {
                            kind: Kind.STRING,
                            value: clause.field.path,
                        },
                    },
                    {
                        kind: Kind.OBJECT_FIELD,
                        name: {
                            kind: Kind.NAME,
                            value: 'direction',
                        },
                        value: {
                            kind: Kind.ENUM,
                            value: clause.direction === OrderDirection.DESCENDING ? 'DESC' : 'ASC',
                        },
                    },
                ],
            }),
        ),
    };
}
