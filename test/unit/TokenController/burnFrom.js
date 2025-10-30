const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther } = ethers;

describe('burnFrom', function () {
  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member1] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(tokenController.connect(member1).burnFrom(member1.address, amount)).to.be.revertedWithCustomError(
      tokenController,
      'Unauthorized',
    );
  });

  it('burns nxm from member', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [cover] = fixture.accounts.cover;
    const [member1] = fixture.accounts.members;

    const amount = parseEther('10');
    await nxm.mint(member1.address, amount);
    await nxm.connect(member1).approve(tokenController, amount);
    const initialBalanceMember1 = await nxm.balanceOf(member1.address);

    await tokenController.connect(cover).burnFrom(member1.address, amount);

    const balanceMember1 = await nxm.balanceOf(member1.address);

    expect(balanceMember1).to.equal(initialBalanceMember1 - amount);
  });
});
