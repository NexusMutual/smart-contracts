const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther } = ethers;

describe('removeFromWhitelist', function () {
  it('reverts if caller is not an registry', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;

    await expect(tokenController.removeFromWhitelist(nonMember.address)).to.be.revertedWithCustomError(
      tokenController,
      'Unauthorized',
    );
  });

  it('reverts if the member balance is not zero', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await impersonateAccount(registry.target);
    const registrySigner = await ethers.provider.getSigner(registry.target);
    await setBalance(registry.target, parseEther('1'));

    await expect(
      tokenController.connect(registrySigner).removeFromWhitelist(member.address),
    ).to.be.revertedWithCustomError(tokenController, 'MemberBalanceNotZero');
  });

  it('remove member from white list', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, registry, nxm } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;

    await impersonateAccount(registry.target);
    const registrySigner = await ethers.provider.getSigner(registry.target);
    await setBalance(registry.target, parseEther('1'));

    await tokenController.connect(registrySigner).addToWhitelist(nonMember.address);

    const whiteListedBefore = await nxm.whiteListed(nonMember.address);

    await tokenController.connect(registrySigner).removeFromWhitelist(nonMember.address);

    const whiteListedAfter = await nxm.whiteListed(nonMember.address);

    expect(whiteListedBefore).to.be.equal(true);
    expect(whiteListedAfter).to.be.equal(false);
  });
});
