export interface OptionsHexOutput {
	outputFormat?: 'hex';
}

export interface OptionBufferOutput {
	outputFormat: 'buffer';
}

/**
[SHA-1 is insecure](https://stackoverflow.com/a/38045085/64949) and should not be used for anything sensitive.

@returns The Hex-encoded hash.

@example
```
import {sha1} from 'crypto-hash';

console.log(await sha1('🦄'));
//=> '5df82936cbf0864be4b7ba801bee392457fde9e4'
```
*/
export function sha1(
	input: string | ArrayBuffer | ArrayBufferView,
	options?: OptionsHexOutput
): Promise<string>;
export function sha1(
	input: string | ArrayBuffer | ArrayBufferView,
	options: OptionBufferOutput
): Promise<ArrayBuffer>;

/**
@returns The Hex-encoded hash.

@example
```
import {sha256} from 'crypto-hash';

console.log(await sha256('🦄'));
//=> '36bf255468003165652fe978eaaa8898e191664028475f83f506dabd95298efc'
```
*/
export function sha256(
	input: string | ArrayBuffer | ArrayBufferView,
	options?: OptionsHexOutput
): Promise<string>;
export function sha256(
	input: string | ArrayBuffer | ArrayBufferView,
	options: OptionBufferOutput
): Promise<ArrayBuffer>;

/**
@returns The Hex-encoded hash.

@example
```
import {sha384} from 'crypto-hash';

console.log(await sha384('🦄'));
//=> 'a9d4dfb503394bd9701d60eb5fb1d7fb800580b43d874165103b16d311fb5c97545cb89f06c31f30e219f5b603e834ca'
```
*/
export function sha384(
	input: string | ArrayBuffer | ArrayBufferView,
	options?: OptionsHexOutput
): Promise<string>;
export function sha384(
	input: string | ArrayBuffer | ArrayBufferView,
	options: OptionBufferOutput
): Promise<ArrayBuffer>;

/**
@returns The Hex-encoded hash.

@example
```
import {sha512} from 'crypto-hash';

console.log(await sha512('🦄'));
//=> '7d9e515c59bd15d0692f9bc0c68f50f82b62a99bef4b8dc490cec165296210dff005529a4cb84a655eee6ddec82339e6bdbab21bdb287b71a543a56cfab53905'
```
*/
export function sha512(
	input: string | ArrayBuffer | ArrayBufferView,
	options?: OptionsHexOutput
): Promise<string>;
export function sha512(
	input: string | ArrayBuffer | ArrayBufferView,
	options: OptionBufferOutput
): Promise<ArrayBuffer>;
