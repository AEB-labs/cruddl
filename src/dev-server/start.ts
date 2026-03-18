import colors from '../core/utils/colors.js';
import { start } from './server.js';

colors.enabled = true;

start().catch((error: Error) => {
    console.error(error.stack);
});
