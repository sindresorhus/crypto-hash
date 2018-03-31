# crypto-hash [![Build Status](https://travis-ci.org/sindresorhus/crypto-hash.svg?branch=master)](https://travis-ci.org/sindresorhus/crypto-hash)

> Tiny hashing module that uses the native crypto API in Node.js and the browser

Useful when you want the same hashing API in all environments. My cat calls it *isomorphic*.

In Node.js it uses [`require('crypto')`](https://nodejs.org/api/crypto.html#crypto_class_hash), while in the browser it uses [`window.crypto`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).

The browser version is only ~300 bytes minified & gzipped.


## Install

```
$ npm install crypto-hash
```

<a href="https://www.patreon.com/sindresorhus">
	<img src="https://c5.patreon.com/external/logo/become_a_patron_button@2x.png" width="160">
</a>


## Usage

```js
const {sha256} = require('crypto-hash');

(async () => {
	console.log(await sha256('🦄'));
	//=> '5df82936cbf0864be4b7ba801bee392457fde9e4'
})();
```


## API

### sha1(input, [options])
### sha256(input, [options])
### sha384(input, [options])
### sha512(input, [options])

Returns a `Promise<string>` with a hex-encoded hash.

*Note that even though it returns a promise, [in Node.js, the operation is synchronous 💩](https://github.com/nodejs/node/issues/678).*

[SHA-1 is insecure](https://stackoverflow.com/a/38045085/64949) and should not be used for anything sensitive.

#### input

Type: `string` [`ArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer) [`ArrayBufferView`](https://developer.mozilla.org/en-US/docs/Web/API/ArrayBufferView)

#### options

Type: `Object`

##### outputFormat

Type: `string`<br>
Values: `hex` `buffer`<br>
Default: `hex`

Setting this to `buffer` makes it return an `ArrayBuffer` instead of a `string`.


## Related

- [hasha](https://github.com/sindresorhus/hasha) - Hashing in Node.js made simple


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
