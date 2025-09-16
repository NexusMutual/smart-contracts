const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, setBalance, impersonateAccount } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers;

// TODO: missing tests
// - reentrancy not tested
// - EthTransferFailed not tested

describe('sendEth', function () {
  it('reverts if the caller is not Ramm or Claims contract', async function () {
    const fixture = await loadFixture(setup);
    const { pool, accounts } = fixture;
    const [member] = accounts.members;
    await setBalance(pool.target, parseEther('100'));

    await expect(pool.sendEth(member, parseEther('0.1'))).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('sends eth to a member - RAMM', async function () {
    const fixture = await loadFixture(setup);
    const { pool, accounts, ramm } = fixture;
    const [member] = accounts.members;
    await impersonateAccount(ramm.target);
    const rammSigner = await ethers.getSigner(ramm.target);

    await setBalance(ramm.target, parseEther('1'));
    await setBalance(pool.target, parseEther('100'));

    const balanceBefore = await ethers.provider.getBalance(member.address);
    await pool.connect(rammSigner).sendEth(member, parseEther('0.1'));
    const balanceAfter = await ethers.provider.getBalance(member.address);

    expect(balanceAfter).to.be.equal(balanceBefore + parseEther('0.1'));
  });
});
