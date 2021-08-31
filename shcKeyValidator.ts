// // Copyright (c) Microsoft Corporation.
// // Licensed under the MIT license.

// import jose, { JWK } from 'node-jose';
// import { validateSchema } from './schema';
// import keySetSchema from './keyset-schema.json';
// import { KeySet, store } from './keys';
// // import execa from 'execa';
// import fs from 'expo-file-system';
// import path from 'path';
// import { v4 as uuidv4 } from 'uuid';
// import { isOpensslAvailable } from './utils'
// import { Certificate } from '@fidm/x509'

// // directory where to write cert files for openssl validation
// const tmpDir = 'tmp';
// // PEM and ASN.1 DER constants
// const PEM_CERT_HEADER = '-----BEGIN CERTIFICATE-----';
// const PEM_CERT_FOOTER = '-----END CERTIFICATE-----';
// const PEM_CERT_FILE_EXT = '.pem';
// const EC_P256_ASN1_PUBLIC_KEY_HEADER_HEX = "3059301306072a8648ce3d020106082a8648ce3d030107034200";
// const EC_COMPRESSED_KEY_HEX = "04";

// // PEM format for P-256 (prime256v1) public key (as used by issuer keys in SMART Health Cards)
// // -----BEGIN PUBLIC KEY-----
// // <-- multi-line base64 encoding of ASN.1:
// //   [0..25]: header for P-256 curve (26 bytes)
// //   [26]: 0x04 (uncompressed public key)
// //   [27..58]: x (32 bytes)
// //   [59..90]: y (32 bytes)
// // -->
// // -----END PUBLIC KEY-----

// // PEM to DER encoding
// // Drop the first and last lines (BEGIN/END markers), concatenate the others, base64-decode
// const PEMtoDER = (pem: string[]) => Buffer.from(pem.slice(1, -2).join(), "base64");

// interface CertFields {
//     x: string;
//     y: string;
//     notBefore: Date | undefined;
//     notAfter: Date | undefined;
//     subjectAltName: string;
// }

// interface EcPublicJWK extends JWK.Key {
//     x: string,
//     y: string,
//     x5c?: string[]
// }

// // validate a JWK certificate chain (x5c value)
// function validateX5c(x5c: string[]): CertFields | undefined {
//     // we use OpenSSL to validate the certificate chain, first check if present
//     if (!isOpensslAvailable()) {
//         console.log('OpenSSL not available to validate the X.509 certificate chain; skipping validation');
//         return;
//     }
//     if (!fs.getInfoAsync(tmpDir)) {
//         fs.makeDirectoryAsync(tmpDir);
//     }
//     // extract each cert in the x5c array, save to PEM-encoded temp file (already base64, so just need to wrap with file header/footer)
//     const tmpFileName = uuidv4();
//     let rootCaArg = '';
//     let caArg = '';
//     let issuerCert = '';
//     const certFiles = x5c.map((cert, index, certs) => {
//         const certFileName = path.join(tmpDir, tmpFileName + '-' + index.toString() + PEM_CERT_FILE_EXT);
//         if (index === 0) {
//             // first cert in the x5c array is the leaf, issuer cert
//             issuerCert = ' ' + certFileName;
//         } else if (index + 1 === certs.length) {
//             // last cert in the x5c array is the root CA cert
//             rootCaArg = '-CAfile ' + certFileName;
//         } else {
//             // all other certs in the x5c array are intermediate certs
//             caArg += ' -untrusted ' + certFileName;
//         }

//         // break the base64 string into lines of 64 characters (PEM format)
//         const certLines = cert.match(/(.{1,64})/g);
//         if (!certLines || certLines.length == 0) {
//             throw 'x5c[' + index.toString() + '] in issuer JWK set is not properly formatted';
//         }
//         // add the PEM header/footer
//         certLines.unshift(PEM_CERT_HEADER);
//         certLines.push(PEM_CERT_FOOTER);
//         // write the PEM cert to file for openssl validation
//         fs.writeAsStringAsync(certFileName, certLines.join('\n'));
//         return certFileName;
//     })
//     try {
//         //
//         // validate the chain with OpenSSL (should work with v1.0.2, v1.1.1, and libressl v3.x)
//         //
//         const opensslVerifyCommand = "openssl verify " + rootCaArg + caArg + issuerCert;
//         console.log('Calling openssl for x5c validation: ' + opensslVerifyCommand);
//         // const result = execa.commandSync(opensslVerifyCommand);

//         // if (result.exitCode != 0) {
//         //     console.log(result.stderr);
//         //     throw 'OpenSSL returned an error: exit code ' + result.exitCode.toString();
//         // }

//         //
//         // extract issuer cert fields
//         //
//         const logX5CError = (field: string) => console.log(`Can't parse ${field} in the issuer's cert (in x5c JWK value)`);
//         const cert = Certificate.fromPEM(Buffer.from(PEM_CERT_HEADER + '\n' + x5c[0] + '\n' + PEM_CERT_FOOTER));
//         const sanExt = cert.getExtension('subjectAltName') as Record<string, Record<string, string>[]>;
//         let subjectAltName = '';
//         // TODO (what if there are more than one SAN? return all of them, make sure the issuer URL is one of them?)
//         if (!sanExt || !sanExt['altNames'] || !sanExt['altNames'][0]) {
//             logX5CError('subject alternative name');
//         } else {
//             const subjectAltNameExt = sanExt['altNames'][0];
//             if (!subjectAltNameExt['uri'] || !subjectAltNameExt['tag']) {
//                 logX5CError('subject alternative name');
//             } else {
//                 if (subjectAltNameExt['tag'] != '6') { // URI
//                     const getTagName = (tag: string) => {
//                         // per RFC 5280
//                         switch (tag) {
//                             case '0': return 'otherName';
//                             case '1': return 'rfc822Name';
//                             case '2': return 'dNSName';
//                             case '3': return 'x400Address';
//                             case '4': return 'directoryName';
//                             case '5': return 'ediPartyName';
//                             case '6': return 'uniformResourceIdentifier';
//                             case '7': return 'iPAddress';
//                             case '8': return 'registeredID';
//                             default: return 'unknown';
//                         }
//                     }
//                     console.log(`Invalid subject alternative name prefix. Expected: 6 (URI). Actual: ${subjectAltNameExt['tag']} (${getTagName(subjectAltNameExt['tag'])})`);
//                 }
//                 subjectAltName = subjectAltNameExt['uri'];
//             }
//         }
//         if (!cert.publicKeyRaw) logX5CError('public key');
//         if (!cert.validFrom) logX5CError('validFrom');
//         if (!cert.validTo) logX5CError('validTo');

//         return {
//             x: cert.publicKeyRaw ? jose.util.base64url.encode(cert.publicKeyRaw.slice(27, 59)) : '',
//             y: cert.publicKeyRaw ? jose.util.base64url.encode(cert.publicKeyRaw.slice(59, 91)) : '',
//             notBefore: cert.validFrom ? cert.validFrom : undefined,
//             notAfter: cert.validTo ? cert.validTo : undefined,
//             subjectAltName: subjectAltName
//         }
//     } catch (err) {
//         console.log('Error validating x5c certificates: ' + (err as Error).toString());
//     } finally {
//         certFiles.map((file) => {
//             fs.deleteAsync(file);
//         })
//     }
// }

// export async function verifyAndImportHealthCardIssuerKey(keySet: KeySet, expectedSubjectAltName = '') {

//     // check that keySet is valid
//     if (!(keySet instanceof Object) || !keySet.keys || !(keySet.keys instanceof Array)) {
//         return console.log("keySet not valid. Expect {keys : JWK.Key[]}");
//     }

//     // failures will be recorded in the log. we can continue processing.
//     validateSchema(keySetSchema, keySet);

//     for (let i = 0; i < keySet.keys.length; i++) {

//         let key: JWK.Key = keySet.keys[i];

//         const keyName = 'key[' + (key.kid || i.toString()) + ']';

//         console.log('Validating key : ' + keyName);
//         console.log("Key " + i.toString() + ":");
//         console.log(JSON.stringify(key, null, 3));

//         // check for private key material (as to happen before the following store.add, because the returned
//         // value will be the corresponding public key)
//         // Note: this is RSA/ECDSA specific, but ok since ECDSA is mandated
//         if ((key as (JWK.Key & { d: string })).d) {
//             console.log(keyName + ': ' + "key contains private key material.");
//         }

//         // check cert chain if present, if so, validate it
//         const ecPubKey = key as EcPublicJWK;
//         if (ecPubKey.x5c) {
//             const certFields = validateX5c(ecPubKey.x5c);
//             if (certFields) {
//                 const checkKeyValue = (v: 'x' | 'y') => {
//                     if (ecPubKey[v]) {
//                         if (certFields[v] !== ecPubKey[v]) {
//                             console.log(`JWK public key value ${v} doesn't match the certificate's public key`);
//                         }
//                     } else {
//                         console.log(`JWK missing elliptic curve public key value ${v}`);
//                     }
//                 }
//                 checkKeyValue('x');
//                 checkKeyValue('y');

//                 if (expectedSubjectAltName && certFields.subjectAltName && certFields.subjectAltName !== expectedSubjectAltName) {
//                     console.log("Subject Alternative Name extension in the issuer's cert (in x5c JWK value) doesn't match issuer URL.\n" +
//                         `Expected: ${expectedSubjectAltName}. Actual: ${certFields.subjectAltName.substring(4)}`);
//                 }
//                 const now = new Date();
//                 if (certFields.notBefore && now < certFields.notBefore) {
//                     console.log('issuer certificate (in x5c JWK value) is not yet valid');
//                 }
//                 if (certFields.notAfter && now > certFields.notAfter) {
//                     console.log('issuer certificate (in x5c JWK value) is expired');
//                 }
//             }
//         }

//         try {
//             key = await store.add(key);
//         } catch (error) {
//             return console.log('Error adding key to keyStore : ' + (error as Error).message);
//         }

//         // check that kid is properly generated
//         if (!key.kid) {
//             console.log(keyName + ': ' + "'kid' missing in issuer key");
//         } else {

//             await key.thumbprint('SHA-256')
//                 .then(tpDigest => {
//                     const thumbprint = jose.util.base64url.encode(tpDigest);
//                     if (key.kid !== thumbprint) {
//                         console.log(keyName + ': ' + "'kid' does not match thumbprint in issuer key. expected: "
//                             + thumbprint + ", actual: " + key.kid);
//                     }
//                 })
//                 .catch(err => {
//                     console.log(keyName + ': ' + "Failed to calculate issuer key thumbprint : " + (err as Error).message);
//                 });
//         }

//         // check that key type is 'EC'
//         if (!key.kty) {
//             console.log(keyName + ': ' + "'kty' missing in issuer key");
//         } else if (key.kty !== 'EC') {
//             console.log(keyName + ': ' + "wrong key type in issuer key. expected: 'EC', actual: " + key.kty);
//         }

//         // check that EC curve is 'ES256'
//         if (!key.alg) {
//             console.log(keyName + ': ' + "'alg' missing in issuer key");
//         } else if (key.alg !== 'ES256') {
//             console.log(keyName + ': ' + "wrong algorithm in issuer key. expected: 'ES256', actual: " + key.alg);
//         }

//         // check that usage is 'sig'
//         if (!key.use) {
//             console.log(keyName + ': ' + "'use' missing in issuer key");
//         } else if (key.use !== 'sig') {
//             console.log(keyName + ': ' + "wrong usage in issuer key. expected: 'sig', actual: " + key.use);
//         }

//     }

//     return keySet;
// }