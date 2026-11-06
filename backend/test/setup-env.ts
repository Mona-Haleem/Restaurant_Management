import { TEST_DATABASE_URL } from './test-env';

process.env.APP_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;
