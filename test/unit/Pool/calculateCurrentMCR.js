const { expect } = require('chai');
const { nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { calculateCurrentMCR } = nexus.pool;

const stored = 12348870328212262601890n;
const desired = 10922706197119349905840n;
const updatedAt = 1751371403n;

describe('calculateCurrentMCR', function () {
  it('should return passed value if now is the same as updated at', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    const storedValue = 0n;
    const newStoredValue = await pool.calculateCurrentMCR(storedValue, 0n, updatedAt, updatedAt);

    expect(newStoredValue).to.be.equal(storedValue);
  });

  it('should calculate new MCR value when desired is lower than stored', async function () {
    const fixture = await loadFixture(setup);
    const { pool, constants } = fixture;

    const timestamp = updatedAt + 86400n;
    const expectedValue = calculateCurrentMCR({ stored, desired, updatedAt, now: timestamp }, constants);
    const newStoredValue = await pool.calculateCurrentMCR(stored, desired, updatedAt, timestamp);

    expect(newStoredValue).to.be.equal(expectedValue);
  });

  it('should calculate new MCR value when desired is higher than stored', async function () {
    const fixture = await loadFixture(setup);
    const { pool, constants } = fixture;

    const desired = stored + 1000000000n;
    const timestamp = updatedAt + 86400n;
    const expectedValue = calculateCurrentMCR({ stored, desired, updatedAt, now: timestamp }, constants);
    const newStoredValue = await pool.calculateCurrentMCR(stored, desired, updatedAt, timestamp);

    expect(newStoredValue).to.be.equal(expectedValue);
  });
});
