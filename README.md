[![Build Status](https://travis-ci.org/somish/NexusMutual.svg?branch=master)](https://travis-ci.org/somish/NexusMutual?branch=master)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Requirements
```
Node >= 10
```

### Installing

Clone this repo and install the dependencies:

```
git clone https://github.com/NexusMutual/smart-contracts.git
cd smart-contracts
npm install
```

Compile the contracts using truffle:

```
npx truffle compile
```

To run the test cases use:
```
npm test
```

You can deploy the contracts edit `truffle-config.js` with the require network and run:
```
npx truffle deploy
```
