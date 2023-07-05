const { expect } = require('chai');
const { parseEther } = require('ethers/lib/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('burnFrom', function () {
  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member1] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(tokenController.connect(member1).burnFrom(member1.address, amount)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });

  it('burns nxm from member', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [internalContract] = fixture.accounts.internalContracts;
    const [member1] = fixture.accounts.members;

    const initialBalanceMember1 = await nxm.balanceOf(member1.address);

    const amount = parseEther('10');
    await tokenController.connect(internalContract).burnFrom(member1.address, amount);

    const balanceMember1 = await nxm.balanceOf(member1.address);

    expect(balanceMember1).to.equal(initialBalanceMember1.sub(amount));
  });
});
