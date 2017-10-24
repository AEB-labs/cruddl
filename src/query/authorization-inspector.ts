import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLField, GraphQLInputField, GraphQLInputObjectType, GraphQLInputType } from 'graphql';
import { getAllowedReadRoles, getAllowedWriteRoles } from '../schema/schema-utils';
import { intersection } from 'lodash';
import { AnyValue, compact, PlainObject } from '../utils/utils';

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
export class InputFieldAuthorizationError {
    constructor(params: {
        inputPath: string[],
        inputField: GraphQLInputField,
        accessKind: AccessKind,
        allowedRoles: string[],
        requestRoles: string[]
    }) {
        this.inputPath = params.inputPath;
        this.inputField = params.inputField;
        this.accessKind = params.accessKind;
        this.allowedRoles = params.allowedRoles;
        this.requestRoles = params.requestRoles;
    }

    public readonly inputPath: string[];
    public readonly inputField: GraphQLInputField;
    public readonly accessKind: AccessKind;
    public readonly allowedRoles: string[];
    public readonly requestRoles: string[];

    toString() {
        return `${this.inputPath.join('.')}`;
    }
}

export class ArgumentAuthorizationError {
    constructor(params: {
        argumentName: string,
        inputFieldErrors: InputFieldAuthorizationError[],
        accessKind: AccessKind
    }) {
        this.argumentName = params.argumentName;
        this.inputFieldErrors = params.inputFieldErrors;
        this.accessKind = params.accessKind;
    }

    public readonly argumentName: string;
    public readonly inputFieldErrors: InputFieldAuthorizationError[];
    public readonly accessKind: AccessKind;

    toString() {
        let fieldPart = '';
        if (this.inputFieldErrors.length == 1) {
            fieldPart += ' (input field: ';
        } else if (this.inputFieldErrors.length > 1) {
            fieldPart += ' (input fields: ';
        }
        fieldPart += this.inputFieldErrors.join(', ');
        if (this.inputFieldErrors.length) {
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
        allowedRoles: string[],
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
    public readonly allowedRoles: string[];
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
        return `Not authorized to ${this.accessKind == AccessKind.WRITE ? 'write' : 'read'} ${this.path.join('.')}` +
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

function checkAuthorizationForFieldRecursively(fieldRequest: FieldRequest, errorList: AuthorizationError[], context: AuthorizationCheckContext): FieldRequest|undefined {
    const allowedRoles = getAllowedRoles(fieldRequest.field, context.accessKind);
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
        const argValue = fieldRequest.args[argumentName];
        const argDef = fieldRequest.field.args.find(arg => arg.name == argumentName);
        const inputFieldErrors: InputFieldAuthorizationError[] = [];
        if (typeof argValue == 'object' && argDef) {
            const argType = getNamedType(argDef.type);
            if (argType instanceof GraphQLInputObjectType) {
                for (const fieldName in argValue) {
                    const field = argType.getFields()[fieldName];
                    if (field) {
                        inputFieldErrors.push(...checkAuthorizationForInputField(field, context, argValue[fieldName], [fieldName]));
                    }
                }
            }
        }
        if (inputFieldErrors.length) {
            argumentErrors.push(new ArgumentAuthorizationError({
                argumentName,
                accessKind: context.accessKind,
                inputFieldErrors
            }));
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

function checkAuthorizationForInputField(inputField: GraphQLInputField, context: AuthorizationCheckContext, inputValue: AnyValue, inputPath: string[]): InputFieldAuthorizationError[] {
    const allowedRoles = getAllowedRoles(inputField, context.accessKind);
    if (allowedRoles && !intersection(allowedRoles, context.requestRoles).length) {
        return [ new InputFieldAuthorizationError({
            inputPath,
            accessKind: context.accessKind,
            requestRoles: context.requestRoles,
            allowedRoles,
            inputField
        }) ];
    }

    const errors = [];
    const fieldType = getNamedType(inputField.type);
    if (inputValue && typeof inputValue == 'object' && fieldType instanceof GraphQLInputObjectType) {
        for (const fieldName in inputValue) {
            const field = fieldType.getFields()[fieldName];
            if (field) {
                errors.push(...checkAuthorizationForInputField(field, context, (inputValue as PlainObject)[fieldName], [
                    ...inputPath, fieldName
                ]));
            }
        }
    }
    return errors;
}

function getAllowedRoles(field: GraphQLField<any, any>|GraphQLInputField, accessKind: AccessKind) {
    switch (accessKind) {
        case AccessKind.READ:
            return getAllowedReadRoles(field);
        default:
            return getAllowedWriteRoles(field);
    }
}
