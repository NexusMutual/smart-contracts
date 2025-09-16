const { expect } = require('chai');
const { ethers, nexus } = require('hardhat');
const { loadFixture, setBalance, impersonateAccount } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers;
const { ETH } = nexus.constants.Assets;

// TODO: missing tests
// - reentrancy not tested
// - failed eth transfers not tested

describe('sendPayout', function () {
  it('reverts if the caller is not Claims contract', async function () {
    const fixture = await loadFixture(setup);
    const { pool, accounts } = fixture;
    const [member] = accounts.members;
    await setBalance(pool.target, parseEther('100'));

    await expect(pool.sendPayout(0, member, parseEther('0.1'), 0)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('sends usdc to a member', async function () {
    const fixture = await loadFixture(setup);
    const { pool, accounts, claims, usdc } = fixture;
    const [member] = accounts.members;

    await usdc.mint(pool.target, parseEther('10'));
    await impersonateAccount(claims.address);
    const claimsSigner = await ethers.getSigner(claims.address);
    await setBalance(claims.address, parseEther('1'));
    await setBalance(pool.target, parseEther('100'));

    const amount = parseEther('0.1');

    const ethBalanceBefore = await ethers.provider.getBalance(member.address);
    const usdcBalanceBefore = await usdc.balanceOf(member.address);

    await expect(pool.connect(claimsSigner).sendPayout(1, member, amount, 0))
      .to.emit(pool, 'Payout')
      .withArgs(member.address, usdc.target, amount);

    const ethBalanceAfter = await ethers.provider.getBalance(member.address);
    const usdcBalanceAfter = await usdc.balanceOf(member.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore + amount);
  });

  it('sends eth to a member', async function () {
    const fixture = await loadFixture(setup);
    const { pool, accounts, claims } = fixture;
    const [member] = accounts.members;

    await impersonateAccount(claims.address);
    const claimsSigner = await ethers.getSigner(claims.address);
    await setBalance(claims.address, parseEther('1'));
    await setBalance(pool.target, parseEther('100'));

    const deposit = parseEther('0.001');
    const amount = parseEther('0.1');

    const ethBalanceBefore = await ethers.provider.getBalance(member.address);

    await expect(pool.connect(claimsSigner).sendPayout(0, member, amount, deposit))
      .to.emit(pool, 'Payout')
      .withArgs(member.address, ETH, amount);

    const ethBalanceAfter = await ethers.provider.getBalance(member.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore + amount + deposit);
  });
});
