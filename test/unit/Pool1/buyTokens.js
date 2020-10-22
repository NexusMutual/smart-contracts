const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const { accounts, constants } = require('../utils');

const {
  nonMembers: [fundSource],
  members: [memberOne],
} = accounts;

describe('buyTokens', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');

  it('successfully buys tokens', async function () {
    const { pool1, mcr, poolData, token } = this;

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('210959924071154460525457');
    const mcrPercentagex100 = initialAssetValue.mul(new BN(10000)).div(mcrEth);

    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue
    });


    const refs = {
      p1: await mcr.p1(),
      pd: await mcr.pd(),
      tk: await mcr.tk(),
      qd: await mcr.qd(),
      mr: await mcr.td(),
      proposalCategory: await mcr.proposalCategory()
    };

    console.log(refs);

    await poolData.setAverageRate(hex('ETH'), ethRate);
    await poolData.setAverageRate(hex('DAI'), daiRate);

    const date = new Date().getTime();
    await poolData.setLastMCR(mcrPercentagex100, mcrEth, initialAssetValue, date);

    const currency = hex('DAI');

    const data = {
      getCurrenciesByIndex: await poolData.getCurrenciesByIndex(0),
      getAllCurrenciesLen: await poolData.getAllCurrenciesLen(),
      dai: await poolData.getCurrencyAssetAddress(currency),
      avgRate: await poolData.getCAAvgRate(currency),
      lastMCR: JSON.stringify(await poolData.getLastMCR())
    };
    console.log(data);


    const { vtp, mcrtp } = await mcr.calVtpAndMCRtp();
    console.log({
      vtp: vtp.toString(),
      mcrtp: mcrtp.toString()
    });
    const { totalAssetValue, mcrPercentage } = await mcr.getTotalAssetValueAndMCRPercentage();
    console.log({
      totalAssetValue: totalAssetValue.toString()
    });
    // await pool1.buyTokens()


    const buyValue = ether('1000');


    const tokensExpected = await mcr.getTokenBuyValue(buyValue);
    console.log({
      tokensExpected: tokensExpected.toString()
    });

    await pool1.buyTokens( '0', {
      from: memberOne,
      value: buyValue
    });

    const postBuyBalance = await token.balanceOf(memberOne);
    console.log({
      postBuyBalance: postBuyBalance.toString()
    })
  });
});

