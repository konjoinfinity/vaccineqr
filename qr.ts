// const MAX_QR_CHUNK_LENGTH = 1191;

// // export async function validate(qr: string[]) {

// //     const jwsString = shcChunksToJws(qr);
// //     console.log(jwsString)
// //     jwsString && await jws.validate(jwsString);
// //     console.log()
// //     return log;
// // }


// function shcChunksToJws(shc: string[]) {

//     const chunkCount = shc.length;
//     const jwsChunks = new Array<String>(chunkCount);

//     for (let shcChunk of shc) {

//         if (shcChunk.trim() !== shcChunk) {
//             console.log(`Numeric QR has leading or trailing spaces`);
//             shcChunk = shcChunk.trim();
//         }

//         const chunkResult = shcToJws(shcChunk, chunkCount);

//         if (!chunkResult) return undefined; // move on to next chunk

//         const chunkIndex = chunkResult.chunkIndex;
//         if (chunkResult.result.length > MAX_QR_CHUNK_LENGTH) {
//             console.log(`QR chunk ${chunkIndex} is larger than ${MAX_QR_CHUNK_LENGTH} bytes`);
//         }

//         if (jwsChunks[chunkIndex - 1]) {
//             // we have a chunk index collision
//             // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
//             console.log(`we have two chunks with index ${chunkIndex}`);
//             return undefined;
//         } else {
//             jwsChunks[chunkIndex - 1] = chunkResult.result;
//         }
//     }
//     // make sure we have all chunks we expect
//     for (let i = 0; i < chunkCount; i++) {
//         if (!jwsChunks[i]) {
//             // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
//             console.log(`missing QR chunk + ${i}`)
//             return undefined;
//         }
//     }

//     if (shc.length > 1) console.log('All shc parts decoded');

//     const jws = jwsChunks.join('');

//     if (chunkCount > 1 && jws.length <= MAX_QR_CHUNK_LENGTH) {
//         console.log(`JWS of size ${jws.length} (<= ${MAX_QR_CHUNK_LENGTH}) didn't need to be split in ${chunkCount} chunks`);
//     }

//     // check if chunk sizes are balanced
//     const expectedChunkSize = Math.floor(jws.length / chunkCount);
//     const balancedSizeBuffer = Math.ceil(expectedChunkSize * (0.5 / 100)); // give some leeway to what we call "balanced", 0.5% away from expected size
//     if (jwsChunks.map(jwsChunk => jwsChunk.length)
//         .reduce((unbalanced, length) => unbalanced || length < expectedChunkSize - balancedSizeBuffer || length > expectedChunkSize + balancedSizeBuffer, false)) {
//         let unbalanced = jwsChunks.map(jwsChunk => jwsChunk.length.toString()).join()
//         console.log(`QR chunk sizes are unbalanced:  + ${unbalanced}`);
//     }

//     console.log('JWS = ' + jws);
//     return jws;
// }


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
                console.log(`Missing QR code chunk: received ${chunkCount}, expected ${expectedChunkCount}`);
                return undefined;
            }
        }
    } else {
        if (isChunkedHeader) {
            console.log(`Single-chunk numeric QR code should have a header ${qrHeader}, not ${qrHeader}1/1/`);
            chunked = true; // interpret the code as chunked even though it shouldn't
        }
    }

    if (!new RegExp(chunked ? `^${qrHeader}${positiveIntRegExp}/${chunkCount}/.*$` : `^${qrHeader}.*$`, 'g').test(shc)) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const expectedHeader = chunked ? `${qrHeader}${positiveIntRegExp}/${positiveIntRegExp}/` : `${qrHeader}`;
        console.log(`Invalid numeric QR header: expected ${expectedHeader}`);
        return undefined;
    }

    // check numeric QR encoding
    if (!new RegExp(chunked ? `^${qrHeader}${positiveIntRegExp}/${chunkCount}/[0-9]+$` : `^${qrHeader}[0-9]+$`, 'g').test(shc)) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const expectedBody = chunked ? `${qrHeader}${positiveIntRegExp}/${positiveIntRegExp}/[0-9]+` : `${qrHeader}[0-9]+`;
        console.log(`Invalid numeric QR: expected ${expectedBody}`);
        return undefined;
    }

    // get the chunk index
    if (chunked) {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const found = shc.match(new RegExp(`^shc:/(?<chunkIndex>${positiveIntRegExp})`));
        chunkIndex = (found && found.groups && found.groups['chunkIndex']) ? parseInt(found.groups['chunkIndex']) : -1;
        if (chunkIndex < 1 || chunkIndex > chunkCount) {
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            console.log(`Invalid QR chunk index: - ${chunkIndex}`);
            return undefined;
        }
    }

    const bodyIndex = shc.lastIndexOf('/') + 1;
    const b64Offset = '-'.charCodeAt(0);
    const digitPairs = shc.substring(bodyIndex).match(/(\d\d?)/g);

    console.log(bodyIndex)
    console.log(b64Offset)
    console.log(digitPairs)

    if (digitPairs == null || digitPairs[digitPairs.length - 1].length == 1) {
        console.log("Invalid numeric QR code, can't parse digit pairs. Numeric values should have even length.\n" +
            "Make sure no leading 0 are deleted from the encoding.");
        return undefined;
    }

    // since source of numeric encoding is base64url-encoded data (A-Z, a-z, 0-9, -, _, =), the lowest
    // expected value is 0 (ascii(-) - 45) and the biggest one is 77 (ascii(z) - 45), check that each pair
    // is no larger than 77
    if (Math.max(...digitPairs.map(d => Number.parseInt(d))) > 77) {
        console.log("Invalid numeric QR code, one digit pair is bigger than the max value 77 (encoding of 'z')." +
            "Make sure you followed the encoding rules.");
        return undefined;
    }

    // breaks string array of digit pairs into array of numbers: 'shc:/123456...' = [12,34,56,...]
    const jws: string = digitPairs
        // for each number in array, add an offset and convert to a char in the base64 range
        .map((c: string) => String.fromCharCode(Number.parseInt(c) + b64Offset))
        // merge the array into a single base64 string
        .join('');

    console.log(shc.slice(0, shc.lastIndexOf('/')) + '/... decoded');
    console.log(shc.slice(0, shc.lastIndexOf('/')) + '/... = ' + jws);

    return { result: jws, chunkIndex: chunkIndex };
}

