const { ethers } = require('hardhat');
const { expect } = require('chai');

const { BigNumber } = ethers;
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

  it('withdraws pooled staking rewards when givern an array of WithdrawFromStakingPoolParams', async function () {
    const { tokenController } = this.contracts;

    const stakingPool1 = await ethers.deployContract('TCMockStakingPool');
    const stakingPool2 = await ethers.deployContract('TCMockStakingPool');

    const trancheIds1 = [1, 2, 3, 4].map(e => BigNumber.from(e));
    const trancheIds2 = [3, 4].map(e => BigNumber.from(e));
    const trancheIds3 = [5, 6, 7].map(e => BigNumber.from(e));

    const nfts1 = [
      { id: 1, trancheIds: trancheIds1 },
      { id: 3, trancheIds: trancheIds3 },
    ];
    const nfts2 = [{ id: 2, trancheIds: trancheIds2 }];

    const params = [
      { poolAddress: stakingPool1.address, nfts: nfts1 },
      { poolAddress: stakingPool2.address, nfts: nfts2 },
    ];

    await tokenController.withdrawPendingRewards(AddressZero, false, false, 0, params);

    {
      const calls = await stakingPool1.calls();
      const [
        withdrawCalledWithTokenId,
        withdrawCalledWithStake,
        withdrawCalledWithRewards,
        withdrawCalledWithTrancheIds,
      ] = await stakingPool1.withdrawCalledWith(1);

      expect(calls).to.equal(nfts1.length);
      expect(withdrawCalledWithTokenId).to.equal(nfts1[0].id);
      expect(withdrawCalledWithStake).to.equal(false);
      expect(withdrawCalledWithRewards).to.equal(true);
      expect(withdrawCalledWithTrancheIds).to.deep.equal(nfts1[0].trancheIds);
    }

    {
      const [
        withdrawCalledWithTokenId,
        withdrawCalledWithStake,
        withdrawCalledWithRewards,
        withdrawCalledWithTrancheIds,
      ] = await stakingPool1.withdrawCalledWith(2);

      expect(withdrawCalledWithTokenId).to.equal(nfts1[1].id);
      expect(withdrawCalledWithStake).to.equal(false);
      expect(withdrawCalledWithRewards).to.equal(true);
      expect(withdrawCalledWithTrancheIds).to.deep.equal(nfts1[1].trancheIds);
    }

    {
      const calls = await stakingPool2.calls();
      const [
        withdrawCalledWithTokenId,
        withdrawCalledWithStake,
        withdrawCalledWithRewards,
        withdrawCalledWithTrancheIds,
      ] = await stakingPool2.withdrawCalledWith(1);

      expect(calls).to.equal(nfts2.length);
      expect(withdrawCalledWithTokenId).to.equal(nfts2[0].id);
      expect(withdrawCalledWithStake).to.equal(false);
      expect(withdrawCalledWithRewards).to.equal(true);
      expect(withdrawCalledWithTrancheIds).to.deep.equal(nfts2[0].trancheIds);
    }
  });
});
