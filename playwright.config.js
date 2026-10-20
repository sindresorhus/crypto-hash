import {defineConfig, devices} from '@playwright/test';

// A port nothing else is likely to use, and never an existing server on it. Reusing one would run the browser tests against whatever happens to be listening there instead of this package.
const port = 48_151;

export default defineConfig({
	testMatch: 'test-browser.js',
	use: {
		...devices['Desktop Chrome'],
		baseURL: `http://localhost:${port}`,
	},
	webServer: {
		command: `npx serve . -p ${port}`,
		port,
	},
});
