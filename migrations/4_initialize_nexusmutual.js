const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsDataMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('NXMDSValueMock');
const NXMaster = artifacts.require('NXMasterMock');
const MCR = artifacts.require('MCR');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const FactoryMock = artifacts.require('FactoryMock');
const PooledStaking = artifacts.require('PooledStakingMock');
const {toHex} = require('../test/utils/ethTools');

const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POOL_ETHER = '3500000000000000000000';
const POOL_ASSET = '50000000000000000000';

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    const Owner = accounts[0];
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
    const pooledStaking = await PooledStaking.deployed();

    await pooledStaking.changeMasterAddress(nxms.address);

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
      mr.address,
      pooledStaking.address
    ];

    await nxms.addNewVersion(addr);

    // reduntant action of setting contract address
    await nxms.setContractAddress(toHex('PS'), pooledStaking.address);

    let pcAddress = await nxms.getLatestAddress('0x5043');
    pc = await ProposalCategory.at(pcAddress);
    await pc.proposalCategoryInitiate();
    const dai = await DAI.deployed();
    // await qd.changeCurrencyAssetAddress('0x444149', dai.address);
    // await qd.changeInvestmentAssetAddress('0x444149', dai.address);
    await pl1.sendEther({from: Owner, value: POOL_ETHER});
    await pl2.sendEther({from: Owner, value: POOL_ETHER}); //
    await mcr.addMCRData(
      13000,
      '100000000000000000000',
      '7000000000000000000000',
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
    let mrInstance = await MemberRoles.at(
      await nxms.getLatestAddress('0x4d52')
    );
    await mrInstance.payJoiningFee(Owner, {
      from: Owner,
      value: '2000000000000000'
    });

    await mrInstance.kycVerdict(Owner, true);
    await mrInstance.addInitialABMembers([Owner]);
  });
};
