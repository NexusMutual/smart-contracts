const { assert } = require('chai');
const { ethers } = require('hardhat');

const { parseEther } = ethers.utils;
const { Zero } = ethers.constants;

describe('depositStake', function () {
  it("increases the sender's stake", async function () {
    const { assessment } = this.contracts;
    const user = this.accounts[1];
    let stake = { amount: Zero };
    await assessment.connect(user).depositStake(parseEther('100'));
    prevStake = stake;
    stake = await assessment.stakeOf(user.address);
    assert(stake.amount.gt(prevStake.amount), 'Expected stake increase');

    await assessment.connect(user).depositStake(parseEther('100'));
    prevStake = stake;
    stake = await assessment.stakeOf(user.address);
    assert(stake.amount.gt(prevStake.amount), 'Expected stake increase');
  });

  it('transfers the staked NXM to the assessment contract', async function () {
    const { assessment, nxm } = this.contracts;
    const user = this.accounts[1];
    {
      await assessment.connect(user).depositStake(parseEther('100'));
      const balance = await nxm.balanceOf(assessment.address);
      assert(balance.eq(parseEther('100')));
    }

    {
      await assessment.connect(user).depositStake(parseEther('100'));
      const balance = await nxm.balanceOf(assessment.address);
      assert(balance.eq(parseEther('200')));
    }
  });
});
