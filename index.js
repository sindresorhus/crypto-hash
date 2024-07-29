import {Worker} from 'node:worker_threads';
import crypto from 'node:crypto';
import {bufferToHex} from './utilities.js';

let create = algorithm => async (buffer, {outputFormat = 'hex'} = {}) => {
	const hash = crypto.createHash(algorithm);
	hash.update(buffer, typeof buffer === 'string' ? 'utf8' : undefined);

	if (outputFormat === 'hex') {
		return hash.digest('hex');
	}

	return hash.digest().buffer;
};

if (Worker !== undefined) {
	const threadFilePath = new URL('thread.js', import.meta.url);

	let worker; // Lazy
	let taskIdCounter = 0;
	const tasks = new Map();

	const createWorker = () => {
		worker = new Worker(threadFilePath);

		worker.on('message', message => {
			const task = tasks.get(message.id);
			tasks.delete(message.id);
			if (tasks.size === 0) {
				worker.unref();
			}

			task(message.value);
		});

		worker.on('error', error => {
			// Any error here is effectively an equivalent of segfault and have no scope, so we just throw it on callback level
			throw error;
		});
	};

	const taskWorker = (value, transferList) => new Promise(resolve => {
		const id = taskIdCounter++;
		tasks.set(id, resolve);

		if (worker === undefined) {
			createWorker();
		}

		worker.ref();
		worker.postMessage({id, value}, transferList);
	});

	create = algorithm => async (source, {outputFormat = 'hex'} = {}) => {
		const {buffer} = typeof source === 'string' ? new TextEncoder().encode(source) : (source instanceof ArrayBuffer ? new Uint8Array(source) : source);

		const hash = await taskWorker({algorithm, buffer}, [buffer]);

		return outputFormat === 'hex' ? bufferToHex(hash) : hash;
	};
}

export const sha1 = create('sha1');
export const sha256 = create('sha256');
export const sha384 = create('sha384');
export const sha512 = create('sha512');
