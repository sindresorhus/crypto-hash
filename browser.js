import {createHasher} from './utilities.js';

const create = algorithm => createHasher(buffer => crypto.subtle.digest(algorithm, buffer));

export const sha1 = create('SHA-1');
export const sha256 = create('SHA-256');
export const sha384 = create('SHA-384');
export const sha512 = create('SHA-512');
