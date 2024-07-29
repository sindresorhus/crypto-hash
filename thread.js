import crypto from 'node:crypto';
import {parentPort} from 'node:worker_threads';

parentPort.on('message', ({id, value: {algorithm, buffer}}) => {
	const hash = crypto.createHash(algorithm);
	hash.update(new DataView(buffer));
	const value = hash.digest().buffer;
	// Transfering buffer here for consistency, but considering buffer size it might be faster to just leave it for copying, needs perf test
	parentPort.postMessage({id, value}, [value]);
});
