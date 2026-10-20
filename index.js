import {Worker} from 'node:worker_threads';
import crypto from 'node:crypto';
import {bufferToHex, toWorkerBuffer} from './utilities.js';
import {createWorkerPool} from './worker-pool.js';

let create = algorithm => async (buffer, {outputFormat = 'hex'} = {}) => {
	const hash = crypto.createHash(algorithm);
	if (typeof buffer === 'string') {
		hash.update(buffer, 'utf8');
	} else {
		hash.update(buffer);
	}

	if (outputFormat === 'hex') {
		return hash.digest('hex');
	}

	// Slice the exact digest bytes to avoid buffer slab issues
	const digest = hash.digest();

	return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
};

if (Worker !== undefined) {
	const pool = createWorkerPool(new URL('thread.js', import.meta.url));

	create = algorithm => async (source, {outputFormat = 'hex'} = {}) => {
		// Create a fresh buffer that's safe to transfer
		const inputBuffer = toWorkerBuffer(source);

		// Transfer the input buffer for zero-copy performance
		const hash = await pool.run({algorithm, buffer: inputBuffer}, [inputBuffer]);

		return outputFormat === 'hex' ? bufferToHex(hash) : hash;
	};
}

export const sha1 = create('sha1');
export const sha256 = create('sha256');
export const sha384 = create('sha384');
export const sha512 = create('sha512');
