const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther } = ethers.utils;

describe('getVoteCountOfAssessor', function () {
  it('returns the total number of votes of an assessor', async function () {
    const { assessment, individualClaims } = this.contracts;
    const [assessor1, assessor2] = this.accounts.members;
    await individualClaims.submitClaim(0, 0, parseEther('100'), '');
    await individualClaims.submitClaim(1, 0, parseEther('100'), '');
    await individualClaims.submitClaim(2, 0, parseEther('100'), '');

    await assessment.connect(assessor1).stake(parseEther('100'));
    await assessment.connect(assessor2).stake(parseEther('100'));

    {
      const count = await assessment.getVoteCountOfAssessor(assessor1.address);
      expect(count).to.be.equal(0);
    }

    await assessment.connect(assessor1).castVotes([0], [true], 0);

    {
      const count = await assessment.getVoteCountOfAssessor(assessor1.address);
      expect(count).to.be.equal(1);
    }

    await assessment.connect(assessor1).castVotes([1], [true], 0);
    await assessment.connect(assessor1).castVotes([2], [true], 0);

    {
      const count = await assessment.getVoteCountOfAssessor(assessor1.address);
      expect(count).to.be.equal(3);
    }

    {
      const count = await assessment.getVoteCountOfAssessor(assessor2.address);
      expect(count).to.be.equal(0);
    }

    await assessment.connect(assessor2).castVotes([1], [true], 0);
    await assessment.connect(assessor2).castVotes([2], [true], 0);

    {
      const count = await assessment.getVoteCountOfAssessor(assessor2.address);
      expect(count).to.be.equal(2);
    }
  });
});
