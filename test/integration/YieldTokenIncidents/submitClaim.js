const { ethers } = require('hardhat');
const { expect } = require('chai');

const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee } = require('../../utils/evm');

const { BigNumber } = ethers;
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const priceDenominator = '10000';

describe('submitClaim', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
    return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
  }

  async function stake({ stakingPool, staker, productId, period, gracePeriod }) {
    // Staking inputs
    const stakingAmount = parseEther('6000');
    const lastBlock = await ethers.provider.getBlock('latest');
    const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

    // Stake to open up capacity
    await stakingPool.connect(staker).depositTo([
      {
        amount: stakingAmount,
        trancheId: firstTrancheId,
        tokenId: 0, // new position
        destination: AddressZero,
      },
    ]);
    await stakingPool.setTargetWeight(productId, 10);
  }

  it('submits ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const productId = 2; // ybETH
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;

    const amount = parseEther('10');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await ybETH.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('100'));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      { value: expectedPremium },
    );

    {
      // submit incident
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yc
        .connect(this.accounts.defaultSender)
        .submitIncident(productId, parseEther('1.1'), currentTime + period / 2, parseEther('100'), '');
    }

    // accept incident
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybETH.connect(coverBuyer1).approve(yc.address, parseEther('10000'));

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('1'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('0.99')));
    }
    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('1.11'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('1.0989')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('3'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('2.970')));
    }
  });

  it('submits DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, dai, yc, ybDAI } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const productId = 3;
    const coverAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;

    const amount = parseEther('10');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('1000000'));
    await ybDAI.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('100'));

    await dai.connect(coverBuyer1).approve(cover.address, expectedPremium);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      { value: expectedPremium },
    );

    {
      // submit incident
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yc
        .connect(this.accounts.defaultSender)
        .submitIncident(productId, parseEther('1.1'), currentTime + period / 2, parseEther('100'), '');
    }

    // accept incident
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybDAI.connect(coverBuyer1).approve(yc.address, parseEther('10000'));

    {
      const daiBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('1'), nonMember1.address, [], { gasPrice: 0 });
      const daiBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(parseEther('0.99')));
    }
    {
      const daiBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('1.11'), nonMember1.address, [], { gasPrice: 0 });
      const daiBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(parseEther('1.0989')));
    }

    {
      const ethBalanceBefore = await dai.balanceOf(nonMember1.address);
      await setNextBlockBaseFee('0');
      await yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('3'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await dai.balanceOf(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('2.970')));
    }
  });

  it('submits ETH claim and rejects claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, yc, ybETH } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;

    const productId = 2; // ybETH
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;

    const amount = parseEther('10');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, productId, period, gracePeriod });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await ybETH.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('100'));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      { value: expectedPremium },
    );

    {
      // submit incident
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yc
        .connect(this.accounts.defaultSender)
        .submitIncident(productId, parseEther('1.1'), currentTime + period / 2, parseEther('100'), '');
    }

    // reject incident (requires at least 1 positive vote)
    await as.connect(staker1).castVotes([0], [true], parseEther('100'));
    await as.connect(staker2).castVotes([0], [false], parseEther('100'));

    {
      // advance past payout cooldown
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    await ybETH.connect(coverBuyer1).approve(yc.address, parseEther('10000'));

    await setNextBlockBaseFee('0');
    await expect(
      yc.connect(coverBuyer1).redeemPayout(0, 0, 0, parseEther('1'), nonMember1.address, [], { gasPrice: 0 }),
    ).to.be.revertedWith('The incident needs to be accepted');
  });
});
