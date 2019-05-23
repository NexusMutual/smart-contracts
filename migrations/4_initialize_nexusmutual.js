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
const PoolData = artifacts.require('PoolDataMock');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const FactoryMock = artifacts.require('FactoryMock');

const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POOL_ETHER = '10000000000000000000';
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
   console.log("1");
   await nxms.addNewVersion(addr);
   console.log("2");
   let pcAddress = await nxms.getLatestAddress('0x5043');
   pc = await ProposalCategory.at(pcAddress);
   await pc.proposalCategoryInitiate();
console.log("3");
   const dai = await DAI.deployed();
   // await qd.changeCurrencyAssetAddress('0x444149', dai.address);
   // await qd.changeInvestmentAssetAddress('0x444149', dai.address);
   await pl1.sendEther({ from: Owner, value: POOL_ETHER });
   console.log("4");
   await pl2.sendEther({ from: Owner, value: POOL_ETHER }); //
   console.log("5");
   await mcr.addMCRData(
     18000,
     '100000000000000000000',
     '2000000000000000000',
     ['0x455448', '0x444149'],
     [100, 15517],
     20190103
   );
   console.log("6");
   await pl2.saveIADetails(
     ['0x455448', '0x444149'],
     [100, 15517],
     20190103,
     true
   ); //testing
   console.log("7");
   await dai.transfer(pl2.address, POOL_ASSET);
   console.log("8");
 });
};