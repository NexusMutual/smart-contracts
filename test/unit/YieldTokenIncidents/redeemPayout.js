const { ethers, network } = require('hardhat');
const { expect } = require('chai');

const { setTime, ASSET, signPermit } = require('./helpers');
const { parseEther, arrayify, hexZeroPad, hexValue } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

describe('redeemPayout', function () {
  it("reverts if the address is not the cover owner's or approved", async function () {
    const { yieldTokenIncidents, assessment, cover, coverNFT } = this.contracts;
    const [coverOwner, nonCoverOwner] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const segmentPeriod = daysToSeconds(30);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('10000'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('10000'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('10000'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(2, parseEther('1.1'), currentTime + segmentPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(coverOwner).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(coverOwner).redeemPayout(0, 0, 0, parseEther('100'), coverOwner.address, []),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 1, 0, parseEther('100'), coverOwner.address, []),
    ).to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await coverNFT.connect(coverOwner).approve(nonCoverOwner.address, 1);

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 1, 0, parseEther('100'), coverOwner.address, []),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 2, 0, parseEther('100'), coverOwner.address, []),
    ).to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await coverNFT.connect(coverOwner).setApprovalForAll(nonCoverOwner.address, true);

    await expect(
      yieldTokenIncidents.connect(nonCoverOwner).redeemPayout(0, 2, 0, parseEther('100'), coverOwner.address, []),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');
  });

  it('reverts if the incident is not accepted', async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1, member2] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('10000'), timestamp + 1, daysToSeconds('30'), 7, 0, false, 0]],
      );
    }

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');

    await assessment.connect(member1).castVote(0, true, parseEther('100'));
    await assessment.connect(member2).castVote(0, false, parseEther('100'));

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(10));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The incident needs to be accepted');
  });

  it("reverts if the voting and cooldown period haven't ended", async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('10000'), timestamp + 1, daysToSeconds('30'), 7, 0, false, 0]],
      );
    }

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The voting and cooldown periods must end');

    const { end } = await assessment.getPoll(0);
    await setTime(end);

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The voting and cooldown periods must end');

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }
  });

  it('reverts if the redemption period expired', async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutRedemptionPeriodInDays } = await yieldTokenIncidents.config();
    const { payoutCooldownInDays } = await assessment.config();

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('10000'), timestamp + 1, daysToSeconds('30'), 7, 0, false, 0]],
      );
    }

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('1'), member1.address, []),
    ).to.be.revertedWith('The redemption period has expired');
  });

  it('reverts if the payout exceeds the covered amount', async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutCooldownInDays } = await assessment.config();
    const productId = 2;

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds('30'), 7, 0, false, 0]],
      );
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('101.011'), member1.address, []),
    ).to.be.revertedWith('Payout exceeds covered amount');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('101.01'), member1.address, []),
    ).not.to.be.revertedWith('Payout exceeds covered amount');
  });

  it('reverts if the cover segment ends before the incident occured', async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutCooldownInDays } = await assessment.config();
    const productId = 2;

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [
          [parseEther('100'), timestamp + 1, daysToSeconds('30'), 7, 0, false, 0],
          [parseEther('100'), timestamp + 1 + daysToSeconds('30'), daysToSeconds('30'), 7, 0, false, 0],
        ],
      );
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(31));
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Cover ended before the incident');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 1, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Cover ended before the incident');
  });

  it('reverts if the cover segment starts after or when the incident occured', async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutCooldownInDays } = await assessment.config();
    const productId = 2;

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [
          [parseEther('100'), timestamp + 1, 1, 7, 0, false, 0], // 1s segment
          [parseEther('100'), timestamp + 2, daysToSeconds('30'), 7, 0, false, 0], // 30d segment
        ],
      );

      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), timestamp + 2, parseEther('100'), '');
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds('30'), 7, 0, false, 0]],
      );
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 1, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Cover started after the incident');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Cover started after the incident');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Cover started after the incident');
  });

  it('reverts if the cover segment is outside the grace period', async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { gracePeriodInDays } = await cover.productTypes(2);
    const productId = 2;
    const segmentPeriod = daysToSeconds(30);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [
          [parseEther('100'), timestamp + 1, segmentPeriod, 7, 0, false, 0],
          [parseEther('100'), timestamp + 1, segmentPeriod + daysToSeconds(gracePeriodInDays), 7, 0, false, 0],
        ],
      );
    }

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    await setTime(currentTime + segmentPeriod + daysToSeconds(gracePeriodInDays));
    await yieldTokenIncidents
      .connect(advisoryBoard)
      .submitIncident(productId, parseEther('1.1'), currentTime + segmentPeriod - 1, parseEther('100'), '');

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Grace period has expired');
    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Grace period has expired');
  });

  it("reverts if the cover's productId mismatches the incident's productId", async function () {
    const { yieldTokenIncidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const segmentPeriod = daysToSeconds(30);
    const validProductId = 2;

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        0, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        1, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        validProductId, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        3, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(validProductId, parseEther('1.1'), currentTime + segmentPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 0, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Product id mismatch');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 1, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Product id mismatch');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 2, 0, parseEther('100'), member1.address, []),
    ).not.to.be.revertedWith('Product id mismatch');

    await expect(
      yieldTokenIncidents.connect(member1).redeemPayout(0, 3, 0, parseEther('100'), member1.address, []),
    ).to.be.revertedWith('Product id mismatch');
  });

  it('transfers payout asset amount to payoutAddress, as per requested amount and priceBefore', async function () {
    const { yieldTokenIncidents, assessment, cover, ybEth } = this.contracts;
    const [member1] = this.accounts.members;
    const [nonMember1, nonMember2] = this.accounts.nonMembers;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const segmentPeriod = daysToSeconds(30);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        member1.address,
        2, // productId
        ASSET.ETH,
        [[parseEther('10000'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(2, parseEther('1.1'), currentTime + segmentPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(member1).approve(yieldTokenIncidents.address, parseEther('10000'));

    // [warning] Cover mock does not subtract the covered amount
    {
      const ethBalanceBefore = await ethers.provider.getBalance(member1.address);
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 0, 0, parseEther('100'), member1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(member1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('99')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 0, 0, parseEther('111'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('109.89')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember2.address);
      await yieldTokenIncidents
        .connect(member1)
        .redeemPayout(0, 0, 0, parseEther('3000'), nonMember2.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember2.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('2970')));
    }
  });

  it("uses permit when it's provided in optionalParams", async function () {
    const { yieldTokenIncidents, assessment, cover, ybPermitDai, dai } = this.contracts;
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
        [[parseEther('10000'), timestamp + 1, segmentPeriod, 7, 0, false, 0]],
      );
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(advisoryBoard)
        .submitIncident(4, parseEther('1.1'), currentTime + segmentPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    let permit, permitDeadline;
    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      permitDeadline = currentTime + daysToSeconds(1);
      permit = await signPermit(
        member1,
        ybPermitDai,
        network.config.chainId,
        yieldTokenIncidents.address,
        parseEther('3000'),
        permitDeadline,
        '1',
      );
    }

    const daiBalanceBefore = await dai.balanceOf(nonMember.address);

    const parsePermitParam = ({ owner, spender, value, deadline, v, r, s }) => [
      ...arrayify(hexZeroPad(owner, 32)),
      ...arrayify(hexZeroPad(spender, 32)),
      ...arrayify(hexZeroPad(hexValue(value), 32)),
      ...arrayify(hexZeroPad(deadline, 32)),
      ...arrayify(hexZeroPad(v, 32)),
      ...arrayify(hexZeroPad(r, 32)),
      ...arrayify(hexZeroPad(s, 32)),
    ];

    await yieldTokenIncidents.connect(member1).redeemPayout(
      0,
      0,
      0,
      parseEther('3000'),
      nonMember.address,
      parsePermitParam({
        owner: member1.address,
        spender: yieldTokenIncidents.address,
        value: parseEther('3000'),
        deadline: permitDeadline,
        v: permit.v,
        r: permit.r,
        s: permit.s,
      }),
      { gasPrice: 0 },
    );
    const daiBalanceAfter = await dai.balanceOf(nonMember.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(parseEther('2970')));
  });

  it('emits IncidentPayoutRedeemed event with owner, payout amount, incident and cover ids', async function () {
    const { yieldTokenIncidents, cover, assessment, ybEth, ybDai } = this.contracts;
    const [coverOwner1, coverOwner2] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner1.address,
      2, // productId using ybEth
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 7, 0, false, 0]],
    );

    await cover.createMockCover(
      coverOwner1.address,
      2, // productId using ybEth
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 7, 0, false, 0]],
    );

    await cover.createMockCover(
      coverOwner2.address,
      3, // productId using ybDai
      ASSET.DAI,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 7, 0, false, 0]],
    );

    await yieldTokenIncidents
      .connect(advisoryBoard)
      .submitIncident(2, parseEther('1'), timestamp + 2, parseEther('100'), '');

    await yieldTokenIncidents
      .connect(advisoryBoard)
      .submitIncident(3, parseEther('1'), timestamp + 2, parseEther('100'), '');

    await assessment.connect(advisoryBoard).castVote(0, true, parseEther('100'));
    await assessment.connect(advisoryBoard).castVote(1, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(1);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(coverOwner1).approve(yieldTokenIncidents.address, parseEther('10000'));
    await expect(
      yieldTokenIncidents.connect(coverOwner1).redeemPayout(0, 0, 0, parseEther('100'), coverOwner1.address, []),
    )
      .to.emit(yieldTokenIncidents, 'IncidentPayoutRedeemed')
      .withArgs(coverOwner1.address, parseEther('90'), 0, 0);

    await ybDai.connect(coverOwner2).approve(yieldTokenIncidents.address, parseEther('10000'));
    await expect(
      yieldTokenIncidents.connect(coverOwner2).redeemPayout(1, 2, 0, parseEther('100'), coverOwner2.address, []),
    )
      .to.emit(yieldTokenIncidents, 'IncidentPayoutRedeemed')
      .withArgs(coverOwner2.address, parseEther('90'), 1, 2);
  });
});
