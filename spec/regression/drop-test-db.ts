import { dropTempDatabase } from './initialization.js';

dropTempDatabase().then(
    () => console.log('Dropped temp test database'),
    (err) => console.error(err.message, err.stack),
);
