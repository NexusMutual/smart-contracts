const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setTime, daysToSeconds, INCIDENT_STATUS } = require('./helpers');
const { parseEther } = ethers.utils;

describe('getIncidentsToDisplay', function () {
  it('aggregates and displays claims related data in a human-readable form', async function () {
    const { incidents, assessment } = this.contracts;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    const expectedIncidentIds = ['0', '1', '2', '3', '4'];
    const expectedProductIds = ['2', '3', '2', '2', '3'];
    const expectedPriceBefore = [
      parseEther('1.1'),
      parseEther('1.2'),
      parseEther('1.3'),
      parseEther('0.5'),
      parseEther('1.5'),
    ];
    const expectedIncidentDates = [];
    const expectedPollStarts = [];
    const expectedPollEnds = [];
    const expectedRedeemableUntil = [];

    const { payoutRedemptionPeriodInDays } = await incidents.config();
    const { payoutCooldownInDays, minVotingPeriodInDays } = await assessment.config();

    for (let i = 0; i < 5; i++) {
      {
        const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
        expectedIncidentDates.push(currentTime);
        await incidents
          .connect(advisoryBoard)
          .submitIncident(expectedProductIds[i], expectedPriceBefore[i], currentTime, parseEther('100'), '');
      }

      {
        const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
        expectedPollStarts.push(currentTime);
        expectedPollEnds.push(currentTime + daysToSeconds(minVotingPeriodInDays));
        expectedRedeemableUntil.push(
          currentTime + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays + payoutRedemptionPeriodInDays),
        );
        await setTime(currentTime + daysToSeconds(1));
      }
    }

    const res = await incidents.getIncidentsToDisplay([0, 1, 2, 3, 4]);
    const actualIncidentIds = res.map(x => x.id);
    const actualProductIds = res.map(x => x.productId);
    const actualPriceBefore = res.map(x => x.priceBefore);
    const actualIncidentDates = res.map(x => x.incidentDate);
    const actualPollStarts = res.map(x => x.pollStart);
    const actualPollEnds = res.map(x => x.pollEnd);
    const actualRedeemableUntil = res.map(x => x.redeemableUntil);

    for (let i = 0; i < 5; i++) {
      expect(actualIncidentIds[i]).to.be.equal(expectedIncidentIds[i]);
      expect(actualProductIds[i]).to.be.equal(expectedProductIds[i]);
      expect(actualPriceBefore[i]).to.be.equal(expectedPriceBefore[i]);
      expect(actualIncidentDates[i]).to.be.equal(expectedIncidentDates[i]);
      expect(actualPollStarts[i]).to.be.equal(expectedPollStarts[i]);
      expect(actualPollEnds[i]).to.be.equal(expectedPollEnds[i]);
      expect(actualRedeemableUntil[i]).to.be.equal(expectedRedeemableUntil[i]);
    }

    {
      const actualStatuses = res.map(x => x.status.toNumber());
      for (const i of [0, 1, 2]) {
        expect(actualStatuses[i]).to.be.equal(INCIDENT_STATUS.DENIED);
      }

      for (const i of [3, 4]) {
        expect(actualStatuses[i]).to.be.equal(INCIDENT_STATUS.PENDING);
      }
    }

    {
      const res = await incidents.getIncidentsToDisplay([0, 1, 2, 3, 4]);
      const actualStatuses = res.map(x => x.status.toNumber());

      await assessment.castVote(3, true, parseEther('100'));
      await assessment.castVote(4, true, parseEther('100'));

      for (const i of [3, 4]) {
        expect(actualStatuses[i]).to.be.equal(INCIDENT_STATUS.PENDING);
      }
    }

    {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }

    {
      const res = await incidents.getIncidentsToDisplay([0, 1, 2, 3, 4]);
      const actualStatuses = res.map(x => x.status.toNumber());

      for (const i of [3, 4]) {
        expect(actualStatuses[i]).to.be.equal(INCIDENT_STATUS.PENDING);
      }
    }

    {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }

    {
      const res = await incidents.getIncidentsToDisplay([0, 1, 2, 3, 4]);
      const actualStatuses = res.map(x => x.status.toNumber());
      expect(actualStatuses[3]).to.be.equal(INCIDENT_STATUS.PENDING);
      expect(actualStatuses[4]).to.be.equal(INCIDENT_STATUS.PENDING);
    }

    {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }

    {
      const res = await incidents.getIncidentsToDisplay([0, 1, 2, 3, 4]);
      const actualStatuses = res.map(x => x.status.toNumber());
      expect(actualStatuses[3]).to.be.equal(INCIDENT_STATUS.ACCEPTED);
      expect(actualStatuses[4]).to.be.equal(INCIDENT_STATUS.ACCEPTED);
    }

    {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(
        latestBlock.timestamp + daysToSeconds(payoutCooldownInDays + payoutRedemptionPeriodInDays) + 1 /* second */,
      );
    }

    {
      const res = await incidents.getIncidentsToDisplay([0, 1, 2, 3, 4]);
      const actualStatuses = res.map(x => x.status.toNumber());
      expect(actualStatuses[3]).to.be.equal(INCIDENT_STATUS.EXPIRED);
      expect(actualStatuses[4]).to.be.equal(INCIDENT_STATUS.EXPIRED);
    }
  });
});
