/* eslint-disable n/prefer-global/buffer -- This module is shared with the browser build, which has no `node:buffer`. The Node fast paths below are guarded by a runtime check instead of an import. */

// A single encoder, reused, so hashing a short string does not allocate one first. `encode` is stateless, so sharing one is safe.
const textEncoder = new TextEncoder();

// Naming a value and tagging one are both property reads, so a getter or a proxy trap on them can throw, and read from inside the error path that error would reach the caller instead of the TypeError naming their argument. Neither read is allowed to escape.
const describe = value => {
	try {
		return value?.constructor?.name ?? typeof value;
	} catch {
		return typeof value;
	}
};

const typeTag = value => {
	try {
		return Object.prototype.toString.call(value);
	} catch {
		return undefined;
	}
};

const notABuffer = input => new TypeError(`Expected a string, an ArrayBuffer, or an ArrayBufferView, got ${describe(input)}`);

// A byte view covering exactly the bytes of `input`, rejecting anything that is not a buffer or a view of one.
const byteView = input => {
	if (ArrayBuffer.isView(input)) {
		return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
	}

	// The tag is read before anything is handed to the constructor, which would otherwise report its own errors for a symbol, and turn an object carrying a byteLength into an empty view rather than rejecting it. The tag works across realms, unlike `instanceof`, and it avoids naming `SharedArrayBuffer`, which is absent in a browser that is not cross-origin isolated. A tag that cannot be read matches neither branch, so the value is rejected by name like any other.
	const tag = typeTag(input);
	if (tag !== '[object ArrayBuffer]' && tag !== '[object SharedArrayBuffer]') {
		throw notABuffer(input);
	}

	// A subclass, or a plain object, can carry a `Symbol.toStringTag` of its own without being a buffer at all, so what the view ends up pointing at is what finally decides.
	const view = new Uint8Array(input);
	if (view.buffer !== input) {
		throw notABuffer(input);
	}

	return view;
};

// Produces a plain `ArrayBuffer` holding exactly the bytes of `input`.
//
// A copy is always made. The caller's buffer is therefore never detached by the transfer list, and a view that covers only part of a larger buffer hashes only the part it covers.
//
// The copy is a new byte view built from one over the input, rather than a slice of the buffer. Slicing a SharedArrayBuffer gives another SharedArrayBuffer, which cannot be transferred to the worker, and it throws outright when the buffer being sliced is empty. It would also hand back whatever a subclass or a proxy returned from `slice`, which the transfer list would then detach, taking the caller's own buffer with it. A byte view is also the only way to copy a DataView, which has no copy method of its own.
const toArrayBuffer = input => typeof input === 'string'
	? textEncoder.encode(input).buffer
	: new Uint8Array(byteView(input)).buffer;

// Pre-computed hex lookup table for fast conversion
const HEX_CHARS = '0123456789abcdef';
const HEX_LUT = [];
for (let index = 0; index < 256; index++) {
	// eslint-disable-next-line no-bitwise
	HEX_LUT[index] = HEX_CHARS[(index >>> 4) & 0xF] + HEX_CHARS[index & 0xF];
}

const bufferToHex = buffer => {
	// Fast path in Node.js
	if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
		return Buffer.from(buffer).toString('hex');
	}

	// Browser fallback with optimized lookup table
	const bytes = new Uint8Array(buffer);
	let hex = '';
	// eslint-disable-next-line unicorn/no-for-loop -- Performance critical path
	for (let index = 0; index < bytes.length; index++) {
		hex += HEX_LUT[bytes[index]];
	}

	return hex;
};

// The shape all three builds share: read the option, copy the input into a plain transferable buffer, hand those bytes to a digest, and format what comes back. The entry points differ only in how the digest is computed, so keeping the rest in one place is what stops the paths from drifting apart.
export const createHasher = digest => async (input, options) => {
	// A parameter default would only cover `undefined`, so a `null` from a caller would throw on the property access instead of behaving like no options at all.
	const {outputFormat = 'hex'} = options ?? {};

	// Anything else used to fall through to the buffer branch, so a typo in the option handed back an ArrayBuffer where the caller expected a string and only surfaced much further downstream. It is checked before any hashing is done, and named without `JSON.stringify` or `String`, both of which throw on a BigInt, a circular value, or a null prototype.
	if (outputFormat !== 'hex' && outputFormat !== 'buffer') {
		const received = typeof outputFormat === 'string' ? `"${outputFormat}"` : describe(outputFormat);
		throw new TypeError(`Expected outputFormat to be 'hex' or 'buffer', got ${received}`);
	}

	const buffer = await digest(toArrayBuffer(input));
	return outputFormat === 'hex' ? bufferToHex(buffer) : buffer;
};
