var Claims = artifacts.require('Claims');
var ClaimsData = artifacts.require('ClaimsData');
var ClaimsReward = artifacts.require('ClaimsReward');
var DAI = artifacts.require('DAI');
var NXMaster = artifacts.require('NXMaster');
var NXMaster2 = artifacts.require('NXMaster2');
var MCR = artifacts.require('MCR');
var MCRData = artifacts.require('MCRData');
var NXMToken2 = artifacts.require('NXMToken2');
var NXMTokenData = artifacts.require('NXMTokenData');
var Pool1 = artifacts.require('Pool1');
var Pool2 = artifacts.require('Pool2');
var Pool3 = artifacts.require('Pool3');
var PoolData = artifacts.require('PoolData');
var Quotation = artifacts.require('Quotation');
var QuotationData = artifacts.require('QuotationData');
var Exchange = artifacts.require('Exchange');
var Token = artifacts.require('Token');
var TokenTransferProxy = artifacts.require('TokenTransferProxy');
let ttpa;
let zxta;

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
  deployer.deploy(MCRData);
  deployer.deploy(NXMToken2);
  deployer.deploy(NXMTokenData);
  deployer.deploy(Quotation);
  deployer.deploy(QuotationData);
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
