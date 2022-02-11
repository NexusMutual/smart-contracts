const { ethers, network } = require('hardhat');
const { expect } = require('chai');

const { daysToSeconds, setTime, ASSET, signPermit } = require('./helpers');

const { parseEther } = ethers.utils;

describe.only('redeemPayoutWithPermit', function () {
  it('calls permit if PermitData is provided', async function () {
    const { incidents, assessment, cover, ybPermitDai, dai } = this.contracts;
    const [member1] = this.accounts.members;
    const [nonMember] = this.accounts.nonMembers;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const segmentPeriod = daysToSeconds(30);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        4, // productId
        ASSET.DAI,
        [[parseEther('10000'), timestamp + 1, segmentPeriod, 0]],
      );
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(4, parseEther('1.1'), currentTime + segmentPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // await ybPermitDai.connect(member1).approve(incidents.address, parseEther('10000'));
    let permit, permitDeadline;
    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      permitDeadline = currentTime + daysToSeconds(1);
      permit = await signPermit(
        member1,
        ybPermitDai,
        network.config.chainId,
        incidents.address,
        parseEther('3000'),
        permitDeadline,
        '1',
      );
    }

    const daiBalanceBefore = await dai.balanceOf(nonMember.address);
    await incidents.connect(member1).redeemPayoutWithPermit(
      0,
      0,
      0,
      parseEther('3000'),
      nonMember.address,
      {
        owner: member1.address,
        spender: incidents.address,
        value: parseEther('3000'),
        deadline: permitDeadline,
        v: permit.v,
        r: permit.r,
        s: permit.s,
      },
      { gasPrice: 0 },
    );
    const daiBalanceAfter = await dai.balanceOf(nonMember.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(parseEther('2970')));
  });
});
