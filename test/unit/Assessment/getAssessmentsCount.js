const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { parseEther } = ethers.utils;

describe('getAssessmentsCount', function () {
  it('returns the total number of claims', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims } = fixture.contracts;
    {
      const count = await assessment.getAssessmentsCount();
      expect(count).to.be.equal(0);
    }
    await individualClaims.submitClaim(0, 0, parseEther('100'), '');
    {
      const count = await assessment.getAssessmentsCount();
      expect(count).to.be.equal(1);
    }
    await individualClaims.submitClaim(0, 0, parseEther('100'), '');
    {
      const count = await assessment.getAssessmentsCount();
      expect(count).to.be.equal(2);
    }
  });
});
