const fetch = require('node-fetch');
const { artifacts, run, web3, accounts, network } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');
const { toDecimal, calculateRelativeError, percentageBN, calculateEthForNXMRelativeError } = require('../utils').tokenPrice;
const { BN } = web3.utils;
const { encode1 } = require('./external');
const { logEvents, hex, tenderlyFactory } = require('../utils').helpers;

const MemberRoles = artifacts.require('MemberRoles');
const Pool1 = artifacts.require('Pool1');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const PoolData = artifacts.require('PoolData');
const PooledStaking = artifacts.require('PooledStaking');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctions');
const Claims = artifacts.require('Claims');
const ClaimsReward = artifacts.require('ClaimsReward');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const Pool2 = artifacts.require('Pool2');
const OldMCR = artifacts.require('P1MockOldMCR');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ERC20 = artifacts.require('ERC20');

const SwapAgent = artifacts.require('SwapAgent');
const TwapOracle = artifacts.require('TwapOracle');
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const upgradeProxyImplementationCategoryId = 5;
const newContractAddressUpgradeCategoryId = 29;
const addNewInternalContractCategoryId = 34;

const tenderly = tenderlyFactory(web3, network);

async function submitGovernanceProposal (categoryId, actionHash, members, gv, submitter) {

  const proposalTitle = 'proposal';
  const proposalSD = 'proposal';
  const proposalDescHash = 'proposal';
  const incentive = 0;
  const proposalId = await gv.getProposalLength();
  console.log(`Creating proposal ${proposalId}`);

  await gv.createProposal(proposalTitle, proposalSD, proposalDescHash, 0, { from: submitter });
  await gv.categorizeProposal(proposalId, categoryId, incentive, { from: submitter });
  await gv.submitProposalWithSolution(proposalId, 'proposal', actionHash, { from: submitter });

  console.log(`Voting for proposal ${proposalId}`);

  for (let i = 0; i < members.length; i++) {
    await gv.submitVote(proposalId, 1, { from: members[i] });
  }

  console.log(`Closing proposal`);
  await time.increase(604800);
  logEvents(await tenderly(gv.closeProposal(proposalId, { from: submitter })));

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3);
}

const holders = [
  '0xd7cba5b9a0240770cfd9671961dae064136fa240',
  '0xd1bda2c21d73ee31a0d3fdcd64b0d7c4bce6d021',
];

const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';

describe.only('NXM sells and buys', function () {

  it('performs contract upgrades', async function () {
    const versionData = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const [{ address: masterAddress }] = versionData.mainnet.abis.filter(({ code }) => code === 'NXMASTER');
    const master = await NXMaster.at(masterAddress);

    const { contractsName, contractsAddress } = await master.getVersionData();

    const nameToAddressMap = {
      NXMTOKEN: await master.dAppToken(),
    };

    for (let i = 0; i < contractsName.length; i++) {
      nameToAddressMap[web3.utils.toAscii(contractsName[i])] = contractsAddress[i];
    }

    const memberRoles = await MemberRoles.at(nameToAddressMap['MR']);
    const token = await NXMToken.at(nameToAddressMap['NXMTOKEN']);
    const governance = await Governance.at(nameToAddressMap['GV']);
    const poolData = await PoolData.at(nameToAddressMap['PD']);
    const oldPool1 = await Pool1.at(nameToAddressMap['P1']);
    const oldMCR = await OldMCR.at(nameToAddressMap['MC']);
    const oldPool2Address = nameToAddressMap['P2'];
    const dai = await ERC20.at(daiAddress);

    const [funder] = accounts;

    console.log('Fetch board members..');
    const members = await memberRoles.members('1');
    const boardMembers = members.memberArray;

    console.log(boardMembers);

    const membersToTopUp = [];
    membersToTopUp.push(...boardMembers);
    membersToTopUp.push(...holders);
    for (const member of membersToTopUp) {
      console.log(`Topping up ${member}`);
      await web3.eth.sendTransaction({ from: funder, to: member, value: ether('1000000') });
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [member],
      });
    }

    const firstBoardMember = boardMembers[0];

    const pool1EthBalanceBefore = await web3.eth.getBalance(oldPool1.address);
    const pool1DaiBalanceBefore = await dai.balanceOf(oldPool1.address);

    const { totalAssetValue: totalPoolValueBefore } = await oldMCR.calVtpAndMCRtp();

    const tokenSpotPriceEthBefore = await oldMCR.calculateTokenPrice(hex('ETH'));
    const tokenSpotPriceDaiBefore = await oldMCR.calculateTokenPrice(hex('DAI'));
    /*
     Required upgrades:
       contracts/modules/capital/MCR.sol
       contracts/modules/capital/Pool1.sol
       contracts/modules/claims/Claims.sol
       contracts/modules/token/TokenFunctions.sol
       contracts/oracles/PriceFeedOracle.sol
    */

    console.log(`Deploying new TokenFunctions..`);
    const newTF = await TokenFunctions.new({ from: firstBoardMember });

    console.log(`Deploying new Claims..`);
    const newCL = await Claims.new({ from: firstBoardMember });

    console.log(`Deploying new MCR..`);
    const newMCR = await MCR.new(masterAddress, { from: firstBoardMember });

    console.log(`Deploying new ClaimsReward..`);
    const newClaimsReward = await ClaimsReward.new(masterAddress, daiAddress, { from: firstBoardMember });

    console.log(`Deploying new Quotation..`);
    const newQuotation = await Quotation.new({ from: firstBoardMember });

    console.log(`Deploying new Pool2..`);
    const newPool2 = await Pool2.new(masterAddress, { from: firstBoardMember });

    console.log(`Deploying PriceFeedOracle..`);
    const assets = [daiAddress];
    const aggregators = ['0x773616E4d11A78F511299002da57A0a94577F1f4'];
    const priceFeedOracle = await PriceFeedOracle.new(assets, aggregators, daiAddress);

    const uniswapFactoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
    const twapOracle = await TwapOracle.new(uniswapFactoryAddress);
    const swapAgent = await SwapAgent.new();

    Pool1.link(swapAgent);

    console.log('Deploying new Pool..');
    const newPool1 = await Pool1.new(
      [daiAddress],
      [0],
      [ether('10000000')],
      [ether('0.01')],
      masterAddress,
      priceFeedOracle.address,
      twapOracle.address,
      firstBoardMember,
      { from: firstBoardMember },
    );

    const upgradeMultipleContractsActionHash = encode1(
      ['bytes2[]', 'address[]'],
      [
        [hex('P2'), hex('TF'), hex('CL'), hex('MCR'), hex('P1'), hex('QT')],
        [newPool2.address, newTF.address, newCL.address, newMCR.address, newPool1.address, newQuotation.address]
      ],
    );

    await submitGovernanceProposal(
      newContractAddressUpgradeCategoryId, upgradeMultipleContractsActionHash, boardMembers, governance, boardMembers[1],
    );

    const storedTFAddress = await master.getLatestAddress(hex('TF'));
    const storedCLAddress = await master.getLatestAddress(hex('CL'));
    const storedMCRAddress = await master.getLatestAddress(hex('MCR'));
    const storedP1Address = await master.getLatestAddress(hex('P1'));
    const storedP2Address = await master.getLatestAddress(hex('P2'));

    assert.equal(storedTFAddress, newTF.address);
    assert.equal(storedCLAddress, newCL.address);
    assert.equal(storedMCRAddress, newMCR.address);
    assert.equal(storedP1Address, newPool1.address);
    assert.equal(storedP2Address, newPool2.address);

    console.log(`Successfully upgraded.`);

    console.log(`Moving funds from obsolete Pool2 to Pool1..`);
    await newPool2.transferAssets([daiAddress]);
    console.log('Transferred assets.');

    const pool1 = await Pool1.at(await master.getLatestAddress(hex('P1')));

    /* Pool balance checks */
    const oldPool1EthBalanceAfter = await web3.eth.getBalance(oldPool1.address);
    const oldPool1DaiBalanceAfter = await dai.balanceOf(oldPool1.address);
    assert.equal(oldPool1EthBalanceAfter.toString(), '0');
    assert.equal(oldPool1DaiBalanceAfter.toString(), '0');

    const pool1EthBalanceAfter = await web3.eth.getBalance(pool1.address);
    const pool1DaiBalanceAfter = await dai.balanceOf(pool1.address);
    assert.equal(pool1DaiBalanceBefore.toString(), pool1DaiBalanceAfter.toString());
    assert.equal(pool1EthBalanceBefore.toString(), pool1EthBalanceAfter.toString());

    /* Token spot price checks */

    const tokenSpotPriceEthAfter = await pool1.getTokenPrice(ETH);
    const tokenSpotPriceDaiAfter = await pool1.getTokenPrice(daiAddress);

    const { _a, _c, rate } = await poolData.getTokenPriceDetails(hex('DAI'));

    const priceFeedRate = await priceFeedOracle.getAssetToEthRate(daiAddress);

    const poolValue = await pool1.getPoolValueInEth();

    console.log({
      getCAAvgRate: rate.toString(),
      priceFeedRate: priceFeedRate.toString(),
      poolValue: poolValue.toString(),
      totalPoolValueBefore: totalPoolValueBefore.toString(),
      pool1EthBalanceAfter: pool1EthBalanceAfter.toString(),
      pool1DaiBalanceAfter: pool1DaiBalanceAfter.toString()
    });
    console.log({
      tokenSpotPriceDaiBefore: tokenSpotPriceDaiBefore.toString(),
      tokenSpotPriceDaiAfter: tokenSpotPriceDaiAfter.toString()
    });
    assert.equal(poolValue.toString(), poolValue.toString());

    const relativeErrorEthSpotPrice = calculateRelativeError(tokenSpotPriceEthAfter, tokenSpotPriceEthBefore);
    assert(
      relativeErrorEthSpotPrice.lt(Decimal(0.0005)),
      `old token ETH spot price ${tokenSpotPriceEthBefore.toString()} differs too much from ${tokenSpotPriceEthAfter.toString()}
      relative error; ${relativeErrorEthSpotPrice}`,
    );

    const relativeErrorDaiSpotPrice = calculateRelativeError(tokenSpotPriceDaiAfter, tokenSpotPriceDaiBefore);
    assert(
      relativeErrorDaiSpotPrice.lt(Decimal(0.0005)),
      `old token DAI spot price ${tokenSpotPriceDaiBefore.toString()} differs too much from ${tokenSpotPriceDaiAfter.toString()}
      relative error: ${relativeErrorDaiSpotPrice.toString()}`,
    );

    this.firstBoardMember = firstBoardMember;
    this.master = master;
    this.token = token;
    this.poolData = poolData;
    this.tokenController = await TokenController.at(await master.getLatestAddress(hex('TC')));
    this.pooledStaking = await PooledStaking.at(await master.getLatestAddress(hex('PS')));
    this.pool1 = pool1;
  });

  it('performs buys and sells', async function () {
    const { poolData, pool1, token } = this;
    const holder = holders[0];

    const mcrEth = await poolData.getLastMCREther();
    const maxBuy = percentageBN(mcrEth, 4.95);

    const balancePre = await token.balanceOf(holder);
    await pool1.buyNXM('0', {
      value: maxBuy,
      from: holder,
    });
    const balancePost = await token.balanceOf(holder);
    const nxmOut = balancePost.sub(balancePre);

    const balancePreSell = await web3.eth.getBalance(holder);
    const sellTx = await pool1.sellNXM(nxmOut, '0', {
      from: holder,
    });

    const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
    const ethSpentOnGas = Decimal(sellTx.receipt.gasUsed).mul(Decimal(gasPrice));
    const balancePostSell = await web3.eth.getBalance(holder);
    const ethOut = toDecimal(balancePostSell).sub(toDecimal(balancePreSell)).add(ethSpentOnGas);

    const ethInDecimal = toDecimal(maxBuy);
    assert(ethOut.lt(ethInDecimal), 'ethOut > ethIn');
    console.log({
      ethOut: toDecimal(ethOut).div(1e18).toString(),
      ethIn: ethInDecimal.div(1e18).toString(),
    });
    const { relativeError: sellSpreadRelativeError } = calculateEthForNXMRelativeError(ethInDecimal, ethOut);
    assert(
      sellSpreadRelativeError.lt(Decimal(0.08)),
      `sell value too low ${ethOut.toFixed()}. sellSpreadRelativeError = ${sellSpreadRelativeError.toFixed()}`,
    );
  });

  it('sells down to 100% MCR%', async function () {
    const { poolData, pool1, token } = this;

    const tokensToSell = ether('10000');
    const holder = holders[0];

    let mcrRatio = await pool1.getMCRRatio();
    while (mcrRatio.gt('100')) {

      const expectedEthOut = await pool1.getEthForNXM(tokensToSell);
      try {
        await pool1.sellNXM(tokensToSell, '0', {
          from: holder,
        });
      } catch (e) {
        assert(mcrRatio.lt(new BN(10050)), `MCR ratio not as low as expected. current value: ${mcrRatio.toString()}`);
        break;
      }

      mcrRatio = await pool1.getMCRRatio();
      console.log({
        tokensToSell: tokensToSell.toString(),
        expectedEthOut: toDecimal(expectedEthOut).div(1e18).toString(),
        mcrRatio: mcrRatio.toString(),
      });
    }

    await expectRevert(
      pool1.sellNXM(tokensToSell, '0', { from: holder }),
      `MCR% cannot fall below 100%`,
    );
  });

  it('buys up to 400% MCR%', async function () {
    const { pool1, poolData, priceFeedOracle } = this;

    const holder = holders[0];

    let mcrRatio = await pool1.getMCRRatio();
    let totalBuyValue = new BN('0');
    while (mcrRatio.lt(new BN('40000'))) {
      const mcrEth = await poolData.getLastMCREther();
      const maxBuy = percentageBN(mcrEth, 4.95);
      await pool1.buyNXM('0', {
        value: maxBuy,
        from: holder,
      });

      mcrRatio = await pool1.getMCRRatio();
      const daiAddress = await priceFeedOracle.daiAddress();
      const tokenSpotPriceDai = await pool1.getTokenPrice(daiAddress);

      totalBuyValue = totalBuyValue.add(maxBuy);
      console.log({
        maxBuy: maxBuy.div(ether('1')).toString(),
        totalBuyValue: totalBuyValue.div(ether('1')).toString(),
        mcrRatio: mcrRatio.toString(),
        tokenSpotPriceDai: tokenSpotPriceDai.div(ether('1')).toString(),
      });
    }

    const mcrEth = await poolData.getLastMCREther();
    const maxBuy = percentageBN(mcrEth, 4.95);
    await expectRevert(
      pool1.buyNXM('0', { from: holder, value: maxBuy }),
      `Pool: Cannot purchase if MCR% > 400%`,
    );
  });
});
