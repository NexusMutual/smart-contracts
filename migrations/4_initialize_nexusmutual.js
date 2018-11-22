const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const NXMaster = artifacts.require('NXMaster');
const NXMaster2 = artifacts.require('NXMaster2');
const MCR = artifacts.require('MCR');
const MCRDataMock = artifacts.require('MCRDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenData');
const Pool1 = artifacts.require('Pool1');
const Pool2 = artifacts.require('Pool2');
const Pool3 = artifacts.require('Pool3');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Exchange = artifacts.require('Exchange');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133'; //web3.eth.accounts[19];
const WETH_0x = web3.eth.accounts[18];
const Owner = web3.eth.accounts[0];
const POOL_ETHER = 15 * 1e18;

module.exports = function(deployer) {
  deployer.then(async () => {
    const nxms = await NXMaster.deployed();
    const nxms2 = await NXMaster2.deployed();
    const tk = await NXMToken.deployed();
    const td = await TokenData.deployed();
    const tf = await TokenFunctions.deployed();
    const tc = await TokenController.deployed();
    const pl1 = await Pool1.deployed();
    const pl2 = await Pool2.deployed();
    const pl3 = await Pool3.deployed();
    const pd = await PoolData.deployed();
    const qt = await Quotation.deployed();
    const qd = await QuotationDataMock.deployed();
    const cl = await Claims.deployed();
    const cr = await ClaimsReward.deployed();
    const cd = await ClaimsData.deployed();
    const mcr = await MCR.deployed();
    const mcrd = await MCRDataMock.deployed();
    const exchange = await Exchange.deployed();
    const IA1 = await DAI.new();
    const IA2 = await DAI.new();
    const IA3 = await DAI.new();
    const IA4 = await DAI.new();
    const IA5 = await DAI.new();
    const IA6 = await DAI.new();
    let addr = [
      qd.address,
      td.address,
      cd.address,
      pd.address,
      mcrd.address,
      qt.address,
      tf.address,
      tc.address,
      cl.address,
      cr.address,
      pl1.address,
      pl2.address,
      pl3.address,
      mcr.address,
      nxms2.address
    ];
    await nxms.changeTokenAddress(tk.address);
    await nxms.addNewVersion(addr);
    await pl1.sendTransaction({ from: Owner, value: POOL_ETHER });
    await pl2.sendTransaction({ from: Owner, value: POOL_ETHER });
    await td.changeWalletAddress(Owner);
    await qd.changeAuthQuoteEngine(QE);
    await nxms2.addCoverStatus();
    await nxms2.callPoolDataMethods();
    await nxms2.addStatusInClaims();
    await nxms2.addMCRCurr();
    const dai = await DAI.deployed();
    await pd.changeCurrencyAssetAddress('0x444149', dai.address);
    await pl2.changeExchangeContractAddress(exchange.address);
    await pl3.changeExchangeContractAddress(exchange.address);
    await mcr.changenotariseAddress(Owner);
    await pd.changeInvestmentAssetAddress(0x444744, IA1.address);
    await pd.changeInvestmentAssetAddress(0x49434e, IA2.address);
    await pd.changeInvestmentAssetAddress(0x5a5258, IA3.address);
    await pd.changeInvestmentAssetAddress(0x474e54, IA4.address);
    await pd.changeInvestmentAssetAddress(0x4d4c4e, IA5.address);
    await pd.changeInvestmentAssetAddress(0x4d4b52, IA6.address);
    await mcr.addMCRData(
      18000,
      10000,
      2,
      ['0x455448', '0x444149'],
      [100, 65407],
      20180807
    );
    await pl3.saveIADetails(
      ['0x444744', '0x49434e', '0x5a5258', '0x4d4b52', '0x474e54', '0x4d4c4e'],
      [100, 200, 300, 400, 500, 600],
      20180807
    );
    const mr = await MemberRoles.deployed();
    await nxms.changeMemberRolesAddress(mr.address);
  });
};
