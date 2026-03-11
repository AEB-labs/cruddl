import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { ArangoDBAdapter, Project } from 'cruddl';

// arangodb --starter.local --starter.mode=single  --starter.port=8529
const db = new ArangoDBAdapter({
    databaseName: 'test',
    url: 'http://localhost:8529',
    user: 'root',
    password: '',
});

const project = new Project({
    sources: [
        {
            name: 'schema.graphqls',
            body: `
      type Order @rootEntity {
        orderNumber: String
          items: [OrderItem]
          deliveryAddress: Address
        paymentInfo: PaymentInfo
      }

      type PaymentInfo @entityExtension {
        creditCardNumber: String
      }

      type OrderItem @childEntity {
        itemNumber: String
          quantity: Int
      }

      type Address @valueObject {
        street: String
        postalCode: String
        city: String
          country: Country @reference
      }

      type Country @rootEntity {
          isoCode: String @key
          description: String
      }`,
        },
        {
            name: 'permission-profiles.json',
            body: JSON.stringify({
                permissionProfiles: {
                    default: {
                        permissions: [
                            {
                                roles: ['users'],
                                access: 'readWrite',
                            },
                        ],
                    },
                },
            }),
        },
    ],
    getExecutionOptions: ({}) => ({ authContext: { authRoles: ['users'] } }),
    getOperationIdentifier: ({ context }) => context as object, // each operation is executed with a unique context object
});

try {
    const schema = project.createSchema(db);
    db.updateSchema(project.getModel()); // create missing collections
    const server = new ApolloServer({
        schema,
    });
    const { url } = await startStandaloneServer(server, {
        listen: { port: 4000 },
        context: async ({ req }) => req,
    });
    console.log(`Server started on ${url}`);
} catch (error: any) {
    console.log("Did you create the 'test' database?");
    console.log(error.stack);
}
