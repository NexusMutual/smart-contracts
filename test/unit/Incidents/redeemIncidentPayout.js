const { ethers } = require('hardhat');
const { expect } = require('chai');

const { daysToSeconds, setTime } = require('./helpers');
const { ASSET } = require('./helpers');

const { parseEther } = ethers.utils;

describe('redeemIncidentPayout', function () {
  it("reverts if the address is not the cover owner's or approved", async function () {
    const { incidents, assessment, cover, coverNFT } = this.contracts;
    const [coverOwner, nonCoverOwner] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const coverPeriod = daysToSeconds(30);

    await cover.buyCover(coverOwner.address, 2, ASSET.ETH, parseEther('10000'), coverPeriod, parseEther('2.6'), []);
    await cover.buyCover(coverOwner.address, 2, ASSET.ETH, parseEther('10000'), coverPeriod, parseEther('2.6'), []);
    await cover.buyCover(coverOwner.address, 2, ASSET.ETH, parseEther('10000'), coverPeriod, parseEther('2.6'), []);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(2, parseEther('1.1'), currentTime + coverPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(coverOwner).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      incidents.connect(coverOwner).redeemIncidentPayout(0, 0, parseEther('100'), coverOwner.address),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await expect(
      incidents.connect(nonCoverOwner).redeemIncidentPayout(0, 1, parseEther('100'), coverOwner.address),
    ).to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await coverNFT.connect(coverOwner).approve(nonCoverOwner.address, 1);

    await expect(
      incidents.connect(nonCoverOwner).redeemIncidentPayout(0, 1, parseEther('100'), coverOwner.address),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await expect(
      incidents.connect(nonCoverOwner).redeemIncidentPayout(0, 2, parseEther('100'), coverOwner.address),
    ).to.be.revertedWith('Only the cover owner or approved addresses can redeem');

    await coverNFT.connect(coverOwner).setApprovalForAll(nonCoverOwner.address, true);

    await expect(
      incidents.connect(nonCoverOwner).redeemIncidentPayout(0, 2, parseEther('100'), coverOwner.address),
    ).not.to.be.revertedWith('Only the cover owner or approved addresses can redeem');
  });

  it('reverts if the incident is not accepted', async function () {
    const { incidents, assessment } = this.contracts;
    const [member1, member2] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'), member1.address),
    ).to.be.revertedWith('The incident must be accepted');

    await assessment.connect(member1).castVote(0, true, parseEther('100'));
    await assessment.connect(member2).castVote(0, false, parseEther('100'));

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'), member1.address),
    ).to.be.revertedWith('The incident must be accepted');

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(10));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'), member1.address),
    ).to.be.revertedWith('The incident must be accepted');
  });

  it("reverts if the voting and cooldown period haven't ended", async function () {
    const { incidents, assessment } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'), member1.address),
    ).to.be.revertedWith('The voting and cooldown periods must end');

    const { end } = await assessment.getPoll(0);
    await setTime(end);

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'), member1.address),
    ).to.be.revertedWith('The voting and cooldown periods must end');

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }
  });

  it('reverts if the redemption period expired', async function () {
    const { incidents, assessment } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutRedemptionPeriodInDays } = await incidents.config();
    const { payoutCooldownInDays } = await assessment.config();

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('1'), member1.address),
    ).to.be.revertedWith('The redemption period has expired');
  });

  it('reverts if the payout exceeds the covered amount', async function () {
    const { incidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutCooldownInDays } = await assessment.config();
    const coverAmount = parseEther('100');
    const coverPeriod = daysToSeconds(30);
    const productId = 2;

    await cover.buyCover(member1.address, productId, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(1));
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('101.011'), member1.address),
    ).to.be.revertedWith('Payout exceeds covered amount');

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('101.01'), member1.address),
    ).not.to.be.revertedWith('Payout exceeds covered amount');
  });

  it('reverts if the cover ends before the incident occured', async function () {
    const { incidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutCooldownInDays } = await assessment.config();
    const coverAmount = parseEther('100');
    const coverPeriod = daysToSeconds(30);
    const productId = 2;

    await cover.buyCover(member1.address, productId, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + daysToSeconds(31));
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('100'), member1.address),
    ).to.be.revertedWith('Cover end date is before the incident');
  });

  it('reverts if the cover starts after or when the incident occured', async function () {
    const { incidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { payoutCooldownInDays } = await assessment.config();
    const coverAmount = parseEther('100');
    const coverPeriod = daysToSeconds(30);
    const productId = 2;

    await cover.buyCover(member1.address, productId, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await setTime(currentTime + 1);
    }

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100'), '');
    }

    await cover.buyCover(member1.address, productId, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 1, parseEther('100'), member1.address),
    ).to.be.revertedWith('Cover start date is after the incident');

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('100'), member1.address),
    ).not.to.be.revertedWith('Cover start date is after the incident');
  });

  it('reverts if the cover is outside the grace period', async function () {
    const { incidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const { gracePeriodInDays } = await cover.productTypes(2);
    const coverAmount = parseEther('100');
    const coverPeriod = daysToSeconds(30);
    const productId = 2;

    await cover.buyCover(member1.address, productId, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    await setTime(currentTime + coverPeriod + daysToSeconds(gracePeriodInDays));
    await incidents
      .connect(advisoryBoard)
      .submitIncident(productId, parseEther('1.1'), currentTime + coverPeriod - 1, parseEther('100'), '');

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('100'), member1.address),
    ).to.be.revertedWith('Grace period has expired');
  });

  it("reverts if the cover's productId mismatches the incident's productId", async function () {
    const { incidents, assessment, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const coverAmount = parseEther('100');
    const coverPeriod = daysToSeconds(30);
    const validProductId = 2;

    await cover.buyCover(member1.address, 0, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    await cover.buyCover(member1.address, 1, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    await cover.buyCover(member1.address, validProductId, ASSET.ETH, coverAmount, coverPeriod, parseEther('2.6'), []);

    await cover.buyCover(member1.address, 3, ASSET.DAI, coverAmount, coverPeriod, parseEther('2.6'), []);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(validProductId, parseEther('1.1'), currentTime + coverPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('100'), member1.address),
    ).to.be.revertedWith('Product id mismatch');

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 1, parseEther('100'), member1.address),
    ).to.be.revertedWith('Product id mismatch');

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 2, parseEther('100'), member1.address),
    ).not.to.be.revertedWith('Product id mismatch');

    await expect(
      incidents.connect(member1).redeemIncidentPayout(0, 3, parseEther('100'), member1.address),
    ).to.be.revertedWith('Product id mismatch');
  });

  it('transfers the deductible amount of the payout asset to the payoutAddress, according to the requested amount and priceBefore', async function () {
    const { incidents, assessment, cover, ybEth } = this.contracts;
    const [member1] = this.accounts.members;
    const [nonMember1, nonMember2] = this.accounts.nonMembers;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;
    const coverPeriod = daysToSeconds(30);

    await cover.buyCover(member1.address, 2, ASSET.ETH, parseEther('10000'), coverPeriod, parseEther('2.6'), []);

    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await incidents
        .connect(advisoryBoard)
        .submitIncident(2, parseEther('1.1'), currentTime + coverPeriod / 2, parseEther('100'), '');
    }

    await assessment.connect(member1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await assessment.config();
      const { end } = await assessment.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybEth.connect(member1).approve(incidents.address, parseEther('10000'));

    // [warning] Cover mock does not subtract the covered amount
    {
      const ethBalanceBefore = await ethers.provider.getBalance(member1.address);
      await incidents.connect(member1).redeemIncidentPayout(0, 0, parseEther('100'), member1.address, { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(member1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('99')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await incidents
        .connect(member1)
        .redeemIncidentPayout(0, 0, parseEther('111'), nonMember1.address, { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('109.89')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember2.address);
      await incidents
        .connect(member1)
        .redeemIncidentPayout(0, 0, parseEther('3000'), nonMember2.address, { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember2.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('2970')));
    }
  });
});
