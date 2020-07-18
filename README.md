[![Build Status](https://travis-ci.org/somish/NexusMutual.svg?branch=master)](https://travis-ci.org/somish/NexusMutual?branch=master)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Requirements
```
Node >= 10
```

### Run

Clone and install dependencies:

```
git clone https://github.com/NexusMutual/smart-contracts.git
cd smart-contracts
npm install
```

Compile using truffle:

```
npx truffle compile
```

Run tests:
```
npm test
```

To deploy the contracts, edit `truffle-config.js` with the required network and run:
```
npx truffle deploy
```
