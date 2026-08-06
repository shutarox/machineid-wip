#!/bin/bash

# Check if the argument is provided
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 SELF_PID SHELL_NAME"
  exit 1
fi

SELF_PID=$1
SHELL_NAME=$2
PID_FILE="/tmp/shell-$SHELL_NAME.pid"

# Check if the PID file exists
if [ -f "$PID_FILE" ]; then
    # Read the PID from the file
    OLD_PID=$(cat "$PID_FILE")

    # Check if the process with the PID exists
    echo '# CHECK START'
    echo $OLD_PID
    echo `ps -p $OLD_PID | grep -v PID`
    echo '# CHECK END'
    if ps -p "$OLD_PID" | grep -v PID > /dev/null 2>&1; then
        echo "Another instance of $SHELL_NAME is already running with PID $OLD_PID. Exiting."
        exit
    else
        echo "Stale PID file found. Removing it."
        rm -f "$PID_FILE"
    fi
fi

# Write the current script's PID to the PID file
echo $SELF_PID > "$PID_FILE"

# The main script logic goes here
echo "$SHELL_NAME started with PID $SELF_PID"
