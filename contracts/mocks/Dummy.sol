
contract Dummy {
    constructor () public {

    }
    uint[] xs = [2];
    function doStuff() public view returns (uint) {
        return doMoreStuff(xs);
    }

    function doMoreStuff(uint[] memory xs) public view returns (uint) {
        return xs[0];
    }
}
