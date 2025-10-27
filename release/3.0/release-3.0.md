# Release 3.0: Assessment, Claims, Registry and Governor contracts

## Github PR

* [audit: governance and assessments august 2025](https://github.com/NexusMutual/smart-contracts/pull/1429)

## Contracts to be deployed / upgraded

__Phase 0:__

* LegacyAssessment.sol
* LegacyMemberRoles.sol
* TemporaryGovernance.sol

__Phase 2:__

* Assessments.sol
* Claims.sol
* Cover.sol
* CoverBroker.sol
* CoverNFTDescriptor.sol
* CoverProducts.sol
* Governor.sol
* LimitOrders.sol
* NXMaster.sol
* Pool.sol
* Ramm.sol
* Registry.sol
* SafeTracker.sol
* StakingProducts.sol
* StakingViewer.sol
* SwapOperator.sol
* TokenController.sol
* VotePower.sol

## Contract deployment & verification

### Upgradable Proxies:

#### CREATE1 Proxy

* deployments-config.js - .create1Proxies

```bash
node scripts/create1/find-address.js cafea
```

**Registry** (create1)
  * Contract Address: 0xcafea2c575550512582090AA06d0a069E7236b9e
  * Deployer Address: 0x68bAd3bDd72d7397D68a22C5e98911E7E45EE395

#### CREATE2 Registry Factory Proxies

* deployments-config.js - .create2Proxies

```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js -t cafea -f 0xcafea2c575550512582090AA06d0a069E7236b9e UpgradableProxy
```

* Pool (P1 ~ 91)
  * Address: `0xcafea91714e55756C125B509274eDE9Bc91697CB`
  * Salt: 38025100935
* Governor (GO ~ 60)
  * Address: `0xcafea6063d4Ec6b045d9676e58897C1f0882Ca32`
  * Salt: 1890277623171
* Claims (CL ~ c1)
  * Address: `0xcafeac11196a5CC352938aEEd545b32d5b9646fa`
  * Salt: 3782112694854
* SwapOperator (SO ~ 50)
  * Address: `0xcafea501b78175F178b899625F06BC618ef06EB8`
  * Salt: 38495587836
* Assessments - (AS ~ 55)
  * Address: `0xcafea55aE10FB1bf21F7aF7a285488C42B59a24A`
  * Salt: 3781429284683

### Proxy Implementations (deployments.json)

#### Assessments.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
* Address brute force command
  * Address: `0xcafeaa54703C9829B697086785f1E2945be6Be20`
  * Salt: 330944124
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Assessments.constructorArgs' release/3.0/config/deployments.json)" \
  Assessments
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Assessments.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.Assessments.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.Assessments.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Assessments
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Assessments.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.Assessments.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/assessment/Assessments.sol:Assessments
```

#### Cover.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * _stakingPoolImplementation = `0xcafeade1872f14adc0a03Ec7b0088b61D76ec729`
  * _verifyingAddress = `0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62`
* Address brute force command
  * Address: `0xcafea6DcD8Ef5836E300b4E62E9a90975b0477EA`
  * Salt: 15283923
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Cover.constructorArgs' release/3.0/config/deployments.json)" \
  Cover
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Cover.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.Cover.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.Cover.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Cover
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Cover.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.Cover.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/cover/Cover.sol:Cover
```

#### CoverNFTDescriptor.sol

* Constructor Params
  * _master = `0x01BFd82675DBCc7762C84019cA518e701C0cD07e`
* Address brute force command
  * Address: `0xcafeaCFc311451c5ec176bba27a1E802caC2fCeF`
  * Salt: 24836729
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.CoverNFTDescriptor.constructorArgs' release/3.0/config/deployments.json)" \
  CoverNFTDescriptor
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.CoverNFTDescriptor.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.CoverNFTDescriptor.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.CoverNFTDescriptor.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 CoverNFTDescriptor
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.CoverNFTDescriptor.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.CoverNFTDescriptor.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/cover/CoverNFTDescriptor.sol:CoverNFTDescriptor
```

#### CoverProducts.sol

* Constructor Params
  * N/A
* Address brute force command
  * Address: `0xcafea4A986A8d88dc63095034cE36bC8387A8534`
  * Salt: 2295602
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  CoverProducts
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -a "$(jq -r '.CoverProducts.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.CoverProducts.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 CoverProducts
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.CoverProducts.expectedAddress' release/3.0/config/deployments.json)" \
  --contract contracts/modules/cover/CoverProducts.sol:CoverProducts
```

#### Claims.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
* Address brute force command
  * Address: `0xcafea6f4d69BD1ef5936a4b9F23F7A0301f4C401`
  * Salt: 16868614
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Claims.constructorArgs' release/3.0/config/deployments.json)" \
  Claims
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Claims.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.Claims.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.Claims.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Claims
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Claims.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.Claims.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/assessment/Claims.sol:Claims
```

#### Governor.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
* Address brute force command
  * Address: `0xcafea466bF6dEFe480cdd54056C020c63b7DA830`
  * Salt: 1779232
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Governor.constructorArgs' release/3.0/config/deployments.json)" \
  Governor
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Governor.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.Governor.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.Governor.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Governor
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Governor.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.Governor.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/governance/Governor.sol:Governor
```

#### LimitOrders.sol

* Constructor Params
  * _nxmTokenAddress = `0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B`
  * _wethAddress = `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
  * _internalSolver = `0xA2dB05Ab09b00725f0C0327df6EFcbdA3F584C97`
* Address brute force command
  * Address: `0xcafea69b744f907C22Ad7F17AA5a94546f6B5d13`
  * Salt: 19789036
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.LimitOrders.constructorArgs' release/3.0/config/deployments.json)" \
  LimitOrders
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.LimitOrders.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.LimitOrders.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.LimitOrders.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 LimitOrders
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.LimitOrders.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.LimitOrders.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/cover/LimitOrders.sol:LimitOrders
```

#### NXMaster.sol

* Constructor Params
  * N/A
* Address brute force command
  * Address: `0xcafea22375708092fd1Ae65CDf93C9c2BA58A438`
  * Salt: 67834859
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  NXMaster
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -a "$(jq -r '.NXMaster.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.NXMaster.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 NXMaster
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.NXMaster.expectedAddress' release/3.0/config/deployments.json)" \
  --contract contracts/modules/governance/NXMaster.sol:NXMaster
```

#### Pool.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
* Address brute force command
  * Address: `0xcafea77A34BabEcC065eBe9AE0EAE6d0C4AECfCA`
  * Salt: 1873535
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Pool.constructorArgs' release/3.0/config/deployments.json)" \
  Pool
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Pool.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.Pool.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.Pool.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Pool
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Pool.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.Pool.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/capital/Pool.sol:Pool
```

#### Ramm.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * initialSpotPriceB = `9852395000000000`
    * initialSpotPriceB param is ignored as the Ramm is already initialized
    * using the same as the [previous deploy's value](https://etherscan.io/address/0xcafea041Ea415F4f6Dd81aF2297C3f3906b5BD12#code)
* Address brute force command
  * Address: `0xcafea5fB679d6c57e47faaBB9d385E38B59eC9f5`
  * Salt: 4289586
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Ramm.constructorArgs' release/3.0/config/deployments.json)" \
  Ramm
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Ramm.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.Ramm.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.Ramm.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Ramm
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Ramm.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.Ramm.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/capital/Ramm.sol:Ramm
```

#### Registry.sol

* Constructor Params
  * _verifyingAddress = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * _master = `0x01BFd82675DBCc7762C84019cA518e701C0cD07e`
* Address brute force command
  * Address: `0xcafeaC64cBE73e6e8973b52cDAE8982DE6Fb500E`
  * Salt: 269845781
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Registry.constructorArgs' release/3.0/config/deployments.json)" \
  Registry
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.Registry.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.Registry.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.Registry.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 Registry
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.Registry.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.Registry.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/governance/Registry.sol:Registry
```

#### SafeTracker.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * _investmentLimit = `25000000000000`
  * _safe = `0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e`
  * _usdc = `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
  * _weth = `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
  * _aweth = `0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8`
  * _debtUsdc = `0x72E95b8931767C79bA4EeE721354d6E99a61D004`
* Address brute force command
  * Address: `0xcafea05ab88D2549d4aAf3739F8493fCBB279989`
  * Salt: 377081778
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.SafeTracker.constructorArgs' release/3.0/config/deployments.json)" \
  SafeTracker
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.SafeTracker.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.SafeTracker.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.SafeTracker.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 SafeTracker
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.SafeTracker.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.SafeTracker.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/capital/SafeTracker.sol:SafeTracker
```

#### StakingProducts.sol

* Constructor Params
  * _coverContract = `0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62`
  * _stakingPoolFactory = `0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3`
* Address brute force command
  * Address: `0xcafeae132d8350775624f12185Dfac12ed6Bb819`
  * Salt: 21864975
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.StakingProducts.constructorArgs' release/3.0/config/deployments.json)" \
  StakingProducts
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.StakingProducts.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.StakingProducts.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.StakingProducts.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 StakingProducts
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.StakingProducts.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.StakingProducts.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/staking/StakingProducts.sol:StakingProducts
```

#### SwapOperator.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * _cowSettlement = `0x9008D19f58AAbD9eD0D60971565AA8510560ab41`
  * _enzymeV4VaultProxyAddress = `0x27F23c710dD3d878FE9393d93465FeD1302f2EbD`
  * _weth = `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
* Address brute force command
  * Address: `0xcafea1Eb0aB6731044E4842c12317036b58D26bE`
  * Salt: 12981051
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.SwapOperator.constructorArgs' release/3.0/config/deployments.json)" \
  SwapOperator
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.SwapOperator.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.SwapOperator.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.SwapOperator.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 SwapOperator
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.SwapOperator.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.SwapOperator.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/capital/SwapOperator.sol:SwapOperator
```

#### TokenController.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
* Address brute force command
  * Address: `0xcafea535C1613d3f3339d2cC85F758095D754f80`
  * Salt: 45020786
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.TokenController.constructorArgs' release/3.0/config/deployments.json)" \
  TokenController
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.TokenController.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.TokenController.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.TokenController.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 TokenController
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.TokenController.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.TokenController.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/token/TokenController.sol:TokenController
```

### Non-proxy Implementations (deployments.json)

#### VotePower.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * _owner = `0x7CB8e530c3310fe192b07315A3ccaD440cb7281c`
* Address brute force command
  * Address: `0xCBcbcBCbfa2EDa48a41Da0711E1f3D7B42605Cc9`
  * Salt: 233904542
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.VotePower.constructorArgs' release/3.0/config/deployments.json)" \
  VotePower
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.VotePower.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.VotePower.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.VotePower.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 VotePower
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.VotePower.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.VotePower.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/governance/VotePower.sol:VotePower
```

#### StakingViewer.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
* Address brute force command
  * Address: `0xcafea5c7d25a192ba70ECA0E2dB62F835c1cF81F`
  * Salt: 132035513
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cafea \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.StakingViewer.constructorArgs' release/3.0/config/deployments.json)" \
  StakingViewer
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.StakingViewer.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.StakingViewer.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.StakingViewer.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 StakingViewer
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.StakingViewer.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.StakingViewer.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/modules/staking/StakingViewer.sol:StakingViewer
```

#### CoverBroker.sol

* Constructor Params
  * _registry = `0xcafea2c575550512582090AA06d0a069E7236b9e`
  * _owner = `0x7CB8e530c3310fe192b07315A3ccaD440cb7281c`
* Address brute force command
  * Address: `0xCBcbcBCbfa2EDa48a41Da0711E1f3D7B42605Cc9`
  * Salt: 233904542
```bash
ENABLE_OPTIMIZER=1 node scripts/create2/find-salt.js \
  -t cbcbcbcb \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.CoverBroker.constructorArgs' release/3.0/config/deployments.json)" \
  CoverBroker
```
* Deploy command
  * replace the baseGasFee parameter (-b 0.5) with the [current gwei gas price](https://etherscan.io/gastracker)
```bash
HARDHAT_NETWORK=mainnet ENABLE_OPTIMIZER=1 node scripts/create2/deploy.js \
  -f 0xfac7011663910F75CbE1E25539ec2D7529f93C3F \
  -c "$(jq -c '.CoverBroker.constructorArgs' release/3.0/config/deployments.json)" \
  -a "$(jq -r '.CoverBroker.expectedAddress' release/3.0/config/deployments.json)" \
  -s "$(jq -r '.CoverBroker.salt'            release/3.0/config/deployments.json)" \
  -k -p 1 -b 0.5 CoverBroker
```
* Verify command
```bash
ENABLE_OPTIMIZER=1 npx hardhat verify --network mainnet \
  "$(jq -r '.CoverBroker.expectedAddress' release/3.0/config/deployments.json)" \
  $(jq -r '.CoverBroker.constructorArgs | .[]' release/3.0/config/deployments.json | xargs -I {} echo '"{}"' | xargs) \
  --contract contracts/external/cover/CoverBroker.sol:CoverBroker
```
