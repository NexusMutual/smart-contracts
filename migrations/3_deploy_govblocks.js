var NXMToken = artifacts.require('NXMToken');
var MemberRoles = artifacts.require('MemberRoles');
const owner = web3.eth.accounts[0];

module.exports = deployer => {
  NXMToken.deployed().then(function(instance) {
    return deployer.deploy(
      MemberRoles,
      '0x4e455855532d4d555455414c',
      instance.address,
      owner
    );
  });
};
