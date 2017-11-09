import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import {
    FieldDefinitionNode,
    GraphQLArgument,
    GraphQLEnumType, GraphQLEnumValue, GraphQLField, GraphQLInputField, GraphQLInputObjectType, GraphQLInputType,
    GraphQLList, GraphQLNonNull
} from 'graphql';
import {getAllowedReadRoles, getAllowedWriteRoles, hasDirectiveWithName} from '../schema/schema-utils';
import { intersection } from 'lodash';
import { AnyValue, compact, PlainObject } from '../utils/utils';
import { isArray } from 'util';
import {NAMESPACE_FIELD_PATH_DIRECTIVE} from "../schema/schema-defaults";

export function checkAuthorization(operation: DistilledOperation, requestRoles: string[]): AuthorizationCheckResult {
    const errorList: AuthorizationError[] = [];
    const accessKind = operation.operation == 'mutation' ? AccessKind.WRITE : AccessKind.READ;
    let newSelectionSet = checkAuthorizationForSelectionSet(operation.selectionSet, errorList, {
        accessKind,
        requestRoles,
        path: []
    });
    if (errorList.length && operation.operation == 'mutation' && newSelectionSet.length != operation.selectionSet.length) {
        // don't do partial mutations - add errors for the other fields
        // but it's ok if only some of its queries failed
        errorList.push(...newSelectionSet.map(sel => new AuthorizationError({
            isErrorBecauseOtherMutationFieldHasErrors: true,
            allowedRoles: [],
            accessKind,
            field: sel.fieldRequest.field,
            requestRoles,
            path: [ sel.propertyName ]
        })));
        newSelectionSet = [];
    }
    const sanitizedOperation = errorList.length ? new DistilledOperation(operation.operation, newSelectionSet) : operation;
    return new AuthorizationCheckResult(sanitizedOperation, errorList);
}

export class AuthorizationCheckResult {
    constructor(public readonly sanitizedOperation: DistilledOperation, public readonly errors: AuthorizationError[]) { }

    get hasErrors() {
        return this.errors.length > 0;
    }
}
export class InputValueAuthorizationError {
    constructor(params: {
        inputPath: (string|number)[],
        inputField?: GraphQLInputField,
        enumValue?: GraphQLEnumValue,
        accessKind: AccessKind,
        allowedRoles: string[],
        requestRoles: string[]
    }) {
        this.inputPath = params.inputPath;
        this.inputField = params.inputField;
        this.enumValue = params.enumValue;
        this.accessKind = params.accessKind;
        this.allowedRoles = params.allowedRoles;
        this.requestRoles = params.requestRoles;
    }

    public readonly inputPath: (string|number)[];
    public readonly inputField: GraphQLInputField|undefined;
    public readonly enumValue: GraphQLEnumValue|undefined;
    public readonly accessKind: AccessKind;
    public readonly allowedRoles: string[];
    public readonly requestRoles: string[];

    toString() {
        let path = '';
        let first = true;
        for (const segment of this.inputPath) {
            if (typeof segment == 'number') {
                path += `[${segment}]`;
            } else {
                if (first) {
                    path += 'field ';
                } else {
                    path += '.';
                }
                path += segment;
            }
            first = false;
        }
        if (this.enumValue) {
            return `${path} == ${this.enumValue.name}`;
        }
        return path;
    }
}

export class ArgumentAuthorizationError {
    constructor(params: {
        argumentName: string,
        valueErrors?: InputValueAuthorizationError[],
        accessKind: AccessKind,
        allowedRoles?: string[],
        requestRoles: string[]
    }) {
        this.argumentName = params.argumentName;
        this.valueErrors = params.valueErrors;
        this.accessKind = params.accessKind;
        this.allowedRoles = params.allowedRoles;
        this.requestRoles = params.requestRoles;
    }

    public readonly argumentName: string;
    public readonly valueErrors: InputValueAuthorizationError[]|undefined;
    public readonly accessKind: AccessKind;
    public readonly allowedRoles: string[]|undefined;
    public readonly requestRoles: string[];

    toString() {
        if (!this.valueErrors) {
            return this.argumentName;
        }
        let fieldPart = '';
        if (this.valueErrors.length) {
            fieldPart = ' (';
        }
        fieldPart += this.valueErrors.join(', ');
        if (this.valueErrors.length) {
            fieldPart += ')';
        }
        return `${this.argumentName}${fieldPart}`;
    }
}

export class AuthorizationError {
    constructor(params: {
        path: string[],
        argumentErrors?: ArgumentAuthorizationError[],
        field: GraphQLField<any, any>,
        accessKind: AccessKind,
        allowedRoles?: string[],
        requestRoles: string[],
        isErrorBecauseOtherMutationFieldHasErrors?: boolean
    }) {
        this.path = params.path;
        this.argumentErrors = params.argumentErrors || [];
        this.field = params.field;
        this.accessKind = params.accessKind;
        this.allowedRoles = params.allowedRoles;
        this.requestRoles = params.requestRoles;
        this.isSkippedBecauseOtherMutationFieldHasErrors = params.isErrorBecauseOtherMutationFieldHasErrors || false;
    }

    public readonly path: string[];
    public readonly argumentErrors: ArgumentAuthorizationError[];
    public readonly field: GraphQLField<any, any>;
    public readonly accessKind: AccessKind;
    public readonly allowedRoles: string[]|undefined;
    public readonly requestRoles: string[];
    public readonly isSkippedBecauseOtherMutationFieldHasErrors: boolean;

    toString() {
        if (this.isSkippedBecauseOtherMutationFieldHasErrors) {
            return `${this.path.join('.')} skipped because other mutation fields have authorization errors`;
        }
        let argPart = '';
        if (this.argumentErrors.length) {
            argPart += ' with argument' + (this.argumentErrors.length > 1 ? 's' : '') + ' ' +
                this.argumentErrors.join(', ');
        }
        // regarding 'call' and 'select':
        // Everything is a field selection, so 'select' would be technically. correct However, for mutations, it is
        // clearer to use the term 'call', as mutations are a kind of function calls.
        // The READ vs. WRITE aspect should become clear to the user from the error messages - e.g.
        // - Not authorized to call updateDelivery with argument input (field: secretField)
        // - Not authorized to call updateDelivery.secretField
        // - Not authorized to select allDeliveries.secretField
        // - Not authorized to select allDeliveries with argument filter (field: secretField)
        // Maybe it would be better to use field here because we already throw this at the correct path and it might
        // be confusing to show aliases here
        return `Not authorized to ${this.accessKind == AccessKind.WRITE ? 'call' : 'select'} ${this.path.join('.')}` +
            argPart;
    }
}

interface AuthorizationCheckContext {
    path: string[]
    accessKind: AccessKind
    requestRoles: string[]
}

enum AccessKind {
    READ,
    WRITE
}

function checkAuthorizationForSelectionSet(selectionSet: FieldSelection[], errorList: AuthorizationError[], context: AuthorizationCheckContext): FieldSelection[] {
    return compact(selectionSet.map(selection => {
        const newFieldRequest = checkAuthorizationForFieldRecursively(selection.fieldRequest, errorList, {
            ...context,
            path: [...context.path, selection.propertyName]
        });
        if (newFieldRequest) {
            return new FieldSelection(selection.propertyName, newFieldRequest);
        }
        return undefined;
    }));
}

function checkAuthorizationForField(fieldRequest: FieldRequest, errorList: AuthorizationError[], context: AuthorizationCheckContext): FieldRequest|undefined {
    const allowedRoles = getAllowedRoles(fieldRequest.field, context.accessKind);
    if (hasDirectiveWithName(fieldRequest.field.astNode as FieldDefinitionNode, NAMESPACE_FIELD_PATH_DIRECTIVE)) {
        // namespaces are always allowed, return original fieldRequest
        return fieldRequest;
    }
    if (allowedRoles && !intersection(allowedRoles, context.requestRoles).length) {
        // (if allowedRules is undefined, no restriction is set)
        errorList.push(new AuthorizationError({
            ...context,
            field: fieldRequest.field,
            allowedRoles,
        }));
        return undefined;
    }

    const argumentErrors: ArgumentAuthorizationError[] = [];
    for (const argumentName in fieldRequest.args) {
        const argDef = fieldRequest.field.args.find(arg => arg.name == argumentName);
        const argValue = fieldRequest.args[argumentName];
        if (argDef) {
            const error = checkAuthorizationForArgument(argDef, argValue, context);
            if (error) {
                argumentErrors.push(error);
            }
        }
    }
    if (argumentErrors.length) {
        errorList.push(new AuthorizationError({
            ...context,
            field: fieldRequest.field,
            allowedRoles: [],
            argumentErrors
        }));
        return undefined;
    }

    return fieldRequest;
}

function checkAuthorizationForFieldRecursively(fieldRequest: FieldRequest, errorList: AuthorizationError[], context: AuthorizationCheckContext): FieldRequest|undefined {
    const result = checkAuthorizationForField(fieldRequest, errorList, context);
    if (!result) {
        return result;
    }

    // process selections
    const oldErrorLength = errorList.length;
    const newSelectionSet = checkAuthorizationForSelectionSet(fieldRequest.selectionSet, errorList, {
        ...context,
        accessKind: AccessKind.READ // only the first level of mutation fields are write operations
    });
    if (oldErrorLength == errorList.length) {
        return fieldRequest;
    }
    return new FieldRequest(fieldRequest.field, fieldRequest.parentType, fieldRequest.schema, newSelectionSet, fieldRequest.args);
}

function checkAuthorizationForArgument(argument: GraphQLArgument, argValue: AnyValue, context: AuthorizationCheckContext): ArgumentAuthorizationError|undefined {
    const allowedRoles = getAllowedRoles(argument, context.accessKind);
    if (allowedRoles && !intersection(allowedRoles, context.requestRoles).length) {
        return new ArgumentAuthorizationError({
            argumentName: argument.name,
            accessKind: context.accessKind,
            allowedRoles,
            requestRoles: context.requestRoles
        });
    }

    // check value
    const inputFieldErrors: InputValueAuthorizationError[] = [];
    checkAuthorizationForInputValue(argument.type, context, argValue, [], inputFieldErrors);
    if (inputFieldErrors.length) {
        return new ArgumentAuthorizationError({
            argumentName: argument.name,
            accessKind: context.accessKind,
            valueErrors: inputFieldErrors,
            requestRoles: context.requestRoles
        });
    }

    // ok
    return undefined;
}

function checkAuthorizationForInputField(inputField: GraphQLInputField, context: AuthorizationCheckContext, inputValue: AnyValue, inputPath: (string|number)[], errorList: InputValueAuthorizationError[]): void {
    const allowedRoles = getAllowedRoles(inputField, context.accessKind);
    if (allowedRoles && !intersection(allowedRoles, context.requestRoles).length) {
        errorList.push(new InputValueAuthorizationError({
            inputPath,
            accessKind: context.accessKind,
            requestRoles: context.requestRoles,
            allowedRoles,
            inputField
        }));
        return;
    }
    checkAuthorizationForInputValue(inputField.type, context, inputValue, inputPath, errorList);
}

function checkAuthorizationForInputValue(type: GraphQLInputType, context: AuthorizationCheckContext, inputValue: AnyValue, inputPath: (string|number)[], errorList: InputValueAuthorizationError[]): void {
    if (type instanceof GraphQLNonNull) {
        checkAuthorizationForInputValue(type.ofType, context, inputValue, inputPath, errorList);
        return;
    }

    if (type instanceof GraphQLList && isArray(inputValue)) {
        inputValue.forEach((itemValue, index) => {
            const newInputPath = [ ...inputPath, index ];
            checkAuthorizationForInputValue(type.ofType, context, itemValue, newInputPath, errorList);
        });
        return;
    }

    if (type instanceof GraphQLInputObjectType && inputValue && typeof inputValue == 'object') {
        for (const fieldName of Object.keys(inputValue)) {
            const field = type.getFields()[fieldName];
            if (field) {
                const newInputPath = [ ...inputPath, fieldName ];
                checkAuthorizationForInputField(field, context, (inputValue as PlainObject)[fieldName], newInputPath, errorList);
            }
        }
    }

    if (type instanceof GraphQLEnumType && inputValue) {
        const enumValue = type.getValue(inputValue + '');
        if (enumValue) {
            const allowedRoles = getAllowedRoles(enumValue, context.accessKind);
            if (allowedRoles && !intersection(allowedRoles, context.requestRoles).length) {
                errorList.push(new InputValueAuthorizationError({
                    inputPath,
                    accessKind: context.accessKind,
                    requestRoles: context.requestRoles,
                    allowedRoles,
                    enumValue
                }));
                return;
            }
        }
    }
}

function getAllowedRoles(field: GraphQLField<any, any>|GraphQLInputField|GraphQLEnumValue, accessKind: AccessKind) {
    switch (accessKind) {
        case AccessKind.READ:
            return getAllowedReadRoles(field);
        default:
            return getAllowedWriteRoles(field);
    }
}
