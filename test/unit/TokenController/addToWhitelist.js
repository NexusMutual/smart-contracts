const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther } = ethers;

describe('addToWhitelist', function () {
  it('reverts if caller is not an registry', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(tokenController.addToWhitelist(member.address)).to.be.revertedWithCustomError(
      tokenController,
      'Unauthorized',
    );
  });

  it('add member to white list', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, registry, nxm } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;

    await impersonateAccount(registry.target);
    const registrySigner = await ethers.provider.getSigner(registry.target);
    await setBalance(registry.target, parseEther('1'));

    const whiteListedBefore = await nxm.whiteListed(nonMember.address);

    await tokenController.connect(registrySigner).addToWhitelist(nonMember.address);

    const whiteListedAfter = await nxm.whiteListed(nonMember.address);

    expect(whiteListedBefore).to.be.equal(false);
    expect(whiteListedAfter).to.be.equal(true);
  });
});
