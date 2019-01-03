const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('DSValueMock');
const FactoryMock = artifacts.require('FactoryMock');
const ExchangeMock = artifacts.require('ExchangeMock');

let dai;
let factory;
let exchange;
const EXCHANGE_TOKEN = 10000 * 1e18;
const EXCHANGE_ETHER = 100 * 1e18;

module.exports = function(deployer) {
  deployer.then(async () => {
    dai = await deployer.deploy(DAI);
    await deployer.deploy(DSValue);
    factory = await deployer.deploy(FactoryMock);
    exchange = await deployer.deploy(ExchangeMock, dai.address);
    await factory.setFactory(dai.address, exchange.address);
    await dai.transfer(exchange.address, EXCHANGE_TOKEN);
    await exchange.sendTransaction({ value: EXCHANGE_ETHER });
  });
};
