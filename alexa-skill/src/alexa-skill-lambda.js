const axios = require('axios');
const alexaModel = require('./alexa-model');

const connectTimeout = 3000;
const requestTimeout = 7000;
const httpClient = axios.create({
    adapter: require('axios/lib/adapters/http'),
    baseURL: process.env.BASE_URL,
    headers: { 'Authorization': process.env.BASIC_AUTH },
    timeout: requestTimeout
});


/**
 * Alexa Skill (lambda handler) for the Globo Lighting Fabiola 0306.
 *
 * @author Max Stark
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
            return alexaModel.buildErrorResponse(directive, 'NO_SUCH_ENDPOINT', `Unknown endpoint '${endpointId}'.`);
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
        return await requestGloboStatus(directive, createStateReport);

    } else if (directiveName == 'TurnOn') {
        return await executeGloboCommand(directive, 'ON', null, createTurnOnResponse);

    } else if (directiveName == 'TurnOff') {
        return await executeGloboCommand(directive, 'OFF', null, createTurnOffResponse);

    } else if (directiveName == 'SetBrightness') {
        const brightness = directive.payload.brightness;

        if (brightness < 0 || brightness > 100) {
            return alexaModel.buildErrorResponse(
                directive, 'VALUE_OUT_OF_RANGE', `Value '${brightness}' (brightness) is out of range for globo light.`);
        } else {
            return await executeGloboCommand(directive, 'DIMM', brightness, createSetBrightnessResponse);
        }

    } else {
        return alexaModel.buildErrorResponse(
            directive, 'INVALID_DIRECTIVE', `Directive '${directiveName}' is invalid for globo light.`);
    }
}

async function handleDirectiveForGloboFan(directive) {
    const directiveName = directive.header.name;

    if (directiveName == 'ReportState') {
        return await requestGloboStatus(directive, createStateReport);

    } else if (directiveName == 'TurnOn') {
        return await executeGloboCommand(directive, 'LOW', null, createTurnOnResponse);

    } else if (directiveName == 'TurnOff') {
        return await executeGloboCommand(directive, 'OFF', null, createTurnOffResponse);

    } else if (directiveName == 'SetPowerLevel') {
        const powerLevel = directive.payload.powerLevel;

        if (powerLevel < 0 || powerLevel > 100) {
            return alexaModel.buildErrorResponse(
                directive, 'VALUE_OUT_OF_RANGE', `Value '${powerLevel}' (powerLevel) is out of range for globo fan.`);

        } else if (powerLevel == 0) {
            return await executeGloboCommand(directive, 'OFF', null, createSetPowerLevelResponse);

        } else if (powerLevel <= 33) {
            return await executeGloboCommand(directive, 'LOW', null, createSetPowerLevelResponse);

        } else if (powerLevel <= 66) {
            return await executeGloboCommand(directive, 'MED', null, createSetPowerLevelResponse);

        } else {
            return await executeGloboCommand(directive, 'HIGH', null, createSetPowerLevelResponse);
        }

    } else {
        return alexaModel.buildErrorResponse(
            directive, 'INVALID_DIRECTIVE', `Directive '${directiveName}' is invalid for globo fan.`);
    }
}

async function requestGloboStatus(directive, success) {
    const globoId = mapToGloboId(directive.endpoint.endpointId);

    const request = {
        method: 'GET',
        url: `/${globoId}`
    };

    return await callGloboFanRemote(request, directive, success);
}

async function executeGloboCommand(directive, command, value, success) {
    const globoId = mapToGloboId(directive.endpoint.endpointId);

    const request = {
        method: 'PUT',
        url: value? `/${globoId}/${command}/${value}` : `/${globoId}/${command}`
    };

    return await callGloboFanRemote(request, directive, success);
}

function mapToGloboId(endpointId) {
    if (endpointId == 'light-v3') {
        return 'light';
    } else if (endpointId == 'fan-v3') {
        return 'fan';
    }
}

async function callGloboFanRemote(request, directive, success) {
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
            return alexaModel.buildErrorResponse(directive, 'BRIDGE_UNREACHABLE', error.message);
        }
    }
}

async function requestWithTimeout(request) {
    const source = axios.CancelToken.source();
    request.cancelToken = source.token;

    let response = null;
    setTimeout(() => response ? console.log('no timeout') : source.cancel('cancel timeout'), connectTimeout);

    response = await httpClient(request);
    return response.data;
}

function createStateReport(directive, globoStatus) {
    const endpointId = directive.endpoint.endpointId;
    const properties = [];

    properties.push(alexaModel.buildStateReportProperty(
        'Alexa.EndpointHealth', 'connectivity', { "value": "OK" }));

    if (endpointId == 'light-v3') {
        const value = mapToGloboLightProperties(globoStatus);

        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.PowerController', 'powerState', value.powerState));
        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.BrightnessController', 'brightness', value.brightness));

    } else if (endpointId == 'fan-v3') {
        const value = mapToGloboFanProperties(globoStatus);

        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.PowerController', 'powerState', value.powerState));
        properties.push(alexaModel.buildStateReportProperty(
            'Alexa.PowerLevelController', 'powerLevel', value.powerLevel));
    }

    return alexaModel.buildStateReport(directive, properties);
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
