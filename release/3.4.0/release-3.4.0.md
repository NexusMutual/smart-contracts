# Release 3.4.0: Pool and rETH Aggregator

## Github PR

* [feat: add setAssetOracle to Pool and add AggregatorRETH contract](https://github.com/NexusMutual/smart-contracts/pull/1526)

## Contracts to be upgraded

* Pool.sol
* AggregatorRETH.sol

## Contract deployment & verification

#### Pool.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
* Address brute force command
  * Address: `0xcafea77B6f25338e8C7d13defdA7Fb71773a7343`
  * Salt: 47681594
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Pool.constructorArgs' release/3.4.0/config/deployments.json)" \
  Pool
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Pool.constructorArgs' release/3.4.0/config/deployments.json)" \
  -a "$(jq -r '.Pool.expectedAddress' release/3.4.0/config/deployments.json)" \
  -s "$(jq -r '.Pool.salt'            release/3.4.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Pool
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Pool.expectedAddress' release/3.4.0/config/deployments.json)" \
  $(jq -r '.Pool.constructorArgs | .[]' release/3.4.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/capital/Pool.sol:Pool
```

#### AggregatorRETH.sol

* Constructor Params
  * _rETH = `0xae78736Cd615f374D3085123A210448E74Fc6393`
* Address brute force command
  * Address: `0xcafea65F0fC6B2b7B1a1C5d22c0bE6F5fe313016`
  * Salt: 196228209
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.AggregatorRETH.constructorArgs' release/3.4.0/config/deployments.json)" \
  AggregatorRETH
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.AggregatorRETH.constructorArgs' release/3.4.0/config/deployments.json)" \
  -a "$(jq -r '.AggregatorRETH.expectedAddress' release/3.4.0/config/deployments.json)" \
  -s "$(jq -r '.AggregatorRETH.salt'            release/3.4.0/config/deployments.json)" \
  -k -p 1 -b 0.5 AggregatorRETH
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.AggregatorRETH.expectedAddress' release/3.4.0/config/deployments.json)" \
  $(jq -r '.AggregatorRETH.constructorArgs | .[]' release/3.4.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/capital/AggregatorRETH.sol:AggregatorRETH
```
