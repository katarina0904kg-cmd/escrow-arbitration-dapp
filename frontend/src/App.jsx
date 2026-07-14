import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, SEPOLIA_CHAIN_ID } from "./contractConfig";
import "./App.css";

const STATE_LABELS = [
  "CREATED",
  "FUNDED",
  "IN_DISPUTE",
  "RELEASED",
  "REFUNDED",
  "RESOLVED",
];

function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [contract, setContract] = useState(null);
  const [signer, setSigner] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Forma za kreiranje escrow-a
  const [sellerAddr, setSellerAddr] = useState("");
  const [arbiterAddr, setArbiterAddr] = useState("");
  const [amountEth, setAmountEth] = useState("");

  const isCorrectNetwork = chainId === SEPOLIA_CHAIN_ID;

  // Povezivanje MetaMask-a 
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Instaliraj MetaMask ekstenziju da bi koristio ovu aplikaciju!");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer_ = await provider.getSigner();
      const network = await provider.getNetwork();
      const contract_ = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer_);

      setAccount(await signer_.getAddress());
      setSigner(signer_);
      setChainId(network.chainId);
      setContract(contract_);
    } catch (err) {
      console.error(err);
      setStatusMsg("Greška pri povezivanju MetaMask-a: " + err.message);
    }
  };

  //Osluškuj promenu naloga/mreže u MetaMask-u 
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = () => window.location.reload();
    const handleChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  //  Učitaj sve escrow-ove i filtriraj one gde je korisnik učesnik
  const loadDeals = useCallback(async () => {
    if (!contract || !account) return;
    setLoading(true);
    try {
      const count = await contract.getDealCount();
      const items = [];
      for (let i = 0n; i < count; i++) {
        const d = await contract.getDeal(i);
        const acc = account.toLowerCase();
        if (
          d.buyer.toLowerCase() === acc ||
          d.seller.toLowerCase() === acc ||
          d.arbiter.toLowerCase() === acc
        ) {
          items.push({
            id: i,
            buyer: d.buyer,
            seller: d.seller,
            arbiter: d.arbiter,
            amount: d.amount,
            state: Number(d.state),
          });
        }
      }
      setDeals(items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [contract, account]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  //Akcije nad ugovorom
  const runTx = async (fn, successMsg) => {
    setLoading(true);
    setStatusMsg("Šaljem transakciju, potvrdi u MetaMask-u...");
    try {
      const tx = await fn();
      setStatusMsg("Čekam potvrdu transakcije na mreži...");
      const receipt = await tx.wait();
      setStatusMsg(
        `${successMsg}  (tx: ${receipt.hash.slice(0, 10)}...) — pogledaj na ` +
          `https://sepolia.etherscan.io/tx/${receipt.hash}`
      );
      await loadDeals();
    } catch (err) {
      console.error(err);
      const reason = err?.reason || err?.message || "Nepoznata greška";
      setStatusMsg("Transakcija neuspešna: " + reason);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEscrow = async (e) => {
    e.preventDefault();
    if (!ethers.isAddress(sellerAddr) || !ethers.isAddress(arbiterAddr)) {
      setStatusMsg("Unesi validne Ethereum adrese za prodavca i arbitra.");
      return;
    }
    const value = ethers.parseEther(amountEth || "0");
    await runTx(
      () => contract.createEscrow(sellerAddr, arbiterAddr, { value }),
      "Escrow uspešno kreiran i finansiran"
    );
    setSellerAddr("");
    setArbiterAddr("");
    setAmountEth("");
  };

  const handleConfirmDelivery = (id) =>
    runTx(() => contract.confirmDelivery(id), "Sredstva oslobođena prodavcu");

  const handleRaiseDispute = (id) =>
    runTx(() => contract.raiseDispute(id), "Spor pokrenut");

  const handleResolve = (id, releaseToSeller) =>
    runTx(
      () => contract.resolveDispute(id, releaseToSeller),
      releaseToSeller
        ? "Spor rešen u korist prodavca"
        : "Spor rešen u korist kupca (refund)"
    );

  return (
    <div className="container">
      <h1>Escrow DApp sa arbitražom</h1>

      {!account ? (
        <button onClick={connectWallet} className="btn btn-primary">
          Poveži MetaMask
        </button>
      ) : (
        <div className="account-info">
          <p>
            <strong>Povezan nalog:</strong> {account}
          </p>
          <p>
            <strong>Mreža:</strong>{" "}
            {isCorrectNetwork ? "Sepolia " : " Nisi na Sepolia mreži!"}
          </p>
        </div>
      )}

      {account && !isCorrectNetwork && (
        <p className="warning">
          Prebaci MetaMask na Sepolia Test Network da bi koristio aplikaciju.
        </p>
      )}

      {account && isCorrectNetwork && (
        <>
          <section className="card">
            <h2>Kreiraj novi escrow (Kupac)</h2>
            <form onSubmit={handleCreateEscrow}>
              <label>
                Adresa prodavca
                <input
                  type="text"
                  placeholder="0x..."
                  value={sellerAddr}
                  onChange={(e) => setSellerAddr(e.target.value)}
                  required
                />
              </label>
              <label>
                Adresa arbitra
                <input
                  type="text"
                  placeholder="0x..."
                  value={arbiterAddr}
                  onChange={(e) => setArbiterAddr(e.target.value)}
                  required
                />
              </label>
              <label>
                Iznos (ETH)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="0.01"
                  value={amountEth}
                  onChange={(e) => setAmountEth(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Kreiraj i finansiraj escrow
              </button>
            </form>
          </section>

          <section className="card">
            <h2>Moji escrow-ovi</h2>
            <button onClick={loadDeals} className="btn btn-secondary" disabled={loading}>
              Osveži listu
            </button>

            {deals.length === 0 && <p>Nema escrow-ova u kojima učestvuješ.</p>}

            {deals.map((deal) => (
              <div key={deal.id.toString()} className="deal-card">
                <p>
                  <strong>Escrow #{deal.id.toString()}</strong> —{" "}
                  {STATE_LABELS[deal.state]}
                </p>
                <p>Kupac: {deal.buyer}</p>
                <p>Prodavac: {deal.seller}</p>
                <p>Arbitar: {deal.arbiter}</p>
                <p>Iznos: {ethers.formatEther(deal.amount)} ETH</p>

                <div className="actions">
                  {deal.state === 1 && // FUNDED
                    account.toLowerCase() === deal.buyer.toLowerCase() && (
                      <button
                        onClick={() => handleConfirmDelivery(deal.id)}
                        className="btn btn-success"
                        disabled={loading}
                      >
                        Potvrdi prijem (oslobodi sredstva)
                      </button>
                    )}

                  {deal.state === 1 && // FUNDED
                    (account.toLowerCase() === deal.buyer.toLowerCase() ||
                      account.toLowerCase() === deal.seller.toLowerCase()) && (
                      <button
                        onClick={() => handleRaiseDispute(deal.id)}
                        className="btn btn-warning"
                        disabled={loading}
                      >
                        Pokreni spor
                      </button>
                    )}

                  {deal.state === 2 && // IN_DISPUTE
                    account.toLowerCase() === deal.arbiter.toLowerCase() && (
                      <>
                        <button
                          onClick={() => handleResolve(deal.id, true)}
                          className="btn btn-success"
                          disabled={loading}
                        >
                          Reši u korist prodavca
                        </button>
                        <button
                          onClick={() => handleResolve(deal.id, false)}
                          className="btn btn-danger"
                          disabled={loading}
                        >
                          Reši u korist kupca (refund)
                        </button>
                      </>
                    )}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {statusMsg && <p className="status-msg">{statusMsg}</p>}
    </div>
  );
}

export default App;