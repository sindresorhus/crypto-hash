import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {execFile} from 'node:child_process';
import {writeFile, unlink} from 'node:fs/promises';
import {randomUUID, createHash} from 'node:crypto';
import process from 'node:process';
import {tmpdir} from 'node:os';
import hashjs from 'hash.js';
import is from '@sindresorhus/is';
import {createWorkerPool} from './worker-pool.js';
import {
	sha1,
	sha256,
	sha384,
	sha512,
} from './index.js';

const fixture = 'foo bar baz';
const moduleUrl = import.meta.url;
const workerPoolUrl = new URL('worker-pool.js', moduleUrl).href;
const threadUrl = new URL('thread.js', moduleUrl).href;

const writeTemporaryScript = async source => {
	const file = new URL(`${randomUUID()}.mjs`, `file://${tmpdir()}/`);
	await writeFile(file, source);
	return file;
};

// A worker that can be told to throw, so the pool's failure handling can be exercised directly.
const crashableWorkerUrl = await writeTemporaryScript(`
	import {parentPort} from 'node:worker_threads';

	parentPort.on('message', message => {
		if (message.value.crash) {
			throw new Error('Worker crashed on purpose');
		}

		parentPort.postMessage(message);
	});
`);

after(async () => {
	await unlink(crashableWorkerUrl);
});

// The hash worker is `unref`ed, so a process that is only hashing must exit on its own once the
// work is done. Running the snippet in a child process is the only way to observe that.
const runDetachedScript = async source => {
	const file = await writeTemporaryScript(source);

	try {
		return await new Promise((resolve, reject) => {
			const child = execFile(process.execPath, [file.pathname]);

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', chunk => {
				stdout += chunk;
			});

			child.stderr.on('data', chunk => {
				stderr += chunk;
			});

			child.on('error', reject);

			const timeout = setTimeout(() => {
				child.kill('SIGKILL');
				reject(new Error(`The process did not exit on its own.\n${stdout}${stderr}`));
			}, 10_000);

			// `close` rather than `exit`, since `exit` can fire before the pipes have been drained
			child.on('close', code => {
				clearTimeout(timeout);
				resolve({code, stdout, stderr});
			});
		});
	} finally {
		await unlink(file);
	}
};

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

test('a failed task does not keep the process alive', async () => {
	const {code, stdout, stderr} = await runDetachedScript(`
		import {createWorkerPool} from ${JSON.stringify(workerPoolUrl)};

		const pool = createWorkerPool(new URL(${JSON.stringify(threadUrl)}));

		try {
			// A SharedArrayBuffer is not transferable, so postMessage throws.
			const shared = new SharedArrayBuffer(8);
			await pool.run({buffer: shared}, [shared]);
		} catch {}

		const buffer = new TextEncoder().encode('still working').buffer;
		await pool.run({algorithm: 'sha1', buffer}, [buffer]);
		console.log('done');
	`);

	assert.equal(stdout.trim(), 'done', stderr);
	assert.equal(code, 0);
});

test('rejects a task that cannot be transferred and keeps the pool usable', async () => {
	const pool = createWorkerPool(crashableWorkerUrl);
	const shared = new SharedArrayBuffer(8);

	await assert.rejects(pool.run({buffer: shared}, [shared]), {name: 'DataCloneError'});
	assert.equal(await pool.run('after the failure'), 'after the failure');
});

test('a crashed worker does not take down the tasks of its replacement', async () => {
	const pool = createWorkerPool(crashableWorkerUrl);

	await assert.rejects(pool.run({crash: true}), {message: 'Worker crashed on purpose'});

	// Started straight from the rejection, so the replacement worker is in place while the
	// crashed one is still winding down and about to emit `exit`.
	const replacement = pool.run(42);
	assert.equal(await replacement, 42);
});

test('accepts a view backed by a SharedArrayBuffer', async () => {
	const shared = new SharedArrayBuffer(8);
	const view = new Uint8Array(shared);
	view.set([1, 2, 3, 4, 5, 6, 7, 8]);

	const expected = createHash('sha256').update(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])).digest('hex');

	assert.equal(await sha256(view), expected);
	assert.equal(await sha256(shared), expected);
});

test('accepts empty shared memory', async () => {
	// `SharedArrayBuffer.prototype.slice` throws when the buffer it is called on is empty, so this
	// needs a path that never slices one.
	const emptyDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

	const emptyShared = new SharedArrayBuffer(0);
	assert.equal(await sha256(emptyShared), emptyDigest);
	assert.equal(await sha256(new Uint8Array(emptyShared)), emptyDigest);
	assert.equal(await sha256(new DataView(emptyShared)), emptyDigest);

	// A view covering only part of a larger shared buffer, including the empty range at its end.
	const shared = new SharedArrayBuffer(8);
	new Uint8Array(shared).set([1, 2, 3, 4, 5, 6, 7, 8]);

	assert.equal(await sha256(new Uint8Array(shared, 4)), createHash('sha256').update(Buffer.from([5, 6, 7, 8])).digest('hex'));
	assert.equal(await sha256(new Uint8Array(shared, 8)), emptyDigest);
});

test('reports unsupported input instead of guessing at its bytes', async () => {
	// A number used to be turned into a zero-filled view of that length and hashed, so it quietly
	// produced a wrong answer rather than failing.
	await assert.rejects(async () => sha256(123), {
		name: 'TypeError',
		message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got Number',
	});

	await assert.rejects(async () => sha256([1, 2, 3]), {name: 'TypeError', message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got Array'});
	await assert.rejects(async () => sha256({}), {name: 'TypeError', message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got Object'});
	await assert.rejects(async () => sha256(null), {name: 'TypeError', message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got object'});
	await assert.rejects(async () => sha256(), {name: 'TypeError', message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got undefined'});

	// The pool stays usable after a rejected call.
	assert.equal(await sha256('still working'), '00b7d7bed7e32d29197248bed5d1296ddcb1a2a7f2f23094fd4856b7e7295d97');
});

test('an object that merely looks like a buffer is rejected', async () => {
	// The guard was meant to stop the constructor turning anything into a zero-filled view, but it
	// only checked that `byteLength` was a number. `new Uint8Array({byteLength: 5})` runs ToIndex on
	// the object, gets NaN, and yields an empty view, so these hashed as zero bytes.
	const message = 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got Object';

	await assert.rejects(async () => sha256({byteLength: 5}), {name: 'TypeError', message});
	await assert.rejects(async () => sha256({byteLength: 1024 * 1024}), {name: 'TypeError', message});
	await assert.rejects(async () => sha256({byteLength: 8, byteOffset: 0}), {name: 'TypeError', message});
	await assert.rejects(async () => sha256(new (class Fake {
		get byteLength() {
			return 7;
		}
	})()), {name: 'TypeError'});

	// A null prototype leaves nothing to name the value by, so the type alone is reported
	await assert.rejects(async () => sha256(Object.assign(Object.create(null), {byteLength: 9})), {
		name: 'TypeError',
		message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got object',
	});

	// An object pretending to be a buffer through `Symbol.toStringTag` must not get through either
	const tagged = {[Symbol.toStringTag]: 'ArrayBuffer', byteLength: 4};
	await assert.rejects(async () => sha256(tagged), {name: 'TypeError'});
});

test('a SharedArrayBuffer subclass is accepted', async () => {
	// A subclass carrying its own `byteOffset` property used to look like a view, fail the view
	// check, and be rejected, even though it is a buffer.
	class TaggedSharedArrayBuffer extends SharedArrayBuffer {
		byteOffset = 0;
	}

	const shared = new TaggedSharedArrayBuffer(8);
	new Uint8Array(shared).set([1, 2, 3, 4, 5, 6, 7, 8]);

	const expected = createHash('sha256').update(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])).digest('hex');

	assert.equal(await sha256(shared), expected);
	assert.equal(await sha256(new Uint8Array(shared)), expected);
	assert.equal(await sha256(new DataView(shared)), expected);
});
test('a buffer whose slice hands back itself is never detached', async () => {
	// The transfer list detaches whatever it is given, so the copy handed to it must never be able
	// to be the caller's own buffer.
	class SelfSlicingBuffer extends ArrayBuffer {
		slice() {
			return this;
		}
	}

	const buffer = new SelfSlicingBuffer(8);
	new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8]);

	const expected = createHash('sha256').update(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])).digest('hex');
	assert.equal(await sha256(buffer), expected);

	assert.equal(buffer.byteLength, 8, 'The buffer the caller passed in is still usable');
	assert.equal(new Uint8Array(buffer)[7], 8);
	assert.equal(await sha256(buffer), expected, 'And it can still be hashed again');
});

test('names the type it was given, whatever it was', async () => {
	// The constructor is reached before the type is checked, so a symbol or a detached buffer was
	// reported by the constructor, in words that say nothing about what the caller passed.
	await assert.rejects(async () => sha256(Symbol('x')), {
		name: 'TypeError',
		message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got Symbol',
	});

	await assert.rejects(async () => sha256(10n), {name: 'TypeError', message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got BigInt'});
	await assert.rejects(async () => sha256(true), {name: 'TypeError', message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got Boolean'});
	await assert.rejects(async () => sha256(() => {}), {name: 'TypeError', message: 'Expected a string, an ArrayBuffer, or an ArrayBufferView, got Function'});
});

test('rejects an unknown output format instead of silently returning a buffer', async () => {
	// Any value other than 'hex' used to take the buffer branch, so a typo handed back an
	// ArrayBuffer where the caller expected a string and the mistake surfaced much later.
	await assert.rejects(async () => sha256('x', {outputFormat: 'HEX'}), {
		name: 'TypeError',
		message: 'Expected outputFormat to be \'hex\' or \'buffer\', got "HEX"',
	});

	await assert.rejects(async () => sha256('x', {outputFormat: 'base64'}), {name: 'TypeError'});

	assert.equal(typeof await sha256('x'), 'string');
	assert.equal(typeof await sha256('x', {outputFormat: 'hex'}), 'string');
	assert.ok((await sha256('x', {outputFormat: 'buffer'})) instanceof ArrayBuffer);

	// The pool stays usable after a rejected call.
	assert.equal(await sha256('still working'), '00b7d7bed7e32d29197248bed5d1296ddcb1a2a7f2f23094fd4856b7e7295d97');
});
test('a null options object is treated as no options', async () => {
	// A destructured parameter default only covers `undefined`, so `null` died on a property
	// access with a message that said nothing about which argument was wrong.
	const expected = '11f6ad8ec52a2984abaafd7c3b516503785c2072';
	assert.equal(await sha1('x', null), expected);
	assert.equal(await sha1('x', undefined), expected);
	assert.equal(await sha1('x', {}), expected);
	assert.equal(await sha1('x'), expected);
	assert.equal(await sha1('x', {outputFormat: 'hex'}), expected);
});

test('describes an unserializable outputFormat without throwing a different error', async () => {
	// The message was built with JSON.stringify, which throws on a BigInt or a circular object, so
	// the caller saw an error from the error path instead of the one describing their mistake.
	const circular = {};
	circular.self = circular;

	await assert.rejects(async () => sha256('x', {outputFormat: 1n}), {
		name: 'TypeError',
		message: 'Expected outputFormat to be \'hex\' or \'buffer\', got BigInt',
	});

	await assert.rejects(async () => sha256('x', {outputFormat: circular}), {
		name: 'TypeError',
		message: 'Expected outputFormat to be \'hex\' or \'buffer\', got Object',
	});
});

test('describes an outputFormat it cannot name', async () => {
	// A null prototype leaves nothing to read a constructor name off, and String() on the value
	// itself throws, so the caller got an error from the error path.
	await assert.rejects(async () => sha256('x', {outputFormat: Object.create(null)}), {
		name: 'TypeError',
		message: 'Expected outputFormat to be \'hex\' or \'buffer\', got object',
	});

	await assert.rejects(async () => sha256('x', {outputFormat: null}), {
		name: 'TypeError',
		message: 'Expected outputFormat to be \'hex\' or \'buffer\', got object',
	});

	// An explicitly undefined option is still the default, not a mistake
	assert.equal(typeof await sha256('x', {outputFormat: undefined}), 'string');
});
