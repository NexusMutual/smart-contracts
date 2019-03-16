const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const NXMaster = artifacts.require('NXMaster');
const MCR = artifacts.require('MCR');
const NXMToken = artifacts.require('NXMToken');
const TokenData = artifacts.require('TokenData');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const Quotation = artifacts.require('Quotation');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const MemberRoles = artifacts.require('MemberRoles');
const EventCaller = artifacts.require('EventCaller');
const FactoryMock = artifacts.require('FactoryMock');
const DSValue = artifacts.require('DSValueMock');
const founderAddress = web3.eth.accounts[0];
const INITIAL_SUPPLY = 1500000 * 1e18;
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';

module.exports = function(deployer) {
  deployer.then(async () => {
    let factory = await FactoryMock.deployed();
    let dsv = await DSValue.deployed();
    await deployer.deploy(Claims);
    await deployer.deploy(ClaimsData);
    await deployer.deploy(ClaimsReward);
    await deployer.deploy(Pool1);
    await deployer.deploy(Pool2, factory.address);
    await deployer.deploy(PoolData, founderAddress, dsv.address);
    await deployer.deploy(MCR);
    const tc = await deployer.deploy(TokenController);
    const tk = await deployer.deploy(
      NXMToken,
      tc.address,
      founderAddress,
      INITIAL_SUPPLY
    );
    await deployer.deploy(TokenData, founderAddress);
    await deployer.deploy(TokenFunctions);
    await deployer.deploy(Quotation);
    await deployer.deploy(QuotationDataMock, QE, founderAddress);
    await deployer.deploy(Governance);
    await deployer.deploy(ProposalCategory);
    await deployer.deploy(MemberRoles);
    const ec = await deployer.deploy(EventCaller);
    await deployer.deploy(NXMaster, ec.address, tk.address);
  });
};
