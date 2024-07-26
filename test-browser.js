/* eslint-env jasmine */
import hashjs from 'hash.js';
import is from '@sindresorhus/is';
import {
	sha1,
	sha256,
	sha384,
	sha512,
} from './browser.js';

const fixture = 'foo bar baz';

it('sha1', async () => {
	expect(await sha1('🦄')).toEqual('5df82936cbf0864be4b7ba801bee392457fde9e4');
	expect(await sha1(fixture)).toEqual(hashjs.sha1().update(fixture).digest('hex'));
});

it('sha256', async () => {
	expect(await sha256('🦄')).toEqual('36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc');
	expect(await sha256(fixture)).toEqual(hashjs.sha256().update(fixture).digest('hex'));
});

it('sha384', async () => {
	expect(await sha384('🦄')).toEqual('a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca');
	expect(await sha384(fixture)).toEqual(hashjs.sha384().update(fixture).digest('hex'));
});

it('sha512', async () => {
	expect(await sha512('🦄')).toEqual('7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905');
	expect(await sha512(fixture)).toEqual(hashjs.sha512().update(fixture).digest('hex'));
});

it('buffer input', async () => {
	const fixture = new Uint16Array([1, 2, 3]);
	expect(await sha1(fixture)).toEqual('5b9ba303e3d8ef9e9d421085303cda49d64c79bf');
});

it('buffer output', async () => {
	const result = await sha1('🦄', {outputFormat: 'buffer'});
	expect(is(result)).toEqual('ArrayBuffer');
});
