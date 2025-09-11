import crypto from 'node:crypto';
import {parentPort} from 'node:worker_threads';

parentPort.on('message', ({id, value: {algorithm, buffer}}) => {
	const hash = crypto.createHash(algorithm);

	// Use Uint8Array for clean, consistent handling
	hash.update(new Uint8Array(buffer));
	const digest = hash.digest(); // Buffer

	// Slice out the exact bytes to avoid slab leakage
	const result = digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);

	// Transfer the result back for zero-copy performance
	parentPort.postMessage({id, value: result}, [result]);
});
