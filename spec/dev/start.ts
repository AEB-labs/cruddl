import {start} from "./server";

// to get through firewall
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import colors from '../../src/utils/colors';
colors.enabled = true;

start().catch((error: Error) => {
    console.error(error.stack);
});
