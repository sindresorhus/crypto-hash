import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
	await page.goto('/');
	await page.addScriptTag({
		type: 'module',
		content: `
			import {sha1, sha256, sha384, sha512} from './browser.js';
			globalThis.sha1 = sha1;
			globalThis.sha256 = sha256;
			globalThis.sha384 = sha384;
			globalThis.sha512 = sha512;
		`,
	});
	await page.waitForFunction(() => globalThis.sha1 && globalThis.sha256 && globalThis.sha384 && globalThis.sha512);
});

test('hash functions work correctly', async ({page}) => {
	const results = await page.evaluate(async () => {
		const sha1Result = await globalThis.sha1('🦄');
		const sha256Result = await globalThis.sha256('🦄');
		const sha384Result = await globalThis.sha384('🦄');
		const sha512Result = await globalThis.sha512('🦄');

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
		const uint16Result = await globalThis.sha1(new Uint16Array([1, 2, 3]));

		// ArrayBuffer
		const {buffer} = new TextEncoder().encode('test');
		const bufferResult = await globalThis.sha256(buffer);

		// DataView
		const dataViewBuffer = new ArrayBuffer(4);
		const view = new DataView(dataViewBuffer);
		view.setUint8(0, 1);
		view.setUint8(1, 2);
		view.setUint8(2, 3);
		view.setUint8(3, 4);
		const dataViewResult = await globalThis.sha1(view);

		return {uint16Result, bufferResult, dataViewResult};
	});

	expect(results.uint16Result).toBe('5b9ba303e3d8ef9e9d421085303cda49d64c79bf');
	expect(results.bufferResult).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
	expect(results.dataViewResult).toBe('12dada1fff4d4787ade3333147202c3b443e376f');
});

test('a view into a larger buffer hashes only the bytes it covers', async ({page}) => {
	const results = await page.evaluate(async () => {
		const backing = new Uint8Array(128);
		for (let index = 0; index < backing.length; index++) {
			backing[index] = index * 5;
		}

		// All three cover bytes 8 to 72, whatever the element size
		const typed = await globalThis.sha256(new Uint16Array(backing.buffer, 8, 32));
		const dataView = await globalThis.sha256(new DataView(backing.buffer, 8, 64));
		const expected = await globalThis.sha256(backing.subarray(8, 72));

		return {typed, dataView, expected};
	});

	expect(results.expected).toBe(results.typed);
	expect(results.expected).toBe(results.dataView);
});

test('empty input', async ({page}) => {
	const results = await page.evaluate(async () => {
		const emptyDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

		return {
			emptyString: await globalThis.sha256(''),
			emptyArrayBuffer: await globalThis.sha256(new ArrayBuffer(0)),
			emptyUint8Array: await globalThis.sha256(new Uint8Array(0)),
			emptyDataView: await globalThis.sha256(new DataView(new ArrayBuffer(0))),
			emptyDigest,
		};
	});

	expect(results.emptyString).toBe(results.emptyDigest);
	expect(results.emptyArrayBuffer).toBe(results.emptyDigest);
	expect(results.emptyUint8Array).toBe(results.emptyDigest);
	expect(results.emptyDataView).toBe(results.emptyDigest);
});

test('buffer output format', async ({page}) => {
	const result = await page.evaluate(async () => {
		const buffer = await globalThis.sha1('🦄', {outputFormat: 'buffer'});
		return {
			isArrayBuffer: buffer instanceof ArrayBuffer,
			byteLength: buffer.byteLength,
			// The two output formats have to describe the same digest. A buffer of the right length holding the wrong bytes would satisfy every other assertion here.
			hex: [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
			expected: '5df82936cbf0864be4b7ba801bee392457fde9e4',
		};
	});

	expect(result.isArrayBuffer).toBe(true);
	expect(result.byteLength).toBe(20);
	expect(result.hex).toBe(result.expected);
});

test('hex output spells out every byte value correctly', async ({page}) => {
	const result = await page.evaluate(async () => {
		// A browser has no `Buffer`, so this is the lookup table path. Between them the digests contain every byte value, so every entry of the table is compared against a conversion written out independently here.
		const inputs = Array.from({length: 200}, (_, index) => `input ${index}`);
		const hexes = await Promise.all(inputs.map(async input => globalThis.sha512(input)));
		const buffers = await Promise.all(inputs.map(async input => globalThis.sha512(input, {outputFormat: 'buffer'})));
		const bytes = buffers.map(buffer => [...new Uint8Array(buffer)]);

		return {
			hasBuffer: 'Buffer' in globalThis,
			byteValues: new Set(bytes.flat()).size,
			mismatches: bytes.filter((digest, index) => digest.map(byte => byte.toString(16).padStart(2, '0')).join('') !== hexes[index]).length,
		};
	});

	expect(result).toEqual({hasBuffer: false, byteValues: 256, mismatches: 0});
});

test('no ArrayBuffer detachment', async ({page}) => {
	const result = await page.evaluate(async () => {
		const buffer = new ArrayBuffer(16);
		const view = new Uint8Array(buffer);
		view[0] = 42;

		await globalThis.sha256(buffer);

		return buffer.byteLength === 16 && view[0] === 42;
	});
	expect(result).toBe(true);
});

test('runs parallel operations', async ({page}) => {
	const results = await page.evaluate(async () => {
		const expected = '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905';
		const results = await Promise.all(Array.from({length: 10}, async () => globalThis.sha512('🦄')));
		return {results, expected};
	});

	expect(results.results).toEqual(Array.from({length: 10}, () => results.expected));
});

test('rejects unsupported input and an unknown output format', async ({page}) => {
	const results = await page.evaluate(async () => {
		const capture = async callback => {
			try {
				await callback();
				return 'resolved';
			} catch (error) {
				return `${error.name}: ${error.message}`;
			}
		};

		return {
			// The library recognises shared memory without naming `SharedArrayBuffer`, because a page that is not cross-origin isolated, like this one, does not have it
			hasSharedArrayBuffer: 'SharedArrayBuffer' in globalThis,
			number: await capture(async () => globalThis.sha256(42)),
			array: await capture(async () => globalThis.sha256([1, 2, 3])),
			outputFormat: await capture(async () => globalThis.sha256('x', {outputFormat: 'HEX'})),
		};
	});

	expect(results.hasSharedArrayBuffer).toBe(false);
	expect(results.number).toBe('TypeError: Expected a string, an ArrayBuffer, or an ArrayBufferView, got Number');
	expect(results.array).toBe('TypeError: Expected a string, an ArrayBuffer, or an ArrayBufferView, got Array');
	expect(results.outputFormat).toBe('TypeError: Expected outputFormat to be \'hex\' or \'buffer\', got "HEX"');
});
