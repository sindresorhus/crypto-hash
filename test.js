import test from 'ava';
import hashjs from 'hash.js';
import is from '@sindresorhus/is';
import {
	sha1,
	sha256,
	sha384,
	sha512,
} from './index.js';

const fixture = 'foo bar baz';

test('sha1', async t => {
	t.is(await sha1('🦄'), '5df82936cbf0864be4b7ba801bee392457fde9e4');
	t.is(await sha1(fixture), hashjs.sha1().update(fixture).digest('hex'));
});

test('sha256', async t => {
	t.is(await sha256('🦄'), '36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc');
	t.is(await sha256(fixture), hashjs.sha256().update(fixture).digest('hex'));
});

test('sha384', async t => {
	t.is(await sha384('🦄'), 'a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca');
	t.is(await sha384(fixture), hashjs.sha384().update(fixture).digest('hex'));
});

test('sha512', async t => {
	t.is(await sha512('🦄'), '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905');
	t.is(await sha512(fixture), hashjs.sha512().update(fixture).digest('hex'));
});

test('buffer input', async t => {
	const fixture = new Uint16Array([1, 2, 3]);
	t.is(await sha1(fixture), '5b9ba303e3d8ef9e9d421085303cda49d64c79bf');
});

test('buffer input - ArrayBuffer', async t => {
	const fixture = 'x';
	const fixtureBuffer = new TextEncoder().encode(fixture).buffer;
	t.is(await sha1(fixture), await sha1(fixtureBuffer));
});

test('buffer input - Node.js Buffer', async t => {
	const fixture = 'foo\nbar\nbaz';
	const fixtureBuffer = Buffer.from(fixture, 'utf8');
	t.is(await sha1(fixture), await sha1(fixtureBuffer));
});

test('buffer output', async t => {
	const result = await sha1('🦄', {outputFormat: 'buffer'});
	t.is(is(result), 'ArrayBuffer');
});

test('parallel execution', async t => {
	const promises = [];
	for (let i = 0; i < 10; i++) {
		promises.push(sha512('🦄'));
	}

	const results = await Promise.all(promises);
	t.is(results.length, promises.length);

	for (const result of results) {
		t.is(result, '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905');
	}
});

test('no ArrayBuffer detachment with transfer list', async t => {
	// Pass a raw ArrayBuffer, call sha256, then assert it's still usable
	// This tests that we properly copy the buffer before transferring
	const originalBuffer = new ArrayBuffer(16);
	const view = new Uint8Array(originalBuffer);
	view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

	// Store original data for verification
	const originalData = [...view];

	// Hash the buffer (internally creates a copy and transfers that)
	const hash1 = await sha256(originalBuffer);

	// Buffer should still be usable (not detached)
	t.is(originalBuffer.byteLength, 16);
	const afterView = new Uint8Array(originalBuffer);
	t.deepEqual([...afterView], originalData, 'Original buffer data unchanged');

	// Should be able to modify the original buffer
	afterView[0] = 99;
	t.is(afterView[0], 99);

	// Hashing again should still work
	const hash2 = await sha256(originalBuffer);
	t.not(hash1, hash2, 'Modified buffer produces different hash');
});

test('TypedArray views preserve exact data', async t => {
	// Test that views with offsets are handled correctly
	const largeBuffer = Buffer.alloc(100);
	largeBuffer.fill(0);

	// Put specific data in the middle
	const testData = Buffer.from('test data');
	testData.copy(largeBuffer, 30);

	// Create a view of just the test data portion
	const view = largeBuffer.subarray(30, 30 + testData.length);

	// Hash the view and the original test data
	const [viewHash, dataHash] = await Promise.all([
		sha1(view),
		sha1(testData),
	]);

	t.is(viewHash, dataHash, 'View produces same hash as its content');

	// Original buffer should still be intact
	t.is(largeBuffer[30], testData[0]);
});

test('offset view hashing', async t => {
	// Create a view that only covers part of a buffer
	const buffer = new ArrayBuffer(20);
	const fullView = new Uint8Array(buffer);
	fullView.set([0, 0, 1, 2, 3, 4, 5, 0, 0, 0]); // Data in middle

	const offsetView = new Uint8Array(buffer, 2, 5); // Only bytes 2-6
	const manualSlice = new Uint8Array([1, 2, 3, 4, 5]);

	const viewResult = await sha1(offsetView);
	const sliceResult = await sha1(manualSlice);

	t.is(viewResult, sliceResult);
});

test('issue #15 regression', async t => {
	// Ensure Buffer input produces consistent results
	const content = 'foo\nbar\nbaz';
	const buffer = Buffer.from(content, 'utf8');

	const results = await Promise.all([
		sha1(buffer),
		sha1(buffer),
		sha1(content),
	]);

	// All should be identical
	t.is(results[0], results[1]);
	t.is(results[0], results[2]);
	t.is(results[0], '01e06a68df2f0598042449c4088842bb4e92ca75');
});

test('transfer list performance - large buffers', async t => {
	// Test that large buffers are handled efficiently with transfer list
	const largeSize = 1024 * 1024; // 1MB
	const largeBuffer = new ArrayBuffer(largeSize);
	const view = new Uint8Array(largeBuffer);

	// Fill with deterministic data
	for (let index = 0; index < largeSize; index++) {
		view[index] = index % 256;
	}

	// Time multiple operations
	const iterations = 10;
	const start = Date.now();

	const promises = [];
	for (let i = 0; i < iterations; i++) {
		promises.push(sha256(largeBuffer));
	}

	const results = await Promise.all(promises);
	const duration = Date.now() - start;

	// All results should be identical
	const firstHash = results[0];
	for (const hash of results) {
		t.is(hash, firstHash, 'Consistent hash for large buffer');
	}

	// Original buffer should still be usable
	t.is(largeBuffer.byteLength, largeSize);
	t.is(view[0], 0);
	t.is(view[255], 255);

	// Performance check (should be fast due to transfer list)
	t.true(duration < 1000, `Processed ${iterations}MB in ${duration}ms`);
});

test('digest output correctness', async t => {
	// Test that digest slicing produces correct exact-length results
	const input = 'digest test';

	// Get buffer outputs for all algorithms
	const [sha1Buffer, sha256Buffer, sha384Buffer, sha512Buffer] = await Promise.all([
		sha1(input, {outputFormat: 'buffer'}),
		sha256(input, {outputFormat: 'buffer'}),
		sha384(input, {outputFormat: 'buffer'}),
		sha512(input, {outputFormat: 'buffer'}),
	]);

	// Verify exact lengths (no slab leakage)
	t.is(sha1Buffer.byteLength, 20);
	t.is(sha256Buffer.byteLength, 32);
	t.is(sha384Buffer.byteLength, 48);
	t.is(sha512Buffer.byteLength, 64);

	// Verify the buffers contain valid data (not zeros or garbage)
	const sha1View = new Uint8Array(sha1Buffer);
	const hasNonZero = [...sha1View].some(byte => byte !== 0);
	t.true(hasNonZero, 'Digest contains actual hash data');
});
