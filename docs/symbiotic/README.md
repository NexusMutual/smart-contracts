# Symbiotic Integration

## Cover router

```js
// if above 20m threshold include symbiotic capital

// get current available stake at t_snap
const tSnap = now + cover period + gracePeriod + assessment duration + buffer ?;
const availableStake = delegator.stakeAt(NET_ID, OP_NEXUS, tSnap);

// 80% symbiotic / 20% nexus
```

## Network

* Register Nexus network: `NET_ID`
* Governor contract can act as the network admin to register the network and execute other admin functions.
* see [NetworkRegistry.sol](https://github.com/symbioticfi/core/blob/main/src/contracts/NetworkRegistry.sol)
```solidity
uint32 netId = NetworkRegistry.registerNetwork()
```
* Governor will be the admin that has power to set network configs (slasher, operator, network params, etc..)

## Operator

Single operator model. A contract with governor only modifiers to setup the vault integration

* register Operator contract. see [OperatorRegistry.sol](https://github.com/symbioticfi/core/blob/main/src/contracts/OperatorRegistry.sol)
```solidity
function registerOperator() external onlyGovernor {
    operatorRegistry.registerOperator();
}
```

* Opt in the Nexus Network and reinsurance vault:
```solidity
function operatorOptInVault() external onlyGovernor {
  OptInService.optIn(VAULT_ADDRESS);
}

function operatorOptInNetwork() external onlyGovernor {
  OptInService.optIn(address(uint160(NEXUS_NET_ID)));
}
```

Once the operator has opt in into both vault and the Nexus Network, the vault can then start allocating stake by calling `setOperatorNetworkLimit` / `setOperatorNetworkShares`


## Slasher Module

* contract allowed to call `vault.slash()`
* Simple Slasher (no veto)
* slashing delay 0
* TODO: add support for different vaults (i.e. providerId)
* how to make it generic and add support for Eigen layer? proxy layer?
* TODO: how to easily add support for different RI providers

```solidity
function slashForClaim(uint256 amount) external onlyContracts(C_CLAIMS) whenNotPaused(PAUSE_SLASHER) {
    uint256 t_snap = block.timestamp;

    uint256 stake = delegator.stakeAt(NET_ID, OP_NEXUS, t_snap);
    require(amount <= stake, "Not enough symbiotic stake to slash");

    vault.slasher().slash(NET_ID, OP_NEXUS, amount, t_snap);
}
```

### SlashingVerifier (Claims)

* The Claims contract will act as the SlashingVerifier
* Claims contract verifies if the claim has been approved for payout and calls slash accordingly

Logic to add on `redeemClaimPayout`:
* calculate the payout from symbiotic for the given coverId (could be 0)
* if symbiotic payout > 0, call slashForClaim in the Slasher contract

```solidity
function redeemClaimPayout(uint claimId) external override onlyMember whenNotPaused(PAUSE_CLAIMS) {
  ...
  // calculate the payout from symbiotic for the given coverId (could be 0)
  if (symbioticPayout > 0) {
    slasher.slashForClaim(symbioticPayout);
  }
  // TODO: how to get the stake that was slashed for payout?
  // sendPayout
  ...
}
```

## Vault Requirements (symbiotic side)

* no veto
* no slashing delay
* epochDuration length?
* withdrawalLock length?
* Network Nexus `NET_ID` is added as consumer to the vault
* vault delegator sets `networkLimit` / `maxNetworkStake` for Network Nexus `NET_ID`
* get vault address

## Questions:

* for the dedicated Nexus vault, will all deposits have the same lock horizon or can stakers can deposit anytime and hence stakes have different lock horizons? (uniform or per deposit locks)
* it seems the slashed tokens stays within the vault, how do we get the slashed tokens for payout?

## TODO:

* symbiotic rewards should only be  25% of the Cover
* check Eigen Layer architecture and make contracts generic to be able to easily support different RI providers