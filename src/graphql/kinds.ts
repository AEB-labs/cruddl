// This is a copy of graphql/language/kinds so that we don't need to rely on internal modules
// (they tend to break: https://github.com/graphql/graphql-js/issues/1221)

/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Name

export const NAME: 'Name' = 'Name';

// Document

export const DOCUMENT: 'Document' = 'Document';
export const OPERATION_DEFINITION: 'OperationDefinition' = 'OperationDefinition';
export const VARIABLE_DEFINITION: 'VariableDefinition' = 'VariableDefinition';
export const VARIABLE: 'Variable' = 'Variable';
export const SELECTION_SET: 'SelectionSet' = 'SelectionSet';
export const FIELD: 'Field' = 'Field';
export const ARGUMENT: 'Argument' = 'Argument';

// Fragments

export const FRAGMENT_SPREAD: 'FragmentSpread' = 'FragmentSpread';
export const INLINE_FRAGMENT: 'InlineFragment' = 'InlineFragment';
export const FRAGMENT_DEFINITION: 'FragmentDefinition' = 'FragmentDefinition';

// Values

export const INT: 'IntValue' = 'IntValue';
export const FLOAT: 'FloatValue' = 'FloatValue';
export const STRING: 'StringValue' = 'StringValue';
export const BOOLEAN: 'BooleanValue' = 'BooleanValue';
export const NULL: 'NullValue' = 'NullValue';
export const ENUM: 'EnumValue' = 'EnumValue';
export const LIST: 'ListValue' = 'ListValue';
export const OBJECT: 'ObjectValue' = 'ObjectValue';
export const OBJECT_FIELD: 'ObjectField' = 'ObjectField';

// Directives

export const DIRECTIVE: 'Directive' = 'Directive';

// Types

export const NAMED_TYPE: 'NamedType' = 'NamedType';
export const LIST_TYPE: 'ListType' = 'ListType';
export const NON_NULL_TYPE: 'NonNullType' = 'NonNullType';

// Type System Definitions

export const SCHEMA_DEFINITION: 'SchemaDefinition' = 'SchemaDefinition';
export const OPERATION_TYPE_DEFINITION: 'OperationTypeDefinition' = 'OperationTypeDefinition';

// Type Definitions

export const SCALAR_TYPE_DEFINITION: 'ScalarTypeDefinition' = 'ScalarTypeDefinition';
export const OBJECT_TYPE_DEFINITION: 'ObjectTypeDefinition' = 'ObjectTypeDefinition';
export const FIELD_DEFINITION: 'FieldDefinition' = 'FieldDefinition';
export const INPUT_VALUE_DEFINITION: 'InputValueDefinition' = 'InputValueDefinition';
export const INTERFACE_TYPE_DEFINITION: 'InterfaceTypeDefinition' = 'InterfaceTypeDefinition';
export const UNION_TYPE_DEFINITION: 'UnionTypeDefinition' = 'UnionTypeDefinition';
export const ENUM_TYPE_DEFINITION: 'EnumTypeDefinition' = 'EnumTypeDefinition';
export const ENUM_VALUE_DEFINITION: 'EnumValueDefinition' = 'EnumValueDefinition';
export const INPUT_OBJECT_TYPE_DEFINITION: 'InputObjectTypeDefinition' = 'InputObjectTypeDefinition';

// Type Extensions

export const TYPE_EXTENSION_DEFINITION: 'TypeExtensionDefinition' = 'TypeExtensionDefinition';

// Directive Definitions

export const DIRECTIVE_DEFINITION: 'DirectiveDefinition' = 'DirectiveDefinition';
