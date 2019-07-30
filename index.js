'use strict'
const crypto = require('crypto')
const path = require('path')

const requireOptional = (name, defaultValue) => {
	try {
		return require(name)
	} catch (_) {
		return defaultValue
	}
}

const { Worker } = requireOptional('worker_threads', {})

const threadFilePath = path.join(__dirname, 'thread.js')

let worker // Lazy
let taskIdCounter = 0
const tasks = new Map()

const createWorker = () => {
	worker = new Worker(threadFilePath)
	worker.on('message', message => {
		const task = tasks.get(message.id)
		tasks.delete(message.id)
		if (tasks.size === 0) {
			worker.unref()
		}

		task(message.value)
	})

	worker.on('error', error => {
		// Any error here is effectively an equivalent of segfault and have no scope, so we just throw it on callback level
		throw error
	})
}

const taskWorker = (value, transferList) =>
	new Promise(resolve => {
		const id = taskIdCounter++
		tasks.set(id, resolve)

		if (worker === undefined) {
			createWorker()
		}

		worker.ref()
		worker.postMessage({ id, value }, transferList)
	})

let create = algorithm => async (buffer, options) => {
	options = {
		outputFormat: 'hex',
		...options
	}

	const hash = crypto.createHash(algorithm)
	hash.update(buffer, typeof buffer === 'string' ? 'utf8' : undefined)

	if (options.outputFormat === 'hex') {
		return hash.digest('hex')
	}

	return hash.digest().buffer
}

const hmac = algorithm => async (key, buffer, options) => {
	options = {
		outputFormat: 'hex',
		...options
	}

	const hash = crypto.createHmac(algorithm, key)
	hash.update(buffer)

	if (options.outputFormat === 'hex') {
		return hash.digest('hex')
	}

	if (options.outputFormat === 'base64') {
		return hash.digest('base64')
	}

	return hash.digest().buffer
}

if (Worker !== undefined) {
	create = algorithm => async (source, options) => {
		options = {
			outputFormat: 'hex',
			...options
		}

		let buffer
		if (typeof source === 'string') {
			// Saving one copy operation by writing string to buffer right away and then transfering buffer
			buffer = new ArrayBuffer(Buffer.byteLength(source, 'utf8'))
			Buffer.from(buffer).write(source, 'utf8')
		} else {
			// Creating a copy of buffer at call time, will be transfered later
			buffer = source.buffer.slice(0)
		}

		const result = await taskWorker({ algorithm, buffer }, [buffer])
		if (options.outputFormat === 'hex') {
			return Buffer.from(result).toString('hex')
		}

		return result
	}

	// Hmac = algorithm => async (key, buffer, options) => {
	// 	options = {
	// 		outputFormat: 'hex',
	// 		...options
	// 	}

	// 	const hash = crypto.createHmac(algorithm, key)
	// 	hash.update(buffer, typeof buffer === 'string' ? 'utf8' : undefined)

	// 	if (options.outputFormat === 'hex') {
	// 		return hash.digest('hex')
	// 	}

	// 	return hash.digest().buffer
	// }
}

exports.sha1 = create('sha1')
exports.sha256 = create('sha256')
exports.sha384 = create('sha384')
exports.sha512 = create('sha512')
exports.hmac = {}
exports.hmac.sha1 = hmac('sha1')
exports.hmac.sha256 = hmac('sha256')
exports.hmac.sha384 = hmac('sha384')
exports.hmac.sha512 = hmac('sha512')
