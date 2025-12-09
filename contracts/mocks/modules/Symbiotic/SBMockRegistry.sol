// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal mock for Symbiotic IRegistry used in tests.
contract SBMockRegistry {
    mapping(address => bool) private _entities;

    function setEntity(address entity, bool isEntity_) external {
        _entities[entity] = isEntity_;
    }

    function isEntity(address entity) external view returns (bool) {
        return _entities[entity];
    }
}
