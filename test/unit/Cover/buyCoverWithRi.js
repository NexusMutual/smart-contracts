const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { signRiQuote, encodeRiData } = nexus.signing;
const { parseEther, ZeroAddress } = ethers;

const coverFixture = {
  productId: 0n,
  coverAsset: 0n, // ETH
  poolId: 1n,
  segmentId: 0n,
  period: 3600n * 24n * 30n, // 30 days
  amount: parseEther('1000'),
  targetPriceRatio: 260n,
  priceDenominator: 10000n,
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  gracePeriod: 120 * 24 * 3600, // 120 days
};

const riCoverFixture = {
  riAmount: parseEther('2000'),
  riPremium: parseEther('20'), // 1%
};

const poolAllocationRequest = [{ poolId: 1, coverAmountInAsset: coverFixture.amount }];

describe('buyCoverWithRi', function () {
  it('should purchase new cover with ri', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool, riSigner, riPremiumDst, riProviderId } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, targetPriceRatio, priceDenominator, gracePeriod } = coverFixture;
    const { riAmount, riPremium } = riCoverFixture;

    const nativeCoverPremium = (amount * targetPriceRatio * period) / (priceDenominator * 365n * 24n * 3600n);
    const totalPremium = nativeCoverPremium + riPremium;

    const coverParams = {
      coverId: 0,
      owner: coverBuyer,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: totalPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: ZeroAddress,
      ipfsData: '',
    };

    const timestamp = await time.latest();
    const deadline = timestamp + 30 * 60;

    const data = [{ amount: riAmount, vaultId: 1, subnetworkId: 1, providerId: riProviderId }];
    const dataFormat = 1;
    const dataEncoded = encodeRiData(data, dataFormat);

    const riQuote = {
      coverId: 0,
      productId,
      providerId: riProviderId,
      amount: riAmount,
      premium: riPremium,
      period,
      coverAsset,
      data: dataEncoded,
      dataFormat,
      deadline,
      nonce: 0,
    };

    const riRequest = {
      providerId: riProviderId,
      amount: riAmount,
      premium: riPremium,
      deadline,
      data: dataEncoded,
      dataFormat,
      signature: await signRiQuote(riSigner, cover, riQuote),
    };

    const coverContractBalanceBefore = await ethers.provider.getBalance(cover.target);
    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.target);
    const riPremiumDstEthBalanceBefore = await ethers.provider.getBalance(riPremiumDst.address);

    const coverId = (await cover.getCoverDataCount()) + 1n;
    const tx = await cover
      .connect(coverBuyer)
      .buyCoverWithRi(coverParams, poolAllocationRequest, riRequest, { value: totalPremium });
    await expect(tx)
      .to.emit(cover, 'CoverRiAllocated')
      .withArgs(coverId, riRequest.premium, coverParams.paymentAsset, dataEncoded, dataFormat);

    expect(await ethers.provider.getBalance(cover.target)).to.be.equal(coverContractBalanceBefore);
    expect(await ethers.provider.getBalance(pool.target)).to.equal(poolEthBalanceBefore + nativeCoverPremium);
    expect(await ethers.provider.getBalance(riPremiumDst.address)).to.equal(riPremiumDstEthBalanceBefore + riPremium);

    const storedCoverData = await cover.getCoverData(coverId);
    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(amount);

    const riData = await cover.getCoverRi(coverId);
    expect(riData.providerId).to.equal(riProviderId);
    expect(riData.amount).to.equal(riAmount);
  });

  it('should revert if the deadline expired', async function () {
    const fixture = await loadFixture(setup);
    const { cover, riSigner, riProviderId } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, targetPriceRatio, priceDenominator } = coverFixture;
    const { riAmount, riPremium } = riCoverFixture;

    const nativeCoverPremium = (amount * targetPriceRatio * period) / (priceDenominator * 365n * 24n * 3600n);
    const totalPremium = nativeCoverPremium + riPremium;

    const coverParams = {
      coverId: 0,
      owner: coverBuyer,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: totalPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: ZeroAddress,
      ipfsData: '',
    };

    const timestamp = await time.latest();
    const deadline = timestamp + 30 * 60;
    const data = [{ amount: riAmount, vaultId: 1, subnetworkId: 1, providerId: riProviderId }];
    const dataFormat = 1;
    const dataEncoded = encodeRiData(data, dataFormat);

    const riQuote = {
      coverId: 0,
      productId,
      providerId: riProviderId,
      amount: riAmount,
      premium: riPremium,
      period,
      coverAsset,
      data: dataEncoded,
      dataFormat,
      deadline,
      nonce: 0,
    };

    const riRequest = {
      providerId: riProviderId,
      amount: riAmount,
      premium: riPremium,
      deadline,
      data: dataEncoded,
      dataFormat,
      signature: await signRiQuote(riSigner, cover, riQuote),
    };

    await time.increase(60 * 30);

    await expect(
      cover.connect(coverBuyer).buyCoverWithRi(coverParams, poolAllocationRequest, riRequest, { value: totalPremium }),
    ).to.be.revertedWithCustomError(cover, 'SignatureExpired');
  });

  it('should revert if the ri amount is 0', async function () {
    const fixture = await loadFixture(setup);
    const { cover, riSigner, riProviderId } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, targetPriceRatio, priceDenominator } = coverFixture;
    const { riAmount, riPremium } = riCoverFixture;

    const nativeCoverPremium = (amount * targetPriceRatio * period) / (priceDenominator * 365n * 24n * 3600n);
    const totalPremium = nativeCoverPremium + riPremium;

    const coverParams = {
      coverId: 0,
      owner: coverBuyer,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: totalPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: ZeroAddress,
      ipfsData: '',
    };

    const timestamp = await time.latest();
    const deadline = timestamp + 30 * 60;
    const data = [{ amount: 0, vaultId: 1, subnetworkId: 1, providerId: riProviderId }];
    const dataFormat = 1;
    const dataEncoded = encodeRiData(data, dataFormat);

    const riQuote = {
      coverId: 0,
      productId,
      providerId: riProviderId,
      amount: riAmount,
      premium: riPremium,
      period,
      coverAsset,
      data: dataEncoded,
      dataFormat,
      deadline,
      nonce: 0,
    };

    const riRequest = {
      providerId: riProviderId,
      amount: 0,
      premium: riPremium,
      data: dataEncoded,
      dataFormat,
      deadline,
      signature: await signRiQuote(riSigner, cover, riQuote),
    };

    await expect(
      cover.connect(coverBuyer).buyCoverWithRi(coverParams, poolAllocationRequest, riRequest, { value: totalPremium }),
    ).to.be.revertedWithCustomError(cover, 'RiAmountIsZero');
  });

  it('should revert if the payment amount is not cover amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover, riSigner, riProviderId } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, targetPriceRatio, priceDenominator } = coverFixture;
    const { riAmount, riPremium } = riCoverFixture;

    const nativeCoverPremium = (amount * targetPriceRatio * period) / (priceDenominator * 365n * 24n * 3600n);
    const totalPremium = nativeCoverPremium + riPremium;

    const coverParams = {
      coverId: 0,
      owner: coverBuyer,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: totalPremium,
      paymentAsset: coverAsset + 1n,
      commissionRatio: parseEther('0'),
      commissionDestination: ZeroAddress,
      ipfsData: '',
    };

    const timestamp = await time.latest();
    const deadline = timestamp + 30 * 60;
    const data = [{ amount: riAmount, vaultId: 1, subnetworkId: 1, providerId: riProviderId }];
    const dataFormat = 1;
    const dataEncoded = encodeRiData(data, dataFormat);

    const riQuote = {
      coverId: 0,
      productId,
      providerId: riProviderId,
      amount: riAmount,
      premium: riPremium,
      period,
      coverAsset,
      data: dataEncoded,
      dataFormat,
      deadline,
      nonce: 0,
    };

    const riRequest = {
      providerId: riProviderId,
      amount: riAmount,
      premium: riPremium,
      deadline,
      data: dataEncoded,
      dataFormat,
      signature: await signRiQuote(riSigner, cover, riQuote),
    };

    await expect(
      cover.connect(coverBuyer).buyCoverWithRi(coverParams, poolAllocationRequest, riRequest, { value: totalPremium }),
    ).to.be.revertedWithCustomError(cover, 'InvalidPaymentAsset');
  });
});
