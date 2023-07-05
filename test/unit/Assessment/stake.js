const { assert, expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const { Zero } = ethers.constants;

describe('stake', function () {
  it("increases the sender's stake", async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const user = fixture.accounts.members[0];
    let stake = { amount: Zero };

    {
      await assessment.connect(user).stake(parseEther('100'));
      const prevStake = stake;
      stake = await assessment.stakeOf(user.address);
      assert(stake.amount.gt(prevStake.amount), 'Expected stake increase');
    }

    {
      await assessment.connect(user).stake(parseEther('100'));
      const prevStake = stake;
      stake = await assessment.stakeOf(user.address);
      assert(stake.amount.gt(prevStake.amount), 'Expected stake increase');
    }
  });

  it('transfers the staked NXM to the assessment contract', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, nxm } = fixture.contracts;
    const user = fixture.accounts.members[0];
    {
      await assessment.connect(user).stake(parseEther('100'));
      const balance = await nxm.balanceOf(assessment.address);
      assert(balance.eq(parseEther('100')));
    }

    {
      await assessment.connect(user).stake(parseEther('100'));
      const balance = await nxm.balanceOf(assessment.address);
      assert(balance.eq(parseEther('200')));
    }
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, master } = fixture.contracts;
    await master.setEmergencyPause(true);

    await expect(assessment.stake(parseEther('100'))).to.revertedWith('System is paused');
  });

  it('emits StakeDeposited event with staker and amount', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [user] = fixture.accounts.members;

    const amount = parseEther('100');
    await expect(assessment.connect(user).stake(amount))
      .to.emit(assessment, 'StakeDeposited')
      .withArgs(user.address, amount);
  });
});
