import {Worker} from 'node:worker_threads';

// Owns the single hash worker and the tasks that are in flight to it.
//
// The worker is `unref`ed again once the last task settles, so a process that only hashes still exits on its own. A task that is never removed would keep the map non-empty forever and with it keep the worker `ref`ed, so every task must be removed exactly once, whatever the outcome.
export const createWorkerPool = filePath => {
	let worker; // Lazy
	let taskIdCounter = 0;
	const tasks = new Map();

	const settleTask = (owner, id, settle) => {
		const task = tasks.get(id);
		if (!task) {
			return;
		}

		tasks.delete(id);
		if (tasks.size === 0) {
			owner.unref();
		}

		settle(task);
	};

	// Every handler closes over the worker it belongs to, so a worker that dies late can only touch its own tasks and cannot clobber the `worker` slot of the replacement that took over meanwhile.
	const retire = (owner, error) => {
		for (const [id, task] of tasks) {
			if (task.worker === owner) {
				settleTask(owner, id, ({reject}) => {
					reject(error);
				});
			}
		}

		if (worker === owner) {
			worker = undefined;
		}
	};

	const createWorker = () => {
		const newWorker = new Worker(filePath, {
			type: 'module',
			// Prevent inheriting `NODE_OPTIONS` and other env vars that could cause issues (e.g., instrumentation trying to bind to the same port).
			env: {},
		});

		worker = newWorker;

		newWorker.on('message', message => {
			settleTask(newWorker, message.id, ({resolve}) => {
				resolve(message.value);
			});
		});

		newWorker.on('error', error => {
			retire(newWorker, error);
		});

		newWorker.on('exit', code => {
			retire(newWorker, new Error(`Hash worker exited early (code ${code})`));
		});

		return newWorker;
	};

	return {
		run(value, transferList) {
			return new Promise((resolve, reject) => {
				const id = taskIdCounter++;
				const owner = worker ?? createWorker();

				tasks.set(id, {resolve, reject, worker: owner});
				owner.ref();

				try {
					// Transfer the fresh buffer for performance - it's safe since we created a copy
					owner.postMessage({id, value}, transferList);
				} catch (error) {
					// `postMessage` throws synchronously for values that cannot be cloned or transferred. Settle the task here, otherwise it is never resolved and the worker stays `ref`ed forever.
					settleTask(owner, id, task => {
						task.reject(error);
					});
				}
			});
		},
	};
};
