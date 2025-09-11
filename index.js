import {Worker} from 'node:worker_threads';
import crypto from 'node:crypto';
import {bufferToHex, toWorkerBuffer} from './utilities.js';

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
	const threadFilePath = new URL('thread.js', import.meta.url);

	let worker; // Lazy
	let taskIdCounter = 0;
	const tasks = new Map();

	const createWorker = () => {
		worker = new Worker(threadFilePath, {type: 'module'});

		worker.on('message', message => {
			const task = tasks.get(message.id);
			if (task) {
				tasks.delete(message.id);
				if (tasks.size === 0) {
					worker.unref();
				}

				task.resolve(message.value);
			}
		});

		worker.on('error', error => {
			// Reject all pending promises and reset worker
			for (const [, task] of tasks) {
				task.reject(error);
			}

			tasks.clear();
			worker = undefined;
		});

		worker.on('exit', code => {
			if (tasks.size > 0) {
				const error = new Error(`Hash worker exited early (code ${code})`);
				for (const [, task] of tasks) {
					task.reject(error);
				}

				tasks.clear();
			}

			worker = undefined;
		});
	};

	const taskWorker = (value, transferList) => new Promise((resolve, reject) => {
		const id = taskIdCounter++;
		tasks.set(id, {resolve, reject});

		if (worker === undefined) {
			createWorker();
		}

		worker.ref();

		// Transfer the fresh buffer for performance - it's safe since we created a copy
		worker.postMessage({id, value}, transferList);
	});

	create = algorithm => async (source, {outputFormat = 'hex'} = {}) => {
		// Create a fresh buffer that's safe to transfer
		const inputBuffer = toWorkerBuffer(source);

		// Transfer the input buffer for zero-copy performance
		const hash = await taskWorker({algorithm, buffer: inputBuffer}, [inputBuffer]);

		return outputFormat === 'hex' ? bufferToHex(hash) : hash;
	};
}

export const sha1 = create('sha1');
export const sha256 = create('sha256');
export const sha384 = create('sha384');
export const sha512 = create('sha512');
