
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/index.{js,jsx,ts,tsx}']
    },
    // Bundle the entire package and its internal dependencies together into the test files.
    // This is to avoid Vitest having trouble resolving the ESM (ECMAScript Modules) imports,
    // which is a common issue with packages that use ESM and have internal module imports.
    // server: {
    //   deps: {
    //     inline: ['@h1deya/json-schema-to-zod']
    //   }
    // }
  }
});
