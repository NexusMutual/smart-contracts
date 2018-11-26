#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [ -n "$bridge_pid" ] && ps -p $bridge_pid > /dev/null; then
    kill -9 $bridge_pid
  fi

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

bridge_running() {
  if [ $(ps -eaf | grep -c ethereum-bridge) -ge 2 ]; then
    return 0
  else
    return 1
  fi
}

start_ganache() {

  if [ "$SOLIDITY_COVERAGE" = true ]; then
    node_modules/.bin/testrpc-sc --gasLimit 0xfffffffffff -p "$ganache_port" -i 5777 -m "grocery obvious wire insane limit weather parade parrot patrol stock blast ivory" -a 21 -e 10000000 > /dev/null &
  else
    node_modules/.bin/ganache-cli --gasLimit 7000000 -p "$ganache_port" -i 5777 -m "grocery obvious wire insane limit weather parade parrot patrol stock blast ivory" -a 21 -e 10000000 > /dev/null &
  fi

  ganache_pid=$!
}

start_ethereum-bridge() {
  # starts ethereum bridge for oraclize query
  if [ "$SOLIDITY_COVERAGE" = true ]; then
    node_modules/.bin/ethereum-bridge -H localhost:8555 -a 20 &> /dev/null &
  else
    node_modules/.bin/ethereum-bridge -H localhost:8545 -a 20 &> /dev/null &
  fi
  sleep 10
  bridge_pid=$!
  echo "Ethereum-bridge is successfully running as process id ${bridge_pid}"
}

if ganache_running; then
  echo "Using existing ganache instance"
  if bridge_running; then
      echo "Using existing ethereum-bridge instance"
  else
      echo "Runnning the new ethereum-bridge instance"
      start_ethereum-bridge
  fi
else
  echo "Starting our own ganache and oraclize instance"
  start_ganache
  sleep 10
  start_ethereum-bridge
fi

if [ "$SOLIDITY_COVERAGE" = true ]; then
  # coverage fix, thanks to @maxsam4 from polymath-network
  curl -o node_modules/solidity-coverage/lib/app.js https://raw.githubusercontent.com/maxsam4/solidity-coverage/relative-path/lib/app.js
  sleep 2
  node_modules/.bin/solidity-coverage
  if [ "$CONTINUOUS_INTEGRATION" = true ]; then
    cat coverage/lcov.info | node_modules/.bin/coveralls
  fi
else
  node_modules/.bin/truffle test "$@"
fi
