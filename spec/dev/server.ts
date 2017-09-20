

const defaultPort = 3200;

export async function start() {

    console.log('Creating schema...');
    const schema = await createSchema(config);

    const port = config.port || defaultPort;
    const schemaManager = {
        getSchema: () => schema
    };
    const graphqlServer = new GraphQLServer({
        schemaProvider: schemaManager,
        port
    });
}
