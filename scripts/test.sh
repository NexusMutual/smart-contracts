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

if [ "$SOLIDITY_COVERAGE" = true ]; then
  ganache_port=8555
else
  ganache_port=8545
fi

ganache_running() {
  nc -z localhost "$ganache_port"
}

start_ganache() {

  if [ "$SOLIDITY_COVERAGE" = true ]; then
    node_modules/.bin/testrpc-sc --gasLimit 0xfffffffffff -p "$ganache_port" -i 5777 -m "grocery obvious wire insane limit weather parade parrot patrol stock blast ivory" -a 30 -e 10000000 > /dev/null &
  else
    node_modules/.bin/ganache-cli --gasLimit 7000000 -p "$ganache_port" -i 5777 -m "grocery obvious wire insane limit weather parade parrot patrol stock blast ivory" -a 30 -e 10000000 > /dev/null &
  fi

  ganache_pid=$!
}

if ganache_running; then
  echo "Using existing ganache instance"
else
  echo "Starting our own ganache instance"
  start_ganache
  sleep 2
fi

if [ "$SOLIDITY_COVERAGE" = true ]; then
  curl -o node_modules/solidity-parser-sc/build/parser.js  https://nexusmutual.io/js/parser.js
  curl -o node_modules/solidity-coverage/lib/app.js https://nexusmutual.io/js/app.js
  sleep 2
  node_modules/.bin/solidity-coverage
  if [ "$CONTINUOUS_INTEGRATION" = true ]; then
    cat coverage/lcov.info | node_modules/.bin/coveralls
  fi
else
  node_modules/.bin/truffle test "$@"
fi
