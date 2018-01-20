#!flask/bin/python

#==============================================================================#
#                           --- globo-fan-remote ---                           #
#                             author:  Max Stark                               #
#                             date:    August 2017                             #
#==============================================================================#

from functools import wraps
from flask import Flask, request, Response

import logging
import os
import ctypes
import time

app = Flask(__name__)

#===============================================================================
GPIO_PIN = 18
MAX_PULSES_PER_WAVE = 12000 # from pigpio.h
FREQUENCY = 38000
PERIOD_TIME = 1000000.0 / FREQUENCY
DUTY_CYCLE = 0.5
DURATION_ON = int(round(PERIOD_TIME * DUTY_CYCLE))
DURATION_OFF = int(round(PERIOD_TIME * (1.0 - DUTY_CYCLE)))
PI_WAVE_MODE_REPEAT_SYNC = 3

class Pulses_struct(ctypes.Structure):
    _fields_ = [("gpioOn", ctypes.c_uint32),
                ("gpioOff", ctypes.c_uint32),
                ("usDelay", ctypes.c_uint32)]

class Wave():
    def __init__(self):
        Pulses_array = Pulses_struct * MAX_PULSES_PER_WAVE
        self.pulses = Pulses_array()
        self.pulse_count = 0
        self.wave_duration = 0

    def addPulse(self, gpioOn, gpioOff, usDelay):
        self.pulses[self.pulse_count].gpioOn = gpioOn
        self.pulses[self.pulse_count].gpioOff = gpioOff
        self.pulses[self.pulse_count].usDelay = usDelay
        self.pulse_count += 1
        self.wave_duration += usDelay

    # Pull the specified output pin low
    def zero(self, duration):
        self.addPulse(0, 1 << GPIO_PIN, duration)

    # Protocol-agnostic square wave generator
    def one(self, duration):
        total_periods = int(round(duration/PERIOD_TIME))
        total_pulses = total_periods * 2

        # Generate square wave on the specified output pin
        for i in range(total_pulses):
          if i % 2 == 0:
            self.addPulse(1 << GPIO_PIN, 0, DURATION_ON)
          else:
            self.addPulse(0, 1 << GPIO_PIN, DURATION_OFF)

class WaveGenerator():
    def __init__(self):
        print("Loading libpigpio.so")
        self.pigpio = ctypes.CDLL('libpigpio.so')
        self.pigpio.gpioInitialise()
        self.pigpio.gpioSetMode(GPIO_PIN, 1)
        self.waves = []

    def add(self, durationPulse, durationPause):
        wave = self.waves[-1]
        if wave.pulse_count > (MAX_PULSES_PER_WAVE - 1000):
            wave = Wave()
            self.waves.append(wave)
        wave.one(durationPulse)
        wave.zero(durationPause)

    def generateWave(self, ircode):
        self.waves = []
        self.waves.append(Wave())

        for i in ircode:
            if i == "0":
                self.add(400, 1200)
            elif i == "1":
               self.add(1200, 400)
            elif i == "*":
                self.add(400, 8000)
            elif i == "#":
                self.add(1200, 7000)

        pulseCount = 0
        for wave in self.waves:
            pulseCount += wave.pulse_count
        print "Generated " + str(len(self.waves)) + " waves " + \
              "with " + str(pulseCount) + " pulses."

    def sendWave(self):
        for wave in self.waves:
            self.pigpio.gpioWaveAddGeneric(wave.pulse_count, wave.pulses)
            waveId = self.pigpio.gpioWaveCreate()

            if waveId >= 0:
                print("Sending wave...")
                result = self.pigpio.gpioWaveTxSend(waveId, PI_WAVE_MODE_REPEAT_SYNC)
                if result >= 0:
                    print("... success! (result: %d)" % result)

                    # Since we send the wave in repeat mode, we have to stop it after
                    # the calculated time
                    wait = round(wave.wave_duration / 100000.0, 3)
                    print("Waiting for %f seconds ..." % wait)
                    time.sleep(wait)
                    self.pigpio.gpioWaveTxStop()
                    print("... now stop and delete wave.")

                else:
                    print("... error! (result: %d)" % result)
            else:
                print("Error creating wave: %d" % waveId)

            self.pigpio.gpioWaveDelete(waveId)
            self.pigpio.gpioWaveClear()
        self.waves = []

    def __def__(self):
        print("Terminating pigpio")
        self.pigpio.gpioTerminate()

#===============================================================================
IRCODE_PREAMBLE    = "11000000000*11000111111#"
IRCODE_LIGHT_POWER = IRCODE_PREAMBLE + 4 * "11000000100*"
IRCODE_LIGHT_DIMM  = "11000010000*"
IRCODE_FAN_OFF     = IRCODE_PREAMBLE + 4 * "11000001000*"
IRCODE_FAN_LOW     = IRCODE_PREAMBLE + 4 * "11000100001#"
IRCODE_FAN_MED     = IRCODE_PREAMBLE + 4 * "11000000010*"
IRCODE_FAN_HIGH    = IRCODE_PREAMBLE + 4 * "11000000000#"
IRCODE_DISCO       = IRCODE_LIGHT_POWER + IRCODE_PREAMBLE
WAVE_GENERATOR = WaveGenerator()

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
        print('Authorization ok, access granted.')
        return function(*args, **kwargs)
    return authenticate

@app.route('/globo/<device>/<command>', methods=['GET'])
@app.route('/globo/<device>/<command>/<value>', methods=['GET'])
@basic_auth
def execCommand(device, command, value = None):
    print("================== Received REST request ==================")
    if device == 'light':
        return handleLightCommand(command, value)
    elif device == 'fan':
        return handleFanCommand(command, value)
    else:
        print("Unknown device '" + device + "'.")
        return Response('Device not found.', 404)

LIGHT_CURRENT_STATE = "OFF"

def handleLightCommand(command, value):
    global LIGHT_CURRENT_STATE

    if command == "POWER":
        print("Send LIGHT POWER command.")
        WAVE_GENERATOR.generateWave(IRCODE_LIGHT_POWER)

    elif command == "ON":
        if LIGHT_CURRENT_STATE != "ON":
            print("Send LIGHT ON command.")
            WAVE_GENERATOR.generateWave(IRCODE_LIGHT_POWER)
            LIGHT_CURRENT_STATE = "ON"
        else:
            print("Light is already ON.")

    elif command == "OFF":
        if LIGHT_CURRENT_STATE != "OFF":
            print("Send LIGHT OFF command.")
            WAVE_GENERATOR.generateWave(IRCODE_LIGHT_POWER)
            LIGHT_CURRENT_STATE = "OFF"
        else:
            print("Light is already OFF.")

    elif command == "DIMM":
        # validate input
        value = int(float(value))
        if value <= 0:
            return handleLightCommand("OFF", None)
        elif value >= 100:
            return handleLightCommand("ON", None)
        # prepare the light for DIMM command
        if LIGHT_CURRENT_STATE == "OFF":
            WAVE_GENERATOR.generateWave(IRCODE_LIGHT_POWER)
            WAVE_GENERATOR.sendWave()
        elif LIGHT_CURRENT_STATE == "DIMM":
            WAVE_GENERATOR.generateWave(IRCODE_LIGHT_POWER)
            WAVE_GENERATOR.sendWave()
            WAVE_GENERATOR.generateWave(IRCODE_LIGHT_POWER)
            WAVE_GENERATOR.sendWave()
        # calculate the DIMM signal
        repeats = ((100 - value) / 10) + 6
        print("Send LIGHT DIMM command (" + str(value) + "%) with " + str(repeats) + " repeats.")
        WAVE_GENERATOR.generateWave(IRCODE_PREAMBLE + repeats * IRCODE_LIGHT_DIMM)
        LIGHT_CURRENT_STATE = "DIMM"

    elif command == "DISCO":
        print("Send LIGHT DISCO command.")
        WAVE_GENERATOR.generateWave(10 * IRCODE_DISCO)

    else:
        print("Unknown command '" + command + "'.")
        return Response('Unknown command.', 400)

    WAVE_GENERATOR.sendWave()
    return Response('Command was sent.', 200)

def handleFanCommand(command, value):
    if command == "ON" or command == "LOW":
        print("Send FAN LOW command.")
        WAVE_GENERATOR.generateWave(IRCODE_FAN_LOW)
    elif command == "MED":
        print("Send FAN MED command.")
        WAVE_GENERATOR.generateWave(IRCODE_FAN_MED)
    elif command == "HIGH":
        print("Send FAN HIGH command.")
        WAVE_GENERATOR.generateWave(IRCODE_FAN_HIGH)
    elif command == "OFF":
        print("Send FAN OFF command.")
        WAVE_GENERATOR.generateWave(IRCODE_FAN_OFF)
    else:
        print("Unknown fan command '" + command + "'.")
        return Response('Unknown fan command.', 400)
    WAVE_GENERATOR.sendWave()
    return Response('Command was sent.', 200)

################################################################################

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=56123)

