/**
 * Alexa Skill (lambda handler) for the Globo Lighting Fabiola 0306.
 *
 * @author Max Stark
 */

const axios = require('axios');
const alexaModel = require('./alexa-model');


/**
 * Trigger for the lambda function.
 */
exports.handler = async (event, context) => {
    try {
        console.info(`Directive: ${JSON.stringify(event)}`);
        const response = await handleDirective(event.directive);
        console.info(`Response: ${JSON.stringify(response)}`);

        context.succeed(response);
    } catch (error) {
        context.fail(error);
    }
}

async function handleDirective(directive) {
    if (directive.header.name == 'Discover') {
        return handleDiscoverDirective(directive);

    } else {
        const endpointId = directive.endpoint.endpointId;

        if (endpointId == 'light-v3') {
            return await handleDirectiveForGloboLight(directive);

        } else if (endpointId == 'fan-v3') {
            return await handleDirectiveForGloboFan(directive);

        } else {
            return buildErrorResponse(directive, 'NO_SUCH_ENDPOINT', `Unknown endpoint '${endpointId}'.`);
        }
    }
}

function handleDiscoverDirective(directive) {
    const lightCapabilities = [];
    lightCapabilities.push(alexaModel.buildCapability('Alexa'));
    lightCapabilities.push(alexaModel.buildCapability('Alexa.EndpointHealth', 'connectivity'));
    lightCapabilities.push(alexaModel.buildCapability('Alexa.PowerController', 'powerState'));
    lightCapabilities.push(alexaModel.buildCapability('Alexa.BrightnessController', 'brightness'));
    const lightEndpoint = alexaModel.buildEndpoint('light-v3', 'Deckenlicht', [ 'LIGHT' ], lightCapabilities);

    const fanCapabilities = [];
    fanCapabilities.push(alexaModel.buildCapability('Alexa'));
    fanCapabilities.push(alexaModel.buildCapability('Alexa.EndpointHealth', 'connectivity'));
    fanCapabilities.push(alexaModel.buildCapability('Alexa.PowerController', 'powerState'));
    fanCapabilities.push(alexaModel.buildCapability('Alexa.PowerLevelController', 'powerLevel'));
    const fanEndpoint = alexaModel.buildEndpoint('fan-v3', 'Ventilator', [ 'SWITCH', 'FAN' ], fanCapabilities);

    return alexaModel.buildDiscoverResponse(directive, [ lightEndpoint, fanEndpoint ]);
}

async function handleDirectiveForGloboLight(directive) {
    const directiveName = directive.header.name;

    if (directiveName == 'ReportState') {
        return await requestGloboStatusWithAxios(directive, createStateReport);

    } else if (directiveName == 'TurnOn') {
        return await executeGloboCommandWithAxios(directive, 'ON', null, createTurnOnResponse);

    } else if (directiveName == 'TurnOff') {
        return await executeGloboCommandWithAxios(directive, 'OFF', null, createTurnOffResponse);

    } else if (directiveName == 'SetBrightness') {
        const brightness = directive.payload.brightness;

        if (brightness < 0 || brightness > 100) {
            return alexaModel.buildErrorResponse(
                directive, 'VALUE_OUT_OF_RANGE', `Value '${brightness}' (brightness) is out of range for globo light.`);
        } else {
            return await executeGloboCommandWithAxios(directive, 'DIMM', brightness, createSetBrightnessResponse);
        }

    } else {
        return alexaModel.buildErrorResponse(
            directive, 'INVALID_DIRECTIVE', `Directive '${directiveName}' is invalid for globo light.`);
    }
}

async function handleDirectiveForGloboFan(directive) {
    const directiveName = directive.header.name;

    if (directiveName == 'ReportState') {
        return await requestGloboStatusWithAxios(directive, createStateReport);

    } else if (directiveName == 'TurnOn') {
        return await executeGloboCommandWithAxios(directive, 'LOW', null, createTurnOnResponse);

    } else if (directiveName == 'TurnOff') {
        return await executeGloboCommandWithAxios(directive, 'OFF', null, createTurnOffResponse);

    } else if (directiveName == 'SetPowerLevel') {
        const powerLevel = directive.payload.powerLevel;

        if (powerLevel < 0 || powerLevel > 100) {
            return alexaModel.buildErrorResponse(
                directive, 'VALUE_OUT_OF_RANGE', `Value '${powerLevel}' (powerLevel) is out of range for globo fan.`);

        } else if (powerLevel == 0) {
            return await executeGloboCommandWithAxios(directive, 'OFF', null, createSetPowerLevelResponse);

        } else if (powerLevel <= 33) {
            return await executeGloboCommandWithAxios(directive, 'LOW', null, createSetPowerLevelResponse);

        } else if (powerLevel <= 66) {
            return await executeGloboCommandWithAxios(directive, 'MED', null, createSetPowerLevelResponse);

        } else {
            return await executeGloboCommandWithAxios(directive, 'HIGH', null, createSetPowerLevelResponse);
        }

    } else {
        return alexaModel.buildErrorResponse(
            directive, 'INVALID_DIRECTIVE', `Directive '${directiveName}' is invalid for globo fan.`);
    }
}


// ================================
// for test: axios.defaults.adapter = require('axios/lib/adapters/http');

async function requestGloboStatusWithAxios(directive, success) {
    const globoId = mapToGloboId(directive.endpoint.endpointId);

    const request = {
        method: 'GET',
        url: `/${globoId}`
    };

    return await requestWithAxios(request, directive, success);
}

async function executeGloboCommandWithAxios(directive, command, value, success) {
    const globoId = mapToGloboId(directive.endpoint.endpointId);

    const request = {
        method: 'PUT',
        url: value? `/${globoId}/${command}/${value}` : `/${globoId}/${command}`
    };

    return await requestWithAxios(request, directive, success);
}




const connectTimeout = 3000;
const requestTimeout = 7000;

const httpClient = axios.create({
    baseURL: process.env.BASE_URL,
    headers: { 'Authorization': process.env.BASIC_AUTH },
    timeout: requestTimeout
});

// function requestWithTimeout(requestConfig) {
//     const request = httpClient(requestConfig);
//     const timeout = new Promise((_, reject) => setTimeout(() => {
//         console.log('timeout!!!');
//         reject(new Error('race timeout')) }
//     , connectTimeout));

//     return Promise.race([ request, timeout ]);
// }

async function requestWithTimeout(requestConfig) {
    const source = axios.CancelToken.source();
    requestConfig.cancelToken = source.token;
    let response = null;

    setTimeout(() => response ? console.log('no timeout') : source.cancel('cancel timeout'), connectTimeout);

    response = await httpClient(requestConfig);

    return response.data;
}

async function requestWithAxios(request, directive, success) {
    try {
        const response = await requestWithTimeout(request)
        return success(directive, response);

    } catch (error) {
        if (error.response) {
            const errMessage = `The globo-fan-remote responded with status ${error.response.status}.`;

            if (error.response.status == 400) {
                return alexaModel.buildErrorResponse(directive, 'INVALID_VALUE', errMessage);

            } else if (error.response.status == 401) {
                return alexaModel.buildErrorResponse(directive, 'INSUFFICIENT_PERMISSIONS', errMessage);

            } else if (error.response.status == 404) {
                return alexaModel.buildErrorResponse(directive, 'NO_SUCH_ENDPOINT', errMessage);

            } else {
                return alexaModel.buildErrorResponse(directive, 'INTERNAL_ERROR', errMessage);
            }
        } else {
            return alexaModel.buildErrorResponse(directive, 'BRIDGE_UNREACHABLE', error);
        }
    }
}

// ====================================

async function requestGloboStatusWithFetch(directive, success) {
    const globoId = mapToGloboId(directive.endpoint.endpointId);

    const request = {
        url: `${process.env.BASE_URL}/${globoId}`,
        options: {
            method: 'GET',
            headers: { 'Authorization': process.env.BASIC_AUTH }
        }
    };

    return await requestWithFetch(request, directive, success);
}

async function executeGloboCommandWithFetch(directive, command, value, success) {
    const globoId = mapToGloboId(directive.endpoint.endpointId);

    const request = {
        url: `${process.env.BASE_URL}/${globoId}` + (value ? `/${command}/${value}` : `/${command}`),
        options: {
            method: 'PUT',
            headers: { 'Authorization': process.env.BASIC_AUTH }
        }
    };

    return await requestWithFetch(request, directive, success);
}

function fetchWithTimeout(url, options, timeout) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
        )
    ]);
}

async function requestWithFetch(request, directive, success) {
    try {
        const response = await fetchWithTimeout(request.url, request.options, 7000);
        console.log(response.data);

        if (response.status == 200) {
            return success(directive, response.data);

        } else {
            console.log("Err1: " + response.status);

            if (response.status == 400) {
                return alexaModel.buildErrorResponse(directive, 'INVALID_VALUE', '');

            } else if (response.status == 401) {
                return alexaModel.buildErrorResponse(directive, 'INSUFFICIENT_PERMISSIONS', '');

            } else if (response.status == 404) {
                return alexaModel.buildErrorResponse(directive, 'NO_SUCH_ENDPOINT', '');

            } else {
                return alexaModel.buildErrorResponse(directive, 'INTERNAL_ERROR', '');
            }
        }
    } catch (error) {
        console.log("Err2: " + error);
        return alexaModel.buildErrorResponse(directive, 'BRIDGE_UNREACHABLE', error);
    }
}

// ==================================


function mapToGloboId(endpointId) {
    if (endpointId == 'light-v3') {
        return 'light';
    } else if (endpointId == 'fan-v3') {
        return 'fan';
    }
}

function mapToGloboLightProperties(globoLightStatus) {
    const status = globoLightStatus.split(':');
    const brightnessValue = status[1];

    switch (status[0]) {
        case 'GloboLightStatus.ON':
        case 'GloboLightStatus.DIMMED': return { powerState: 'ON',  brightness: brightnessValue };
        case 'GloboLightStatus.OFF':    return { powerState: 'OFF', brightness: brightnessValue };

        default:
            throw new Error(`Could not map value '${globoLightStatus}' for globo light.`);
    }
}

function mapToGloboFanProperties(globoFanStatus) {
    switch (globoFanStatus) {
        case 'GloboFanCommand.OFF':  return { powerState: 'OFF', powerLevel: '0' };
        case 'GloboFanCommand.LOW':  return { powerState: 'ON',  powerLevel: '33' };
        case 'GloboFanCommand.MED':  return { powerState: 'ON',  powerLevel: '66' };
        case 'GloboFanCommand.HIGH': return { powerState: 'ON',  powerLevel: '100' };

        default:
            throw new Error(`Could not map value '${globoStatus}' for globo fan.`);
    }
}


// ==============================================


function createStateReport(directive, globoStatus) {
    const globoId = mapToGloboId(directive.endpoint.endpointId);
    const properties = [];

    properties.push(alexaModel.buildStateReportProperty(
        'Alexa.EndpointHealth', 'connectivity', { "value": "OK" }));

    if (globoId == 'light') {
        const value = mapToGloboLightProperties(globoStatus);

        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.PowerController', 'powerState', value.powerState));
        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.BrightnessController', 'brightness', value.brightness));

    } else if (globoId == 'fan') {
        const value = mapToGloboFanProperties(globoStatus);

        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.PowerController', 'powerState', value.powerState));
        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.PowerLevelController', 'powerLevel', value.powerLevel));
    }

    return alexaModel.buildStateReport(directive, properties);
}

function createTurnOnResponse(directive) {
    return alexaModel.buildResponse(directive, 'powerState', 'ON');
}

function createTurnOffResponse(directive) {
    return alexaModel.buildResponse(directive, 'powerState', 'Off');
}

function createSetBrightnessResponse(directive) {
    const brightness = directive.payload.brightness;
    return alexaModel.buildResponse(directive, 'brightness', brightness);
}

function createSetPowerLevelResponse(directive) {
    const powerLevel = directive.payload.powerLevel;
    return alexaModel.buildResponse(directive, 'powerLevel', powerLevel);
}
