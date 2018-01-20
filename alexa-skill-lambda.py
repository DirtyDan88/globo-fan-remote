#!/usr/bin/env python

#==============================================================================#
#             --- globo-fan-remote alexa-skill lambda-function ---             #
#                             author:  Max Stark                               #
#                             date:    August 2017                             #
#                     alexa-smart-home-skill api-version: v2                   #
#==============================================================================#

import logging
import urllib2
import base64
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

COMMAND_LIGHT_ON = 'ON'
COMMAND_LIGHT_OFF = 'OFF'
COMMAND_LIGHT_DIMM = 'DIMM'
COMMAND_FAN_LOW = 'LOW'
COMMAND_FAN_MED = 'MED'
COMMAND_FAN_HIGH = 'HIGH'
COMMAND_FAN_OFF = 'OFF'

#===============================================================================
def main(event, context):
    logger.info('Alexa Skill called with \'%s\' request.', event['header']['namespace'])

    if event['header']['namespace'] == 'Alexa.ConnectedHome.Discovery':
        return handleDiscoveryRequest(event)
    elif event['header']['namespace'] == 'Alexa.ConnectedHome.Control':
        return handleControlRequest(event)

#===============================================================================
def handleDiscoveryRequest(event):
    try:
        light = {}
        light['applianceId'] = 'light'
        light['manufacturerName'] = 'Globo Lighting'
        light['modelName'] = 'Fabiola 0306'
        light['version'] = '-'
        light['friendlyName'] = 'Deckenlicht'
        light['friendlyDescription'] = 'Deckenlicht Wohnzimmer'
        light['isReachable'] = True
        light['actions'] = [ 'turnOn', 'turnOff', 'setPercentage' ]
        light['additionalApplianceDetails'] = {}

        fan = {}
        fan['applianceId'] = 'fan'
        fan['manufacturerName'] = 'Globo Lighting'
        fan['modelName'] = 'Fabiola 0306'
        fan['version'] = '-'
        fan['friendlyName'] = 'Ventilator'
        fan['friendlyDescription'] = 'Ventilator Wohnzimmer'
        fan['isReachable'] = True
        fan['actions'] = [ 'turnOn', 'turnOff', 'setPercentage' ]
        fan['additionalApplianceDetails'] = {}

        payload = { 'discoveredAppliances': [light, fan] }
        logger.info('DiscoveryRequest was successful.')
    except Exception:
        payload = {}
        logger.exception('DiscoveryRequest failed.')

    header = {}
    header['messageId'] = event['header']['messageId']
    header['name'] = 'DiscoverAppliancesResponse'
    header['namespace'] = event['header']['namespace']
    header['payloadVersion'] = event['header']['payloadVersion']

    return { 'header': header, 'payload': payload }

#===============================================================================
def handleControlRequest(event):
    applianceId = event['payload']['appliance']['applianceId']
    
    try:
        if applianceId == 'light':
            execLightCommand(applianceId, event)
        elif applianceId == 'fan':
            execFanCommand(applianceId, event)
        else:
            raise Exception('NoSuchTargetError')

        requestType = event['header']['name']
        responseType = requestType.replace('Request', 'Confirmation')
        
    except Exception as ex:
        responseType = str(ex)

    header = {}
    header['messageId'] = event['header']['messageId']
    header['name'] = responseType
    header['namespace'] = event['header']['namespace']
    header['payloadVersion'] = event['header']['payloadVersion']

    return { 'header': header, 'payload': {} }

#===============================================================================
def execLightCommand(applianceId, event):
    requestType = event['header']['name']

    if requestType == 'TurnOnRequest':
        command = COMMAND_LIGHT_ON
        value = None
    elif requestType == 'TurnOffRequest':
        command = COMMAND_LIGHT_OFF
        value = None
    elif requestType == 'SetPercentageRequest':
        command = COMMAND_LIGHT_DIMM
        value = event['payload']['percentageState']['value']
        if value < 0 or value > 100:
            raise Exception('ValueOutOfRangeError')
    else:
        raise Exception('UnsupportedOperationError') 

    execCommand(applianceId, command, value)

#===============================================================================
def execFanCommand(applianceId, event):
    requestType = event['header']['name']

    if requestType == 'TurnOnRequest':
        command = COMMAND_FAN_LOW
    elif requestType == 'TurnOffRequest':
        command = COMMAND_FAN_OFF
    elif requestType == 'SetPercentageRequest':
        value = event['payload']['percentageState']['value']
        if value < 0 or value > 100:
            raise Exception('ValueOutOfRangeError')
        elif value <= 33:
            command = COMMAND_FAN_LOW
        elif value <= 66:
            command = COMMAND_FAN_MED
        elif value > 66:
            command = COMMAND_FAN_HIGH
    else:
        raise Exception('UnsupportedOperationError')

    execCommand(applianceId, command, None)

#===============================================================================
def execCommand(applianceId, command, value):
    logger.info('Try to execute command \'%s\' for appliance \'%s\'.', command, applianceId)

    if value is None:
        url = os.environ['BASE_URL'] + '/' + applianceId + '/' + command
    else:
        url = os.environ['BASE_URL'] + '/' + applianceId + '/' + command + '/' + str(value)

    try:
        request = urllib2.Request(url)
        request.add_header('Authorization', os.environ['BASIC_AUTH'])
        response = urllib2.urlopen(request)

        if response.code == 401:
            logger.exception('Sending the command failed: Unauthorized')
        elif response.code == 200:
            logger.info('Sending the command was successful.')

    except urllib2.HTTPError, e:
        logger.exception('Sending the command failed: ' + str(e.code) + ' ' + str(e.msg))
        if e.code == 400:
            raise Exception('UnsupportedOperationError')
        if e.code == 401:
            raise Exception('InvalidAccessTokenError')
        elif e.code == 404:
            raise Exception('NoSuchTargetError')
        else:
            raise Exception('UnexpectedInformationReceivedError')
    except Exception:
        logger.exception('Sending the command failed.')
        raise Exception('BridgeOfflineError')

