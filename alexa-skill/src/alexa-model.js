/**
 * Alexa model (v3) message builder for the Globo Lighting Fabiola 0306.
 *
 * @author Max Stark
 */

exports.buildCapability = (capabilityInterface, propertyName) => {
    return {
        "type": "AlexaInterface",
        "interface": capabilityInterface,
        "version": "3",
        "properties": propertyName ? this.buildCapabilityProperty(propertyName) : undefined
    };
}

exports.buildCapabilityProperty = (propertyName) => {
    return {
        "supported": [
            {
                "name": propertyName
            }
        ],
        "proactivelyReported": "false",
        "retrievable": "true"
    };
}

exports.buildEndpoint = (endpointId, voiceName, displayCategories, capabilities) => {
    return {
        "endpointId": endpointId,
        "friendlyName": voiceName,
        "description": "Globo Lighting Fabiola 0306",
        "displayCategories": displayCategories,
        "manufacturerName": "Globo Fan Remote by DirtyDan",
        "capabilities": capabilities
    };
}

exports.buildDiscoverResponse = (directive, endpoints) => {
    return {
        "event": {
            "header": {
                "namespace": directive.header.namespace,
                "name": "Discover.Response",
                "messageId": directive.header.messageId,
                "payloadVersion": "3"
            },
            "payload": {
                "endpoints": endpoints
            }
        }
    };
}

exports.buildStateReportProperty = (capabilityInterface, propertyName, value) => {
    return {
        "namespace": capabilityInterface,
        "name": propertyName,
        "value": value,
        "timeOfSample": new Date(Date.now()).toISOString(),
        "uncertaintyInMilliseconds": 0
    };
}

exports.buildStateReport = (directive, properties) => {
    return this.buildContextEvent(directive, 'StateReport', properties);
}

exports.buildResponse = (directive, propertyName, value) => {
    const property = this.buildStateReportProperty(directive.header.namespace, propertyName, value);
    return this.buildContextEvent(directive, 'Response', [ property ]);
}

exports.buildContextEvent = (directive, eventName, properties) => {
    return {
        "event": {
            "header": {
                "namespace": "Alexa",
                "name": eventName,
                "messageId": directive.header.messageId,
                "correlationToken": directive.header.correlationToken,
                "payloadVersion": "3"
            },
            "endpoint": {
                "endpointId": directive.endpoint.endpointId
            }
        },
        "context": {
            "properties": properties
        }
    };
}

exports.buildErrorResponse = (directive, errType, errMessage) => {
    return {
        "event": {
            "header": {
                "namespace": "Alexa",
                "name": "ErrorResponse",
                "messageId": directive.header.messageId,
                "correlationToken": directive.header.correlationToken,
                "payloadVersion": "3"
            },
            "endpoint": {
                "endpointId": directive.endpoint.endpointId
            },
            "payload": {
                "type": errType,
                "message": errMessage
            }
        }
    };
}
