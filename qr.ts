export default function shcToJws(shc: string, chunkCount = 1): { result: String, chunkIndex: number } | undefined {

    let chunked = chunkCount > 1;
    const qrHeader = 'shc:/';
    const positiveIntRegExp = '[1-9][0-9]*';
    let chunkIndex = 1;

    // check numeric QR header
    const isChunkedHeader = new RegExp(`^${qrHeader}${positiveIntRegExp}/${chunkCount}/.*$`).test(shc);
    if (chunked) {
        if (!isChunkedHeader) {
            // should have been a valid chunked header, check if we are missing one
            const hasBadChunkCount = new RegExp(`^${qrHeader}${positiveIntRegExp}/[1-9][0-9]*/.*$`).test(shc);
            const found = shc.match(new RegExp(`^${qrHeader}${positiveIntRegExp}/(?<expectedChunkCount2>[1-9][0-9]*)/.*$`)); // FIXME!!!!!
            if (found) console.log(found);
            if (hasBadChunkCount) {
                const expectedChunkCount = parseInt(shc.substring(7, 8));
                alert(`Missing QR code chunk: received ${chunkCount}, expected ${expectedChunkCount}`);
                return undefined;
            }
        }
    } else {
        if (isChunkedHeader) {
            alert(`Single-chunk numeric QR code should have a header ${qrHeader}, not ${qrHeader}1/1/`);
            chunked = true; // interpret the code as chunked even though it shouldn't
        }
    }

    if (!new RegExp(chunked ? `^${qrHeader}${positiveIntRegExp}/${chunkCount}/.*$` : `^${qrHeader}.*$`, 'g').test(shc)) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const expectedHeader = chunked ? `${qrHeader}${positiveIntRegExp}/${positiveIntRegExp}/` : `${qrHeader}`;
        alert(`Invalid numeric QR header: expected ${expectedHeader}`);
        return undefined;
    }

    // check numeric QR encoding
    if (!new RegExp(chunked ? `^${qrHeader}${positiveIntRegExp}/${chunkCount}/[0-9]+$` : `^${qrHeader}[0-9]+$`, 'g').test(shc)) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const expectedBody = chunked ? `${qrHeader}${positiveIntRegExp}/${positiveIntRegExp}/[0-9]+` : `${qrHeader}[0-9]+`;
        alert(`Invalid numeric QR: expected ${expectedBody}`);
        return undefined;
    }

    // get the chunk index
    if (chunked) {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const found = shc.match(new RegExp(`^shc:/(?<chunkIndex>${positiveIntRegExp})`));
        chunkIndex = (found && found.groups && found.groups['chunkIndex']) ? parseInt(found.groups['chunkIndex']) : -1;
        if (chunkIndex < 1 || chunkIndex > chunkCount) {
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            alert(`Invalid QR chunk index: - ${chunkIndex}`);
            return undefined;
        }
    }

    const bodyIndex = shc.lastIndexOf('/') + 1;
    const b64Offset = '-'.charCodeAt(0);
    const digitPairs = shc.substring(bodyIndex).match(/(\d\d?)/g);

    if (digitPairs == null || digitPairs[digitPairs.length - 1].length == 1) {
        alert("Invalid numeric QR code, can't parse digit pairs. Numeric values should have even length.\n" +
            "Make sure no leading 0 are deleted from the encoding.");
        return undefined;
    }

    // since source of numeric encoding is base64url-encoded data (A-Z, a-z, 0-9, -, _, =), the lowest
    // expected value is 0 (ascii(-) - 45) and the biggest one is 77 (ascii(z) - 45), check that each pair
    // is no larger than 77
    if (Math.max(...digitPairs.map(d => Number.parseInt(d))) > 77) {
        alert("Invalid numeric QR code, one digit pair is bigger than the max value 77 (encoding of 'z')." +
            "Make sure you followed the encoding rules.");
        return undefined;
    }

    // breaks string array of digit pairs into array of numbers: 'shc:/123456...' = [12,34,56,...]
    const jws: string = digitPairs
        // for each number in array, add an offset and convert to a char in the base64 range
        .map((c: string) => String.fromCharCode(Number.parseInt(c) + b64Offset))
        // merge the array into a single base64 string
        .join('');

    alert(shc.slice(0, shc.lastIndexOf('/')) + '/... decoded');
    alert(shc.slice(0, shc.lastIndexOf('/')) + '/... = ' + jws);

    return { result: jws, chunkIndex: chunkIndex };
}
