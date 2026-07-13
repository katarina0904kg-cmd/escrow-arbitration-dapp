// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EscrowFactory - Uslovni escrow sa arbitražom
/// @notice Omogućava kupcu da kreira i finansira escrow, potvrdi prijem,
///         pokrene spor, i arbitru da razreši spor u korist jedne od strana.
contract EscrowFactory {
    enum State { CREATED, FUNDED, IN_DISPUTE, RELEASED, REFUNDED, RESOLVED }

    struct EscrowDeal {
        address buyer;
        address seller;
        address arbiter;
        uint256 amount;
        State state;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(uint256 => EscrowDeal) public deals;
    uint256 public dealCounter;

    // --- Reentrancy guard (ručna implementacija, bez OpenZeppelin importa) ---
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private locked = NOT_ENTERED;

    modifier nonReentrant() {
        require(locked == NOT_ENTERED, "Reentrant call blocked");
        locked = ENTERED;
        _;
        locked = NOT_ENTERED;
    }

    // --- Eventi ---
    event EscrowCreated(uint256 indexed dealId, address indexed buyer, address indexed seller, address arbiter, uint256 amount, uint256 timestamp);
    event EscrowFunded(uint256 indexed dealId, uint256 amount, uint256 timestamp);
    event DeliveryConfirmed(uint256 indexed dealId, uint256 timestamp);
    event DisputeRaised(uint256 indexed dealId, address indexed raisedBy, uint256 timestamp);
    event DisputeResolved(uint256 indexed dealId, address indexed winner, bool releasedToSeller, uint256 timestamp);
    event Refunded(uint256 indexed dealId, uint256 timestamp);

    // --- Modifikatori za kontrolu pristupa ---
    modifier onlyBuyer(uint256 dealId) {
        require(msg.sender == deals[dealId].buyer, "Samo kupac moze ovo pozvati");
        _;
    }

    modifier onlyBuyerOrSeller(uint256 dealId) {
        require(
            msg.sender == deals[dealId].buyer || msg.sender == deals[dealId].seller,
            "Samo kupac ili prodavac mogu ovo pozvati"
        );
        _;
    }

    modifier onlyArbiter(uint256 dealId) {
        require(msg.sender == deals[dealId].arbiter, "Samo arbitar moze ovo pozvati");
        _;
    }

    modifier inState(uint256 dealId, State expected) {
        require(deals[dealId].state == expected, "Neispravno stanje ugovora za ovu akciju");
        _;
    }

    modifier dealExists(uint256 dealId) {
        require(dealId < dealCounter, "Escrow ne postoji");
        _;
    }

    /// @notice Kreira i odmah finansira novi escrow. Kupac šalje ETH zajedno sa pozivom.
    function createEscrow(address seller, address arbiter) external payable returns (uint256) {
        require(msg.value > 0, "Iznos mora biti veci od nule");
        require(seller != address(0) && arbiter != address(0), "Nevalidna adresa");
        require(seller != msg.sender, "Prodavac ne moze biti isti kao kupac");
        require(arbiter != msg.sender && arbiter != seller, "Arbitar mora biti nezavisna treca strana");

        uint256 dealId = dealCounter;
        dealCounter++;

        deals[dealId] = EscrowDeal({
            buyer: msg.sender,
            seller: seller,
            arbiter: arbiter,
            amount: msg.value,
            state: State.FUNDED,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit EscrowCreated(dealId, msg.sender, seller, arbiter, msg.value, block.timestamp);
        emit EscrowFunded(dealId, msg.value, block.timestamp);

        return dealId;
    }

    /// @notice Kupac potvrđuje prijem robe/usluge — sredstva se oslobađaju prodavcu.
    function confirmDelivery(uint256 dealId)
        external
        dealExists(dealId)
        onlyBuyer(dealId)
        inState(dealId, State.FUNDED)
        nonReentrant
    {
        EscrowDeal storage deal = deals[dealId];
        deal.state = State.RELEASED;
        deal.updatedAt = block.timestamp;

        uint256 amount = deal.amount;
        (bool sent, ) = deal.seller.call{value: amount}("");
        require(sent, "Transfer prodavcu neuspesan");

        emit DeliveryConfirmed(dealId, block.timestamp);
    }

    /// @notice Kupac ili prodavac pokreće spor.
    function raiseDispute(uint256 dealId)
        external
        dealExists(dealId)
        onlyBuyerOrSeller(dealId)
        inState(dealId, State.FUNDED)
    {
        EscrowDeal storage deal = deals[dealId];
        deal.state = State.IN_DISPUTE;
        deal.updatedAt = block.timestamp;

        emit DisputeRaised(dealId, msg.sender, block.timestamp);
    }

    /// @notice Arbitar razrešava spor — bira da li sredstva idu prodavcu ili se vraćaju kupcu.
    function resolveDispute(uint256 dealId, bool releaseToSeller)
        external
        dealExists(dealId)
        onlyArbiter(dealId)
        inState(dealId, State.IN_DISPUTE)
        nonReentrant
    {
        EscrowDeal storage deal = deals[dealId];
        deal.state = State.RESOLVED;
        deal.updatedAt = block.timestamp;

        uint256 amount = deal.amount;
        address winner = releaseToSeller ? deal.seller : deal.buyer;

        (bool sent, ) = winner.call{value: amount}("");
        require(sent, "Transfer neuspesan");

        emit DisputeResolved(dealId, winner, releaseToSeller, block.timestamp);
    }

    /// @notice Vraća pojedinosti o escrow-u (korisno za frontend).
    function getDeal(uint256 dealId) external view dealExists(dealId) returns (EscrowDeal memory) {
        return deals[dealId];
    }

    /// @notice Vraća ukupan broj kreiranih escrow-ova.
    function getDealCount() external view returns (uint256) {
        return dealCounter;
    }
}