/* eslint-env browser */
'use strict';

const bufferToHex = buffer => {
	const view = new DataView(buffer);

	let hexCodes = '';
	for (let i = 0; i < view.byteLength; i += 4) {
		hexCodes += view.getUint32(i).toString(16).padStart(8, '0');
	}

	return hexCodes;
};

const create = algorithm => async (buffer, options) => {
	if (typeof buffer === 'string') {
		buffer = new window.TextEncoder().encode(buffer);
	}

	options = {
		outputFormat: 'hex',
		...options
	};

	const hash = await window.crypto.subtle.digest(algorithm, buffer);

	return options.outputFormat === 'hex' ? bufferToHex(hash) : hash;
};

exports.sha1 = create('SHA-1');
exports.sha256 = create('SHA-256');
exports.sha384 = create('SHA-384');
exports.sha512 = create('SHA-512');
