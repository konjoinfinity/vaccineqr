// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as utils from './utils';
import { validateSchema, objPathToSchema } from './schema';
import fs from 'fs';
import fhirSchema from './fhir-schema.json';
import immunizationDM from './immunization-dm.json';
import patientDM from './patient-dm.json';
import beautify from 'json-beautify'
import { propPath, walkProperties } from './utils';

// Subset of the CDC covid vaccine codes (https://www.cdc.gov/vaccines/programs/iis/COVID-19-related-codes.html),
// currently pre-authorized in the US (https://www.cdc.gov/vaccines/covid-19/info-by-product/index.html)
export const cdcCovidCvxCodes = ["207", "208", "212"];

// LOINC covid test codes (https://vsac.nlm.nih.gov/valueset/2.16.840.1.113762.1.4.1114.9/expansion)
export const loincCovidTestCodes = ["50548-7", "68993-5", "82159-5", "94306-8", "94307-6", "94308-4", "94309-2", "94500-6", "94502-2", "94503-0", "94504-8", "94507-1", "94508-9", "94531-1", "94533-7", "94534-5", "94547-7", "94558-4", "94559-2", "94562-6", "94563-4", "94564-2", "94565-9", "94640-0", "94661-6", "94756-4", "94757-2", "94758-0", "94759-8", "94760-6", "94761-4", "94762-2", "94764-8", "94845-5", "95209-3", "95406-5", "95409-9", "95416-4", "95423-0", "95424-8", "95425-5", "95542-7", "95608-6", "95609-4"];

export enum ValidationProfiles {
    'any',
    'usa-covid19-immunization'
}

export class FhirOptions {
    static LogOutputPath = '';
    static ValidationProfile: ValidationProfiles = ValidationProfiles.any;
}

export function validate(fhirBundleText: string) {

    console.log('FhirBundle');
    const profile: ValidationProfiles = FhirOptions.ValidationProfile;

    if (fhirBundleText.trim() !== fhirBundleText) {
        console.log(`FHIR bundle has leading or trailing spaces`);
        fhirBundleText = fhirBundleText.trim();
    }

    const fhirBundle = utils.parseJson<FhirBundle>(fhirBundleText);
    if (fhirBundle === undefined) {
        return console.log("Failed to parse FhirBundle data as JSON.");
    }

    if (FhirOptions.LogOutputPath) {
        // fs.writeFileSync(FhirOptions.LogOutputPath, fhirBundleText); // should we instead print out the output of beautify
        console.log(FhirOptions.LogOutputPath, fhirBundleText)
    }

    // failures will be recorded in the log
    if (!validateSchema(fhirSchema, fhirBundle)) return "valid schema";


    // to continue validation, we must have a list of resources in .entry[]
    if (!fhirBundle.entry ||
        !(fhirBundle.entry instanceof Array) ||
        fhirBundle.entry.length === 0
    ) {
        // The schema check above will list the expected properties/type
        return console.log("FhirBundle.entry[] required to continue.");
    }

    //
    // Validate each resource of .entry[]
    //
    for (let i = 0; i < fhirBundle.entry.length; i++) {

        const entry = fhirBundle.entry[i];
        const resource = entry.resource;

        if (resource == null) {
            console.log(`Schema: entry[${i.toString()}].resource missing`);
            continue;
        }

        if (!resource.resourceType) {
            console.log(`Schema: entry[${i.toString()}].resource.resourceType missing`);
            continue;
        }

        if (!(fhirSchema.definitions as Record<string, unknown>)[resource.resourceType]) {
            console.log(`Schema: entry[${i.toString()}].resource.resourceType '${resource.resourceType}' unknown`);
            continue;
        }

        validateSchema({ $ref: 'https://smarthealth.cards/schema/fhir-schema.json#/definitions/' + resource.resourceType }, resource, ['', 'entry', i.toString(), resource.resourceType].join('/'));

        if (resource.id) {
            console.log("Bundle.entry[" + i.toString() + "].resource[" + resource.resourceType + "] should not include .id elements");
        }

        if (resource.meta) {
            // resource.meta.security allowed as special case, however, no other properties may be included on .meta
            if (!resource.meta.security || Object.keys(resource.meta).length > 1) {
                console.log("Bundle.entry[" + i.toString() + "].resource[" + resource.resourceType + "].meta should only include .security property with an array of identity assurance codes");
            }
        }

        if (resource.text) {
            console.log("Bundle.entry[" + i.toString() + "].resource[" + resource.resourceType + "] should not include .text elements");
        }

        // walks the property tree of this resource object
        // the callback receives the child property and it's path 
        // objPathToSchema() maps a schema property to a property path
        // currently, oneOf types will break this system
        walkProperties(entry.resource as unknown as Record<string, unknown>, [entry.resource.resourceType], (o: Record<string, unknown>, path: string[]) => {

            const propType = objPathToSchema(path.join('.'));

            if (propType === 'CodeableConcept' && o['text']) {
                console.log('fhirBundle.entry[' + i.toString() + ']' + ".resource." + path.join('.') + " (CodeableConcept) should not include .text elements");
            }

            if (propType === 'Coding' && o['display']) {
                console.log('fhirBundle.entry[' + i.toString() + ']' + ".resource." + path.join('.') + " (Coding) should not include .display elements");
            }

            if (propType === 'Reference' && o['reference'] && !/[^:]+:\d+/.test(o['reference'] as string)) {
                console.log('fhirBundle.entry[' + i.toString() + ']' + ".resource." + path.join('.') + " (Reference) should be short resource-scheme URIs (e.g., {“patient”: {“reference”: “resource:0”}})");
            }

            if (  // warn on empty string, empty object, empty array
                (o instanceof Array && o.length === 0) ||
                (typeof o === 'string' && o === '') ||
                (o instanceof Object && Object.keys(o).length === 0)
            ) {
                console.log('fhirBundle.entry[' + i.toString() + ']' + ".resource." + path.join('.') + " is empty. Empty elements are invalid.");
            }

        });

        // with Bundle.entry.fullUrl populated with short resource-scheme URIs (e.g., {"fullUrl": "resource:0})
        if ((typeof entry.fullUrl !== 'string') || !/resource:\d+/.test(entry.fullUrl)) {
            console.log('fhirBundle.entry.fullUrl should be short resource-scheme URIs (e.g., {“fullUrl”: “resource:0}"');
        }
    }

    if (profile === ValidationProfiles['usa-covid19-immunization']) {
        console.log(`applying profile : usa-covid19-immunization`);
        ValidationProfilesFunctions['usa-covid19-immunization'](fhirBundle.entry);
    }

    console.log("FHIR bundle validated");
    console.log("FHIR Bundle Contents:");
    console.log(beautify(fhirBundle, null as unknown as Array<string>, 3, 100));

    return fhirBundle;
}

const ValidationProfilesFunctions = {

    "any": function (entries: BundleEntry[]): boolean {
        return true || entries;
    },

    "usa-covid19-immunization": function (entries: BundleEntry[]): boolean {

        const profileName = 'usa-covid19-immunization';

        const patients = entries.filter(entry => entry.resource.resourceType === 'Patient');
        if (patients.length !== 1) {
            console.log(`Profile : ${profileName} : requires exactly 1 ${'Patient'} resource. Actual : ${patients.length.toString()}`);
        }

        const immunizations = entries.filter(entry => entry.resource.resourceType === 'Immunization');
        if (immunizations.length === 0) {
            console.log(`Profile : ${profileName} : requires 1 or more Immunization resources. Actual : ${immunizations.length.toString()}`);
        }

        const expectedResources = ["Patient", "Immunization"];
        entries.forEach((entry, index) => {

            if (!expectedResources.includes(entry.resource.resourceType)) {
                console.log(`Profile : ${profileName} : resourceType: ${entry.resource.resourceType} is not allowed.`);
                expectedResources.push(entry.resource.resourceType); // prevent duplicate errors
                return;
            }

            if (entry.resource.resourceType === "Immunization") {

                // verify that valid covid vaccine codes are used
                const code = (entry.resource?.vaccineCode as { coding: { code: string }[] })?.coding[0]?.code;
                if (code && !cdcCovidCvxCodes.includes(code)) {
                    console.log(`Profile : ${profileName} : Immunization.vaccineCode.code requires valid COVID-19 code (${cdcCovidCvxCodes.join(',')}).`);
                }

                // check for properties that are forbidden by the dm-profiles
                (immunizationDM as { path: string }[]).forEach(constraint => {
                    propPath(entry.resource, constraint.path) &&
                        console.log(`Profile : ${profileName} : entry[${index.toString()}].resource.${constraint.path} should not be present.`);
                });

            }

            if (entry.resource.resourceType === "Patient") {

                // check for properties that are forbidden by the dm-profiles
                (patientDM as { path: string }[]).forEach(constraint => {
                    propPath(entry.resource, constraint.path) &&
                        console.log(`Profile : ${profileName} : entry[${index.toString()}].resource.${constraint.path} should not be present.`);
                });

            }

        });

        return true;
    }
}

