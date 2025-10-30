const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { impersonateAccount, setEtherBalance } = require('../utils').evm;
const { toBytes2 } = require('../utils').helpers;
const setup = require('./setup');

const { parseEther } = ethers.utils;

describe('sendEth', function () {
  it('should only be callable by the RAMM contract', async function () {
    const fixture = await loadFixture(setup);
    const { pool, ramm } = fixture;
    const [member] = fixture.accounts.members;

    const amountToSend = parseEther('1');

    const notRammSendEthPromise = pool.sendEth(member.address, amountToSend);
    await expect(notRammSendEthPromise).to.be.revertedWith('Pool: Not Ramm');

    await impersonateAccount(ramm.address);
    await setEtherBalance(pool.address, amountToSend);
    await setEtherBalance(ramm.address, parseEther('0.1'));
    const rammSigner = await ethers.provider.getSigner(ramm.address);

    const rammSendEthPromise = pool.connect(rammSigner).sendEth(member.address, amountToSend);
    await expect(rammSendEthPromise).to.not.be.reverted;
  });

  it('should revert on reentrancy', async function () {
    const fixture = await loadFixture(setup);
    const { pool, master } = fixture;

    const poolBalance = parseEther('1000');
    const sendEthAmount = poolBalance.div(2);
    await setEtherBalance(pool.address, poolBalance);

    // set up reentrancyExploiter
    const ReentrancyExploiter = await ethers.getContractFactory('ReentrancyExploiter');
    const reentrancyExploiter = await ReentrancyExploiter.deploy();
    const { data: sendEthData } = await pool.populateTransaction.sendEth(reentrancyExploiter.address, sendEthAmount);

    // bypass onlyRamm modifier
    await master.setLatestAddress(toBytes2('RA'), reentrancyExploiter.address);
    await pool.changeDependentContractAddress();

    // this test guards against reentrancy as it will fail on a successful reentrancy attack (there will be no revert)
    const reentrancyAttackPromise = reentrancyExploiter.execute(pool.address, 0, sendEthData);
    await expect(reentrancyAttackPromise).to.be.revertedWith('Pool: ETH transfer failed');
  });

  it('should successfully send ETH to a member in exchange for NXM tokens', async function () {
    const fixture = await loadFixture(setup);
    const { pool, ramm } = fixture;
    const [member] = fixture.accounts.members;

    await setEtherBalance(pool.address, parseEther('1000'));

    const beforeBalance = await ethers.provider.getBalance(member.address);
    await impersonateAccount(ramm.address);
    await setEtherBalance(ramm.address, parseEther('1000'));
    const rammSigner = await ethers.provider.getSigner(ramm.address);

    const amountToSend = parseEther('1');
    await pool.connect(rammSigner).sendEth(member.address, amountToSend);

    const afterBalance = await ethers.provider.getBalance(member.address);
    expect(afterBalance).to.be.equal(beforeBalance.add(amountToSend));
  });
});
