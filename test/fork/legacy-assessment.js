const { ethers } = require('hardhat');
const { expect } = require('chai');

const { getSigner } = require('./utils');

it('withdrawRewards should return user rewards', async function () {
  const membersWithWithdrawableRewards = [
    '0x5fa07227d05774c2ff11c2425919d14225a38dbb',
    '0x5929cc4d10b6a1acc5bf5d221889f10251c628a1',
    '0xf3bfac9e828bc904112e7bb516d4cd4e6468f785',
    '0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0',
  ];

  // Get before rewards and NXM balance for each member
  const beforeMap = {};
  await Promise.all(
    membersWithWithdrawableRewards.map(async member => {
      const [rewards, balance] = await Promise.all([this.assessment.getRewards(member), this.nxm.balanceOf(member)]);
      expect(rewards.withdrawableAmountInNXM).to.be.gt(0n, `Member ${member} should have withdrawable rewards`);
      beforeMap[member] = { rewards, balance };
    }),
  );

  // Withdraw all rewards for each member (batchSize 0 ~ withdraw all)
  for (const member of membersWithWithdrawableRewards) {
    await this.assessment.withdrawRewards(member, 0);
  }

  // Verify rewards were withdrawn and NXM balance increased
  // for (const member of membersWithWithdrawableRewards) {
  await Promise.all(
    membersWithWithdrawableRewards.map(async member => {
      const [afterRewards, afterBalance] = await Promise.all([
        this.assessment.getRewards(member),
        this.nxm.balanceOf(member),
      ]);
      const before = beforeMap[member];

      // Verify withdrawable rewards are now 0 (or less than before)
      expect(afterRewards.withdrawableAmountInNXM).to.be.lt(
        before.rewards.withdrawableAmountInNXM,
        `Member ${member} should have fewer withdrawable rewards after withdrawal`,
      );

      // Verify NXM balance increased by the withdrawn amount
      const expectedBalance = before.balance + before.rewards.withdrawableAmountInNXM;
      expect(afterBalance).to.equal(
        expectedBalance,
        `Member ${member} balance should be ${expectedBalance.toString()} but got ${afterBalance.toString()}`,
      );

      // Verify rewardsWithdrawableFromIndex was updated
      const stakeInfo = await this.assessment.stakeOf(member);
      expect(stakeInfo.rewardsWithdrawableFromIndex).to.be.gte(
        before.rewards.withdrawableUntilIndex,
        `Member ${member} rewardsWithdrawableFromIndex should be updated`,
      );
    }),
  );
});

it('calling unstakeAllForBatch should return user stake', async function () {
  console.info('Snapshot ID unstakeAllForBatch: ', await this.evm.snapshot());

  // Import addresses from the deployments package
  const { addresses } = require('@nexusmutual/deployments');

  // Define minimal ABI with just the functions we need
  const legacyAssessmentAbi = [
    'function unstakeAllForBatch(address[] calldata stakers) external',
    'function stakeOf(address staker) external view returns (' +
      'uint256 amount, uint256 rewardsWithdrawableFromIndex, uint256 fraudCount)',
  ];

  // Create contract instance using the Assessment contract address with the legacy ABI
  const legacyAssessment = await ethers.getContractAt(legacyAssessmentAbi, addresses.Assessment);
  // console.info('Snapshot ID after Legacy Assessment Upgrade: ', await this.evm.snapshot());

  const membersWithStake = [
    // '0x87b2a7559d85f4653f13e6546a14189cd5455d45',
    '0x5fa07227d05774c2ff11c2425919d14225a38dbb',
    '0x5929cc4d10b6a1acc5bf5d221889f10251c628a1',
    '0xf3bfac9e828bc904112e7bb516d4cd4e6468f785',
    '0x2a156b05ae6ab6ea14b4b5f14dc6fba08c320de2',
    '0xfec65468cf9ab04cea40b113bf679e82973bdb58',
    '0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0',
  ];

  // Get before assessment stake and NXM balance for each member
  const beforeMap = {};
  await Promise.all(
    membersWithStake.map(async member => {
      const [stake, balance] = await Promise.all([legacyAssessment.stakeOf(member), this.nxm.balanceOf(member)]);
      expect(stake.amount).to.be.gt(0n, `Member ${member} should have stake before unstaking`);
      beforeMap[member] = { stake, balance };
    }),
  );

  // Unstake all for batch using the legacy assessment contract
  const hugh = await getSigner('0x87b2a7559d85f4653f13e6546a14189cd5455d45');
  const tx = await legacyAssessment.connect(hugh).unstakeAllForBatch(membersWithStake);
  await tx.wait();

  // Verify each member now has 0 stake and correct NXM balance
  await Promise.all(
    membersWithStake.map(async member => {
      const [afterStake, afterBalance] = await Promise.all([
        legacyAssessment.stakeOf(member),
        this.nxm.balanceOf(member),
      ]);
      const before = beforeMap[member];

      // Verify each member now has 0 stake
      expect(afterStake.amount).to.equal(0, `Member ${member} should have 0 stake after unstaking`);
      expect(afterStake.rewardsWithdrawableFromIndex).to.equal(
        before.stake.rewardsWithdrawableFromIndex,
        `Member ${member} rewardsWithdrawableFromIndex should remain unchanged`,
      );
      expect(afterStake.fraudCount).to.equal(
        before.stake.fraudCount,
        `Member ${member} fraudCount should remain unchanged`,
      );

      // Verify each member NXM balance increased by their stake amount
      const expectedBalance = before.balance + before.stake.amount;
      expect(afterBalance).to.equal(
        expectedBalance,
        `Member ${member} balance should be ${expectedBalance.toString()} but got ${afterBalance.toString()}`,
      );
    }),
  );
});
// });

// TODO: withdraw governance rewards tests
