#!/bin/bash

LOCATION=$(dirname "$(readlink -e "$0")")
LOCKFILE=$LOCATION"/.lock"

case "$1" in
    start)
        if [ -e $LOCKFILE ]; then
            echo "globo-fan-remote already running"
        else
            sudo nohup python -u $LOCATION/globo-fan-HTTP-interface.py >> $LOCATION/log.txt &
            touch $LOCKFILE
        fi
        ;;
    stop)
        if [ -e $LOCKFILE ]; then
            for PID in $(ps aux | grep pyth | awk '{print $2}'); do
                echo "kill globo-fan-remote process: "$PID
                sudo kill -9 $PID
            done
            rm $LOCKFILE
        else
            echo "globo-fan-remote is not running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop}"
        exit 1
        ;;
esac
