import { expect } from "chai";
import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
const { ethers, networkHelpers } = await network.create();

describe("EscrowFactory", function () {
  // Fixture: deploy-uje ugovor i vraća osnovne aktere (kupac, prodavac, arbitar)
  async function deployEscrowFixture() {
    const [buyer, seller, arbiter, other] = await ethers.getSigners();
    const escrow = await ethers.deployContract("EscrowFactory");
    const amount = ethers.parseEther("1.0");

    return { escrow, buyer, seller, arbiter, other, amount };
  }

  // Fixture: deploy-uje ugovor i odmah kreira jedan finansirani escrow (dealId = 0)
  async function fundedEscrowFixture() {
    const { escrow, buyer, seller, arbiter, other, amount } =
      await deployEscrowFixture();

    await escrow
      .connect(buyer)
      .createEscrow(seller.address, arbiter.address, { value: amount });

    return { escrow, buyer, seller, arbiter, other, amount, dealId: 0n };
  }

  describe("Kreiranje i finansiranje escrow-a", function () {
    it("treba uspešno da kreira i finansira escrow, i emituje evente", async function () {
      const { escrow, buyer, seller, arbiter, amount } =
        await networkHelpers.loadFixture(deployEscrowFixture);

      await expect(
        escrow
          .connect(buyer)
          .createEscrow(seller.address, arbiter.address, { value: amount })
      )
        .to.emit(escrow, "EscrowCreated")
        .withArgs(
          0n,
          buyer.address,
          seller.address,
          arbiter.address,
          amount,
          anyValue
        )
        .and.to.emit(escrow, "EscrowFunded");

      const deal = await escrow.getDeal(0n);
      expect(deal.buyer).to.equal(buyer.address);
      expect(deal.seller).to.equal(seller.address);
      expect(deal.arbiter).to.equal(arbiter.address);
      expect(deal.amount).to.equal(amount);
      expect(deal.state).to.equal(1n); // State.FUNDED
    });

    it("treba da revert-uje ako je iznos 0", async function () {
      const { escrow, buyer, seller, arbiter } =
        await networkHelpers.loadFixture(deployEscrowFixture);

      await expect(
        escrow
          .connect(buyer)
          .createEscrow(seller.address, arbiter.address, { value: 0 })
      ).to.be.revertedWith("Iznos mora biti veci od nule");
    });

    it("treba da revert-uje ako je prodavac ista adresa kao kupac", async function () {
      const { escrow, buyer, arbiter, amount } =
        await networkHelpers.loadFixture(deployEscrowFixture);

      await expect(
        escrow
          .connect(buyer)
          .createEscrow(buyer.address, arbiter.address, { value: amount })
      ).to.be.revertedWith("Prodavac ne moze biti isti kao kupac");
    });

    it("treba da revert-uje ako je arbitar ista adresa kao kupac ili prodavac", async function () {
      const { escrow, buyer, seller, amount } =
        await networkHelpers.loadFixture(deployEscrowFixture);

      await expect(
        escrow
          .connect(buyer)
          .createEscrow(seller.address, buyer.address, { value: amount })
      ).to.be.revertedWith("Arbitar mora biti nezavisna treca strana");
    });
  });

  describe("Potvrda prijema (confirmDelivery)", function () {
    it("kupac uspešno potvrđuje prijem i sredstva idu prodavcu", async function () {
      const { escrow, buyer, seller, dealId, amount } =
        await networkHelpers.loadFixture(fundedEscrowFixture);

      await expect(
        escrow.connect(buyer).confirmDelivery(dealId)
      ).to.changeEtherBalances(ethers, [seller], [amount]);

      const deal = await escrow.getDeal(dealId);
      expect(deal.state).to.equal(3n); // State.RELEASED
    });

    it("treba da emituje DeliveryConfirmed event", async function () {
      const { escrow, buyer, dealId } =
        await networkHelpers.loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(buyer).confirmDelivery(dealId)).to.emit(
        escrow,
        "DeliveryConfirmed"
      );
    });

    it("treba da revert-uje ako neko ko nije kupac pokuša da potvrdi prijem", async function () {
      const { escrow, seller, dealId } =
        await networkHelpers.loadFixture(fundedEscrowFixture);

      await expect(
        escrow.connect(seller).confirmDelivery(dealId)
      ).to.be.revertedWith("Samo kupac moze ovo pozvati");
    });

    it("treba da spreči dvostruko oslobađanje sredstava", async function () {
      const { escrow, buyer, dealId } =
        await networkHelpers.loadFixture(fundedEscrowFixture);

      await escrow.connect(buyer).confirmDelivery(dealId);

      await expect(
        escrow.connect(buyer).confirmDelivery(dealId)
      ).to.be.revertedWith("Neispravno stanje ugovora za ovu akciju");
    });
  });

  describe("Pokretanje spora (raiseDispute)", function () {
    it("kupac može da pokrene spor", async function () {
      const { escrow, buyer, dealId } =
        await networkHelpers.loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(buyer).raiseDispute(dealId))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(dealId, buyer.address, anyValue);

      const deal = await escrow.getDeal(dealId);
      expect(deal.state).to.equal(2n); // State.IN_DISPUTE
    });

    it("prodavac takođe može da pokrene spor", async function () {
      const { escrow, seller, dealId } =
        await networkHelpers.loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(seller).raiseDispute(dealId)).to.emit(
        escrow,
        "DisputeRaised"
      );
    });

    it("treba da revert-uje ako neovlašćena treća strana pokuša da pokrene spor", async function () {
      const { escrow, other, dealId } =
        await networkHelpers.loadFixture(fundedEscrowFixture);

      await expect(
        escrow.connect(other).raiseDispute(dealId)
      ).to.be.revertedWith("Samo kupac ili prodavac mogu ovo pozvati");
    });
  });

  describe("Arbitražna odluka (resolveDispute)", function () {
    async function disputedEscrowFixture() {
      const base = await fundedEscrowFixture();
      await base.escrow.connect(base.buyer).raiseDispute(base.dealId);
      return base;
    }

    it("arbitar može da reši spor u korist prodavca", async function () {
      const { escrow, arbiter, seller, dealId, amount } =
        await networkHelpers.loadFixture(disputedEscrowFixture);

      await expect(
        escrow.connect(arbiter).resolveDispute(dealId, true)
      ).to.changeEtherBalances(ethers, [seller], [amount]);

      const deal = await escrow.getDeal(dealId);
      expect(deal.state).to.equal(5n); // State.RESOLVED
    });

    it("arbitar može da reši spor u korist kupca (refund)", async function () {
      const { escrow, arbiter, buyer, dealId, amount } =
        await networkHelpers.loadFixture(disputedEscrowFixture);

      await expect(
        escrow.connect(arbiter).resolveDispute(dealId, false)
      ).to.changeEtherBalances(ethers, [buyer], [amount]);
    });

    it("treba da emituje DisputeResolved event", async function () {
      const { escrow, arbiter, seller, dealId } =
        await networkHelpers.loadFixture(disputedEscrowFixture);

      await expect(escrow.connect(arbiter).resolveDispute(dealId, true))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(dealId, seller.address, true, anyValue);
    });

    it("treba da revert-uje ako neko ko nije arbitar pokuša da reši spor", async function () {
      const { escrow, buyer, dealId } =
        await networkHelpers.loadFixture(disputedEscrowFixture);

      await expect(
        escrow.connect(buyer).resolveDispute(dealId, true)
      ).to.be.revertedWith("Samo arbitar moze ovo pozvati");
    });

    it("treba da revert-uje ako se pokuša rešavanje spora koji nije u stanju IN_DISPUTE", async function () {
      const { escrow, arbiter, dealId } =
        await networkHelpers.loadFixture(fundedEscrowFixture); // nije u sporu

      await expect(
        escrow.connect(arbiter).resolveDispute(dealId, true)
      ).to.be.revertedWith("Neispravno stanje ugovora za ovu akciju");
    });
  });

  describe("Nepostojeći escrow", function () {
    it("treba da revert-uje pri pristupu escrow-u koji ne postoji", async function () {
      const { escrow } = await networkHelpers.loadFixture(deployEscrowFixture);

      await expect(escrow.getDeal(99n)).to.be.revertedWith(
        "Escrow ne postoji"
      );
    });
  });
});