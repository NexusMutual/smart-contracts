const { expect } = require('chai');
const { parseEther } = require('ethers/lib/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('mint', function () {
  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member1] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(tokenController.connect(member1).mint(member1.address, amount)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });

  it('mint nxm to member', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [internalContract] = fixture.accounts.internalContracts;
    const [member1] = fixture.accounts.members;

    const initialBalanceMember1 = await nxm.balanceOf(member1.address);

    const amount = parseEther('10');
    await tokenController.connect(internalContract).mint(member1.address, amount);

    const balanceMember1 = await nxm.balanceOf(member1.address);

    expect(balanceMember1).to.equal(initialBalanceMember1.add(amount));
  });

  it('reverts when minting to non-members', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [internalContract] = fixture.accounts.internalContracts;
    const [nonMember] = fixture.accounts.nonMembers;

    const amount = parseEther('10');
    await expect(
      tokenController.connect(internalContract).mint(nonMember.address, amount),
    ).to.be.revertedWithCustomError(tokenController, 'CantMintToNonMemberAddress');
  });
});
