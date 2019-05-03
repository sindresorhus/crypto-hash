'use strict';
const crypto = require('crypto');
const {parentPort} = require('worker_threads'); // eslint-disable-line import/no-unresolved, eslint-comments/no-unused-disable

parentPort.on('message', message => {
	const {algorithm, buffer} = message.value;
	const hash = crypto.createHash(algorithm);
	hash.update(Buffer.from(buffer));
	const arrayBuffer = hash.digest().buffer;
	// Transfering buffer here for consistency, but considering buffer size it might be faster to just leave it for copying, needs perf test
	parentPort.postMessage({id: message.id, value: arrayBuffer}, [arrayBuffer]);
});
