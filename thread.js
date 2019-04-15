'use strict';
const {parentPort} = require('worker_threads');
const crypto = require('crypto');

parentPort.on('message', (opts) => {
	const hash = crypto.createHash(opts.algorithm);
	hash.update(Buffer.from(opts.arrayBuf));
	const arrayBuf = hash.digest().buffer;
	parentPort.postMessage(arrayBuf, [arrayBuf]);
});
