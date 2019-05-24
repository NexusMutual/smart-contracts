@echo off
title Nexus Dev Kitchen !!!
echo Loading Resources . . .
cd node_modules/.bin/
echo starting ganche-cli  . . .
ganache-cli --gasLimit 0xfffffffffff -i 5777 -p 8545 -m 'grocery obvious wire insane limit weather parade parrot patrol stock blast ivory' -a 30 -e 10000000
ping 127.0.0.1 -n 5 > nul
echo starting oraclize ethereum bridge . . .
ethereum-bridge -H localhost:8545 -a 20 --dev
