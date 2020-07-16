#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

GANACHE_PORT=8545
GANACHE_SEED="grocery obvious wire insane limit weather parade parrot patrol stock blast ivory"

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi
}

ganache_running() {
  nc -z localhost "$GANACHE_PORT"
}

start_ganache() {
  npx ganache-cli \
    --port $GANACHE_PORT \
    --mnemonic $GANACHE_SEED \
    --defaultBalanceEther 100000 \
    --accounts 100 \
    --gasLimit 80000000 \
    --networkId 5777 \
    > /dev/null &
  ganache_pid=$!
}

if ganache_running; then
  echo "Using existing ganache instance"
else
  echo "Starting ganache"
  start_ganache
  sleep 1
fi

if [ -d "node_modules/eth-lightwallet/node_modules/bitcore-lib" ]; then
    rm -r "node_modules/eth-lightwallet/node_modules/bitcore-lib"
fi

if [ -d "node_modules/bitcore-mnemonic/node_modules/bitcore-lib" ]; then
  rm -r "node_modules/bitcore-mnemonic/node_modules/bitcore-lib"
fi

echo "Running truffle test"
npx truffle test "$@"
