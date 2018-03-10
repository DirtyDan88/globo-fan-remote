#!flask/bin/python

#==============================================================================#
#                           --- globo-fan-remote ---                           #
#                             author:  Max Stark                               #
#                             date:    March 2018                              #
#==============================================================================#

from functools import wraps
from enum import Enum
from flask import Flask, request, Response
from lib_globo_fan_IR_remote import GloboLightIRController, GloboLightCommand
from lib_globo_fan_IR_remote import GloboFanIRController, GloboFanCommand

import thread

#===============================================================================

class GloboLightStatus(Enum):
    ON = 1
    OFF = 2
    DIMMED = 3

class GloboLightCommandHandler():
    def __init__(self):
        self.__lightIRCtrl = GloboLightIRController()
        self.__currentStatus = GloboLightStatus.OFF
        self.__currentValue = 0

    def handleCommand(self, commandString, value):
        commands = []

        if commandString == "POWER":
            commands.append([GloboLightCommand.POWER, None])
            if self.__currentStatus == GloboLightStatus.ON:
                self.__currentStatus = GloboLightStatus.OFF
                self.__currentValue = 0
            elif self.__currentStatus == GloboLightStatus.DIMMED:
                self.__currentStatus = GloboLightStatus.OFF
                self.__currentValue = 0
            elif self.__currentStatus == GloboLightStatus.OFF:
                self.__currentStatus = GloboLightStatus.ON
                self.__currentValue = 100

        elif commandString == "ON":
            if self.__currentStatus != GloboLightStatus.ON:
                commands.append([GloboLightCommand.POWER, None])
                self.__currentStatus = GloboLightStatus.ON
                self.__currentValue = 100
            else:
                print("Light is already ON.")

        elif commandString == "OFF":
            if self.__currentStatus != GloboLightStatus.OFF:
                commands.append([GloboLightCommand.POWER, None])
                self.__currentStatus = GloboLightStatus.OFF
                self.__currentValue = 0
            else:
                print("Light is already OFF.")

        elif commandString == "DIMM":
            # validate input value
            value = int(float(value))
            if value <= 0:
                return self.handleCommand("OFF", None)
            elif value >= 100:
                return self.handleCommand("ON", None)
            # prepare the light for DIMM command
            if self.__currentStatus == GloboLightStatus.OFF:
                commands.append([GloboLightCommand.POWER, None])
            elif self.__currentStatus == GloboLightStatus.DIMMED:
                commands.append([GloboLightCommand.POWER, None])
                commands.append([GloboLightCommand.POWER, None])
            # add the actual dimm command
            commands.append([GloboLightCommand.DIMM, value])
            self.__currentStatus = GloboLightStatus.DIMMED
            self.__currentValue = value

        elif commandString == "DISCO":
            commands.append([GloboLightCommand.DISCO, None])

        else:
            print("Unknown light command '" + commandString + "'.")
            return Response('Unknown command.', 400)

        thread.start_new_thread(self.__submitCommands, (commands,))
        return Response('Commands were submitted.', 200)

    def __submitCommands(self, commands):
        for command in commands:
            print("Send " + str(command[0]) + " (value " + str(command[1]) + ")")
            self.__lightIRCtrl.sendCommand(command[0], command[1])

    def getStatus(self):
        return str(self.__currentStatus)

#===============================================================================

class GloboFanCommandHandler():
    def __init__(self):
        self.__fanIRCtrl = GloboFanIRController()
        self.__currentStatus = GloboFanCommand.OFF

    def handleCommand(self, commandString):
        if commandString == "ON":
            command = GloboFanCommand.LOW
        elif commandString == "LOW":
            command = GloboFanCommand.LOW
        elif commandString == "MED":
            command = GloboFanCommand.MED
        elif commandString == "HIGH":
            command = GloboFanCommand.HIGH
        elif commandString == "OFF":
            command = GloboFanCommand.OFF
        else:
            print("Unknown fan command '" + commandString + "'.")
            return Response('Unknown fan command.', 400)

        if command == self.__currentStatus:
            return Response('Fan already in desired status.', 200)

        thread.start_new_thread(self.__submitCommand, (command,))
        self.__currentStatus = command
        return Response('Command was submitted.', 200)

    def __submitCommand(self, command):
        print("Send " + str(command))
        self.__fanIRCtrl.sendCommand(command)

    def getStatus(self):
        return str(self.__currentStatus)

#===============================================================================

def checkCredentials(username, password):
    auth_file = open('/home/pi/globo-fan-remote/auth.txt', 'r')
    return username == auth_file.readline().strip() and \
           password == auth_file.readline().strip()

def basic_auth(function):
    @wraps(function)
    def authenticate(*args, **kwargs):
        credentials = request.authorization
        if not credentials or not checkCredentials(credentials.username, credentials.password):
            print('Authorization failed, access denied.')
            return Response('Unauthorized.', 401)
        print('\nAuthorization ok, access granted.')
        return function(*args, **kwargs)
    return authenticate

#===============================================================================

app = Flask(__name__)

@app.route('/globo/<device>/<command>', methods=['PUT'])
@app.route('/globo/<device>/<command>/<value>', methods=['PUT'])
@basic_auth
def execCommand(device, command, value = None):
    print("================== Received HTTP PUT request ==================")
    if device == 'light':
        return LIGHT_CMD_HANDLER.handleCommand(command, value)
    elif device == 'fan':
        return FAN_CMD_HANDLER.handleCommand(command)
    else:
        print("Unknown device '" + device + "'.")
        return Response('Device not found.', 404)

@app.route('/globo/<device>', methods=['GET'])
@basic_auth
def getStatus(device):
    print("================== Received HTTP GET request ==================")
    if device == 'light':
        return LIGHT_CMD_HANDLER.getStatus()
    elif device == 'fan':
        return FAN_CMD_HANDLER.getStatus()
    else:
        print("Unknown device '" + device + "'.")
        return Response('Device not found.', 404)

#===============================================================================

LIGHT_CMD_HANDLER = GloboLightCommandHandler()
FAN_CMD_HANDLER = GloboFanCommandHandler()

if __name__ == '__main__':
    app.run(host = '0.0.0.0', port = 56123)