const { expect } = require('chai');
const { parseEther } = require('ethers/lib/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('operatorTransfer', function () {
  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member1, member2] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(
      tokenController.connect(member1).operatorTransfer(member1.address, member2.address, amount),
    ).to.be.revertedWith('Caller is not an internal contract');
  });

  it('transfer nxm from source address to destination address', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [internalContract] = fixture.accounts.internalContracts;
    const [member1, member2] = fixture.accounts.members;

    const initialBalanceMember1 = await nxm.balanceOf(member1.address);
    const initialBalanceMember2 = await nxm.balanceOf(member2.address);

    const amount = parseEther('10');
    await tokenController.connect(internalContract).operatorTransfer(member1.address, member2.address, amount);

    const balanceMember1 = await nxm.balanceOf(member1.address);
    const balanceMember2 = await nxm.balanceOf(member2.address);

    expect(balanceMember1).to.equal(initialBalanceMember1.sub(amount));
    expect(balanceMember2).to.equal(initialBalanceMember2.add(amount));
  });

  it('transfer nxm from source address to token controller', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [internalContract] = fixture.accounts.internalContracts;
    const [member2] = fixture.accounts.members;

    const initialBalanceTC = await nxm.balanceOf(tokenController.address);
    const initialBalanceMember2 = await nxm.balanceOf(member2.address);

    const amount = parseEther('10');
    await tokenController.connect(internalContract).operatorTransfer(member2.address, tokenController.address, amount);

    const balanceTC = await nxm.balanceOf(tokenController.address);
    const balanceMember2 = await nxm.balanceOf(member2.address);

    expect(balanceTC).to.equal(initialBalanceTC.add(amount));
    expect(balanceMember2).to.equal(initialBalanceMember2.sub(amount));
  });
});
