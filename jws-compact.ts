// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { validateSchema } from './schema';
import * as jwsPayload from './jws-payload';
import * as keys from './keys';
import pako from 'pako';
// import got from 'got';
import axios from "axios"
import { jose, JWK } from 'node-jose';
import { parseJson } from './utils';
import { verifyAndImportHealthCardIssuerKey } from "./shcKeyValidator"



// NOTE: the trusted issuer directory uses the format specified by VCI in https://github.com/the-commons-project/vci-directory/

export interface TrustedIssuer {
    iss: string,
    name: string
}

export interface TrustedIssuers {
    participating_issuers: TrustedIssuer[]
}

// Known issuers directories
export interface KnownIssuerDirectory {
    name: string,
    URL: string
}
export const KnownIssuerDirectories: KnownIssuerDirectory[] = [
    {
        name: 'VCI',
        URL: 'https://raw.githubusercontent.com/the-commons-project/vci-directory/main/vci-issuers.json'
    },
    {
        name: 'test',
        URL: 'https://raw.githubusercontent.com/smart-on-fhir/health-cards-validation-SDK/main/testdata/test-issuers.json'
    }
]

export class TrustedIssuerDirectory {
    static directoryURL: string;
    static directoryName: string;
    static issuers: TrustedIssuers | undefined;
}

const jwsCompactSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://smarthealth.cards/schema/jws-schema.json",
    "title": "JWS",
    "type": "string",
    "pattern": "^[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+$"
}

export function checkTrustedIssuerDirectory(iss: string): void {
    if (TrustedIssuerDirectory.issuers) {
        // extract the VCI issuer friendly name; we assume there are no duplicated URLs in the list
        const issName = TrustedIssuerDirectory.issuers?.participating_issuers.filter(issuer => issuer.iss === iss).map(issuer => issuer.name)[0];
        if (issName) {
            console.log(`Issuer found in ${TrustedIssuerDirectory.name} directory; name: ${issName}`);
        } else {
            console.log(`Issuer not part of the ${TrustedIssuerDirectory.directoryName} directory`);
        }
    } else {
        // trusted issuers directory not available
        console.log("Error validating against the trusted issuers directory: directory not set");
    }
}

export const JwsValidationOptions = {
    skipJwksDownload: false,
    jwksDownloadTimeOut: 5000
}

export const schema = jwsCompactSchema;

const MAX_JWS_SINGLE_CHUNK_LENGTH = 1195;

// Object or string?
export async function validate(jws: any, index = '') {

    // the jws string is not JSON.  It is base64url.base64url.base64url

    // output the index if there the VC includes more than one JWS
    console.log((index ? '[' + index + '] ' : '') + 'JWS-compact');

    if (jws.trim() !== jws) {
        console.log(`JWS has leading or trailing spaces`);
        jws = jws.trim();
    }

    if (jws.length > MAX_JWS_SINGLE_CHUNK_LENGTH) {
        console.log(`JWS is longer than ${MAX_JWS_SINGLE_CHUNK_LENGTH} characters, and will result in split QR codes`);
    }

    if (!/[0-9a-zA-Z_-]+\.[0-9a-zA-Z_-]+\.[0-9a-zA-Z_-]+/g.test(jws)) {
        return console.log('Failed to parse JWS-compact data as \'base64url.base64url.base64url\' string.');
    }

    // failures will be recorded in the log. we can continue processing.
    console.log("validate schema")
    validateSchema(jwsCompactSchema, jws);

    // split into header[0], payload[1], key[2]
    const parts = jws.split('.');
    const rawPayload = parts[1];

    // check header
    console.log("check header")
    let headerBytes;
    let errString;
    try {
        headerBytes = Buffer.from(parts[0], 'base64');
        console.log('JWS.header = ' + headerBytes.toString());
    } catch (err) {
        errString = err as string;
    } finally {
        if (!headerBytes) {
            console.log(["Error base64-decoding the JWS header.", errString].join('\n'));
        }
    }

    let headerJson;
    if (headerBytes) {
        headerJson = parseJson<{ kid: string, alg: string, zip: string }>(headerBytes.toString());

        if (headerJson == null) {
            console.log(["Can't parse JWS header as JSON.", errString].join(''));

        } else {
            const headerKeys = Object.keys(headerJson);
            if (!headerKeys.includes('alg')) {
                console.log("JWS header missing 'alg' property.");
            } else if (headerJson['alg'] !== 'ES256') {
                console.log(`Wrong value for JWS header property 'alg' property; expected: "ES256", actual: "${headerJson['alg']}".`);
            }
            if (!headerKeys.includes('zip')) {
                console.log("JWS header missing 'zip' property.");
            } else if (headerJson['zip'] !== 'DEF') {
                console.log(`Wrong value for JWS header property 'zip' property; expected: "DEF", actual: "${headerJson['zip']}".`);
            }
            if (!headerKeys.includes('kid')) {
                console.log("JWS header missing 'kid' property.");
            }

            // the value of the kid will be used in the crypto validation of the signature to select the issuer's public key
        }
        console.log(headerJson)
    }

    // check signature format
    let sigBytes;
    try {
        sigBytes = Buffer.from(parts[2], 'base64');
        console.log('JWS.signature = ' + sigBytes.toString('hex'));
    } catch (err) {
        console.log([
            "Error base64-decoding the JWS signature.",
            (err as string)].join('\n'));
    }

    if (sigBytes && sigBytes.length > 64 && sigBytes[0] === 0x30 && sigBytes[2] === 0x02) {

        console.log("Signature appears to be in DER encoded form. Signature is expected to be 64-byte r||s concatenated form.\n" +
            "See https://tools.ietf.org/html/rfc7515#appendix-A.3 for expected ES256 signature form.");

        // DER encoded signature will constructed as follows:
        // 0             |1                       |2            |3                 |4-35                       |36           |37                |38-69
        // 0x30          |0x44                    |0x02         |0x20              |<r-component of signature> |0x02         |0x20 or 0x21      |<s-component of signature>
        // Sequence-type |length-of-sequence-data |Integer-type |length-of-integer |integer-data               |Integer-type |length-of-integer |integer-data

        // sigBytes[3] contains length of r-integer; it may be 32 or 33 bytes.
        // DER encoding dictates an Integer is negative if the high-order bit of the first byte is set. 
        //   To represent an integer with a high-order bit as positive, a leading zero byte is required.
        //   This increases the Integer length to 33. 

        // For signature use, the sign is irrelevant and the leading zero, if present, is ignored.
        const rStart = 4 + (sigBytes[3] - 32);  // adjust for the potential leading zero
        const rBytes = sigBytes.slice(rStart, rStart + 32); // 32 bytes of the r-integer 
        const sStart = sigBytes.length - 32;
        const sBytes = sigBytes.slice(sStart); // 32 bytes of the s-integer

        // Make Base64url
        const newSig = Buffer.concat([rBytes, sBytes]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        parts[2] = newSig;

        console.log("jws-signature converted from DER form to r||s form: " + newSig);

        jws = parts.join('.');

    } else if (sigBytes && sigBytes.length !== 64) {
        console.log("Signature is " + sigBytes.length.toString() + "-bytes. Signature is expected to be 64-bytes");
    }
    console.log(sigBytes)


    // check payload
    let b64DecodedPayloadBuffer;
    let b64DecodedPayloadString;
    try {
        b64DecodedPayloadBuffer = Buffer.from(rawPayload, 'base64');
    } catch (err) {
        console.log([
            "Error base64-decoding the JWS payload.",
            (err as string)].join('\n'));
    }
    let inflatedPayload;
    if (b64DecodedPayloadBuffer) {
        try {
            inflatedPayload = pako.inflateRaw(b64DecodedPayloadBuffer, { to: 'string' });
            console.log('JWS payload inflated');
        } catch (err) {
            // try normal inflate
            try {
                inflatedPayload = pako.inflate(b64DecodedPayloadBuffer, { to: 'string' });
                console.log(
                    "Error inflating JWS payload. Compression should use raw DEFLATE (without wrapper header and adler32 crc)",
                );
            } catch (err) {
                console.log(
                    ["Error inflating JWS payload. Did you use raw DEFLATE compression?",
                        (err as string)].join('\n'),
                );
                // inflating failed, let's try to parse the base64-decoded string directly
                b64DecodedPayloadString = b64DecodedPayloadBuffer.toString('utf-8');
            }
        }
    }
    console.log(inflatedPayload)

    // try to validate the payload (even if inflation failed)
    const payloadLog = jwsPayload.validate(inflatedPayload || b64DecodedPayloadString || rawPayload);

    console.log(payloadLog);


    // try-parse the JSON even if it failed validation above
    const payload = parseJson<JWSPayload>(inflatedPayload || b64DecodedPayloadString || rawPayload);
    console.log(payload)

    // if we did not get a payload back, it failed to be parsed and we cannot extract the key url
    // so we can stop.
    // the jws-payload child will contain the parse errors.
    // The payload validation may have a Fatal error
    if (!payload) {
        console.log("payload error");
    }


    // Extract the key url
    if (payload.iss) {
        console.log("Issuer: " + payload.iss)
        if (typeof payload.iss === 'string') {

            if (payload.iss.slice(0, 8) !== 'https://') {
                console.log("Issuer URL SHALL use https");
            }

            if (payload.iss.slice(-1) === '/') {
                console.log("Issuer URL SHALL NOT include a trailing /");
            }

            // download the keys into the keystore. if it fails, continue an try to use whatever is in the keystore.
            if (!JwsValidationOptions.skipJwksDownload) {
                await downloadAndImportKey(payload.iss);
            } else {
                console.log("skipping issuer JWK set download");
            }

            // check if the iss URL is part of a trust framework
            if (TrustedIssuerDirectory.directoryURL) {
                checkTrustedIssuerDirectory(payload.iss);
            }
        } else {
            console.log(`JWS payload 'iss' should be a string, not a ${typeof payload.iss}`);
        }

    } else {
        // continue, since we might have the key we need in the global keystore
        console.log("Can't find 'iss' entry in JWS payload");
    }

    if (headerJson && await verifyJws(jws, headerJson['kid'])) {
        console.log("JWS signature verified");
    }

    return console.log(jws)
}


async function downloadAndImportKey(issuerURL: string): Promise<keys.KeySet | undefined> {

    const jwkURL = issuerURL + '/.well-known/jwks.json';
    console.log("Retrieving issuer key from " + jwkURL);
    const requestedOrigin = 'https://example.org'; // request bogus origin to test CORS response
    try {
        const response = await axios(jwkURL, { headers: { Origin: requestedOrigin }, timeout: JwsValidationOptions.jwksDownloadTimeOut });
        // we expect a CORS response header consistent with the requested origin (either allow all '*' or the specific origin)
        // TODO: can we easily add a unit test for this?
        const acaoHeader = response.headers['access-control-allow-origin'];
        if (!acaoHeader) {
            console.log("Issuer key endpoint does not contain a 'access-control-allow-origin' header for Cross-Origin Resource Sharing (CORS)");
        } else if (acaoHeader !== '*' && acaoHeader !== requestedOrigin) {
            console.log(`Issuer key endpoint's 'access-control-allow-origin' header ${acaoHeader} does not match the requested origin ${requestedOrigin}, for Cross-Origin Resource Sharing (CORS)`);
        }
        try {
            const keySet = parseJson<keys.KeySet>(response);
            if (!keySet) {
                throw "Failed to parse JSON KeySet schema";
            }
            console.log("Downloaded issuer key(s) : ");
            await verifyAndImportHealthCardIssuerKey(keySet, issuerURL);
            return keySet;
        } catch (err) {
            console.log("Can't parse downloaded issuer JWK set: " + (err as Error).toString());
            return undefined;
        }
    } catch (err) {
        console.log("Failed to download issuer JWK set: " + (err as Error).toString());
        return undefined;
    }
}

async function verifyJws(jws: string, kid: string): Promise<boolean> {

    const verifier: jose.JWS.Verifier = jose.JWS.createVerify(keys.store);

    if (kid && !keys.store.get(kid)) {
        console.log(`JWS verification failed: can't find key with 'kid' = ${kid} in issuer set`);
        return false;
    }
    try {
        await verifier.verify(jws);
        return true;
    } catch (error) {
        // The error message is always 'no key found', regardless if a key is missing or
        // if the signature was tempered with. Don't return the node-jose error message.
        console.log('JWS verification failed');
        return false;
    }

}

