const { accounts, artifacts, web3 } = require('hardhat');

const { toWei } = web3.utils;
const zeroAddress = '0x0000000000000000000000000000000000000000';

const ERC20Mock = artifacts.require('ERC20Mock');
const Pool = artifacts.require('Pool');

async function setup () {

  const assetA = await ERC20Mock.new();
  const assetB = await ERC20Mock.new();

  const pool = await Pool.new(
    [assetA.address, assetB.address],
    [0, 0],
    [toWei('10'), toWei('10')],
    zeroAddress,
    zeroAddress,
    zeroAddress,
    zeroAddress,
  );

  this.contracts = {
    assetA,
    assetB,
    pool,
  };
}

module.exports = setup;
