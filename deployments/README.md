# Nexus Mutual Deployment

This package contains the abis and addresses of the deployed Nexus Mutual contracts.

## Usage

### CommonJS

```javascript
  // import everything in one go
  const deployments = require('@nexusmutual/deployments');
  console.log(`NXM Token address: ${deployments.addresses.NXMToken}`);

  // import addresses only
  const addresses = require('@nexusmutual/deployments/addresses');

  // import abis only
  const abis = require('@nexusmutual/deployments/abis');

  // import a specific abi
  const coverAbi = require('@nexusmutual/deployments/abis/Cover');

  // Create a contract instance
  const ethers = require('ethers');

  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  const coverContract = new ethers.Contract(addresses.Cover, coverAbi, provider);

  const stakingPoolAddress = await coverContract.stakingPool(2);
  console.log(`Staking pool #2 is at: ${stakingPoolAddress}`);
```

### ESM

```javascript
  // import everything in one go
  import deployments from '@nexusmutual/deployments';
  console.log(`NXM Token address (import all): ${deployments.addresses.NXMToken}`);

  // import addresses only
  import addresses from '@nexusmutual/deployments/addresses';
  console.log(`NXM Token address (import addresses): ${addresses.NXMToken}`);

  // import abis only
  import abis from '@nexusmutual/deployments/abis';
  console.log(`Contract list: ${Object.keys(abis).join(', ')}`);

  // import a specific abi and create a contract instance
  import ethers from 'ethers';
  import coverAbi from '@nexusmutual/deployments/abis/Cover';

  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  const coverContract = new ethers.Contract(addresses.Cover, coverAbi, provider);

  const stakingPoolAddress = await coverContract.stakingPool(2);
  console.log(`Staking pool #2 is at: ${stakingPoolAddress}`);
```
