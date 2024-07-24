# Nexus Mutual Deployment

This package contains the abis and addresses of the deployed Nexus Mutual contracts.

## Usage

### Variables

`addresses`:
Contains addresses of all contracts.

Example:

```typescript
import { addresses } from '@nexusmutual/deployments';

console.log(addresses.Assessment); // Outputs: 0x0E801D84Fa9...
```

`abis`:
A map which contains abi definitions for all contracts.

Example:

```typescript
import { abis } from '@nexusmutual/deployments';

console.log(abis.Assessment); // Outputs: [{ inputs: [{ internalType: "ad...
```

You can also import them in a treeshakable manner:

```typescript
import { Assessment as AssessmentAbi } from '@nexusmutual/deployments';

console.log(AssessmentAbi); // Outputs: [{ inputs: [{ internalType: "ad...
```

### Exported ABIs

The addresses and ABIs are also exported as `addresses.json` and `abis/*.json` for convenience. These files are located in the `dist/data` folder. You can reference them directly in `node_modules` as follows:

```
node_modules/@nexusmutual/deployments/dist/data/addresses.json
```

or

```
node_modules/@nexusmutual/deployments/dist/data/abis/Assessment.json
```

## Building the Package

Run build script:

```shell
npm run deployments:build
```

This script will generate abis and typings for contracts defined by `contractList` in the `build.js` file using Hardhat. The script will also auto update the `package.json` version.

## Deploying locally

The script requires two environment variables to run:

```
# These can be found in .env.sample
ADDRESSES_FILE=./deployments/src/addresses.json
ABI_DIR=./deployments/generated/abis
```

These variables specify the output location of the generated addresses and ABIs. On these default locations they will be picked up by the build, which can be useful for local development in combination with `npm link`. See the [local development docs](https://www.notion.so/nxmcommunity/Local-development-95f84f09cbfb4b90bcdcba52e1d2fa90?pvs=4) for more details.
