const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const utils = require('../utils');

const {
  helpers: { toBytes8 },
  constants: {
    Assets: { ETH: ETH_ADDRESS },
    AggregatorType,
  },
} = utils;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

describe('getPoolValueInEth', function () {
  it('gets total value of ETH and DAI assets in the pool', async function () {
    const fixture = await loadFixture(setup);
    const { pool, mcr, chainlinkDAI, dai } = fixture;
    const [nonMember] = fixture.accounts.nonMembers;

    const initialAssetValue = BigNumber.from('210959924071154460525457');
    const mcrEth = BigNumber.from('162424730681679380000000');
    const ethToDaiRate = parseEther('394.59');
    const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);
    await chainlinkDAI.setLatestAnswer(daiToEthRate);

    await mcr.setMCR(mcrEth);
    await nonMember.sendTransaction({ to: pool.address, value: initialAssetValue });

    const daiAmount = parseEther('10000');
    await dai.mint(pool.address, daiAmount);

    const expectedPoolValue = initialAssetValue.add(daiAmount.mul(daiToEthRate).div(parseEther('1')));
    const poolValue = await pool.getPoolValueInEth();
    expect(poolValue).to.equal(expectedPoolValue);
  });

  it('should not fail when pool asset balanceOf reverts', async function () {
    const fixture = await loadFixture(setup);
    const { pool, dai, stETH, enzymeVault, st } = fixture;
    const { chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault, chainlinkEthUsdAsset } = fixture;
    const [governance] = fixture.accounts.governanceContracts;

    const ERC20RevertingBalanceOfMock = await ethers.getContractFactory('ERC20RevertingBalanceOfMock');
    const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const revertingERC20 = await ERC20RevertingBalanceOfMock.deploy();
    const chainlinkForRevertingERC20 = await ChainlinkAggregatorMock.deploy();
    await chainlinkForRevertingERC20.setLatestAnswer(parseEther('1'));

    const priceFeedOracle = await PriceFeedOracle.deploy(
      [dai, stETH, enzymeVault, revertingERC20, { address: ETH_ADDRESS }].map(c => c.address),
      [chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault, chainlinkForRevertingERC20, chainlinkEthUsdAsset].map(
        c => c.address,
      ),
      [AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.USD],
      [18, 18, 18, 18, 18],
      st.address,
    );

    await pool.connect(governance).updateAddressParameters(toBytes8('PRC_FEED'), priceFeedOracle.address);
    await pool.connect(governance).addAsset(revertingERC20.address, true, '0', parseEther('100'), '1000');

    // 1 token = 1 eth
    const tokenValue = parseEther('1');

    await revertingERC20.setBalance(pool.address, tokenValue);
    const valueWithToken = await pool.getPoolValueInEth();

    await revertingERC20.setIsReverting(true);
    const valueWithoutToken = await pool.getPoolValueInEth();

    expect(valueWithToken).to.equal(valueWithoutToken.add(tokenValue));
  });

  it('includes swapValue in the calculation', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const [governance] = fixture.accounts.governanceContracts;
    const { defaultSender } = fixture.accounts;

    const oldPoolValue = await pool.getPoolValueInEth();

    await pool.connect(governance).updateAddressParameters(toBytes8('SWP_OP'), defaultSender.address);
    await pool.setSwapAssetAmount(ETH_ADDRESS, parseEther('1'));

    const swapValue = await pool.assetInSwapOperator();
    expect(swapValue.toString()).to.eq(parseEther('1').toString());

    const newPoolValue = await pool.getPoolValueInEth();

    expect(newPoolValue).to.eq(oldPoolValue.add(swapValue));
  });
});
