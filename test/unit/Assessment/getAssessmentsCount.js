const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther } = ethers.utils;

describe('getAssessmentsCount', function () {
  it('returns the total number of claims', async function () {
    const { assessment, individualClaims } = this.contracts;
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
