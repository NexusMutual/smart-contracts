const { expect } = require('chai');

const membersWithWithdrawableRewards = [
  '0x5fa07227d05774c2ff11c2425919d14225a38dbb',
  '0x5929cc4d10b6a1acc5bf5d221889f10251c628a1',
  '0xf3bfac9e828bc904112e7bb516d4cd4e6468f785',
  '0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0',
];

const membersWithStake = [
  // '0x87b2a7559d85f4653f13e6546a14189cd5455d45',
  '0x5fa07227d05774c2ff11c2425919d14225a38dbb',
  '0x5929cc4d10b6a1acc5bf5d221889f10251c628a1',
  '0xf3bfac9e828bc904112e7bb516d4cd4e6468f785',
  '0x2a156b05ae6ab6ea14b4b5f14dc6fba08c320de2',
  '0xfec65468cf9ab04cea40b113bf679e82973bdb58',
  '0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0',
];

it('withdrawRewards should return user rewards', async function () {
  for (const member of membersWithWithdrawableRewards) {
    // get values before withdraw
    const balanceBefore = await this.nxm.balanceOf(member);
    const { totalPendingAmountInNXM: rewardsBefore } = await this.legacyAssessment.getRewards(member);
    expect(rewardsBefore).to.be.gt(0n, `Member ${member} should have withdrawable rewards`);

    // withdraw
    await this.legacyAssessment.withdrawRewards(member, 0);

    const { totalPendingAmountInNXM: rewardsAfter } = await this.legacyAssessment.getRewards(member);
    const balanceAfter = await this.nxm.balanceOf(member);

    // Verify withdrawable rewards are now 0 (or less than before)
    expect(rewardsAfter).to.equal(0n, `Member ${member} should have 0 withdrawable rewards after withdrawal`);

    // Verify NXM balance increased by the withdrawn amount
    const expectedBalance = balanceBefore + rewardsBefore;
    expect(balanceAfter).to.equal(
      expectedBalance,
      `Member ${member} balance should be ${expectedBalance.toString()} but got ${balanceAfter.toString()}`,
    );
  }
});

it('calling unstakeAllForBatch should return user stake', async function () {
  // Get before assessment stake and NXM balance for each member
  const beforeMap = {};

  for (const member of membersWithStake) {
    const stake = await this.legacyAssessment.stakeOf(member);
    const balance = await this.nxm.balanceOf(member);
    expect(stake.amount).to.be.gt(0n, `Member ${member} should have stake before unstaking`);
    beforeMap[member] = { stake, balance };
  }

  // Unstake all for batch using the legacy assessment contract
  await this.legacyAssessment.unstakeAllForBatch(membersWithStake, { gasLimit: 21e6 });

  // Verify each member now has 0 stake and correct NXM balance
  for (const member of membersWithStake) {
    const afterStake = await this.legacyAssessment.stakeOf(member);
    const afterBalance = await this.nxm.balanceOf(member);
    const before = beforeMap[member];

    // Verify each member now has 0 stake
    expect(afterStake.amount).to.equal(0, `Member ${member} should have 0 stake after unstaking`);

    // Verify each member NXM balance increased by their stake amount
    const expectedBalance = before.balance + before.stake.amount;
    expect(afterBalance).to.equal(
      expectedBalance,
      `Member ${member} balance should be ${expectedBalance.toString()} but got ${afterBalance.toString()}`,
    );
  }
});

// TODO: withdraw governance rewards tests
