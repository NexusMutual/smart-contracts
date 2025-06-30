const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers;

describe('sendPayout', function () {
  it('reverts if the caller is not Assessment contract', async function () {
    const fixture = await loadFixture(setup);
    const { pool, accounts } = fixture;
    const [member] = accounts.members;
    await setBalance(pool.target, parseEther('100'));

    await expect(pool.sendPayout(0, member, parseEther('0.1'), 0)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('sends eth to a member', async function () {
    const fixture = await loadFixture(setup);
    const { pool, accounts, assessment, usdc } = fixture;
    const [member] = accounts.members;

    await usdc.mint(pool.target, parseEther('10'));
    await setBalance(assessment.address, parseEther('1'));
    await setBalance(pool.target, parseEther('100'));

    const deposit = parseEther('0.001');
    const amount = parseEther('0.1');

    const ethBalanceBefore = await ethers.provider.getBalance(member.address);
    const usdcBalanceBefore = await usdc.balanceOf(member.address);

    await expect(pool.connect(assessment).sendPayout(0, member, amount, deposit))
      .to.emit(pool, 'Payout')
      .withArgs(member.address, usdc.target, amount);

    const ethBalanceAfter = await ethers.provider.getBalance(member.address);
    const usdcBbalanceAfter = await usdc.balanceOf(member.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore + deposit);
    expect(usdcBbalanceAfter).to.be.equal(usdcBalanceBefore + amount);
  });
});
