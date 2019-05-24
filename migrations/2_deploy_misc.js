const DAI = artifacts.require('MockDAI');
const MKR = artifacts.require('MockMKR');
const DSValue = artifacts.require('DSValueMock');
const FactoryMock = artifacts.require('FactoryMock');
const ExchangeMock = artifacts.require('ExchangeMock');
const ExchangeMKRMock = artifacts.require('ExchangeMock');

let dai;
let factory;
let exchange;
let mkr;
const EXCHANGE_TOKEN = '10000000000000000000000';
const EXCHANGE_ETHER = 100000000000000000000;

module.exports = function(deployer, network, accounts) {
  deployer.then(async () => {
    dai = await deployer.deploy(DAI);
    mkr = await deployer.deploy(MKR);
    await deployer.deploy(DSValue);
    factory = await deployer.deploy(FactoryMock);
    exchange = await deployer.deploy(
      ExchangeMock,
      dai.address,
      factory.address
    );
    exchangeMKR = await deployer.deploy(
      ExchangeMKRMock,
      mkr.address,
      factory.address
    );
    await factory.setFactory(dai.address, exchange.address);
    await factory.setFactory(mkr.address, exchangeMKR.address);
    await dai.transfer(exchange.address, EXCHANGE_TOKEN);
    await mkr.transfer(exchangeMKR.address, EXCHANGE_TOKEN);
    await exchange.recieveEther({ value: EXCHANGE_ETHER });
    await exchangeMKR.recieveEther({ value: EXCHANGE_ETHER });
  });
};
