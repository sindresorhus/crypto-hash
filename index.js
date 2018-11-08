'use strict';
const crypto = require('crypto');

const create = algorithm => async (buffer, options) => { // eslint-disable-line require-await
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

exports.sha1 = create('sha1');
exports.sha256 = create('sha256');
exports.sha384 = create('sha384');
exports.sha512 = create('sha512');
