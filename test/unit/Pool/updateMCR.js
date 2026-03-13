const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { setNextBlockTime, calculateCurrentMCR, setMCR } = require('../utils');

const stored = 12348870328212262601890n;
const desired = 10922706197119349905840n;
const updatedAt = 1751371403n;

// TODO: missing tests
// - else path for `if (geared != desired)`
// - else path for `if (current != stored)`
// - emitted event

describe('updateMCR', function () {
  it('should revert if there is a pause', async function () {
    const fixture = await loadFixture(setup);
    const { pool, registry } = fixture;

    await registry.setPauseConfig(1);
    await expect(pool.updateMCR()).to.be.revertedWithCustomError(pool, 'Paused');
  });

  it('should not update MCR if MIN_UPDATE_TIME has not passed', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const { timestamp } = await ethers.provider.getBlock('latest');
    await setMCR(pool.target, { stored, desired, updatedAt: BigInt(timestamp + 1) }, ethers.provider);

    const before = await ethers.provider.getStorage(pool.target, '0x3');
    await setNextBlockTime(timestamp + 3000);
    await pool.updateMCR();
    const after = await ethers.provider.getStorage(pool.target, '0x3');
    expect(before).to.be.equal(after);
  });

  it('should update MCR', async function () {
    const fixture = await loadFixture(setup);
    const { pool, constants } = fixture;
    const { timestamp } = await ethers.provider.getBlock('latest');

    const nextTimestamp = timestamp + 86400;
    const expectedMCRValue = calculateCurrentMCR({ stored, desired, updatedAt, now: BigInt(nextTimestamp) }, constants);

    await setNextBlockTime(nextTimestamp);
    await pool.updateMCR();
    const newMCRValue = await pool.getMCR();

    expect(newMCRValue).to.be.equal(expectedMCRValue);
  });
});

describe('updateMCRInternal', function () {
  it('should revert if RAMM is not a caller', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    await expect(pool.updateMCRInternal(true)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('should revert if there is a pause', async function () {
    const fixture = await loadFixture(setup);
    const { pool, ramm, registry } = fixture;
    await impersonateAccount(ramm.target);
    const rammSigner = await ethers.getSigner(ramm.target);
    await setBalance(ramm.target, ethers.parseEther('1'));

    await registry.setPauseConfig(1);
    await expect(pool.connect(rammSigner).updateMCRInternal(true)).to.be.revertedWithCustomError(pool, 'Paused');
  });

  it('should update MCR', async function () {
    const fixture = await loadFixture(setup);
    const { pool, constants, ramm } = fixture;

    await impersonateAccount(ramm.target);
    const rammSigner = await ethers.getSigner(ramm.target);
    await setBalance(ramm.target, ethers.parseEther('1'));

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextTimestamp = timestamp + 86400;
    const expectedMCRValue = calculateCurrentMCR({ stored, desired, updatedAt, now: BigInt(nextTimestamp) }, constants);

    await setNextBlockTime(nextTimestamp);
    await pool.connect(rammSigner).updateMCRInternal(true);
    const newMCRValue = await pool.getMCR();

    expect(newMCRValue).to.be.equal(expectedMCRValue);
  });
});
