import test from 'ava';
import hashjs from 'hash.js';
import cryptojs from 'crypto-js';
import is from '@sindresorhus/is';
import {sha1, sha256, sha384, sha512, hmac} from '.';

const fixture = 'foo bar baz';
const fixtureKey = 'secret fixture key';

test('sha1', async t => {
	t.is(await sha1('🦄'), '5df82936cbf0864be4b7ba801bee392457fde9e4');
	t.is(
		await sha1(fixture),
		hashjs
			.sha1()
			.update(fixture)
			.digest('hex')
	);
});

test('sha256', async t => {
	t.is(
		await sha256('🦄'),
		'36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc'
	);
	t.is(
		await sha256(fixture),
		hashjs
			.sha256()
			.update(fixture)
			.digest('hex')
	);
});

test('sha384', async t => {
	t.is(
		await sha384('🦄'),
		'a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca'
	);
	t.is(
		await sha384(fixture),
		hashjs
			.sha384()
			.update(fixture)
			.digest('hex')
	);
});

test('sha512', async t => {
	t.is(
		await sha512('🦄'),
		'7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905'
	);
	t.is(
		await sha512(fixture),
		hashjs
			.sha512()
			.update(fixture)
			.digest('hex')
	);
});

test('hmac - sha1', async t => {
	t.is(
		await hmac.sha1('secret key foo', '🦄'),
		'355ecf1f695dfc969b5d0db9dba08105f99943a0'
	);
	t.is(
		await hmac.sha1(fixtureKey, fixture),
		cryptojs.HmacSHA1(fixture, fixtureKey).toString(cryptojs.enc.Hex)
	);
});

test('hmac - sha256', async t => {
	t.is(
		await hmac.sha256('secret key foo', '🦄'),
		'09a764f7324829c8c54a82d84d2e33049e09ed3f28929a1d08835346be324471'
	);
	t.is(
		await hmac.sha256(fixtureKey, fixture),
		cryptojs.HmacSHA256(fixture, fixtureKey).toString(cryptojs.enc.Hex)
	);
});

test('hmac - sha384', async t => {
	t.is(
		await hmac.sha384('secret key foo', '🦄'),
		'36bc8cccea6c3ff35c9f761672c7c4227dafdece4e0401f530dfd12e4c4541e7506e84cd4bb745d7fb61be4c28ba1a38'
	);
	t.is(
		await hmac.sha384(fixtureKey, fixture),
		cryptojs.HmacSHA384(fixture, fixtureKey).toString(cryptojs.enc.Hex)
	);
});

test('hmac - sha512', async t => {
	t.is(
		await sha512('secret key foo', '🦄'),
		'15d88d583f896083c72cce95bd9c7ae7489693858b06e5a98935c654c80000529f1ac4a05347bdb9222535e24044b1f4a3d256bfccc9d45e28c54aa3ff81e185'
	);
	t.is(
		await hmac.sha512(fixtureKey, fixture),
		cryptojs.HmacSHA512(fixture, fixtureKey).toString(cryptojs.enc.Hex)
	);
});

test('buffer input', async t => {
	const fixture = new Uint16Array([1, 2, 3]);
	t.is(await sha1(fixture), '5b9ba303e3d8ef9e9d421085303cda49d64c79bf');
});

test('hmac - buffer input', async t => {
	const fixture = new Uint16Array([1, 2, 3]);
	t.is(
		await hmac.sha1(fixtureKey, fixture),
		'287d1c7842239843c170558dd3dfe0d7ca53bfb6'
	);
});

test('buffer output', async t => {
	const result = await sha1('🦄', {outputFormat: 'buffer'});
	t.is(is(result), 'ArrayBuffer');
});

test('hmac - buffer output', async t => {
	const result = await sha1('🦄', {outputFormat: 'buffer'});
	t.is(is(result), 'ArrayBuffer');
});

test('parallel execution', async t => {
	const promises = [];
	for (let i = 0; i < 10; i++) {
		promises.push(sha512('🦄'));
	}

	const results = await Promise.all(promises);
	t.is(results.length, promises.length);

	for (const result of results) {
		t.is(
			result,
			'7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905'
		);
	}
});
