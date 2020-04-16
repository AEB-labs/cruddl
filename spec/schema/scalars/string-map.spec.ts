import { expect } from 'chai';
import { GraphQLStringMap } from '../../../src/schema/scalars/string-map';

describe('GraphQLStringMap', () => {
    describe('parseLiteral', () => {
        it('parses simple string maps', () => {
            const parsed = GraphQLStringMap.parseLiteral(
                {
                    kind: 'ObjectValue',
                    fields: [
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'prop1'
                            },
                            value: {
                                kind: 'StringValue',
                                value: 'val1'
                            }
                        },
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'prop2'
                            },
                            value: {
                                kind: 'StringValue',
                                value: 'val2'
                            }
                        }
                    ]
                },
                undefined
            );
            expect(parsed).to.deep.equal({
                prop1: 'val1',
                prop2: 'val2'
            });
        });

        it('removes null values', () => {
            const parsed = GraphQLStringMap.parseLiteral(
                {
                    kind: 'ObjectValue',
                    fields: [
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'prop1'
                            },
                            value: {
                                kind: 'StringValue',
                                value: 'val1'
                            }
                        },
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'empty'
                            },
                            value: {
                                kind: 'NullValue'
                            }
                        }
                    ]
                },
                undefined
            );
            expect(parsed).to.deep.equal({
                prop1: 'val1'
            });
        });

        it('takes strings from variables', () => {
            const parsed = GraphQLStringMap.parseLiteral(
                {
                    kind: 'ObjectValue',
                    fields: [
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'prop1'
                            },
                            value: {
                                kind: 'StringValue',
                                value: 'val1'
                            }
                        },
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'varField'
                            },
                            value: {
                                kind: 'Variable',
                                name: {
                                    kind: 'Name',
                                    value: 'var'
                                }
                            }
                        }
                    ]
                },
                {
                    var: 'varValue'
                }
            );
            expect(parsed).to.deep.equal({
                prop1: 'val1',
                varField: 'varValue'
            });
        });

        it('ignores nulls from variables', () => {
            const parsed = GraphQLStringMap.parseLiteral(
                {
                    kind: 'ObjectValue',
                    fields: [
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'prop1'
                            },
                            value: {
                                kind: 'StringValue',
                                value: 'val1'
                            }
                        },
                        {
                            kind: 'ObjectField',
                            name: {
                                kind: 'Name',
                                value: 'varField'
                            },
                            value: {
                                kind: 'Variable',
                                name: {
                                    kind: 'Name',
                                    value: 'var'
                                }
                            }
                        }
                    ]
                },
                {
                    var: null
                }
            );
            expect(parsed).to.deep.equal({
                prop1: 'val1'
            });
        });

        it('errors on non-object values', () => {
            expect(() => {
                GraphQLStringMap.parseLiteral(
                    {
                        kind: 'IntValue',
                        value: '123'
                    },
                    undefined
                );
            }).to.throw('Expected object value');
        });

        it('errors on non-string property values', () => {
            expect(() => {
                GraphQLStringMap.parseLiteral(
                    {
                        kind: 'ObjectValue',
                        fields: [
                            {
                                kind: 'ObjectField',
                                name: {
                                    kind: 'Name',
                                    value: 'intField'
                                },
                                value: {
                                    kind: 'IntValue',
                                    value: '123'
                                }
                            }
                        ]
                    },
                    undefined
                );
            }).to.throw('Expected value of property "intField" to be a string');
        });

        it('errors on non-string variable values', () => {
            expect(() => {
                GraphQLStringMap.parseLiteral(
                    {
                        kind: 'ObjectValue',
                        fields: [
                            {
                                kind: 'ObjectField',
                                name: {
                                    kind: 'Name',
                                    value: 'varField'
                                },
                                value: {
                                    kind: 'Variable',
                                    name: {
                                        kind: 'Name',
                                        value: 'var'
                                    }
                                }
                            }
                        ]
                    },
                    {
                        var: 123
                    }
                );
            }).to.throw('Expected value of property "varField" to be a string');
        });
    });

    describe('parseValue', () => {
        it('accepts a simple string map', () => {
            const input = {
                prop1: 'value1',
                prop2: 'value2'
            };
            const result = GraphQLStringMap.parseValue(input);
            expect(result).to.equal(input);
        });

        it('removes null properties', () => {
            const input = {
                prop1: 'value1',
                empty: null
            };
            const result = GraphQLStringMap.parseValue(input);
            expect(result).not.to.equal(input);
            expect(input.empty).to.equal(null);
            expect(result).to.deep.equal({
                prop1: 'value1'
            });
        });

        it('errors on non-objects', () => {
            expect(() => GraphQLStringMap.parseValue(123)).to.throw('Expected object value');
        });

        it('errors on non-string values', () => {
            expect(() => GraphQLStringMap.parseValue({ intProp: 123 })).to.throw(
                'Expected value of property "intProp" to be a string'
            );
        });
    });
});
