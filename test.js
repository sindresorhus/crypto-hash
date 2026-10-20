import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import hashjs from 'hash.js';
import is from '@sindresorhus/is';
import {
	sha1,
	sha256,
	sha384,
	sha512,
} from './index.js';

const fixture = 'foo bar baz';

test('sha1 hashes strings', async () => {
	assert.equal(await sha1('🦄'), '5df82936cbf0864be4b7ba801bee392457fde9e4');
	assert.equal(await sha1(fixture), hashjs.sha1().update(fixture).digest('hex'));
});

test('sha256 hashes strings', async () => {
	assert.equal(await sha256('🦄'), '36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc');
	assert.equal(await sha256(fixture), hashjs.sha256().update(fixture).digest('hex'));
});

test('sha384 hashes strings', async () => {
	assert.equal(await sha384('🦄'), 'a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca');
	assert.equal(await sha384(fixture), hashjs.sha384().update(fixture).digest('hex'));
});

test('sha512 hashes strings', async () => {
	assert.equal(await sha512('🦄'), '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905');
	assert.equal(await sha512(fixture), hashjs.sha512().update(fixture).digest('hex'));
});

test('accepts a typed array', async () => {
	const typedArray = new Uint16Array([1, 2, 3]);
	assert.equal(await sha1(typedArray), '5b9ba303e3d8ef9e9d421085303cda49d64c79bf');
});

test('accepts an ArrayBuffer', async () => {
	const {buffer} = new TextEncoder().encode('x');
	assert.equal(await sha1('x'), await sha1(buffer));
});

test('accepts a Node.js Buffer', async () => {
	const string = 'foo\nbar\nbaz';
	const buffer = Buffer.from(string, 'utf8');
	assert.equal(await sha1(string), await sha1(buffer));
});

test('returns an ArrayBuffer with the buffer output format', async () => {
	const result = await sha1('🦄', {outputFormat: 'buffer'});
	assert.equal(is(result), 'ArrayBuffer');
});

test('runs parallel operations', async () => {
	const expected = '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905';

	const promises = [];
	for (let index = 0; index < 10; index++) {
		promises.push(sha512('🦄'));
	}

	const results = await Promise.all(promises);
	assert.equal(results.length, promises.length);
	assert.deepEqual(results, Array.from({length: 10}, () => expected));
});

test('does not detach an ArrayBuffer passed to the transfer list', async () => {
	// Pass a raw ArrayBuffer, hash it, then assert it's still usable.
	// This tests that we properly copy the buffer before transferring.
	const originalBuffer = new ArrayBuffer(16);
	const view = new Uint8Array(originalBuffer);
	view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

	// Store original data for verification
	const originalData = [...view];

	// Hash the buffer (internally creates a copy and transfers that)
	const hash1 = await sha256(originalBuffer);

	// Buffer should still be usable (not detached)
	assert.equal(originalBuffer.byteLength, 16);
	const afterView = new Uint8Array(originalBuffer);
	assert.deepEqual([...afterView], originalData, 'Original buffer data unchanged');

	// Should be able to modify the original buffer
	afterView[0] = 99;
	assert.equal(afterView[0], 99);

	// Hashing again should still work
	const hash2 = await sha256(originalBuffer);
	assert.notEqual(hash1, hash2, 'Modified buffer produces different hash');
});

test('preserves the exact data of TypedArray views', async () => {
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

	assert.equal(viewHash, dataHash, 'View produces same hash as its content');

	// Original buffer should still be intact
	assert.equal(largeBuffer[30], testData[0]);
});

test('hashes an offset view', async () => {
	// Create a view that only covers part of a buffer
	const buffer = new ArrayBuffer(20);
	const fullView = new Uint8Array(buffer);
	fullView.set([0, 0, 1, 2, 3, 4, 5, 0, 0, 0]); // Data in middle

	const offsetView = new Uint8Array(buffer, 2, 5); // Only bytes 2-6
	const manualSlice = new Uint8Array([1, 2, 3, 4, 5]);

	const viewResult = await sha1(offsetView);
	const sliceResult = await sha1(manualSlice);

	assert.equal(viewResult, sliceResult);
});

test('hashes a Buffer consistently (issue #15)', async () => {
	// Ensure Buffer input produces consistent results
	const content = 'foo\nbar\nbaz';
	const buffer = Buffer.from(content, 'utf8');

	const results = await Promise.all([
		sha1(buffer),
		sha1(buffer),
		sha1(content),
	]);

	// All should be identical
	assert.equal(results[0], results[1]);
	assert.equal(results[0], results[2]);
	assert.equal(results[0], '01e06a68df2f0598042449c4088842bb4e92ca75');
});

test('handles large buffers via the transfer list', async () => {
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
	for (let index = 0; index < iterations; index++) {
		promises.push(sha256(largeBuffer));
	}

	const results = await Promise.all(promises);
	const duration = Date.now() - start;

	// All results should be identical
	const firstHash = results[0];
	assert.deepEqual(results, Array.from({length: iterations}, () => firstHash), 'Consistent hash for large buffer');

	// Original buffer should still be usable
	assert.equal(largeBuffer.byteLength, largeSize);
	assert.equal(view[0], 0);
	assert.equal(view[255], 255);

	// Performance check (should be fast due to transfer list)
	assert.ok(duration < 1000, `Processed ${iterations}MB in ${duration}ms`);
});

test('produces digest output of the exact length', async () => {
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
	assert.equal(sha1Buffer.byteLength, 20);
	assert.equal(sha256Buffer.byteLength, 32);
	assert.equal(sha384Buffer.byteLength, 48);
	assert.equal(sha512Buffer.byteLength, 64);

	// Verify the buffers contain valid data (not zeros or garbage)
	const sha1View = new Uint8Array(sha1Buffer);
	const hasNonZero = [...sha1View].some(byte => byte !== 0);
	assert.ok(hasNonZero, 'Digest contains actual hash data');
});
