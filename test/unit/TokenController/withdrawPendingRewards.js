const { ethers } = require('hardhat');
const { expect } = require('chai');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

describe('withdrawPendingRewards', function () {
  it('reverts if system is paused', async function () {
    const { tokenController, master } = this.contracts;
    const [member] = this.accounts.members;

    await master.setEmergencyPause(true);

    await expect(
      tokenController.connect(member).withdrawPendingRewards(member.address, false, false, 0, []),
    ).to.be.revertedWith('System is paused');
  });

  it('withdraws assessment rewards when fromAssessment param is true', async function () {
    const { tokenController, assessment } = this.contracts;
    const [member] = this.accounts.members;

    const forUser = member.address;
    const batchSize = 1;

    // call with fromAssessment = false
    await tokenController.connect(member).withdrawPendingRewards(forUser, false, false, batchSize, []);

    {
      const calledWithStaker = await assessment.withdrawRewardsLastCalledWithStaker();
      const calledWithBatchSize = await assessment.withdrawRewardsLastCalledWithBatchSize();

      expect(calledWithStaker).to.equal(AddressZero);
      expect(calledWithBatchSize).to.equal(0);
    }

    // call with fromAssessment = true
    await tokenController.connect(member).withdrawPendingRewards(forUser, false, true, batchSize, []);

    {
      const calledWithStaker = await assessment.withdrawRewardsLastCalledWithStaker();
      const calledWithBatchSize = await assessment.withdrawRewardsLastCalledWithBatchSize();

      expect(calledWithStaker).to.equal(forUser);
      expect(calledWithBatchSize).to.equal(batchSize);
    }
  });

  it('withdraws governance rewards when fromGovernance param is true', async function () {
    const { tokenController, governance, nxm } = this.contracts;
    const [member] = this.accounts.members;

    const forUser = member.address;
    const batchSize = 1;

    const governanceRewards = parseEther('10');
    await governance.setUnclaimedGovernanceRewards(forUser, governanceRewards);

    const initialBalance = await nxm.balanceOf(forUser);

    // call with fromGovernance = false
    await tokenController.withdrawPendingRewards(forUser, false, false, batchSize, []);

    {
      const balance = await nxm.balanceOf(forUser);
      const { memberAddress, maxRecords } = await governance.claimRewardLastCalledWith();

      expect(balance).to.equal(initialBalance);
      expect(memberAddress).to.equal(AddressZero);
      expect(maxRecords).to.equal(0);
    }

    // call with fromGovernance = true
    await tokenController.withdrawPendingRewards(forUser, true, false, batchSize, []);

    {
      const balance = await nxm.balanceOf(forUser);
      const { memberAddress, maxRecords } = await governance.claimRewardLastCalledWith();

      expect(balance).to.equal(initialBalance.add(governanceRewards));
      expect(memberAddress).to.equal(forUser);
      expect(maxRecords).to.equal(batchSize);
    }
  });

  it('reverts if no withdrawable governance rewards', async function () {
    const { tokenController } = this.contracts;
    const [member] = this.accounts.members;

    const forUser = member.address;
    const batchSize = 1;

    // call with fromGovernance = false
    await expect(tokenController.withdrawPendingRewards(forUser, true, false, batchSize, [])).to.be.revertedWith(
      'TokenController: No withdrawable governance rewards',
    );
  });
});
