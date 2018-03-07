import test from 'ava';
import hashjs from 'hash.js';
import is from '@sindresorhus/is';
import {sha1, sha256, sha384, sha512} from '.';

const fixture = 'foo bar baz';

test('sha1', async t => {
	t.is(await sha1('🦄'), '5df82936cbf0864be4b7ba801bee392457fde9e4');
	t.is(await sha1(fixture), hashjs.sha1().update(fixture).digest('hex'));
});

test('sha256', async t => {
	t.is(await sha256('🦄'), '36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc');
	t.is(await sha256(fixture), hashjs.sha256().update(fixture).digest('hex'));
});

test('sha384', async t => {
	t.is(await sha384('🦄'), 'a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca');
	t.is(await sha384(fixture), hashjs.sha384().update(fixture).digest('hex'));
});

test('sha512', async t => {
	t.is(await sha512('🦄'), '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905');
	t.is(await sha512(fixture), hashjs.sha512().update(fixture).digest('hex'));
});

test('buffer input', async t => {
	const fixture = new Uint16Array([1, 2, 3]);
	t.is(await sha1(fixture), '5b9ba303e3d8ef9e9d421085303cda49d64c79bf');
});

test('buffer output', async t => {
	const result = await sha1('🦄', {outputFormat: 'buffer'});
	t.is(is(result), 'ArrayBuffer');
});
