import {registerHooks} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// `index.js` only falls back to hashing in the same process when `Worker` is undefined, which a static import of node:worker_threads never is. Stubbing the module out is what makes that branch reachable, so the code that ships in it is covered rather than taken on trust. Registering here, before anything is imported, is what puts the stub in place. Nothing may be imported from node:worker_threads statically, or the real module would be loaded before the hook exists.
registerHooks({
	load(url, context, nextLoad) {
		if (url === 'node:worker_threads') {
			return {
				format: 'module',
				shortCircuit: true,
				source: 'export const Worker = undefined;\nexport const isMainThread = true;\nexport const parentPort = null;\n',
			};
		}

		return nextLoad(url, context);
	},
});

const {Worker} = await import('node:worker_threads');
const algorithms = await import('./index.js');
const {mismatchesWithNodeCrypto, rejectionMessages, expectedRejectionMessages} = await import('./fixtures.js');

test('the in-process path is the one under test', () => {
	assert.equal(Worker, undefined, 'node:worker_threads should have been stubbed out');
});

test('the in-process path matches node:crypto for every input', async () => {
	assert.deepEqual(await mismatchesWithNodeCrypto(algorithms), []);
});

test('the in-process path rejects unsupported input by name', async () => {
	assert.deepEqual(await rejectionMessages(algorithms.sha256), expectedRejectionMessages);
});

test('the in-process path accepts a null options object and rejects an unknown format', async () => {
	const expected = createHash('sha256').update('x').digest('hex');
	const results = await Promise.all([
		algorithms.sha256('x', null),
		algorithms.sha256('x', undefined),
		algorithms.sha256('x', {outputFormat: 'hex'}),
	]);

	assert.deepEqual(results, [expected, expected, expected]);
	await assert.rejects(algorithms.sha256('x', {outputFormat: 'base64'}), {
		name: 'TypeError',
		message: 'Expected outputFormat to be \'hex\' or \'buffer\', got "base64"',
	});
});
