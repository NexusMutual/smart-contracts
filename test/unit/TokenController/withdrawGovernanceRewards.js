const { ethers } = require('hardhat');
const { Role } = require('../utils').constants;

describe('withdrawGovernanceRewards', function () {
  it('calls claimReward with the address owning the rewards and the given batchSize', async function () {
    const { tokenController, governance } = this.contracts;
    const { members } = this.accounts;

    {
      await governance.setUnclaimedGovernanceRewards(members[2].address, ethers.utils.parseUnits('1'));
      await tokenController.connect(members[0]).withdrawGovernanceRewards(members[2].address, 1);
      const { memberAddress, maxRecords } = await governance.claimRewardLastCalledWith();
      expect(memberAddress).to.be.equal(members[2].address);
      expect(maxRecords).to.be.equal(1);
    }

    {
      await governance.setUnclaimedGovernanceRewards(members[3].address, ethers.utils.parseUnits('1'));
      await tokenController.withdrawGovernanceRewards(members[3].address, 99);
      const { memberAddress, maxRecords } = await governance.claimRewardLastCalledWith();
      expect(memberAddress).to.be.equal(members[3].address);
      expect(maxRecords).to.be.equal(99);
    }
  });

  it('reverts if there are no rewards to withdraw', async function () {
    const { tokenController, governance } = this.contracts;
    const { members } = this.accounts;

    {
      await expect(tokenController.withdrawGovernanceRewards(members[0].address, 1)).to.be.revertedWith(
        'TokenController: No withdrawable governance rewards',
      );
    }

    {
      await governance.setUnclaimedGovernanceRewards(members[0].address, ethers.utils.parseUnits('1'));
      await expect(tokenController.withdrawGovernanceRewards(members[0].address, 0)).not.to.be.revertedWith(
        'TokenController: No withdrawable governance rewards',
      );
    }
  });

  it('tranfers the rewards to the destination address', async function () {
    const { tokenController, governance, nxm } = this.contracts;
    const { members } = this.accounts;

    const balanceBefore = await nxm.balanceOf(members[1].address);
    await governance.setUnclaimedGovernanceRewards(members[1].address, ethers.utils.parseUnits('123'));
    await tokenController.withdrawGovernanceRewards(members[1].address, 0);
    const balanceAfter = await nxm.balanceOf(members[1].address);
    await expect(balanceAfter).to.be.equal(balanceBefore.add(ethers.utils.parseUnits('123')));
  });
});
