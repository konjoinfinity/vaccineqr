// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { JWK } from "node-jose";
import issuerKeys from './issuerkeys.json';

export type KeySet = {
    keys: JWK.Key[]
}

export let store = JWK.createKeyStore();

export async function initKeyStoreFromFile(): Promise<JWK.KeyStore> {

    // Issuer keys - Download and store locally
    const keySet = issuerKeys

    store = await JWK.asKeyStore(keySet);

    return store;
}