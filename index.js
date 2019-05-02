'use strict';
const crypto = require('crypto');

const requireOptional = (name, defaultValue) => {
	try {
		return require(name);
	} catch (error) {
		return defaultValue;
	}
};

const {Worker} = requireOptional('worker_threads', {});

let worker; // Lazy
let taskIdCounter = 0;
const tasks = new Map();

const createWorker = () => {
	worker = new Worker('./thread.js');
	worker.on('message', message => {
		const task = tasks.get(message.id);
		tasks.delete(message.id);
		if (tasks.size === 0) {
			worker.unref();
		}

		task(message.value);
	});
	worker.on('error', err => {
		// Any error here is effectively an equivalent of segfault and have no scope, so we just throw it on callback level
		throw err;
	});
};

const taskWorker = (value, transferList) => new Promise(resolve => {
	const id = taskIdCounter++;
	tasks.set(id, resolve);

	if (worker === undefined) {
		createWorker();
	}

	worker.postMessage({id, value}, transferList);
});

let create = algorithm => async (buffer, options) => {
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

if (Worker !== undefined) {
	create = algorithm => async (src, options) => {
		options = {
			outputFormat: 'hex',
			...options
		};

		let buffer;
		if (typeof src === 'string') {
			// Saving one copy operation by writing string to buffer right away and then transfering buffer
			buffer = new ArrayBuffer(Buffer.byteLength(src, 'utf8'));
			Buffer.from(buffer).write(src, 'utf8');
		} else {
			// Creating a copy of buffer at call time, will be transfered later
			buffer = src.buffer.slice(0);
		}

		const res = await taskWorker({algorithm, buffer}, [buffer]);
		if (options.outputFormat === 'hex') {
			return Buffer.from(res).toString('hex');
		}

		return res;
	};
}

exports.sha1 = create('sha1');
exports.sha256 = create('sha256');
exports.sha384 = create('sha384');
exports.sha512 = create('sha512');
