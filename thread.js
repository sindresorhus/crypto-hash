'use strict';
const {parentPort} = require('worker_threads');
const crypto = require('crypto');

parentPort.on('message', msg => {
	const {algorithm, buffer} = msg.value;
	const hash = crypto.createHash(algorithm);
	hash.update(Buffer.from(buffer));
	const arrayBuf = hash.digest().buffer;
	// Transfering buffer here for consistency, but considering buffer size it might be faster to just leave it for copying, needs perf test
	parentPort.postMessage({id: msg.id, value: arrayBuf}, [arrayBuf]);
});
