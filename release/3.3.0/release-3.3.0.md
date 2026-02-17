# Release 3.2.0: Cover contract

## Github PR

* [feat: add data and deadline to buyCoverWithRi signature](https://github.com/NexusMutual/smart-contracts/pull/1504)

## Contracts to be upgraded

* Cover.sol

## Contract deployment & verification


#### Cover.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * _stakingPoolImplementation = `0xcafeade1872f14adc0a03Ec7b0088b61D76ec729`
  * _verifyingAddress = `0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62`
* Address brute force command
  * Address: `0xcafeafF1a21418f530Feb00C6BAeF07523979C05`
  * Salt: 50026701
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Cover.constructorArgs' release/3.2.0/config/deployments.json)" \
  Cover
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Cover.constructorArgs' release/3.3.0/config/deployments.json)" \
  -a "$(jq -r '.Cover.expectedAddress' release/3.3.0/config/deployments.json)" \
  -s "$(jq -r '.Cover.salt'            release/3.3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Cover
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Cover.expectedAddress' release/3.3.0/config/deployments.json)" \
  $(jq -r '.Cover.constructorArgs | .[]' release/3.3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/cover/Cover.sol:Cover
```
