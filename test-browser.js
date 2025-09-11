/* eslint-env browser */
import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
	await page.goto('http://localhost:8080/');
	await page.addScriptTag({
		type: 'module',
		content: `
			import {sha1, sha256, sha384, sha512} from './browser.js';
			window.sha1 = sha1;
			window.sha256 = sha256;
			window.sha384 = sha384;
			window.sha512 = sha512;
		`,
	});
	await page.waitForFunction(() => window.sha1 && window.sha256 && window.sha384 && window.sha512);
});

test('hash functions work correctly', async ({page}) => {
	const results = await page.evaluate(async () => {
		const sha1Result = await window.sha1('🦄');
		const sha256Result = await window.sha256('🦄');
		const sha384Result = await window.sha384('🦄');
		const sha512Result = await window.sha512('🦄');

		return {
			sha1Result,
			sha256Result,
			sha384Result,
			sha512Result,
		};
	});

	expect(results.sha1Result).toBe('5df82936cbf0864be4b7ba801bee392457fde9e4');
	expect(results.sha256Result).toBe('36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc');
	expect(results.sha384Result).toBe('a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca');
	expect(results.sha512Result).toBe('7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905');
});

test('accepts various input types', async ({page}) => {
	const results = await page.evaluate(async () => {
		// TypedArray
		const uint16Result = await window.sha1(new Uint16Array([1, 2, 3]));

		// ArrayBuffer
		const {buffer} = new TextEncoder().encode('test');
		const bufferResult = await window.sha256(buffer);

		// DataView
		const dataViewBuffer = new ArrayBuffer(4);
		const view = new DataView(dataViewBuffer);
		view.setUint8(0, 1);
		view.setUint8(1, 2);
		view.setUint8(2, 3);
		view.setUint8(3, 4);
		const dataViewResult = await window.sha1(view);

		return {uint16Result, bufferResult, dataViewResult};
	});

	expect(results.uint16Result).toBe('5b9ba303e3d8ef9e9d421085303cda49d64c79bf');
	expect(results.bufferResult).toHaveLength(64);
	expect(results.dataViewResult).toHaveLength(40);
});

test('buffer output format', async ({page}) => {
	const result = await page.evaluate(async () => {
		const buffer = await window.sha1('🦄', {outputFormat: 'buffer'});
		return buffer instanceof ArrayBuffer && buffer.byteLength === 20;
	});
	expect(result).toBe(true);
});

test('no ArrayBuffer detachment', async ({page}) => {
	const result = await page.evaluate(async () => {
		const buffer = new ArrayBuffer(16);
		const view = new Uint8Array(buffer);
		view[0] = 42;

		await window.sha256(buffer);

		return buffer.byteLength === 16 && view[0] === 42;
	});
	expect(result).toBe(true);
});
