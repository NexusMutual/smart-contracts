var HDWalletProvider = require("truffle-hdwallet-provider");

var mnemonic = "word vocal hazard glory home property canvas duty fetch private wasp ozone";

module.exports = {
  networks: {
    development: {
      host: "176.9.155.139",
      port: 7070,
      network_id: "5777"
    },
    ropsten: {
      gasPrice : 1,
      provider: function() {
        return new HDWalletProvider(mnemonic, "https://ropsten.infura.io/");
      },      
      network_id: 3
    },
    rinkeby: {
      gasPrice : 1,
      provider: function() {
        return new HDWalletProvider(mnemonic, "https://rinkeby.infura.io/");
      },      
      network_id: 4
    },
    kovan: {
      gasPrice : 1,
      provider: function() {
        return new HDWalletProvider(mnemonic, "https://kovan.infura.io/");
      },      
      network_id: 42
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
};

