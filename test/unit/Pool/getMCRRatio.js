const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('getMCRRatio', function () {
  it('should return the correct MCR ratio', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture.contracts;

    const initialAssetValue = 210959924071154460525457n;
    const mcrEth = 162424730681679380000000n;
    const { mcr } = fixture;
    const [member] = fixture.accounts.members;

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    const expectedMCRRatio = initialAssetValue * 10000n / mcrEth;
    const calculatedMCRRatio = await pool.getMCRRatio();

    expect(calculatedMCRRatio).to.be.equal(expectedMCRRatio);
  });
});
