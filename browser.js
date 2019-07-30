/* eslint-env browser */
'use strict';

// Ponyfill for `globalThis`
const _globalThis = (() => {
	if (typeof self !== 'undefined') {
		return self;
	}

	/* istanbul ignore next */
	if (typeof window !== 'undefined') {
		return window;
	}

	/* istanbul ignore next */
	if (typeof global !== 'undefined') {
		return global;
	}
})();

const bufferToHex = buffer => {
	const view = new DataView(buffer);

	let hexCodes = '';
	for (let i = 0; i < view.byteLength; i += 4) {
		hexCodes += view
			.getUint32(i)
			.toString(16)
			.padStart(8, '0');
	}

	return hexCodes;
};

const create = algorithm => async (buffer, options) => {
	if (typeof buffer === 'string') {
		buffer = new _globalThis.TextEncoder().encode(buffer);
	}

	options = {
		outputFormat: 'hex',
		...options
	};

	const hash = await _globalThis.crypto.subtle.digest(algorithm, buffer);

	return options.outputFormat === 'hex' ? bufferToHex(hash) : hash;
};

// Async function hmac(key, string, encoding) {
// 	const cryptoKey = await crypto.subtle.importKey(
// 		'raw',
// 		typeof key === 'string' ? encoder.encode(key) : key,
// 		{name: 'HMAC', hash: {name: 'SHA-256'}},
// 		false,
// 		['sign']
// 	);
// 	const signed = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(string));
// 	return encoding === 'hex' ? buf2hex(signed) : signed;
// }

// async function hash(content, encoding) {
// 	const digest = await crypto.subtle.digest('SHA-256', typeof content === 'string' ? encoder.encode(content) : content);
// 	return encoding === 'hex' ? buf2hex(digest) : digest;
// }

// function buf2hex(buffer) {
// 	return Array.prototype.map.call(new Uint8Array(buffer), x => ('0' + x.toString(16)).slice(-2)).join('');
// }

exports.sha1 = create('SHA-1');
exports.sha256 = create('SHA-256');
exports.sha384 = create('SHA-384');
exports.sha512 = create('SHA-512');
