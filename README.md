[![Build Status](https://travis-ci.org/somish/NexusMutual.svg?branch=master)](https://travis-ci.org/somish/NexusMutual?branch=master)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Requirements
```
Node >= 10
```

### Installing

Firstly, you need to clone this repo. You can do so using the following git command:

```
git clone https://github.com/NexusMutual/smart-contracts.git
```

Now, It's time to install the dependencies. Enter the smart-contracts directory and use

```
npm install
```

Make sure you delete folder `bitcore-lib` from node_modules inside modules `eth-lightwallet` and `bitcore-mnemonic`

We need to compile the contracts before deploying. We'll be using truffle for that:

```
npx truffle compile
```

To run the test cases use:
```
npm test
```

You can deploy the contracts using the migrate script:
```
npx truffle deploy
```
