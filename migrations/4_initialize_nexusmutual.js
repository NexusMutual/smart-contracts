const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('DSValueMock');
const NXMaster = artifacts.require('NXMaster');
const MCR = artifacts.require('MCR');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('GovernanceMock');
const ProposalCategory = artifacts.require('ProposalCategory');
const FactoryMock = artifacts.require('FactoryMock');
const EventCaller = artifacts.require('EventCaller');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133'; //web3.eth.accounts[19];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const Owner = web3.eth.accounts[0];
const POOL_ETHER = 10 * 1e18;
const POOL_ASSET = 50 * 1e18;

module.exports = function(deployer) {
  deployer.then(async () => {
    const nxms = await NXMaster.deployed();
    const tk = await NXMToken.deployed();
    const td = await TokenData.deployed();
    const tf = await TokenFunctions.deployed();
    const tc = await TokenController.deployed();
    const pl1 = await Pool1.deployed();
    const pl2 = await Pool2.deployed();
    const pd = await PoolData.deployed();
    const qt = await Quotation.deployed();
    const qd = await QuotationDataMock.deployed();
    const cl = await Claims.deployed();
    const cr = await ClaimsReward.deployed();
    const cd = await ClaimsData.deployed();
    const mcr = await MCR.deployed();
    const dsv = await DSValue.deployed();
    const gov = await Governance.deployed();
    let propCat = await ProposalCategory.deployed();
    const mr = await MemberRoles.deployed();
    const factory = await FactoryMock.deployed();
    const eventCaller = await EventCaller.deployed();
    // let gvAdd = await nxms.getLatestAddress("GV");
    // let mrAdd = await nxms.getLatestAddress("MR");
    // let pcAdd = await nxms.getLatestAddress("PC");
    let addr = [
      qd.address,
      td.address,
      cd.address,
      pd.address,
      qt.address,
      tf.address,
      tc.address,
      cl.address,
      cr.address,
      pl1.address,
      pl2.address,
      mcr.address,
      gov.address,
      propCat.address,
      mr.address
    ];

    await nxms.addNewVersion(addr);
    const dai = await DAI.deployed();
    // await qd.changeCurrencyAssetAddress('0x444149', dai.address);
    // await qd.changeInvestmentAssetAddress('0x444149', dai.address);
    await pl1.sendTransaction({ from: Owner, value: POOL_ETHER });
    await pl2.sendTransaction({ from: Owner, value: POOL_ETHER }); //
    await mcr.addMCRData(
      18000,
      100 * 1e18,
      2 * 1e18,
      ['0x455448', '0x444149'],
      [100, 15517],
      20190103
    );
    await pl2.saveIADetails(
      ['0x455448', '0x444149'],
      [100, 15517],
      20190103,
      true
    ); //testing
    await dai.transfer(pl2.address, POOL_ASSET);
    let pcAddress = await nxms.getLatestAddress('PC');
    pc = await ProposalCategory.at(pcAddress);
    await pc.proposalCategoryInitiate();
  });
};
