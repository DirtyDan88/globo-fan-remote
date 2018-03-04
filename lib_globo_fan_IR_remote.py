#!flask/bin/python

#==============================================================================#
#                           --- globo-fan-remote ---                           #
#                             author:  Max Stark                               #
#                             date:    March 2018                              #
#==============================================================================#

from enum import Enum

import logging
import os
import ctypes
import time

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

#===============================================================================

class GloboLightCommand(Enum):
    POWER = 0
    DIMM = 1
    DISCO = 2

class GloboLightIRController():
    def sendCommand(self, command, value):
        if command == GloboLightCommand.POWER:
            print("Generate wave: LIGHT POWER")
            WAVE_GENERATOR.generateWave(IRCODE_LIGHT_POWER)
        elif command == GloboLightCommand.DIMM:
            repeats = ((100 - value) / 10) + 6
            print("Generate wave: LIGHT DIMM (" + str(value) + "%) with " + str(repeats) + " repeats.")
            WAVE_GENERATOR.generateWave(IRCODE_PREAMBLE + repeats * IRCODE_LIGHT_DIMM)
        elif command == "DISCO":
            print("Generate wave: LIGHT DISCO")
            WAVE_GENERATOR.generateWave(10 * IRCODE_DISCO)
        else:
            print("Unknown light command '" + command + "'.")
            return

        print("Sending wave ...")
        WAVE_GENERATOR.sendWave()
        print("Sending wave finished.")

#===============================================================================

class GloboFanCommand(Enum):
    LOW = 0
    MED = 1
    HIGH = 2
    OFF = 3

class GloboFanIRController():
    def sendCommand(self, command):
        if command == GloboFanCommand.LOW:
            print("Send FAN LOW command.")
            WAVE_GENERATOR.generateWave(IRCODE_FAN_LOW)
        elif command == GloboFanCommand.MED:
            print("Send FAN MED command.")
            WAVE_GENERATOR.generateWave(IRCODE_FAN_MED)
        elif command == GloboFanCommand.HIGH:
            print("Send FAN HIGH command.")
            WAVE_GENERATOR.generateWave(IRCODE_FAN_HIGH)
        elif command == GloboFanCommand.OFF:
            print("Send FAN OFF command.")
            WAVE_GENERATOR.generateWave(IRCODE_FAN_OFF)
        else:
            print("Unknown fan command '" + command + "'.")
            return

        print("Sending wave ...")
        WAVE_GENERATOR.sendWave()
        print("Sending wave finished.")