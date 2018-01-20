# globo-fan-remote

The globo-fan-remote python script imitates the IR commands of the IR remote control of the [Globo Lighting Fabiola](http://www.globo-lighting.com/de/products/83/0306/) ceiling fan. It offers an
REST like interface which, in principle, makes it possible to control the fan (and light) from everywhere.

The alexa-skill-lambda function uses the globo-fan-remote REST interface and enables the Globo Lighting Fabiola ceiling fan to be controlled via the Amazon Alexa voice service.

## Hardware

- Raspberry Pi Zero W
- RS-15-5 MEAN WELL 5V 3A power supply
- Digital 38khz IR receiver & transmitter
- Case: BOXEXPERT RAL7015 Elbe 122x120x55mm

![Hardware](https://raw.githubusercontent.com/DirtyDan88/globo-fan-remote/master/hardware.png)

## Software

- OS: 2017-11-29-raspbian-stretch-lite
- [pigpio](https://github.com/joan2937/pigpio) by joan2937, thanks!
- Python and Python Flask

## Install

- Download and build pigpio:
```sh
# git clone https://github.com/joan2937/pigpio.git
# cd pigpio
# make && make install
```

- Install Flask:
```sh
# sudo apt-get install python-pip
# sudo pip install Flask
# sudo apt-get install python-flask
```

- Add script to autostart:
```sh
# sudo nano /etc/rc.local
Add lines:
# # Start the globo-fan-remote REST endpoint (as root)
# python /home/pi/globo-fan-remote/globo-fan-remote.py >> /home/pi/globo-fan-remote/log.txt
```
