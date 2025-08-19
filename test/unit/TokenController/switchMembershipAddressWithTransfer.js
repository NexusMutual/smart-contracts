const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther, MaxUint256 } = ethers;

describe('switchMembershipAddressWithTransfer', function () {
  it('reverts if caller is not registry', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;

    await expect(
      tokenController.switchMembershipAddressWithTransfer(member.address, nonMember.address),
    ).to.be.revertedWithCustomError(tokenController, 'Unauthorized');
  });

  it('switch membership address and transfer everything', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;
    const [stakingProducts] = fixture.accounts.stakingProducts;
    const poolId = 150;

    await impersonateAccount(registry.target);
    const registrySigner = await ethers.provider.getSigner(registry.target);
    await setBalance(registry.target, parseEther('1'));

    await nxm.connect(member).approve(tokenController, MaxUint256);
    // Set old manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, member.address);

    const oldMemberAddressBalanceBefore = await nxm.balanceOf(member.address);
    const newMemberAddressBalanceBefore = await nxm.balanceOf(nonMember.address);
    const isOldAddressWhitelistedBefore = await nxm.whiteListed(member.address);
    const isNewAddressWhitelistedBefore = await nxm.whiteListed(nonMember.address);

    await tokenController
      .connect(registrySigner)
      .switchMembershipAddressWithTransfer(member.address, nonMember.address);

    const oldMemberAddressBalanceAfter = await nxm.balanceOf(member.address);
    const newMemberAddressBalanceAfter = await nxm.balanceOf(nonMember.address);
    const isOldAddressWhitelistedAfter = await nxm.whiteListed(member.address);
    const isNewAddressWhitelistedAfter = await nxm.whiteListed(nonMember.address);

    expect(newMemberAddressBalanceBefore).to.be.equal(0);
    expect(isOldAddressWhitelistedBefore).to.be.equal(true);
    expect(isNewAddressWhitelistedBefore).to.be.equal(false);

    expect(isOldAddressWhitelistedAfter).to.be.equal(false);
    expect(isNewAddressWhitelistedAfter).to.be.equal(true);
    expect(newMemberAddressBalanceAfter).to.be.equal(oldMemberAddressBalanceBefore);
    expect(oldMemberAddressBalanceAfter).to.be.equal(0);
  });
});
