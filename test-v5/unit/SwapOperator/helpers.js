const { ethers } = require('hardhat');
const { pick: lodashPick, values: lodashValues } = require('lodash');

const {
  BigNumber,
  utils: { parseEther, hexlify, randomBytes, isHexString, hexDataLength, keccak256, toUtf8Bytes },
} = ethers;

const daiMinAmount = parseEther('3000');
const daiMaxAmount = parseEther('20000');

const stEthMinAmount = parseEther('10');
const stEthMaxAmount = parseEther('20');

const makeContractOrder = order => {
  return {
    ...order,
    kind: hashUtf(order.kind),
    sellTokenBalance: hashUtf(order.sellTokenBalance),
    buyTokenBalance: hashUtf(order.buyTokenBalance),
  };
};

const makeOrderTuple = contractOrder => {
  return lodashValues(
    lodashPick(contractOrder, [
      'sellToken',
      'buyToken',
      'receiver',
      'sellAmount',
      'buyAmount',
      'validTo',
      'appData',
      'feeAmount',
      'kind',
      'partiallyFillable',
      'sellTokenBalance',
      'buyTokenBalance',
    ]),
  );
};

const hashUtf = str => keccak256(toUtf8Bytes(str));

const lastBlockTimestamp = async () =>
  (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

// helper function to alter a given value
const makeWrongValue = value => {
  if (isHexString(value)) {
    return hexlify(randomBytes(hexDataLength(value)));
  } else if (BigNumber.isBigNumber(value)) {
    return value.add(1);
  } else if (typeof value === 'number') {
    return value + 1;
  } else if (typeof value === 'boolean') {
    return !value;
  } else if (value === 'erc20') {
    return 'internal';
  } else if (typeof value === 'string') {
    return value + '!';
  } else {
    throw new Error(`Unsupported value while fuzzing order: ${value}`);
  }
};

module.exports = {
  makeWrongValue,
  lastBlockTimestamp,
  makeOrderTuple,
  makeContractOrder,
  daiMaxAmount,
  daiMinAmount,
  stEthMaxAmount,
  stEthMinAmount,
  lodashValues,
};
