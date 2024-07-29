export const bufferToHex = buffer => {
	const view = new DataView(buffer);

	let hexCodes = '';
	for (let index = 0; index < view.byteLength; index += 4) {
		hexCodes += view.getUint32(index).toString(16).padStart(8, '0');
	}

	return hexCodes;
};
