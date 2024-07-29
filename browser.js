import {bufferToHex} from './utilities.js';

const create = algorithm => async (buffer, {outputFormat = 'hex'} = {}) => {
	if (typeof buffer === 'string') {
		buffer = new globalThis.TextEncoder().encode(buffer);
	}

	const hash = await globalThis.crypto.subtle.digest(algorithm, buffer);

	return outputFormat === 'hex' ? bufferToHex(hash) : hash;
};

export const sha1 = create('SHA-1');
export const sha256 = create('SHA-256');
export const sha384 = create('SHA-384');
export const sha512 = create('SHA-512');
