#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi
}

ganache_port=8545

ganache_running() {
  nc -z localhost "$ganache_port"
}

start_ganache() { 
  node_modules/.bin/ganache-cli --gasLimit 80000000 -p "$ganache_port" -i 5777 -m "grocery obvious wire insane limit weather parade parrot patrol stock blast ivory" -a 30 -e 10000000 > /dev/null &
  ganache_pid=$!
}

if ganache_running; then
  echo "Using existing ganache instance"
else
  echo "Starting our own ganache instance"
  start_ganache
  sleep 2
fi

if [ -d "node_modules/eth-lightwallet/node_modules/bitcore-lib" ]; then
    rm -r "node_modules/eth-lightwallet/node_modules/bitcore-lib"
    echo "Deleted eth bitcore-lib"
fi
if [ -d "node_modules/bitcore-mnemonic/node_modules/bitcore-lib" ]; then
  rm -r "node_modules/bitcore-mnemonic/node_modules/bitcore-lib"
  echo "Deleted mne bitcore-lib"
fi

if [ "$SOLIDITY_COVERAGE" = true ]; then
  npx truffle run coverage
  if [ "$CONTINUOUS_INTEGRATION" = true ]; then
    cat coverage/lcov.info | node_modules/.bin/coveralls
  fi
else
  echo "Now let's test truffle"
  node_modules/.bin/truffle test "$@"
fi