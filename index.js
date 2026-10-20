import {Worker} from 'node:worker_threads';
import crypto from 'node:crypto';
import {createHasher} from './utilities.js';
import {createWorkerPool} from './worker-pool.js';

// Where the runtime provides no `Worker`, the digest runs in this process instead, so the entry point still works. `createHasher` gives it the same input contract, copying and output format as the worker path, and `test-fallback.js` pins it to `node:crypto` on the same inputs `test.js` pins the worker path to.
const inProcess = algorithm => createHasher(buffer => {
	const hash = crypto.createHash(algorithm);
	hash.update(new Uint8Array(buffer));
	const digest = hash.digest();

	// Slice the exact digest bytes to avoid buffer slab issues
	return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
});

let create = inProcess;

if (Worker !== undefined) {
	const pool = createWorkerPool(new URL('thread.js', import.meta.url));

	// `createHasher` copies the input first, so the buffer handed to the transfer list is ours to detach and never the caller's.
	create = algorithm => createHasher(buffer => pool.run({algorithm, buffer}, [buffer]));
}

export const sha1 = create('sha1');
export const sha256 = create('sha256');
export const sha384 = create('sha384');
export const sha512 = create('sha512');
