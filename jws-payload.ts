// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as utils from './utils';
import { validateSchema } from './schema';
import jwsPayloadSchema from './smart-health-card-vc-schema.json';
import * as fhirBundle from './fhirBundle';
import beautify from 'json-beautify'
import { cdcCovidCvxCodes, loincCovidTestCodes } from './fhirBundle';

export const schema = jwsPayloadSchema;


export function validate(jwsPayloadText: string) {

    console.log('JWS.payload');

    const supportedTypes = {
        healthCard: 'https://smarthealth.cards#health-card',
        immunization: 'https://smarthealth.cards#immunization',
        laboratory: 'https://smarthealth.cards#laboratory',
        covid19: 'https://smarthealth.cards#covid19',
        vc: 'VerifiableCredential'
    };

    if (jwsPayloadText.trim() !== jwsPayloadText) {
        console.log(`JWS payload has leading or trailing spaces`);
        jwsPayloadText = jwsPayloadText.trim();
    }

    const jwsPayload = utils.parseJson(jwsPayloadText);
    if (!jwsPayload || typeof jwsPayload !== 'object') {
        return console.log("Failed to parse JWS.payload data as JSON.");
    }
    console.log("JWS Payload Contents:");
    console.log(beautify(jwsPayload, null as unknown as Array<string>, 3, 100));

    // failures will be recorded in the log. we can continue processing.
    validateSchema(jwsPayloadSchema, jwsPayload);

    // validate issuance date, if available - the schema check above will flag if missing/invalid
    if (utils.isNumeric(jwsPayload.nbf)) {
        const nbf = new Date();
        nbf.setTime(jwsPayload.nbf * 1000); // convert seconds to milliseconds
        const now = new Date();
        if (nbf > now) {
            if (jwsPayload.nbf > new Date(2021, 1, 1).getTime()) {
                // we will assume the nbf was encoded in milliseconds, and we will return an error
                const dateParsedInMilliseconds = new Date();
                dateParsedInMilliseconds.setTime(jwsPayload.nbf);
                console.log(`Health card is not yet valid, nbf=${jwsPayload.nbf} (${nbf.toUTCString()}).\n` +
                    "nbf should be encoded in seconds since 1970-01-01T00:00:00Z UTC.\n" +
                    `Did you encode the date in milliseconds, which would give the date: ${dateParsedInMilliseconds.toUTCString()}?`);
            } else {
                console.log(`Health card is not yet valid, nbf=${jwsPayload.nbf} (${nbf.toUTCString()}).`);
            }
        }
    }

    if (jwsPayload.vc && Object.keys(jwsPayload.vc).includes("@context")) {
        console.log("JWS.payload.vc shouldn't have a @context property");
    }

    if (!jwsPayload?.vc?.type?.includes(supportedTypes.healthCard)) {
        console.log(`JWS.payload.vc.type SHALL contain '${supportedTypes.healthCard}'`);
    }

    // to continue validation, we must have a FHIR bundle string to validate
    if (!jwsPayload?.vc?.credentialSubject?.fhirBundle) {
        // The schema check above will list the expected properties/type
        return console.log("JWS.payload.vc.credentialSubject.fhirBundle{} required to continue.");
    }

    console.log("JWS Payload validated");

    const fhirBundleJson = jwsPayload.vc.credentialSubject.fhirBundle;
    const fhirBundleText = JSON.stringify(fhirBundleJson);
    console.log(fhirBundle.validate(fhirBundleText));

    // does the FHIR bundle contain an immunization?
    const hasImmunization = fhirBundleJson?.entry?.some(entry => entry?.resource?.resourceType === 'Immunization');

    // does the FHIR bundle contain a covid immunization?
    const hasCovidImmunization = fhirBundleJson?.entry?.some(entry =>
        entry.resource.resourceType === 'Immunization' &&
        (cdcCovidCvxCodes.includes((entry?.resource?.vaccineCode as { coding: { code: string }[] })?.coding?.[0]?.code)));

    // does the FHIR bundle contain a covid lab observation?
    // TODO: support more general labs
    // http://build.fhir.org/ig/dvci/vaccine-credential-ig/branches/main/StructureDefinition-covid19-laboratory-result-observation.html
    const hasCovidObservation = fhirBundleJson?.entry?.some(entry =>
        entry.resource.resourceType === 'Observation' &&
        (loincCovidTestCodes.includes((entry?.resource?.code as { coding: { code: string }[] })?.coding?.[0]?.code)));

    // check for health card VC types (https://spec.smarthealth.cards/vocabulary/)
    const hasImmunizationType = jwsPayload?.vc?.type?.includes(supportedTypes.immunization);
    const hasLaboratoryType = jwsPayload?.vc?.type?.includes(supportedTypes.laboratory);
    const hasCovidType = jwsPayload?.vc?.type?.includes(supportedTypes.covid19);
    const hasVerifiableCredential = jwsPayload?.vc?.type?.includes(supportedTypes.vc);

    if (hasImmunization && !hasImmunizationType) {
        console.log(`JWS.payload.vc.type SHOULD contain '${supportedTypes.immunization}'`);
    } else if (!hasImmunization && hasImmunizationType) {
        console.log(`JWS.payload.vc.type SHOULD NOT contain '${supportedTypes.immunization}', no immunization resources found`);
    }

    if (hasCovidObservation && !hasLaboratoryType) {
        console.log(`JWS.payload.vc.type SHOULD contain '${supportedTypes.laboratory}'`);
    }

    if ((hasCovidImmunization || hasCovidObservation) && !hasCovidType) {
        console.log(`JWS.payload.vc.type SHOULD contain '${supportedTypes.covid19}'`);
    } else if (!(hasCovidImmunization || hasCovidObservation) && hasCovidType) {
        console.log(`JWS.payload.vc.type SHOULD NOT contain '${supportedTypes.covid19}', no covid immunization or observation found`);
    }

    if (hasVerifiableCredential) {
        console.log(`JWS.payload.vc.type : '${supportedTypes.vc}' is not required and may be omitted to conserve space`);

    }

    jwsPayload?.vc?.type && jwsPayload?.vc?.type.forEach(t => {
        if (!Object.values(supportedTypes).includes(t)) {
            console.log(`JWS.payload.vc.type : '${t}' is an unknown Verifiable Credential (VC) type (see: https://spec.smarthealth.cards/vocabulary/)`);
        }
    });

    return jwsPayloadText;
}
