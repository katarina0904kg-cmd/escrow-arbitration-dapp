# Escrow DApp sa arbitražom

Decentralizovana aplikacija (DApp) koja implementira escrow (deponovanje sredstava kod posrednika) između kupca i prodavca, uz mogućnost uključivanja arbitra u slučaju spora. Sredstva se zaključavaju u pametnom ugovoru na Ethereum (Sepolia testnet) mreži i oslobađaju tek kada su ispunjeni dogovoreni uslovi bez potrebe da kupac i prodavac veruju jedno drugom.

Projekat je rađen u okviru predmeta Kriptografija, kao projektni zadatak "DApp za uslovni escrow sa arbitražom".

## Sadržaj

- [Kako radi]
- [Tehnologije]
- [Deploy-ovani ugovor]
- [Uloge i tok korišćenja]
- [Pokretanje projekta lokalno]
- [Testiranje]
- [Struktura projekta]
- [Bezbednosne mere]
- [Licenca]

## Kako radi

1. Kupac kreira escrow i odmah ga finansira slanjem ETH-a, navodeći adresu prodavca i arbitra.
2. Ako je sve u redu, kupac potvrđuje prijem robe/usluge sredstva se automatski oslobađaju prodavcu.
3. Ako dođe do spora, kupac ili prodavac mogu pokrenuti spor — tada jedino arbitar može doneti odluku:
   - oslobodi sredstva prodavcu, ili
   - vrati sredstva kupcu (refund).

Sve akcije se izvršavaju kroz MetaMask potpisivanje transakcija, a ceo tok je proverljiv na Sepolia Etherscan-u.

## Tehnologije

- Solidity- pametni ugovor
- Hardhat 3 (TypeScript + Mocha + Ethers.js) - razvojno okruženje, testiranje, deploy
- Hardhat Ignition- deployment modul
- React + Vite-frontend
- ethers.js - Web3 integracija frontenda sa ugovorom
- MetaMask- potpisivanje transakcija i poruka
- Ethereum Sepolia Testnet- mreža za deployment i testiranje

## Deploy-ovani ugovor


Mreža Ethereum Sepolia Testnet 
Adresa ugovora `0x10e91857D901C520846975B31241DF986a4b3C27` 
Etherscan https://sepolia.etherscan.io/address/0x10e91857D901C520846975B31241DF986a4b3C27 |

## Uloge i tok korišćenja


Kupac (Buyer) Kreira i finansira escrow, potvrđuje prijem (oslobađa sredstva), pokreće spor
Prodavac (Seller) Pokreće spor 
Arbitar (Arbiter) Razrešava spor u korist prodavca ili kupca 

### Stanja escrow-a

`CREATED → FUNDED → (RELEASED | IN_DISPUTE → RESOLVED) / REFUNDED`

### Primer toka kroz aplikaciju

1. Poveži MetaMask nalog (dugme "Poveži MetaMask") i proveri da si na Sepolia mreži.
2. Kao Kupac: popuni formu (adresa prodavca, adresa arbitra, iznos u ETH) i klikni "Kreiraj i finansiraj escrow".
3. Escrow se pojavljuje u sekciji "Moji escrow-ovi" sa statusom FUNDED.
4. Kao Kupac: klikni "Potvrdi prijem" da oslobodiš sredstva prodavcu, ili klikni "Pokreni spor" ako nešto nije u redu.
5. Ako je spor pokrenut, prebaci se na nalog Arbitar u MetaMask-u, osveži stranicu, i klikni "Reši u korist prodavca" ili "Reši u korist kupca (refund)".

## Pokretanje projekta lokalno

### Preduslovi
- Node.js 
- MetaMask ekstenzija
- Sepolia testni ETH (npr. sa [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia))

### 1. Kloniranje repozitorijuma
```bash
git clone https://github.com/katarina0904kg-cmd/escrow-arbitration-dapp.git
cd escrow-arbitration-dapp
```

### 2. Instalacija zavisnosti (pametni ugovor)
```bash
npm install
```

### 3. Kompajliranje ugovora
```bash
npx hardhat compile
```

### 4. (Opciono) Sopstveni deploy na Sepolia
```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/Escrow.ts --network sepolia
```

### 5. Pokretanje frontenda
```bash
cd frontend
npm install
npm run dev
```
Aplikacija se pokreće na `http://localhost:5173`.



## Testiranje

Projekat ima kompletan set unit testova (Hardhat + Mocha + Chai) koji pokrivaju:
- kreiranje i finansiranje escrow-a (uključujući validaciju ulaznih parametara),
- uspešno oslobađanje sredstava prodavcu,
- sprečavanje dvostrukog oslobađanja sredstava,
- kontrolu pristupa (samo kupac potvrđuje prijem, samo arbitar rešava spor),
- pokretanje i razrešavanje spora u korist obe strane,
- emitovanje svih relevantnih događaja (eventova).

Pokretanje testova:
```bash
npx hardhat test
```

Dodatno, aplikacija je ručno testirana end-to-end na Sepolia mreži sa tri različita MetaMask naloga (Kupac, Prodavac, Arbitar), pokrivajući sva tri moguća ishoda:
-  uspešno oslobađanje sredstava (potvrda kupca),
-  arbitraža u korist prodavca,
-  arbitraža u korist kupca (refund).

## Struktura projekta

```
escrow-arbitration-dapp/
├── contracts/
│   └── Escrow.sol            # Pametni ugovor (EscrowFactory)
├── test/
│   └── Escrow.ts             # Unit testovi
├── ignition/
│   └── modules/
│       └── Escrow.ts         # Hardhat Ignition deploy modul
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Glavna React komponenta
│   │   ├── App.css
│   │   ├── contractConfig.js # Adresa ugovora + ABI
│   │   └── EscrowFactory.json
│   └── package.json
├── hardhat.config.ts
└── package.json
```

## Bezbednosne mere

- Kontrola pristupa  modifikatori `onlyBuyer`, `onlyArbiter`, `onlyBuyerOrSeller` obezbeđuju da samo ovlašćene adrese mogu pokrenuti odgovarajuće akcije.
- Reentrancy zaštita `nonReentrant` modifikator + poštovanje Checks-Effects-Interactions pattern-a (stanje se menja pre transfera sredstava).
- Sprečavanje dvostrukog oslobađanja svaka funkcija koja transferuje sredstva zahteva tačno određeno prethodno stanje (`inState` modifikator).
- Validacija ulaza provera da adrese nisu nula-adresa, da su kupac/prodavac/arbitar međusobno različiti, i da je iznos veći od nule.
- Revizorski trag svaka promena stanja beleži `block.timestamp`, a sve akcije emituju odgovarajuće evente (`EscrowCreated`, `EscrowFunded`, `DeliveryConfirmed`, `DisputeRaised`, `DisputeResolved`).
- Autentičnost akcija sve transakcije se potpisuju ECDSA potpisom preko MetaMask-a, vezano za `msg.sender` proveru u ugovoru.

## Licenca

Ovaj projekat je dostupan pod MIT licencom — pogledaj [LICENSE](./LICENSE) fajl.
