// Creates a fresh buffer safe for transfer without detaching user's buffer
export const toWorkerBuffer = input => {
	if (typeof input === 'string') {
		// Fresh buffer from encoding
		return new globalThis.TextEncoder().encode(input).buffer;
	}

	if (input instanceof ArrayBuffer) {
		// Fresh copy - caller's buffer stays intact
		// eslint-disable-next-line unicorn/prefer-spread -- ArrayBuffer.slice() is the correct method
		return input.slice(0);
	}

	// TypedArray/DataView/Node Buffer
	const isNodeBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer?.(input);
	const view = isNodeBuffer ? new Uint8Array(input) : input;

	// Fresh exact slice from the view's portion
	return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
};

export const toArrayBuffer = input => {
	if (typeof input === 'string') {
		return new globalThis.TextEncoder().encode(input).buffer;
	}

	if (input instanceof ArrayBuffer) {
		// Return a copy to guarantee we never detach user-owned buffers
		// eslint-disable-next-line unicorn/prefer-spread -- ArrayBuffer.slice() is the correct method
		return input.slice();
	}

	// Handle Node.js Buffer and other ArrayBufferViews
	const isNodeBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer?.(input);
	const view = isNodeBuffer ? new Uint8Array(input) : input;

	// For DataView, we need special handling since new Uint8Array(dataView) doesn't work
	if (view instanceof DataView) {
		const newBuffer = new ArrayBuffer(view.byteLength);
		const newView = new Uint8Array(newBuffer);
		for (let index = 0; index < view.byteLength; index++) {
			newView[index] = view.getUint8(index);
		}

		return newBuffer;
	}

	return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
};

export const bufferToHex = buffer => {
	// Fast path in Node.js
	if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
		return Buffer.from(buffer).toString('hex');
	}

	// Browser fallback
	const bytes = new Uint8Array(buffer);
	let hex = '';
	for (const byte of bytes) {
		hex += byte.toString(16).padStart(2, '0');
	}

	return hex;
};
