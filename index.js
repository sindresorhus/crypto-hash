'use strict';
const {Worker} = require('worker_threads');

let worker; // Lazy
let taskIdCounter = 0;
const tasks = new Map();

const taskWorker = (value, transferList) => new Promise(resolve => {
	const id = taskIdCounter++;
	tasks.set(id, resolve);
	if (worker === undefined) {
		worker = new Worker('./thread.js');
		worker.on('message', msg => {
			const task = tasks.get(msg.id);
			tasks.delete(msg.id);
			if (tasks.size === 0) {
				worker.unref();
			}

			task(msg.value);
		});
		worker.on('error', err => {
			// Any error here is effectively an equivalent of segfault, and have no scope, so we just throw it on callback level
			throw err;
		});
	}

	worker.postMessage({id, value}, transferList);
});

const create = algorithm => async (src, options) => {
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

exports.sha1 = create('sha1');
exports.sha256 = create('sha256');
exports.sha384 = create('sha384');
exports.sha512 = create('sha512');
