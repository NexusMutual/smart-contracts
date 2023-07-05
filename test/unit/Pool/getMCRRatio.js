const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { BigNumber } = ethers;

describe('getMCRRatio', function () {
  it('gets MCR ratio value', async function () {
    const fixture = await loadFixture(setup);
    const { pool, mcr } = fixture;
    const [member] = fixture.accounts.members;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    const expectedMCRRatio = initialAssetValue.mul(10000).div(mcrEth);
    const calculatedMCRRatio = await pool.getMCRRatio();

    expect(calculatedMCRRatio).to.be.equal(expectedMCRRatio);
  });
});
