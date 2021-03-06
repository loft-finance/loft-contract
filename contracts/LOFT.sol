// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "./interfaces/ISynthesizer.sol";

contract LOFT is Initializable, OwnableUpgradeable, ERC20PausableUpgradeable {
    // Maximum Total Supply 1 B
    uint256 constant maxTotalSupply = 1e9 ether;

    ISynthesizer public synthesizer;

    function initialize() external initializer {
        __Ownable_init();
        __ERC20_init("Loft Protocol", "LOFT");
        __ERC20Pausable_init();
        _mint(_msgSender(), 1e8 ether); //10%
    }

    function liquidateDelinquentAccount(address account, uint256 susdAmount)
        external
    {
        require(
            address(synthesizer) != address(0),
            "Missing Synthesizer address"
        );
        (uint256 totalRedeemed, uint256 amountLiquidated) = synthesizer
            .liquidateDelinquentAccount(account, susdAmount, _msgSender());

        emit AccountLiquidated(
            account,
            totalRedeemed,
            amountLiquidated,
            _msgSender()
        );

        // Transfer LOFT redeemed to messageSender
        // Reverts if amount to redeem is more than balanceOf account, ie due to escrowed balance
        _transfer(account, _msgSender(), totalRedeemed);
    }

    function transfer(address recipient, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        if (address(synthesizer) != address(0)) {
            require(
                amount <= synthesizer.transferableLoft(_msgSender()),
                "Cannot transfer staked LOFT"
            );
        }
        super.transfer(recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        if (address(synthesizer) != address(0)) {
            require(
                amount <= synthesizer.transferableLoft(sender),
                "Cannot transfer staked LOFT"
            );
        }
        super.transferFrom(sender, recipient, amount);
        return true;
    }

    function _beforeTokenTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal override {
        return super._beforeTokenTransfer(sender, recipient, amount);
    }

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function _mint(address account, uint256 amount) internal override {
        uint256 totalSupply = super.totalSupply();
        require(
            maxTotalSupply >= totalSupply + amount,
            "Max total supply over"
        );

        super._mint(account, amount);
    }

    function setSynthesizer(ISynthesizer _synthesizer) external onlyOwner {
        synthesizer = _synthesizer;
        emit SynthesizerUpdated(_synthesizer);
    }

    event SynthesizerUpdated(ISynthesizer _synthesizer);
    event AccountLiquidated(
        address indexed account,
        uint256 dowsRedeemed,
        uint256 amountLiquidated,
        address liquidator
    );
}
