const { ethers } = require('hardhat');
const { expect } = require('chai');
const base64 = require('base64-js');
const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const JSON_HEADER = 'data:application/json;base64,';
const SVG_HEADER = 'data:image/svg+xml;base64,';

describe('CoverNFTDescriptor', function () {
  beforeEach(async function () {
    const {
      members: [staker, coverBuyer],
    } = this.accounts;
    const { stakingPool1, cover, dai } = this.contracts;
    const { TRANCHE_DURATION } = this.config;
    const stakingAmount = parseEther('100');

    // Move to beginning of next block
    const { timestamp } = await ethers.provider.getBlock('latest');
    const trancheId = Math.floor(timestamp / TRANCHE_DURATION);

    const depositTrancheId = trancheId + 2;
    await stakingPool1.connect(staker).depositTo(
      stakingAmount,
      depositTrancheId,
      0, // new position
      AddressZero,
    );

    // Cover details
    const poolId = await stakingPool1.getPoolId();
    const amount = parseEther('4');
    const targetPrice = this.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = 10000;
    const coverAsset = 0; // ETH
    const expectedPremium = amount.mul(targetPrice).div(priceDenominator);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0, // new cover
        owner: coverBuyer.address,
        productId: 0,
        coverAsset,
        amount,
        period: daysToSeconds(30),
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    await dai.mint(coverBuyer.address, amount);
    await dai.connect(coverBuyer).approve(cover.address, MaxUint256);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: 0, // new cover
        owner: coverBuyer.address,
        productId: 0,
        coverAsset: 1, // DAI
        amount,
        period: daysToSeconds(30),
        maxPremiumInAsset: expectedPremium,
        paymentAsset: 1,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount.toString() }],
    );
  });

  it('tokenURI json output should be formatted properly', async function () {
    const { coverNFT } = this.contracts;

    const uri = await coverNFT.tokenURI(1);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    // name/description
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Cover');
    expect(decodedJson.description.length).to.be.gt(0);
    expect(decodedJson.description).to.contain('ETH');

    // image
    expect(decodedJson.image.slice(0, SVG_HEADER.length)).to.be.equal(SVG_HEADER);
    // const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(SVG_HEADER.length)));
    // TODO: verify svg
  });

  it('should handle dai covers', async function () {
    const { coverNFT } = this.contracts;

    const uri = await coverNFT.tokenURI(2);
    expect(uri.slice(0, JSON_HEADER.length)).to.be.equal(JSON_HEADER);

    // name/description
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    expect(decodedJson.description).to.contain('DAI');
  });

  // TODO: move to unit tests when they are made
  it('should handle usdc covers', async function () {
    const { coverNFTDescriptor } = this.contracts;
    expect(await coverNFTDescriptor.getAssetSymbol(4)).to.be.equal('USDC');
  });

  it('should handle non-existent token', async function () {
    const { coverNFT } = this.contracts;

    const uri = await coverNFT.tokenURI(3);
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    expect(decodedJson.description).to.be.equal('This NFT does not exist');
  });

  it('should handle expired token', async function () {
    const { coverNFT, cover } = this.contracts;

    // expire cover
    const coverSegment = await cover.coverSegmentWithRemainingAmount(1, 0);
    const expiryTimestamp = coverSegment.start + coverSegment.period;
    await setNextBlockTime(expiryTimestamp);
    await mineNextBlock();

    // decode uri
    const uri = await coverNFT.tokenURI(1);
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));

    // get expected expiry date string
    const expectedExpiryDate = new Date(expiryTimestamp * 1000 /* milliseconds */);
    const dateStringWithDay = expectedExpiryDate.toDateString();
    // remove day of week
    const dateString = dateStringWithDay.slice(3);

    expect(decodedJson.description).to.contain(dateString);
    expect(decodedJson.description).to.contain('This cover NFT has already expired');

    // check that javascript can parse the date
    expect(new Date(dateString).toDateString()).to.be.equal(dateStringWithDay);
  });

  it('should handle token that expired decades ago', async function () {
    const { coverNFT, cover } = this.contracts;

    // get cover segment
    const coverSegment = await cover.coverSegmentWithRemainingAmount(1, 0);
    const expiryTimestamp = coverSegment.start + coverSegment.period;
    const timeAtQuery = expiryTimestamp + daysToSeconds(365 * 20);
    // expire cover
    await setNextBlockTime(timeAtQuery);
    await mineNextBlock();

    const uri = await coverNFT.tokenURI(1);
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(JSON_HEADER.length))));
    const expectedExpiryDate = new Date(expiryTimestamp * 1000 /* milliseconds */);
    const dateStringWithDay = expectedExpiryDate.toDateString();
    // remove day of week
    const dateString = dateStringWithDay.slice(3);

    expect(decodedJson.description).to.contain(dateString);
    expect(decodedJson.description).to.contain('This cover NFT has already expired');

    // check that javascript can parse the date
    expect(new Date(dateString).toDateString()).to.be.equal(dateStringWithDay);
  });
});
