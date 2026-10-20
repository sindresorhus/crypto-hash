/* eslint-disable n/prefer-global/buffer -- This module is shared with the browser build, which has no `node:buffer`. The Node fast paths below are guarded by a runtime check instead of an import. */

// Creates a fresh buffer safe for transfer without detaching user's buffer
export const toWorkerBuffer = input => {
	if (typeof input === 'string') {
		// Fresh buffer from encoding
		return new TextEncoder().encode(input).buffer;
	}

	// ArrayBuffer: fresh copy so the caller's buffer stays intact.
	// TypedArray/DataView/Node Buffer: fresh exact slice from the view's portion.
	// eslint-disable-next-line unicorn/prefer-spread -- ArrayBuffer.slice() is the correct method
	return input instanceof ArrayBuffer ? input.slice(0) : input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
};

export const toArrayBuffer = input => {
	if (typeof input === 'string') {
		return new TextEncoder().encode(input).buffer;
	}

	if (input instanceof ArrayBuffer) {
		// Return a copy to guarantee we never detach user-owned buffers
		// eslint-disable-next-line unicorn/prefer-spread -- ArrayBuffer.slice() is the correct method
		return input.slice();
	}

	// For DataView, we need special handling since the view's buffer may be larger
	// than the region the view actually covers
	if (input instanceof DataView) {
		const newBuffer = new ArrayBuffer(input.byteLength);
		const newView = new Uint8Array(newBuffer);
		for (let index = 0; index < input.byteLength; index++) {
			newView[index] = input.getUint8(index);
		}

		return newBuffer;
	}

	// TypedArray/Node Buffer
	return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
};

// Pre-computed hex lookup table for fast conversion
const HEX_CHARS = '0123456789abcdef';
const HEX_LUT = [];
for (let index = 0; index < 256; index++) {
	// eslint-disable-next-line no-bitwise
	HEX_LUT[index] = HEX_CHARS[(index >>> 4) & 0xF] + HEX_CHARS[index & 0xF];
}

export const bufferToHex = buffer => {
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
