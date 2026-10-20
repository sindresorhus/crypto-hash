/* eslint-disable unicorn/no-top-level-side-effects -- The fixtures are built once, when the suites load them. */
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';

// Shared by `test.js` and `test-fallback.js`, so the worker path, the in-process path and the browser build are all held to the same table. Nothing here may import `node:worker_threads`, since `test-fallback.js` stubs that module out before loading this one.

const backing = Buffer.alloc(64);
for (let index = 0; index < backing.length; index++) {
	backing[index] = index * 3;
}

const typedArray = new Uint16Array([1, 2, 3]);

const shared = new SharedArrayBuffer(8);
new Uint8Array(shared).set([1, 2, 3, 4, 5, 6, 7, 8]);

// Grown after the view over it was made, so the view is length tracking and only knows its length at the time it is read
const resizable = new ArrayBuffer(4, {maxByteLength: 32});
const lengthTracking = new Uint8Array(resizable);
resizable.resize(12);
lengthTracking.set(backing.subarray(0, 12));

// Every input shape the builds have to agree on, paired with the bytes it is expected to hash
export const inputs = new Map([
	['an empty string', ['', new Uint8Array(0)]],
	['a plain string', ['foo bar baz', Buffer.from('foo bar baz', 'utf8')]],
	['an astral character', ['🦄', Buffer.from('🦄', 'utf8')]],
	['an unpaired surrogate', ['\u{D800}', Buffer.from('\u{D800}', 'utf8')]],
	['an ArrayBuffer', [new TextEncoder().encode('test').buffer, Buffer.from('test', 'utf8')]],
	['a Node.js Buffer from the shared pool', [Buffer.from('foo\nbar\nbaz', 'utf8'), Buffer.from('foo\nbar\nbaz', 'utf8')]],
	['a view into a larger buffer', [backing.subarray(7, 47), backing.subarray(7, 47)]],
	['a typed array', [typedArray, Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)]],
	['a DataView at an offset', [new DataView(backing.buffer, 8, 16), backing.subarray(8, 24)]],
	['a shared buffer', [shared, new Uint8Array(shared)]],
	['a view over shared memory', [new Uint8Array(shared), new Uint8Array(shared)]],
	['the tail of a shared buffer', [new Uint8Array(shared, 4), new Uint8Array(shared, 4)]],
	['the empty range at the end of a shared buffer', [new Uint8Array(shared, 8), new Uint8Array(0)]],
	// `SharedArrayBuffer.prototype.slice` throws when the buffer it is called on is empty, so these need a path that never slices one
	['an empty shared buffer', [new SharedArrayBuffer(0), new Uint8Array(0)]],
	['a DataView over empty shared memory', [new DataView(new SharedArrayBuffer(0)), new Uint8Array(0)]],
	['a resizable buffer that has grown', [resizable, backing.subarray(0, 12)]],
	['a length-tracking view of it', [lengthTracking, backing.subarray(0, 12)]],
]);

const digestSizes = {
	sha1: 20,
	sha256: 32,
	sha384: 48,
	sha512: 64,
};

// Every input in the table, through every algorithm in both formats, compared with what `node:crypto` gives for the expected bytes. Returns a description of each mismatch, so a failure says which input went wrong.
export const mismatchesWithNodeCrypto = async algorithms => {
	const mismatches = await Promise.all(Object.entries(algorithms).flatMap(([name, hash]) => [...inputs].map(async ([label, [input, bytes]]) => {
		const expected = createHash(name).update(bytes).digest('hex');
		const hex = await hash(input);
		const buffer = await hash(input, {outputFormat: 'buffer'});
		const bufferHex = Buffer.from(buffer).toString('hex');

		const isCorrect = hex === expected
			&& bufferHex === expected
			&& buffer instanceof ArrayBuffer
			&& buffer.byteLength === digestSizes[name];

		return isCorrect ? undefined : `${name} of ${label}: got ${hex} and ${bufferHex} (${buffer.byteLength} bytes), want ${expected}`;
	})));

	return mismatches.filter(Boolean);
};

// A value that throws from the one property the library reads, and one that throws from every property read at all
export const trapped = property => ({
	get [property]() {
		throw new Error('trap');
	},
});

export const revokedProxy = () => {
	const {proxy, revoke} = Proxy.revocable({}, {});
	revoke();
	return proxy;
};

// Values that are not a string, a buffer or a view, paired with the name the error gives them
export const rejectedInputs = [
	[123, 'Number'],
	[10n, 'BigInt'],
	[true, 'Boolean'],
	[Symbol('x'), 'Symbol'],
	[() => {}, 'Function'],
	[null, 'object'],
	[undefined, 'undefined'],
	[[1, 2, 3], 'Array'],
	[{}, 'Object'],
	// `new Uint8Array({byteLength: 5})` runs ToIndex on the object, gets NaN, and yields an empty view, so an object that merely looks like a buffer would hash as zero bytes if it got through
	[{byteLength: 5}, 'Object'],
	[{byteLength: 8, byteOffset: 0}, 'Object'],
	[new (class Fake {
		get byteLength() {
			return 7;
		}
	})(), 'Fake'],
	// A null prototype leaves nothing to name the value by, so the type alone is reported
	[Object.assign(Object.create(null), {byteLength: 9}), 'object'],
	// Pretending to be a buffer through its tag is not enough either
	[{[Symbol.toStringTag]: 'ArrayBuffer', byteLength: 4}, 'Object'],
	// Naming a value reads its `constructor`, and recognising it reads its `Symbol.toStringTag`. A trap on either must not replace the TypeError naming the argument with its own error. A trapped constructor leaves only `typeof`, a trapped tag leaves the value unrecognisable but still nameable, and a revoked proxy throws from every read.
	[trapped('constructor'), 'object'],
	[trapped(Symbol.toStringTag), 'Object'],
	[revokedProxy(), 'object'],
];

export const inputError = name => `Expected a string, an ArrayBuffer, or an ArrayBufferView, got ${name}`;

// Returns the message each rejected input was rejected with, or a note that it was not rejected at all
export const rejectionMessages = async hash => Promise.all(rejectedInputs.map(async ([value]) => {
	try {
		await hash(value);
		return 'resolved';
	} catch (error) {
		return `${error.name}: ${error.message}`;
	}
}));

export const expectedRejectionMessages = rejectedInputs.map(([, name]) => `TypeError: ${inputError(name)}`);
