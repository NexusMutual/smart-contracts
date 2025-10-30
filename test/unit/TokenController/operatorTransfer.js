const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther } = ethers;

describe('operatorTransfer', function () {
  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member1, member2] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(
      tokenController.connect(member1).operatorTransfer(member1.address, member2.address, amount),
    ).to.be.revertedWithCustomError(tokenController, 'Unauthorized');
  });

  it('transfer nxm from source address to destination address', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [cover] = fixture.accounts.cover;
    const [member1, member2] = fixture.accounts.members;

    const amount = parseEther('10');
    await nxm.mint(member1.address, amount);
    await nxm.connect(member1).approve(tokenController, amount);

    const initialBalanceMember1 = await nxm.balanceOf(member1.address);
    const initialBalanceMember2 = await nxm.balanceOf(member2.address);

    await tokenController.connect(cover).operatorTransfer(member1.address, member2.address, amount);

    const balanceMember1 = await nxm.balanceOf(member1.address);
    const balanceMember2 = await nxm.balanceOf(member2.address);

    expect(balanceMember1).to.equal(initialBalanceMember1 - amount);
    expect(balanceMember2).to.equal(initialBalanceMember2 + amount);
  });

  it('transfer nxm from source address to token controller', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [cover] = fixture.accounts.cover;
    const [member2] = fixture.accounts.members;

    const amount = parseEther('10');
    await nxm.mint(member2.address, amount);
    await nxm.connect(member2).approve(tokenController, amount);

    const initialBalanceTC = await nxm.balanceOf(tokenController.target);
    const initialBalanceMember2 = await nxm.balanceOf(member2.address);

    await tokenController.connect(cover).operatorTransfer(member2.address, tokenController, amount);

    const balanceTC = await nxm.balanceOf(tokenController.target);
    const balanceMember2 = await nxm.balanceOf(member2.address);

    expect(balanceTC).to.equal(initialBalanceTC + amount);
    expect(balanceMember2).to.equal(initialBalanceMember2 - amount);
  });
});
