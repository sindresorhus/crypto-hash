import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {execFile} from 'node:child_process';
import {MessageChannel} from 'node:worker_threads';
import {writeFile, unlink, readFile} from 'node:fs/promises';
import {randomUUID, createHash} from 'node:crypto';
import process from 'node:process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createWorkerPool} from './worker-pool.js';
import {
	mismatchesWithNodeCrypto,
	rejectionMessages,
	expectedRejectionMessages,
	trapped,
	revokedProxy,
} from './fixtures.js';
import * as browser from './browser.js';
import {
	sha1,
	sha256,
	sha384,
	sha512,
} from './index.js';

const moduleUrl = import.meta.url;
const indexUrl = new URL('index.js', moduleUrl).href;
const workerPoolUrl = new URL('worker-pool.js', moduleUrl).href;
const threadUrl = new URL('thread.js', moduleUrl).href;

// The digest `node:crypto` gives for the same bytes, so every assertion below compares against a reference rather than against the library hashing itself.
const digestOf = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const eightBytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

// What `tsc` says about a file, or `undefined` when it is happy. The declaration is all a TypeScript consumer ever sees, and nothing else in this suite looks at it, so it is checked by compiling against it rather than by reading it.
const tsc = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));

const compileTypeScript = async (lib, file) => {
	const compilerArguments = ['--noEmit', '--strict', '--target', 'es2022', '--lib', lib, '--module', 'nodenext', '--moduleResolution', 'nodenext', fileURLToPath(file)];

	// `execFile` hands back the child and never a promise, so the verdict has to come from its own callback. Awaiting it instead resolves with the child straight away, whatever it exits as, which would make every compile below look like it passed.
	return new Promise(resolve => {
		execFile(process.execPath, [tsc, ...compilerArguments], (error, stdout, stderr) => {
			resolve(error ? `${stdout}${stderr}` : undefined);
		});
	});
};

// A consumer that imports the declaration the way a package consumer would, written as a string because it is a program for the compiler to read rather than for this file to import. The specifier is a plain path, since the compiler does not resolve a `file:` URL.
const consumer = lines => `
	import type {BufferLike} from ${JSON.stringify(fileURLToPath(indexUrl))};
	import {sha1, sha256, sha384, sha512} from ${JSON.stringify(fileURLToPath(indexUrl))};

	${lines.join('\n\t')}
`;

const writeTemporaryScript = async (source, extension = 'mjs') => {
	const file = pathToFileURL(path.join(tmpdir(), `${randomUUID()}.${extension}`));
	await writeFile(file, source);
	return file;
};

// A worker that can be told to throw, to exit outright, or to say which thread it is, so the pool's failure handling can be exercised directly. A crash emits `error` and then `exit`, while an exit emits only `exit`.
const crashableWorkerUrl = await writeTemporaryScript(`
	import process from 'node:process';
	import {parentPort, threadId} from 'node:worker_threads';

	parentPort.on('message', message => {
		if (message.value.crash) {
			throw new Error('Worker crashed on purpose');
		}

		if (message.value.exitCode !== undefined) {
			process.exit(message.value.exitCode);
		}

		parentPort.postMessage(message.value === 'threadId' ? {id: message.id, value: threadId} : message);
	});
`);

after(async () => {
	await unlink(crashableWorkerUrl);
});

// A pool that leaves a task pending would otherwise hang the whole run instead of failing the test that caught it
const poolTimeout = 10_000;

// The hash worker is `unref`ed, so a process that is only hashing must exit on its own once the work is done. Running the snippet in a child process is the only way to observe that.
const runDetachedScript = async source => {
	const file = await writeTemporaryScript(source);

	try {
		return await new Promise((resolve, reject) => {
			const child = execFile(process.execPath, [fileURLToPath(file)]);

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
			}, 30_000);

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

test('hashes the known test vectors', async () => {
	assert.deepEqual(await Promise.all([sha1('🦄'), sha256('🦄'), sha384('🦄'), sha512('🦄')]), [
		'5df82936cbf0864be4b7ba801bee392457fde9e4',
		'36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc',
		'a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca',
		'7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905',
	]);
});

test('hashes on a worker thread where one is available', async () => {
	// The in-process path computes the digest before the call even returns, leaving nothing in flight, while a worker round trip keeps its message port active until the reply arrives
	const pending = sha256('x');
	const resources = process.getActiveResourcesInfo();
	await pending;

	assert.ok(resources.includes('MessagePort'), `Active resources: ${resources.join(', ')}`);
});

test('matches node:crypto for every input shape', async () => {
	assert.deepEqual(await mismatchesWithNodeCrypto({
		sha1, sha256, sha384, sha512,
	}), []);
});

test('the browser build matches node:crypto for every input shape', async () => {
	// Node has `crypto.subtle` too, so the browser build's input handling can be held to the same table, including the shared memory a browser only has when it is cross-origin isolated.
	assert.deepEqual(await mismatchesWithNodeCrypto(browser), []);
});

test('the browser build hex-encodes every byte value without Buffer', async () => {
	const inputs = Array.from({length: 200}, (_, index) => `input ${index}`);
	const expected = inputs.map(input => digestOf('sha512', input));

	// Between them the reference digests contain every byte value, so every entry of the lookup table a browser uses is exercised
	assert.equal(new Set(expected.flatMap(hex => [...Buffer.from(hex, 'hex')])).size, 256);

	// The hex conversion only takes the lookup table where there is no global `Buffer`, and it decides that per call, after the digest, so `Buffer` stays gone until every call has settled
	/* eslint-disable n/prefer-global/buffer, unicorn/no-global-object-property-assignment -- The global is what the browser build looks for, so it is what has to go. */
	const {Buffer: globalBuffer} = globalThis;
	delete globalThis.Buffer;

	try {
		assert.deepEqual(await Promise.all(inputs.map(async input => browser.sha512(input))), expected);
	} finally {
		globalThis.Buffer = globalBuffer;
	}
	/* eslint-enable n/prefer-global/buffer, unicorn/no-global-object-property-assignment */
});

test('rejects unsupported input by name instead of guessing at its bytes', async () => {
	// A number used to be turned into a zero-filled view of that length and hashed, so it quietly produced a wrong answer rather than failing.
	assert.deepEqual(await rejectionMessages(sha256), expectedRejectionMessages);
	assert.deepEqual(await rejectionMessages(browser.sha256), expectedRejectionMessages);

	// The pool stays usable after a rejected call.
	assert.equal(await sha256('still working'), digestOf('sha256', 'still working'));
});

test('bad arguments reject the promise rather than throwing', async () => {
	// A synchronous throw would escape a caller chaining `.catch` on the promise it expected back.
	const badInput = sha256(123);
	const badFormat = sha256('x', {outputFormat: 'nope'});

	await assert.rejects(badInput, {name: 'TypeError'});
	await assert.rejects(badFormat, {name: 'TypeError'});
});

test('does not detach an ArrayBuffer passed to the transfer list', async () => {
	const originalBuffer = new ArrayBuffer(16);
	const view = new Uint8Array(originalBuffer);
	view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

	const originalData = [...view];
	const hash1 = await sha256(originalBuffer);

	// The buffer is still usable, so what was transferred was a copy
	assert.equal(originalBuffer.byteLength, 16);
	const afterView = new Uint8Array(originalBuffer);
	assert.deepEqual([...afterView], originalData, 'Original buffer data unchanged');

	afterView[0] = 99;
	assert.equal(afterView[0], 99);

	const hash2 = await sha256(originalBuffer);
	assert.notEqual(hash1, hash2, 'Modified buffer produces different hash');
});

test('handles large buffers via the transfer list', async () => {
	const largeSize = 1024 * 1024; // 1MB
	const largeBuffer = new ArrayBuffer(largeSize);
	const view = new Uint8Array(largeBuffer);

	for (let index = 0; index < largeSize; index++) {
		view[index] = index % 256;
	}

	const iterations = 10;
	const results = await Promise.all(Array.from({length: iterations}, async () => sha256(largeBuffer)));

	// Every copy must match the reference hash, not just the other copies of each other, so a transfer that truncated or reordered the buffer could not pass
	const expected = digestOf('sha256', view);
	assert.deepEqual(results, Array.from({length: iterations}, () => expected), 'Consistent hash for large buffer');

	// Original buffer should still be usable
	assert.equal(largeBuffer.byteLength, largeSize);
	assert.equal(view[0], 0);
	assert.equal(view[255], 255);
});

test('a process that only hashes exits on its own', async () => {
	// The readme promises the worker is `unref`ed whenever nothing is in flight. Whether a process settles its last task and then stops is the one thing a test in this process cannot observe, since the test runner holds the loop open regardless.
	const {code, stdout, stderr} = await runDetachedScript(`
		import {sha256} from ${JSON.stringify(indexUrl)};

		console.log(await sha256('foo bar baz'));
	`);

	assert.equal(stdout.trim(), 'dbd318c1c462aee872f41109a4dfd3048871a03dedd0fe0e757ced57dad6f2d7', stderr);
	assert.equal(code, 0);
});

test('a process with many hashes in flight still exits on its own', async () => {
	// Every task refs the worker, and only the last one to settle unrefs it, so this is the case where tasks settling in between must neither leave the worker refed nor let the process end with work still pending.
	const {code, stdout, stderr} = await runDetachedScript(`
		import {sha256} from ${JSON.stringify(indexUrl)};

		const digests = await Promise.all(Array.from({length: 200}, (_, index) => sha256('input ' + index)));
		console.log(digests.length, digests[0], digests.at(-1));
	`);

	assert.equal(
		stdout.trim(),
		'200 d76f36ed5f851e3d704778cec654530641adf8b0ee3c15c1a6802ba5688b9d69 c38018a564b2449bbc4916036579baada0588f14e9a579b6cb02334dc1988c0d',
		stderr,
	);
	assert.equal(code, 0);
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

test('a script that crashes the worker still finishes and exits', async () => {
	// A worker that has already emitted `error` and `exit` cannot hold the event loop open whatever its ref state, so this does not cover the ref counting. It does cover the recovery: the replacement is spawned, answers, and lets the process finish on its own.
	const {code, stdout, stderr} = await runDetachedScript(`
		import {createWorkerPool} from ${JSON.stringify(workerPoolUrl)};

		const pool = createWorkerPool(new URL(${JSON.stringify(crashableWorkerUrl.href)}));

		try {
			await pool.run({crash: true});
		} catch {}

		await pool.run('after the crash');
		console.log('done');
	`);

	assert.equal(stdout.trim(), 'done', stderr);
	assert.equal(code, 0);
});

test('rejects a task that cannot be transferred and keeps the pool usable', {timeout: poolTimeout}, async () => {
	const pool = createWorkerPool(crashableWorkerUrl);
	const shared = new SharedArrayBuffer(8);

	await assert.rejects(pool.run({buffer: shared}, [shared]), {name: 'DataCloneError'});
	assert.equal(await pool.run('after the failure'), 'after the failure');
});

test('a crashed worker does not take down its replacement', {timeout: poolTimeout}, async () => {
	const pool = createWorkerPool(crashableWorkerUrl);

	await assert.rejects(pool.run({crash: true}), {message: 'Worker crashed on purpose'});

	// Started straight from the rejection, so the replacement is in place while the crashed worker is still winding down and about to emit `exit`.
	const replacement = await pool.run('threadId');

	// By the time the replacement has started and answered, the crashed worker has exited. Had that `exit` cleared the slot the replacement now holds, the next task would spawn yet another worker and orphan this one.
	assert.equal(await pool.run('threadId'), replacement);
});

test('rejects tasks that were in flight when the worker exited', {timeout: poolTimeout}, async () => {
	const pool = createWorkerPool(crashableWorkerUrl);

	// A clean `exit` with no preceding `error` is the other way a worker can disappear.
	await assert.rejects(pool.run({exitCode: 7}), {message: 'Hash worker exited early (code 7)'});

	// The pool recovers.
	assert.equal(await pool.run(42), 42);
});

test('a crash settles every task in flight and the pool recovers', {timeout: poolTimeout}, async () => {
	const pool = createWorkerPool(crashableWorkerUrl);

	// The worker answers messages one at a time, so the crash lands last. Whether the replies it already posted are delivered before the error that killed it is a matter of ordering between two event queues, so a task can settle either way here. What must always hold is that nothing is left hanging, and that the crash itself is reported.
	const settled = await Promise.allSettled([pool.run(1), pool.run(2), pool.run(3), pool.run({crash: true})]);

	// Each task either got the value it was sent or was caught up in the crash, and nothing else
	const described = settled.map(task => task.status === 'fulfilled' ? `value ${task.value}` : `crash ${task.reason.message}`);

	assert.equal(described.at(-1), 'crash Worker crashed on purpose');
	assert.ok(described.slice(0, 3).every((outcome, index) => outcome === `value ${index + 1}` || outcome === 'crash Worker crashed on purpose'), described.join(', '));

	assert.equal(await pool.run('after the crash'), 'after the crash');
});

test('matches each reply to its own task', {timeout: poolTimeout}, async () => {
	const pool = createWorkerPool(crashableWorkerUrl);

	const values = await Promise.all(Array.from({length: 50}, async (_, index) => pool.run(index)));
	assert.deepEqual(values, Array.from({length: 50}, (_, index) => index));
});

test('a SharedArrayBuffer subclass is accepted', async () => {
	// A subclass carrying its own `byteOffset` property used to look like a view, fail the view check, and be rejected, even though it is a buffer.
	class TaggedSharedArrayBuffer extends SharedArrayBuffer {
		byteOffset = 0;
	}

	const shared = new TaggedSharedArrayBuffer(8);
	new Uint8Array(shared).set(eightBytes);

	const expected = digestOf('sha256', eightBytes);

	assert.equal(await sha256(shared), expected);
	assert.equal(await sha256(new Uint8Array(shared)), expected);
	assert.equal(await sha256(new DataView(shared)), expected);
});

test('a buffer whose slice hands back itself is never detached', async () => {
	// The transfer list detaches whatever it is given, so the copy handed to it must never be able to be the caller's own buffer.
	class SelfSlicingBuffer extends ArrayBuffer {
		slice() {
			return this;
		}
	}

	const buffer = new SelfSlicingBuffer(8);
	new Uint8Array(buffer).set(eightBytes);

	const expected = digestOf('sha256', eightBytes);
	assert.equal(await sha256(buffer), expected);

	assert.equal(buffer.byteLength, 8, 'The buffer the caller passed in is still usable');
	assert.equal(new Uint8Array(buffer)[7], 8);
	assert.equal(await sha256(buffer), expected, 'And it can still be hashed again');
});

test('every way of asking for the default format gives hex', async () => {
	// A destructured parameter default only covers `undefined`, so `null` died on a property access with a message that said nothing about which argument was wrong.
	const expected = digestOf('sha1', 'x');
	const results = await Promise.all([
		sha1('x'),
		sha1('x', undefined),
		sha1('x', null),
		sha1('x', {}),
		sha1('x', {outputFormat: undefined}),
		sha1('x', {outputFormat: 'hex'}),
	]);

	assert.deepEqual(results, Array.from({length: results.length}, () => expected));
});

test('rejects every other output format by name', async () => {
	// Any value other than 'hex' used to take the buffer branch, so a typo handed back an ArrayBuffer where the caller expected a string and the mistake surfaced much later. The message was then built with JSON.stringify, which throws on a BigInt or a circular object, and a trap on the value could throw from the error path too, so the caller saw some other error instead of the one describing their mistake.
	const circular = {};
	circular.self = circular;

	const formats = [
		['HEX', '"HEX"'],
		['base64', '"base64"'],
		['', '""'],
		[1n, 'BigInt'],
		[null, 'object'],
		[circular, 'Object'],
		[Object.create(null), 'object'],
		[trapped('constructor'), 'object'],
		[trapped(Symbol.toStringTag), 'Object'],
		[revokedProxy(), 'object'],
	];

	const messages = await Promise.all(formats.map(async ([outputFormat]) => {
		try {
			await sha256('x', {outputFormat});
			return 'resolved';
		} catch (error) {
			return `${error.name}: ${error.message}`;
		}
	}));

	assert.deepEqual(messages, formats.map(([, name]) => `TypeError: Expected outputFormat to be 'hex' or 'buffer', got ${name}`));

	// The pool stays usable after a rejected call.
	assert.equal(await sha256('still working'), digestOf('sha256', 'still working'));
});

test('the declaration accepts every input the runtime accepts', async () => {
	// Everything the suite hashes above, typed the way a consumer writes it. A bare SharedArrayBuffer was a compile error before, so a consumer following the documented feature had to cast to any.
	const accepted = await writeTemporaryScript(consumer([
		'export const fromString: Promise<string> = sha256(\'x\');',
		'export const fromArrayBuffer: Promise<string> = sha256(new ArrayBuffer(8));',
		'export const fromShared: Promise<string> = sha256(new SharedArrayBuffer(8));',
		'export const fromUint8: Promise<string> = sha1(new Uint8Array(8));',
		'export const fromUint16: Promise<string> = sha1(new Uint16Array([1, 2, 3]));',
		'export const fromClamped: Promise<string> = sha512(new Uint8ClampedArray(8));',
		'export const fromFloat: Promise<string> = sha384(new Float64Array(8));',
		'export const fromBigInt: Promise<string> = sha256(new BigInt64Array(8));',
		'export const fromDataView: Promise<string> = sha256(new DataView(new ArrayBuffer(8)));',
		'export const fromViewOfShared: Promise<string> = sha256(new Uint8Array(new SharedArrayBuffer(8)));',
		'export const throughTheAlias: Promise<string> = sha256(new Uint8Array(8) as BufferLike);',
		'export const asHex: Promise<string> = sha256(\'x\', {outputFormat: \'hex\'});',
		'export const asBuffer: Promise<ArrayBuffer> = sha256(\'x\', {outputFormat: \'buffer\'});',
	]), 'ts');

	// The overloads have to discriminate too, or a typo would compile and then hand back the wrong type at runtime, which is what the output format check exists to prevent
	const rejected = await writeTemporaryScript(consumer([
		'export const wrong: Promise<string> = sha256(\'x\', {outputFormat: \'HEX\'});',
	]), 'ts');

	try {
		const [acceptedErrors, rejectedErrors] = await Promise.all([
			compileTypeScript('es2022', accepted),
			compileTypeScript('es2022', rejected),
		]);

		assert.equal(acceptedErrors, undefined, 'Every documented input should type check');
		assert.match(rejectedErrors ?? '', /No overload matches/v, `An unknown format should not type check, got: ${rejectedErrors}`);
	} finally {
		await Promise.all([unlink(accepted), unlink(rejected)]);
	}
});

test('the declaration compiles for a consumer whose lib predates shared memory', async () => {
	// Naming SharedArrayBuffer outright put an error inside node_modules, reported far from the change that caused it, and it broke the build whether or not the consumer ever touched shared memory. ArrayBufferLike is declared in lib.es5 and widened by lib.es2017.sharedmemory, so the declaration has to survive the older lib on its own.
	const errors = await compileTypeScript('es5', new URL('index.d.ts', moduleUrl));
	assert.equal(errors, undefined, errors);
});

test('publishes every module that the exports reach', async () => {
	// The entry points import by relative path and the worker is loaded by URL, so a module missing from `files` ships a package that cannot be imported at all. Nothing else in the suite notices, since the tests import the source tree directly rather than the published one.
	const {files, exports} = JSON.parse(await readFile(new URL('package.json', moduleUrl), 'utf8'));
	const published = new Set(files);
	const projectDirectory = fileURLToPath(new URL('.', moduleUrl));
	// The worker is loaded by URL rather than imported, and its specifier carries no leading dot, so the two forms are normalized separately. Filtering on a bare leading dot would drop exactly the one module that cannot be found by the resolver at runtime.
	const specifierPattern = /from '(?<imported>[^']+)'|new URL\('(?<loaded>[^']+)', import\.meta\.url\)/gv;

	const resolve = (from, specifier) => {
		const url = new URL(specifier, new URL(from, moduleUrl));
		return path.relative(projectDirectory, fileURLToPath(url));
	};

	const visited = new Set();
	const stack = Object.values(exports).map(target => path.normalize(target));
	const reachable = [];

	// A depth first walk, one file read per turn rather than the whole graph at once
	while (stack.length > 0) {
		const file = stack.pop();
		if (visited.has(file)) {
			continue;
		}

		visited.add(file);
		reachable.push(file);

		// eslint-disable-next-line no-await-in-loop -- One file read per turn
		const source = await readFile(new URL(file, moduleUrl), 'utf8');
		const specifiers = source.matchAll(specifierPattern)
			.map(match => match.groups.imported ?? `./${match.groups.loaded}`)
			.filter(specifier => specifier.startsWith('./'))
			.map(specifier => resolve(file, specifier))
			.toArray();

		stack.push(...specifiers);
	}

	assert.ok(reachable.includes('thread.js'), 'The walk should reach the worker module');
	assert.deepEqual(reachable.filter(file => !published.has(file)), [], 'Every reachable module should be published');
});

test('a view into a larger buffer hashes only the bytes it covers', async () => {
	const backing = Buffer.alloc(128);
	for (let index = 0; index < backing.length; index++) {
		backing[index] = index * 5;
	}

	// An offset that every element size divides, so all of them can sit on it
	const region = backing.subarray(8, 72);
	const expected = digestOf('sha256', region);

	const views = [
		Int8Array,
		Uint8Array,
		Uint8ClampedArray,
		Int16Array,
		Uint16Array,
		Int32Array,
		Uint32Array,
		Float32Array,
		Float64Array,
		BigInt64Array,
		BigUint64Array,
	].map(Type => new Type(region.buffer, region.byteOffset, region.byteLength / Type.BYTES_PER_ELEMENT));

	// A DataView has no element size, so it covers whatever range it was given
	views.push(new DataView(region.buffer, region.byteOffset, region.byteLength));

	assert.deepEqual(views.map(view => `${view.constructor.name}:${view.byteLength}`), views.map(view => `${view.constructor.name}:${region.byteLength}`));

	assert.deepEqual(await Promise.all(views.map(async view => sha256(view))), views.map(() => expected));
});

test('a byte view at an unaligned offset hashes only the bytes it covers', async () => {
	const backing = Buffer.alloc(32);
	for (let index = 0; index < backing.length; index++) {
		backing[index] = index;
	}

	// 7 is not a multiple of any element size above one byte
	const unaligned = backing.subarray(7, 23);
	const expected = digestOf('sha256', unaligned);

	assert.equal(await sha256(unaligned), expected);
	assert.equal(await sha256(new Int8Array(backing.buffer, 7, 16)), expected);
	assert.equal(await sha256(new Uint8Array(backing.buffer, 7, 16)), expected);
	assert.equal(await sha256(new DataView(backing.buffer, 7, 16)), expected);
	assert.equal(await sha256(new Uint8Array(backing.buffer, 7, 0)), createHash('sha256').digest('hex'));
});

test('a buffer that changes length is copied at its length when the call is made', async () => {
	// A resizable ArrayBuffer changes length with `resize`, in both directions, and shared memory only grows, with `grow`. A view made without a length tracks either, so every copy has to read the length as it stands rather than as it was when the view was made.
	const resizable = new ArrayBuffer(8, {maxByteLength: 32});
	const growable = new SharedArrayBuffer(8, {maxByteLength: 32});

	const buffers = [
		[resizable, length => resizable.resize(length), [8, 32, 4, 16]],
		[growable, length => growable.grow(length), [8, 16, 32]],
	];

	const expected = [];
	const observed = [];

	for (const [buffer, setLength, lengths] of buffers) {
		const trackingView = new Uint8Array(buffer);
		const trackingDataView = new DataView(buffer);

		for (const length of lengths) {
			setLength(length);
			trackingView.fill(length);

			const whole = digestOf('sha256', Buffer.alloc(length, length));
			expected.push(whole, whole, whole, digestOf('sha256', Buffer.alloc(4, length)));

			// Each call takes its copy before its first await, so collecting the promises here samples every step in turn rather than all of them at the final length
			observed.push(
				sha256(buffer),
				sha256(trackingView),
				sha256(trackingDataView),
				sha256(new Uint8Array(buffer, length - 4, 4)),
			);
		}
	}

	assert.deepEqual(await Promise.all(observed), expected);
});

test('a buffer from another realm is accepted', async () => {
	// Neither an instanceof ArrayBuffer nor an instanceof ArrayBufferView of this realm, so the conversion must not lean on instanceof alone.
	const vm = await import('node:vm');
	const [view, buffer] = vm.runInNewContext('const view = new Uint8Array([1, 2, 3, 4, 5]); [view, view.buffer]');
	const expected = digestOf('sha256', Buffer.from([1, 2, 3, 4, 5]));

	assert.equal(await sha256(view), expected);
	assert.equal(await sha256(buffer), expected);
});

test('a detached buffer is rejected rather than hashed as empty', async () => {
	const {port1, port2} = new MessageChannel();
	const buffer = new ArrayBuffer(8);
	const view = new Uint8Array(buffer);
	port1.postMessage(buffer, [buffer]);
	await new Promise(resolve => {
		port2.once('message', resolve);
	});

	port1.close();

	assert.equal(buffer.byteLength, 0);
	await assert.rejects(sha256(buffer), {name: 'TypeError'});
	await assert.rejects(sha256(view), {name: 'TypeError'});
});

test('a string hashes exactly its utf-8 bytes', async () => {
	const values = [
		'',
		'foo',
		'🦄',
		'ünïcödé',
		'a b',
		'\u{1F469}\u{1F4BB}',
		// Unpaired surrogates, which utf-8 encoding replaces with U+FFFD
		'\u{D800}',
		'\u{DC00}',
		// Sizes around the typical buffer size classes, where an over-allocated `Uint8Array` would append zero bytes and quietly produce a different hash
		...Array.from({length: 40}, (_, index) => 'x'.repeat(index)),
		'x'.repeat(10_000),
	];

	const digests = await Promise.all(values.map(async value => sha256(value)));

	// Checked against node's own utf-8 encoding, not against the TextEncoder the library uses, so that a mis-sized buffer shows up here rather than cancelling out on both sides
	const expected = values.map(value => digestOf('sha256', Buffer.from(value, 'utf8')));

	assert.deepEqual(digests, expected);
	assert.equal(digests[0], createHash('sha256').digest('hex'));
});

test('buffer results stay correct and distinct under concurrency', async () => {
	// Every reply is a separately transferred ArrayBuffer. If two of them shared memory, a concurrent result would overwrite another and the digests would not all be right, which is why they are all read only once every call has settled.
	const count = 100;
	const inputs = Array.from({length: count}, (_, index) => `input ${index}`);
	const expected = inputs.map(input => digestOf('sha512', input));

	const results = await Promise.all(inputs.map(async input => sha512(input, {outputFormat: 'buffer'})));
	const hexes = results.map(buffer => Buffer.from(buffer).toString('hex'));

	assert.deepEqual(hexes, expected);
});

test('mixed algorithms and formats stay correct when interleaved', async () => {
	const algorithms = {
		sha1, sha256, sha384, sha512,
	};
	const calls = [];

	for (const [name, hash] of Object.entries(algorithms)) {
		for (let index = 0; index < 25; index++) {
			calls.push({
				name, hash, input: `${name} ${index}`, format: index % 2 === 0 ? 'hex' : 'buffer',
			});
		}
	}

	const results = await Promise.all(calls.map(async ({hash, input, format}) => {
		const result = await hash(input, {outputFormat: format});
		return format === 'hex' ? result : Buffer.from(result).toString('hex');
	}));

	assert.deepEqual(
		results,
		calls.map(({name, input}) => digestOf(name, input)),
	);
});

test('hashing does not observe a buffer the caller mutates mid-flight', async () => {
	// The copy is taken before the worker round trip, so a caller reusing its buffer immediately after the call returns must not be able to change the digest.
	const buffer = new ArrayBuffer(4096);
	const view = new Uint8Array(buffer);
	const expected = digestOf('sha256', view);

	const pending = sha256(buffer);
	view.fill(0xFF);
	assert.equal(await pending, expected);

	// And a later hash does see the change, proving the buffer really was written
	assert.equal(await sha256(buffer), digestOf('sha256', view));
});
