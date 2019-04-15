'use strict';
const {Worker} = require('worker_threads');

const create = algorithm => (buffer, options) => new Promise((resolve, reject) => {
	options = {
		outputFormat: 'hex',
		...options
	};

	let arrayBuf;
	if (typeof buffer === 'string') {
		let buf = Buffer.from(buffer, 'utf8');
		if(buf.byteOffset === 0 && buf.buffer.byteLength === buf.length) {
			arrayBuf = buf.Buffer;
		} else {
			arrayBuf = new ArrayBuffer(buf.length);
			buf.copy(Buffer.from(arrayBuf));
		}
	} else {
		arrayBuf = buffer.buffer.slice(0);
	}

	const worker = new Worker('./thread.js');
	worker.on('message', arrayBuf => {
		if(options.outputFormat === 'hex') {
			resolve(Buffer.from(arrayBuf).toString('hex'));
		} else {
			resolve(arrayBuf);
		}
	});
	worker.on('error', reject);
	worker.postMessage({algorithm, arrayBuf}, [arrayBuf]);
});

exports.sha1 = create('sha1');
exports.sha256 = create('sha256');
exports.sha384 = create('sha384');
exports.sha512 = create('sha512');
