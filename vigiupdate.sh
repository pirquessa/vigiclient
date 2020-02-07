#!/bin/bash

set -e
set -u

BASEDIR=/usr/local/vigiclient

trace() {
 echo "$(date "+%d/%m/%Y %H:%M:%S") $1"
}

trace "Start the update-release script"
cd $BASEDIR
sudo node vigiupdate.js
