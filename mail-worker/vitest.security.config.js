import { defineConfig } from 'vitest/config';

// Local unit tests: never invoke the package's "test" script (it deploys a Worker).
export default defineConfig({ test: { include: ['test/security*.spec.js'], environment: 'node' } });
