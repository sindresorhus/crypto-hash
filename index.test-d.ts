import {expectType} from 'tsd';
import {sha1, sha256, sha384, sha512} from '.';

expectType<Promise<string>>(sha1('🦄'));
expectType<Promise<ArrayBuffer>>(sha1('🦄', {outputFormat: 'buffer'}));
expectType<Promise<string>>(sha1('🦄', {outputFormat: 'hex'}));
expectType<Promise<string>>(sha256('🦄'));
expectType<Promise<ArrayBuffer>>(sha256('🦄', {outputFormat: 'buffer'}));
expectType<Promise<string>>(sha256('🦄', {outputFormat: 'hex'}));
expectType<Promise<string>>(sha384('🦄'));
expectType<Promise<ArrayBuffer>>(sha384('🦄', {outputFormat: 'buffer'}));
expectType<Promise<string>>(sha384('🦄', {outputFormat: 'hex'}));
expectType<Promise<string>>(sha512('🦄'));
expectType<Promise<ArrayBuffer>>(sha512('🦄', {outputFormat: 'buffer'}));
expectType<Promise<string>>(sha512('🦄', {outputFormat: 'hex'}));
