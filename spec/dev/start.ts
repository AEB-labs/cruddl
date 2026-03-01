import { start } from './server.js';

import colors from '../../src/utils/colors.js';
colors.enabled = true;

start().catch((error: Error) => {
    console.error(error.stack);
});
