const { accounts, artifacts, web3 } = require('hardhat');
const { assert } = require('chai');

const { ether } = require('../utils').helpers;
const { contracts } = require('./setup');

const [owner] = accounts;

describe('update', function () {

  it('should get the current reserves and store them in the correct bucket', async function () {

    const { oracle, router, tokenA, weth, wethAPair } = contracts();

    // unreachable in this test future
    const deadline = 1800000000;

    await weth.deposit({ value: ether('100') });
    await tokenA.mint(owner, ether('100'));

    await tokenA.approve(router.address, ether('50'));
    await weth.approve(router.address, ether('50'));

    await router.addLiquidity(
      weth.address, tokenA.address, // tokens
      ether('50'), ether('50'), // desired amounts
      0, 0, // minimum amounts
      owner, deadline,
    );

    // const { _reserve0, _reserve1, _blockTimestampLast } = await wethAPair.getReserves();
    // console.log({
    //   _reserve0: _reserve0.toString(),
    //   _reserve1: _reserve1.toString(),
    //   _blockTimestampLast: _blockTimestampLast.toString(),
    // });

  });

});
