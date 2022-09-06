import { start } from './server';

import colors from '../../src/utils/colors';
colors.enabled = true;

start().catch((error: Error) => {
    console.error(error.stack);
});
