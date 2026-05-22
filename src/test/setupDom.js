// Loaded for every test file, but its jest-dom matchers + cleanup only have effect
// when the file opts into the jsdom environment via `// @vitest-environment jsdom`.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
