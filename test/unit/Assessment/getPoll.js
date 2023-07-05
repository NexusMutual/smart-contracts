const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { parseEther } = ethers.utils;

describe('getPoll', function () {
  it('returns the poll of a given assessment', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims } = fixture.contracts;
    const user = fixture.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));
    await individualClaims.submitClaim(0, 0, parseEther('100'), '');
    {
      const targetAssessment = await assessment.assessments(0);
      const poll = await assessment.getPoll(0);
      expect(poll.accepted).to.be.equal(targetAssessment.poll.accepted);
      expect(poll.denied).to.be.equal(targetAssessment.poll.denied);
      expect(poll.start).to.be.equal(targetAssessment.poll.start);
      expect(poll.end).to.be.equal(targetAssessment.poll.end);
    }
    await assessment.connect(user).castVotes([0], [true], ['Assessment data hash'], 0);
    {
      const targetAssessment = await assessment.assessments(0);
      const poll = await assessment.getPoll(0);
      expect(poll.accepted).to.be.equal(targetAssessment.poll.accepted);
      expect(poll.denied).to.be.equal(targetAssessment.poll.denied);
      expect(poll.start).to.be.equal(targetAssessment.poll.start);
      expect(poll.end).to.be.equal(targetAssessment.poll.end);
    }
  });
});
