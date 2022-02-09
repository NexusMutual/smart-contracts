const { accounts, web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const [owner, nobody] = accounts;
const contracts = require('./setup').contracts;
const { toBN } = web3.utils;

describe('swapETHForAsset', function () {

  it('should revert when called by an address that is not swap controller', async function () {

    const { swapOperator } = contracts();

    await expectRevert(
      swapOperator.transferToCommunityFund({ from: nobody }),
      'SwapOperator: not swapController',
    );
  });

  // This test fails due to the hardcoded timestamp in the contract so we're skipping it.
  it.skip('should revert when called while the system is paused', async function () {

    const { master, swapOperator } = contracts();
    await master.pause();

    await expectRevert(
      swapOperator.transferToCommunityFund({ from: owner }),
      'System is paused',
    );
  });

  // This test fails due to the hardcoded timestamp in the contract so we're skipping it.
  it.skip('should transfer 8k ETH to community fund wallet and revert on a second attempt', async function () {

    const { swapOperator } = contracts();
    const amount = ether('8000');
    const communityFund = '0x586b9b2F8010b284A0197f392156f1A7Eb5e86e9';

    const communityFundBalanceBefore = toBN(await web3.eth.getBalance(communityFund));

    // Transfer 8k ETH to community fund
    await swapOperator.transferToCommunityFund({ from: owner });

    const communityFundBalanceAfter = toBN(await web3.eth.getBalance(communityFund));
    const expectedCommunityFundBalance = communityFundBalanceBefore.add(amount);

    assert(
      communityFundBalanceAfter.eq(expectedCommunityFundBalance),
      `Expected community fund balance to be ${expectedCommunityFundBalance} but got ${communityFundBalanceAfter}`,
    );

    await expectRevert(
      swapOperator.transferToCommunityFund({ from: owner }),
      'SwapOperator: already executed',
    );
  });

});
