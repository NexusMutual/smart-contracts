const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('DSValue');
const NXMaster = artifacts.require('NXMaster');
const MCR = artifacts.require('MCR');
const MCRDataMock = artifacts.require('MCRDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenData');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const FactoryMock = artifacts.require('FactoryMock');

const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133'; //web3.eth.accounts[19];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const Owner = web3.eth.accounts[0];
const POOL_ETHER = 15 * 1e18;
const POOL_ASSET = 1000 * 1e18;

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
    const mcrd = await MCRDataMock.deployed();
    const dsv = await DSValue.deployed();
    const gov = await Governance.deployed();
    const propCat = await ProposalCategory.deployed();
    const mr = await MemberRoles.deployed();
    const factory = await FactoryMock.deployed();
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
      mcr.address,
      gov.address,
      propCat.address,
      mr.address
    ];
    await nxms.changeTokenAddress(tk.address);
    await nxms.addNewVersion(addr);
    await pl1.sendTransaction({ from: Owner, value: POOL_ETHER });
    await pl2.sendTransaction({ from: Owner, value: POOL_ETHER });
    await td.changeWalletAddress(Owner);
    await qd.changeAuthQuoteEngine(QE);
    const dai = await DAI.deployed();
    await pd.changeCurrencyAssetAddress('0x444149', dai.address);
    await mcr.changenotariseAddress(Owner);
    await pd.changeInvestmentAssetAddress('0x455448', ZERO_ADDRESS);
    await pd.changeInvestmentAssetAddress('0x444149', dai.address);
    await mcrd.changeDAIfeedAddress(dsv.address);
    await mcr.addMCRData(
      18000,
      10000,
      2,
      ['0x455448', '0x444149'],
      [100, 65407],
      20180807
    );
    await pl2.saveIADetails(['0x455448', '0x444149'], [100, 65407], 20180807);
    await mr.memberRolesInitiate(
      '0x4e657875732d4d757475616c',
      '0x4e584d',
      Owner
    );
    await pl2.changeUniswapFactoryAddress(factory.address);
    await dai.transfer(pl1.address, POOL_ASSET);
    await dai.transfer(pl2.address, POOL_ASSET);
  });
};
