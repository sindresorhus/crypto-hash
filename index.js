'use strict';
const crypto = require('crypto');

const create = algorithm => async (buffer, options) => {
	options = {
		outputFormat: 'hex',
		...options
	};

	const hash = crypto.createHash(algorithm);
	hash.update(buffer, typeof buffer === 'string' ? 'utf8' : undefined);

	if (options.outputFormat === 'hex') {
		return hash.digest('hex');
	}

	return hash.digest().buffer;
};

exports.ripemd160 = create('ripemd160');
exports.blake32s256 = create('blake32s256');
exports.blake32b512 = create('blake32b512');
exports.md4 = create('md4');
exports.md5 = create('md5');
exports.sha1 = create('sha1');
exports.sha224 = create('sha224');
exports.sha256 = create('sha256');
exports.sha384 = create('sha384');
exports.sha512 = create('sha512');
exports.whirlpool = create('whirlpool');
