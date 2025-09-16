const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('withdrawGovernanceRewardsTo', function () {
  it('reverts if the system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, master } = fixture.contracts;
    const { members } = fixture.accounts;

    await master.setEmergencyPause(true);

    await expect(
      tokenController.connect(members[0]).withdrawGovernanceRewardsTo(members[0].address, 1),
    ).to.be.revertedWith('System is paused');
  });

  it("calls claimReward with the sender's address and the given batchSize", async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, governance } = fixture.contracts;
    const { members } = fixture.accounts;

    {
      await governance.setUnclaimedGovernanceRewards(members[0].address, ethers.utils.parseUnits('1'));
      await tokenController.connect(members[0]).withdrawGovernanceRewardsTo(members[1].address, 1);
      const { memberAddress, maxRecords } = await governance.claimRewardLastCalledWith();
      expect(memberAddress).to.be.equal(members[0].address);
      expect(maxRecords).to.be.equal(1);
    }

    {
      await governance.setUnclaimedGovernanceRewards(members[0].address, ethers.utils.parseUnits('1'));
      await tokenController.connect(members[0]).withdrawGovernanceRewardsTo(members[2].address, 99);
      const { memberAddress, maxRecords } = await governance.claimRewardLastCalledWith();
      expect(memberAddress).to.be.equal(members[0].address);
      expect(maxRecords).to.be.equal(99);
    }
  });

  it('reverts if there are no rewards to withdraw', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, governance } = fixture.contracts;
    const { members } = fixture.accounts;

    await expect(
      tokenController.connect(members[0]).withdrawGovernanceRewardsTo(members[1].address, 1),
    ).to.be.revertedWithCustomError(tokenController, 'NoWithdrawableGovernanceRewards');

    await governance.setUnclaimedGovernanceRewards(members[0].address, ethers.utils.parseUnits('1'));
    await expect(
      tokenController.connect(members[0]).withdrawGovernanceRewardsTo(members[1].address, 0),
    ).not.to.be.revertedWithCustomError(tokenController, 'NoWithdrawableGovernanceRewards');
  });

  it('tranfers the rewards to the destination address', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, governance, nxm } = fixture.contracts;
    const { members } = fixture.accounts;

    const balanceBefore = await nxm.balanceOf(members[1].address);
    await governance.setUnclaimedGovernanceRewards(members[0].address, ethers.utils.parseUnits('123'));
    await tokenController.connect(members[0]).withdrawGovernanceRewardsTo(members[1].address, 0);
    const balanceAfter = await nxm.balanceOf(members[1].address);
    await expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseUnits('123')));
  });

  it('allows non-member addresses to send unwithdrawn rewards to member addresses', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, governance, nxm } = fixture.contracts;
    const { members, nonMembers } = fixture.accounts;

    const balanceBefore = await nxm.balanceOf(members[1].address);
    await governance.setUnclaimedGovernanceRewards(nonMembers[0].address, ethers.utils.parseUnits('123'));
    await tokenController.connect(nonMembers[0]).withdrawGovernanceRewardsTo(members[1].address, 0);
    const balanceAfter = await nxm.balanceOf(members[1].address);
    await expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseUnits('123')));
  });
});
