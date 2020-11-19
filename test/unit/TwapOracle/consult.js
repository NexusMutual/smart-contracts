const { artifacts, web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');

const { contracts } = require('./setup');
const { setNextBlockTime } = require('../utils').hardhat;

const { toBN } = web3.utils;

const PERIOD_SIZE = 1800;
const PERIODS_PER_WINDOW = 8;
const timestampToBucket = timestamp => toBN(timestamp).divn(PERIOD_SIZE).modn(PERIODS_PER_WINDOW);

/** @var {ToMockUniswapPairContract} UniswapPair */
const UniswapPair = artifacts.require('TOMockUniswapPair');

describe('consult', function () {

});
