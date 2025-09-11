import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
	testMatch: 'test-browser.js',
	use: {
		...devices['Desktop Chrome'],
	},
	webServer: {
		command: 'npx serve . -p 8080',
		port: 8080,
		reuseExistingServer: true,
	},
});
