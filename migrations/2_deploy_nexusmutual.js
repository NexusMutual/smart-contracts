var Claims = artifacts.require('Claims');
var ClaimsData = artifacts.require('ClaimsData');
var ClaimsReward = artifacts.require('ClaimsReward');
var DAI = artifacts.require('MockDAI');
var NXMaster = artifacts.require('NXMaster');
var NXMaster2 = artifacts.require('NXMaster2');
var MCR = artifacts.require('MCR');
var MCRDataMock = artifacts.require('MCRDataMock');
var NXMToken = artifacts.require('NXMToken');
var TokenData = artifacts.require('TokenData');
var TokenFunctions = artifacts.require('TokenFunctions');
var TokenController = artifacts.require('TokenController');
var Pool1 = artifacts.require('Pool1');
var Pool2 = artifacts.require('Pool2');
var Pool3 = artifacts.require('Pool3');
var PoolData = artifacts.require('PoolData');
var Quotation = artifacts.require('Quotation');
var QuotationDataMock = artifacts.require('QuotationDataMock');
var Exchange = artifacts.require('Exchange');
var Token = artifacts.require('Token');
var TokenTransferProxy = artifacts.require('TokenTransferProxy');

var ttpa;
var zxta;
var tcAddress;

const founderAddress = web3.eth.accounts[19];
const INITIAL_SUPPLY = 1500000 * 1e18;

module.exports = function(deployer) {
  deployer.deploy(Claims);
  deployer.deploy(ClaimsData);
  deployer.deploy(ClaimsReward);
  deployer.deploy(DAI);
  deployer.deploy(NXMaster);
  deployer.deploy(NXMaster2);
  deployer.deploy(Pool1);
  deployer.deploy(Pool2);
  deployer.deploy(Pool3);
  deployer.deploy(PoolData);
  deployer.deploy(MCR);
  deployer.deploy(MCRDataMock);
  deployer.deploy(TokenController).then(function(instance) {
    tcAddress = instance.address;
    return deployer.deploy(NXMToken, tcAddress, founderAddress, INITIAL_SUPPLY);
  });
  deployer.deploy(TokenData);
  deployer.deploy(TokenFunctions);
  deployer.deploy(Quotation);
  deployer.deploy(QuotationDataMock);
  deployer
    .deploy(TokenTransferProxy)
    .then(function(instance) {
      ttpa = instance;
      return deployer.deploy(Token);
    })
    .then(function(instance) {
      zxta = instance;
      return deployer.deploy(Exchange, zxta.address, ttpa.address);
    });
};
