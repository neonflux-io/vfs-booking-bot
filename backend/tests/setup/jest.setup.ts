import path from 'path';

// Load test environment variables before any module imports
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

// Increase default timeout for integration tests
jest.setTimeout(30_000);
