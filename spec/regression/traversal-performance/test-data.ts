import { InitTestDataContext } from '../init-test-data-context';
import gql from 'graphql-tag';
import { generateRandomString } from '../../helpers/generate-random-string';

export default async function init(context: InitTestDataContext) {
    await context.executeGraphql(
        gql`
            mutation Init($input: CreateSuperInput!) {
                createSuper(input: $input) {
                    key
                }
            }
        `,
        {
            variables: {
                input: {
                    key: 'super1',
                    createRoots: [...Array(10).keys()].map((rootIndex) => ({
                        key: `root${rootIndex}`,
                        payload: generateRandomString(5_000_000),
                        children: [...Array(10).keys()].map((childIndex) => ({
                            key: `child${rootIndex}_${childIndex}`,
                        })),
                    })),
                },
            },
            authRoles: ['user'],
        },
    );
}
