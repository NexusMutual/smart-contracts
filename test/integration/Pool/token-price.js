const { ethers } = require('hardhat');
const { parseEther, defaultAbiCoder } = ethers.utils;
const { MaxUint256 } = ethers.constants;
const { BigNumber } = ethers;
const { assert, expect } = require('chai');
const Decimal = require('decimal.js');
const { setNextBlockTime, mineNextBlock, setEtherBalance } = require('../../utils/evm');
const { ETH_ASSET_ID } = require('../utils/cover');
const { daysToSeconds } = require('../../../lib/helpers');
const { ProposalCategory } = require('../utils').constants;
const { calculateEthForNXMRelativeError, calculateNXMForEthRelativeError, getTokenSpotPrice } =
  require('../utils').tokenPrice;

const { buyCover } = require('../utils/cover');
const { stake } = require('../utils/staking');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { hex } = require('../utils').helpers;

const increaseTime = async interval => {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
  const timestamp = currentTime + interval;
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const ratioScale = BigNumber.from(10000);

const ethCoverTemplate = {
  productId: 0, // DEFAULT_PRODUCT
  coverAsset: ETH_ASSET_ID, // ETH
  period: daysToSeconds(30), // 30 days
  gracePeriod: daysToSeconds(30),
  amount: parseEther('1'),
  priceDenominator: 10000,
  coverId: 0,
  segmentId: 0,
  incidentId: 0,
  assessmentId: 0,
};

async function tokenPriceSetup() {
  const fixture = await setup();
  const { tk, stakingPool1: stakingPool, tc } = fixture.contracts;
  const [member1] = fixture.accounts.members;

  const operator = await tk.operator();
  await setEtherBalance(operator, parseEther('10000000'));
  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('1000000000000'));

  await tk.connect(member1).approve(tc.address, MaxUint256);
  await stake({
    stakingPool,
    staker: member1,
    productId: ethCoverTemplate.productId,
    period: daysToSeconds(60),
    gracePeriod: daysToSeconds(30),
    amount: parseEther('1000000'),
  });

  return fixture;
}

describe('Token price functions', function () {
  it('getTokenPriceInAsset returns spot price for all assets', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, mcr } = fixture.contracts;
    const { ethToDaiRate } = fixture.rates;

    const ethTokenPrice = await pool.getTokenPriceInAsset(0);
    const daiTokenPrice = await pool.getTokenPriceInAsset(1);

    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();
    const expectedEthTokenPrice = BigNumber.from(getTokenSpotPrice(totalAssetValue, mcrEth).toString());

    const ethPriceDiff = ethTokenPrice.sub(expectedEthTokenPrice).abs();
    assert(
      ethPriceDiff.lte(BigNumber.from(1)),
      `token price ${ethTokenPrice.toString()} not close enough to ${expectedEthTokenPrice.toString()}`,
    );

    const expectedDaiPrice = BigNumber.from(ethToDaiRate / 100).mul(expectedEthTokenPrice);
    const daiPriceDiff = daiTokenPrice.sub(expectedDaiPrice);
    assert(
      daiPriceDiff.lte(BigNumber.from(10000)), // negligible amount of wei
      `DAI token price ${daiTokenPrice.toString()} not close enough to ${expectedDaiPrice.toString()}`,
    );
  });

  it('getTokenPrice returns the price in ETH', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, mcr } = fixture.contracts;

    const ethTokenPrice = await pool.getTokenPriceInAsset(0);
    const tokenPriceInEthImplicit = await pool.getTokenPrice();
    expect(tokenPriceInEthImplicit).to.be.equal(ethTokenPrice);

    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();
    const expectedEthTokenPrice = BigNumber.from(getTokenSpotPrice(totalAssetValue, mcrEth).toString());

    const ethPriceDiff = ethTokenPrice.sub(expectedEthTokenPrice).abs();
    assert(
      ethPriceDiff.lte(BigNumber.from(1)),
      `token price ${ethTokenPrice.toString()} not close enough to ${expectedEthTokenPrice.toString()}`,
    );
  });

  it('buyNXM reverts for non-member', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool } = fixture.contracts;
    const [nonMember1] = fixture.accounts.nonMembers;

    const buyValue = parseEther('10');
    await expect(pool.connect(nonMember1).buyNXM('0', { value: buyValue })).to.be.revertedWith(
      'Caller is not a member',
    );
  });

  it('sellNXM reverts for non-member', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool } = fixture.contracts;
    const [nonMember1] = fixture.accounts.nonMembers;

    await expect(pool.connect(nonMember1).sellNXM('1', '0')).to.be.revertedWith('Caller is not a member');
  });

  it('sellNXM reverts if member does not have enough NXM balance', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, tk: token } = fixture.contracts;

    const [member1] = fixture.accounts.members;
    const memberBalance = await token.balanceOf(member1.address);

    await expect(pool.connect(member1).sellNXM(memberBalance.add(1), '0')).to.be.revertedWith(
      'Pool: Not enough balance',
    );
  });

  it('buyNXM mints tokens for member in exchange of ETH', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { tk: token, p1: pool, mcr } = fixture.contracts;

    const [member] = fixture.accounts.members;
    const buyValue = parseEther('1000');
    const expectedTokensReceived = await pool.getNXMForEth(buyValue);
    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();

    const preBuyBalance = await token.balanceOf(member.address);
    await pool.connect(member).buyNXM(expectedTokensReceived, { value: buyValue });

    const postBuyBalance = await token.balanceOf(member.address);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    expect(tokensReceived).to.be.equal(expectedTokensReceived);

    const maxRelativeError = new Decimal(0.0006);
    const { relativeError } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokensReceived);
    assert(
      relativeError.lt(maxRelativeError),
      `Relative error too high ${relativeError.toString()} > ${maxRelativeError.toFixed()}`,
    );
  });

  it('sellNXM burns tokens for member and returns ETH', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { tk: token, p1: pool } = fixture.contracts;

    const [member] = fixture.accounts.members;
    const ethIn = parseEther('500');
    const nxmAmount = await pool.getNXMForEth(ethIn);

    // buy tokens first
    await pool.connect(member).buyNXM(nxmAmount, { value: ethIn });

    // sell them back
    const preNXMSellBalance = await token.balanceOf(member.address);
    const preSellTokenSupply = await token.totalSupply();
    const preSellEthBalance = await ethers.provider.getBalance(member.address);

    await pool.connect(member).sellNXM(nxmAmount, '0');

    const postSellEthBalance = await ethers.provider.getBalance(member.address);
    const postSellNXMBalance = await token.balanceOf(member.address);
    const postSellTokenSupply = await token.totalSupply();

    const tokensTakenAway = preNXMSellBalance.sub(postSellNXMBalance);
    const tokensBurned = preSellTokenSupply.sub(postSellTokenSupply);

    expect(tokensTakenAway).to.be.equal(nxmAmount);
    expect(tokensBurned).to.be.equal(nxmAmount);

    const ethOut = postSellEthBalance.sub(preSellEthBalance);

    const maxRelativeError = new Decimal(0.0002);
    const { relativeError } = calculateEthForNXMRelativeError(ethIn, ethOut);

    assert(
      relativeError.lt(maxRelativeError),
      `Relative error too high ${relativeError.toString()} > ${maxRelativeError.toFixed()}`,
    );
  });

  it('buyNXM token price reflects the latest lower MCR value (lower MCReth -> higher price)', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, mcr } = fixture.contracts;

    const [member1] = fixture.accounts.members;

    const buyValue = parseEther('1000');
    const expectedNXMOutPreMCRPosting = await pool.getNXMForEth(buyValue);
    const spotTokenPricePreMCRPosting = await pool.getTokenPriceInAsset(ETH_ASSET_ID);
    await pool.getPoolValueInEth();

    // trigger an MCR update and post a lower MCR since lowering the price (higher MCR percentage)
    const minUpdateTime = await mcr.minUpdateTime();

    await increaseTime(minUpdateTime + 1);

    // perform a buy with a negligible amount of ETH
    await pool.connect(member1).buyNXM('0', { value: '1' });
    // let time pass so that mcr decreases towards desired MCR
    await increaseTime(6 * 3600);

    const spotTokenPricePostMCRPosting = await pool.getTokenPriceInAsset(ETH_ASSET_ID);
    const expectedNXMOutPostMCRPosting = await pool.getNXMForEth(buyValue);

    assert(
      spotTokenPricePostMCRPosting.gt(spotTokenPricePreMCRPosting),
      `Expected token price to be higher than ${spotTokenPricePreMCRPosting.toString()} at a lower mcrEth.
       Price: ${spotTokenPricePostMCRPosting.toString()}`,
    );
    assert(
      expectedNXMOutPostMCRPosting.lt(expectedNXMOutPreMCRPosting),
      `Expected to receive less tokens than ${expectedNXMOutPreMCRPosting.toString()} at a lower mcrEth.
       Receiving: ${expectedNXMOutPostMCRPosting.toString()}`,
    );
  });

  it('buyNXM token price reflects the latest higher MCR value (higher MCReth -> lower price)', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, mcr, cover, stakingProducts } = fixture.contracts;
    const [member1, coverHolder] = fixture.accounts.members;

    const buyValue = parseEther('1000');
    const expectedNXMOutPreMCRPosting = await pool.getNXMForEth(buyValue);
    const spotTokenPricePreMCRPosting = await pool.getTokenPriceInAsset(ETH_ASSET_ID);

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = BigNumber.from(gearingFactor)
      .mul(currentMCR.add(parseEther('300')))
      .div(ratioScale);

    const coverBuyParams = { ...ethCoverTemplate, amount: coverAmount };
    const product = await stakingProducts.getProduct(1 /* poolId */, coverBuyParams.productId);
    // increase totalSumAssured to trigger MCR increase
    await buyCover({
      ...coverBuyParams,
      cover,
      coverBuyer: coverHolder,
      targetPrice: product.targetPrice,
      expectedPremium: coverAmount,
    });

    // trigger an MCR update and post a lower MCR since lowering the price (higher MCR percentage)
    const minUpdateTime = await mcr.minUpdateTime();
    await increaseTime(minUpdateTime + 1);

    // perform a buy with a negligible amount of ETH
    await pool.connect(member1).buyNXM('0', { value: '1' });
    // let time pass so that mcr increases towards desired MCR
    await increaseTime(6 * 3600); // 6 hours

    const spotTokenPricePostMCRPosting = await pool.getTokenPriceInAsset(ETH_ASSET_ID);
    const expectedNXMOutPostMCRPosting = await pool.getNXMForEth(buyValue);

    expect(spotTokenPricePostMCRPosting).to.be.lt(spotTokenPricePreMCRPosting);
    expect(expectedNXMOutPostMCRPosting).to.be.gt(expectedNXMOutPreMCRPosting);
  });

  it('getPoolValueInEth calculates pool value correctly', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool, dai } = fixture.contracts;
    const { daiToEthRate } = fixture.rates;

    const poolBalance = BigNumber.from(await ethers.provider.getBalance(pool.address));
    const daiBalance = await dai.balanceOf(pool.address);
    const expectedDAiValueInEth = daiToEthRate.mul(daiBalance).div(parseEther('1'));
    const expectedTotalAssetValue = poolBalance.add(expectedDAiValueInEth);
    const totalAssetValue = await pool.getPoolValueInEth();
    assert(totalAssetValue.toString(), expectedTotalAssetValue.toString());
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    const { p1: pool } = fixture.contracts;
    const mcrRatio = await pool.getMCRRatio();
    assert.equal(mcrRatio.toString(), '22000'); // ETH + DAI + USDC
  });

  it('sellNXM reverts for member if tokens are locked for member vote', async function () {
    const fixture = await loadFixture(tokenPriceSetup);
    // [todo] Use new contracts
    const { gv, master, p1: pool } = fixture.contracts;

    const [member] = fixture.accounts.members;

    const mcrCode = hex('MC');
    const MCR = await ethers.getContractFactory('MCR');
    const newMCR = await MCR.deploy(master.address);

    const contractCodes = [mcrCode];
    const newAddresses = [newMCR.address];

    const upgradeContractsData = defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, newAddresses]);

    const proposalId = await gv.getProposalLength();
    await gv.createProposal('', '', '', '0');
    await gv.categorizeProposal(proposalId, ProposalCategory.upgradeProxy, 0);
    await gv.submitProposalWithSolution(proposalId, '', upgradeContractsData);

    await gv.connect(member).submitVote(proposalId, 1, []);

    await expect(pool.connect(member).sellNXM('1', '0')).to.be.revertedWith('Pool: NXM tokens are locked for voting');
  });
});
