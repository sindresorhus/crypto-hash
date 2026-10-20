export type OptionsHexOutput = {
	outputFormat?: 'hex';
};

export type OptionsBufferOutput = {
	outputFormat: 'buffer';
};

// `ArrayBufferLike` rather than naming `SharedArrayBuffer`, so that the declaration still compiles for a consumer whose `lib` predates shared memory. It resolves to `SharedArrayBuffer` as well wherever the consumer's `lib` does define it.
export type BufferLike = ArrayBufferLike | ArrayBufferView;

/**
Hashes the input using SHA-1.

SHA-1 is insecure and should not be used for anything sensitive.

@param input A string, `ArrayBuffer`, `SharedArrayBuffer`, or `ArrayBufferView`. The bytes are always copied, so the buffer you pass in is never detached, and a view hashes only the range it covers.
@returns Hex-encoded hash by default, or an ArrayBuffer if `{outputFormat: 'buffer'}` is given. The promise rejects with a `TypeError` if the input is none of those, if it has been detached, or if `outputFormat` is neither `'hex'` nor `'buffer'`.

@example
```
import {sha1} from 'crypto-hash';

console.log(await sha1('🦄'));
//=> '5df82936cbf0864be4b7ba801bee392457fde9e4'

const digest = await sha1('🦄', {outputFormat: 'buffer'});
//=> ArrayBuffer (20 bytes)
```
*/
export function sha1(input: string | BufferLike, options?: OptionsHexOutput): Promise<string>;
export function sha1(input: string | BufferLike, options: OptionsBufferOutput): Promise<ArrayBuffer>;

/**
Hashes the input using SHA-256.

@param input A string, `ArrayBuffer`, `SharedArrayBuffer`, or `ArrayBufferView`. The bytes are always copied, so the buffer you pass in is never detached, and a view hashes only the range it covers.
@returns Hex-encoded hash by default, or an ArrayBuffer if `{outputFormat: 'buffer'}` is given. The promise rejects with a `TypeError` if the input is none of those, if it has been detached, or if `outputFormat` is neither `'hex'` nor `'buffer'`.

@example
```
import {sha256} from 'crypto-hash';

console.log(await sha256('🦄'));
//=> '36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc'

const digest = await sha256('🦄', {outputFormat: 'buffer'});
//=> ArrayBuffer (32 bytes)
```
*/
export function sha256(input: string | BufferLike, options?: OptionsHexOutput): Promise<string>;
export function sha256(input: string | BufferLike, options: OptionsBufferOutput): Promise<ArrayBuffer>;

/**
Hashes the input using SHA-384.

@param input A string, `ArrayBuffer`, `SharedArrayBuffer`, or `ArrayBufferView`. The bytes are always copied, so the buffer you pass in is never detached, and a view hashes only the range it covers.
@returns Hex-encoded hash by default, or an ArrayBuffer if `{outputFormat: 'buffer'}` is given. The promise rejects with a `TypeError` if the input is none of those, if it has been detached, or if `outputFormat` is neither `'hex'` nor `'buffer'`.

@example
```
import {sha384} from 'crypto-hash';

console.log(await sha384('🦄'));
//=> 'a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca'

const digest = await sha384('🦄', {outputFormat: 'buffer'});
//=> ArrayBuffer (48 bytes)
```
*/
export function sha384(input: string | BufferLike, options?: OptionsHexOutput): Promise<string>;
export function sha384(input: string | BufferLike, options: OptionsBufferOutput): Promise<ArrayBuffer>;

/**
Hashes the input using SHA-512.

@param input A string, `ArrayBuffer`, `SharedArrayBuffer`, or `ArrayBufferView`. The bytes are always copied, so the buffer you pass in is never detached, and a view hashes only the range it covers.
@returns Hex-encoded hash by default, or an ArrayBuffer if `{outputFormat: 'buffer'}` is given. The promise rejects with a `TypeError` if the input is none of those, if it has been detached, or if `outputFormat` is neither `'hex'` nor `'buffer'`.

@example
```
import {sha512} from 'crypto-hash';

console.log(await sha512('🦄'));
//=> '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905'

const digest = await sha512('🦄', {outputFormat: 'buffer'});
//=> ArrayBuffer (64 bytes)
```
*/
export function sha512(input: string | BufferLike, options?: OptionsHexOutput): Promise<string>;
export function sha512(input: string | BufferLike, options: OptionsBufferOutput): Promise<ArrayBuffer>;
