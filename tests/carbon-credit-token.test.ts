import { describe, it, expect, beforeEach } from "vitest";

interface CarbonCreditMetadata {
  projectId: bigint;
  origin: string;
  issuanceDate: bigint;
}

interface Event {
  eventType: string;
  sender: string;
  amount: bigint;
  recipient: string | null;
  timestamp: bigint;
}

interface BatchMintEntry {
  recipient: string;
  amount: bigint;
  projectId: bigint;
  origin: string;
  issuanceDate: bigint;
}

interface BatchTransferEntry {
  recipient: string;
  amount: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  emergencyLock: boolean;
  totalSupply: bigint;
  metadataFrozen: boolean;
  lastEventId: bigint;
  balances: Map<string, bigint>;
  staked: Map<string, bigint>;
  metadata: Map<bigint, CarbonCreditMetadata>;
  events: Map<bigint, Event>;
  MAX_SUPPLY: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setEmergencyLock(caller: string, lock: boolean): { value: boolean } | { error: number };
  mint(caller: string, recipient: string, amount: bigint, projectId: bigint, origin: string, issuanceDate: bigint): { value: boolean } | { error: number };
  batchMint(caller: string, entries: BatchMintEntry[]): { value: boolean } | { error: number };
  transfer(caller: string, recipient: string, amount: bigint): { value: boolean } | { error: number };
  batchTransfer(caller: string, entries: BatchTransferEntry[]): { value: boolean } | { error: number };
  stake(caller: string, amount: bigint): { value: boolean } | { error: number };
  unstake(caller: string, amount: bigint): { value: boolean } | { error: number };
  burn(caller: string, amount: bigint): { value: boolean } | { error: number };
  setCreditMetadata(caller: string, creditId: bigint, projectId: bigint, origin: string, issuanceDate: bigint): { value: boolean } | { error: number };
  freezeMetadata(caller: string): { value: boolean } | { error: number };
  getBalance(account: string): { value: bigint };
  getStaked(account: string): { value: bigint };
  getTotalSupply(): { value: bigint };
  getCreditMetadata(creditId: bigint): { value: CarbonCreditMetadata };
  getEvent(eventId: bigint): { value: Event };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  emergencyLock: false,
  totalSupply: 0n,
  metadataFrozen: false,
  lastEventId: 0n,
  balances: new Map(),
  staked: new Map(),
  metadata: new Map(),
  events: new Map(),
  MAX_SUPPLY: 1_000_000_000_000n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    this.events.set(this.lastEventId + 1n, {
      eventType: pause ? "paused" : "unpaused",
      sender: caller,
      amount: 0n,
      recipient: null,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: pause };
  },

  setEmergencyLock(caller: string, lock: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.emergencyLock = lock;
    this.events.set(this.lastEventId + 1n, {
      eventType: lock ? "locked" : "unlocked",
      sender: caller,
      amount: 0n,
      recipient: null,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: lock };
  },

  mint(caller: string, recipient: string, amount: bigint, projectId: bigint, origin: string, issuanceDate: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.emergencyLock) return { error: 109 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (amount <= 0n) return { error: 106 };
    if (this.totalSupply + amount > this.MAX_SUPPLY) return { error: 103 };
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.totalSupply += amount;
    this.metadata.set(this.totalSupply, { projectId, origin, issuanceDate });
    this.events.set(this.lastEventId + 1n, {
      eventType: "mint",
      sender: caller,
      amount,
      recipient,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: true };
  },

  batchMint(caller: string, entries: BatchMintEntry[]) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.emergencyLock) return { error: 109 };
    if (entries.length === 0) return { error: 107 };
    for (const entry of entries) {
      if (entry.recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
      if (entry.amount <= 0n) return { error: 106 };
      if (this.totalSupply + entry.amount > this.MAX_SUPPLY) return { error: 103 };
      this.balances.set(entry.recipient, (this.balances.get(entry.recipient) || 0n) + entry.amount);
      this.totalSupply += entry.amount;
      this.metadata.set(this.totalSupply, {
        projectId: entry.projectId,
        origin: entry.origin,
        issuanceDate: entry.issuanceDate,
      });
      this.events.set(this.lastEventId + 1n, {
        eventType: "batch-mint",
        sender: caller,
        amount: entry.amount,
        recipient: entry.recipient,
        timestamp: 100n,
      });
      this.lastEventId += 1n;
    }
    return { value: true };
  },

  transfer(caller: string, recipient: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (this.emergencyLock) return { error: 109 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (amount <= 0n) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    this.balances.set(caller, bal - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.events.set(this.lastEventId + 1n, {
      eventType: "transfer",
      sender: caller,
      amount,
      recipient,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: true };
  },

  batchTransfer(caller: string, entries: BatchTransferEntry[]) {
    if (this.paused) return { error: 104 };
    if (this.emergencyLock) return { error: 109 };
    if (entries.length === 0) return { error: 107 };
    for (const entry of entries) {
      if (entry.recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
      if (entry.amount <= 0n) return { error: 106 };
      const bal = this.balances.get(caller) || 0n;
      if (bal < entry.amount) return { error: 101 };
      this.balances.set(caller, bal - entry.amount);
      this.balances.set(entry.recipient, (this.balances.get(entry.recipient) || 0n) + entry.amount);
      this.events.set(this.lastEventId + 1n, {
        eventType: "batch-transfer",
        sender: caller,
        amount: entry.amount,
        recipient: entry.recipient,
        timestamp: 100n,
      });
      this.lastEventId += 1n;
    }
    return { value: true };
  },

  stake(caller: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (this.emergencyLock) return { error: 109 };
    if (amount <= 0n) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    this.balances.set(caller, bal - amount);
    this.staked.set(caller, (this.staked.get(caller) || 0n) + amount);
    this.events.set(this.lastEventId + 1n, {
      eventType: "stake",
      sender: caller,
      amount,
      recipient: null,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: true };
  },

  unstake(caller: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (this.emergencyLock) return { error: 109 };
    if (amount <= 0n) return { error: 106 };
    const stakeBal = this.staked.get(caller) || 0n;
    if (stakeBal < amount) return { error: 102 };
    this.staked.set(caller, stakeBal - amount);
    this.balances.set(caller, (this.balances.get(caller) || 0n) + amount);
    this.events.set(this.lastEventId + 1n, {
      eventType: "unstake",
      sender: caller,
      amount,
      recipient: null,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: true };
  },

  burn(caller: string, amount: bigint) {
    if (this.paused) return { error: 104 };
    if (this.emergencyLock) return { error: 109 };
    if (amount <= 0n) return { error: 106 };
    const bal = this.balances.get(caller) || 0n;
    if (bal < amount) return { error: 101 };
    this.balances.set(caller, bal - amount);
    this.totalSupply -= amount;
    this.events.set(this.lastEventId + 1n, {
      eventType: "burn",
      sender: caller,
      amount,
      recipient: null,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: true };
  },

  setCreditMetadata(caller: string, creditId: bigint, projectId: bigint, origin: string, issuanceDate: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.metadataFrozen) return { error: 108 };
    this.metadata.set(creditId, { projectId, origin, issuanceDate });
    this.events.set(this.lastEventId + 1n, {
      eventType: "metadata-set",
      sender: caller,
      amount: creditId,
      recipient: null,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: true };
  },

  freezeMetadata(caller: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.metadataFrozen = true;
    this.events.set(this.lastEventId + 1n, {
      eventType: "metadata-frozen",
      sender: caller,
      amount: 0n,
      recipient: null,
      timestamp: 100n,
    });
    this.lastEventId += 1n;
    return { value: true };
  },

  getBalance(account: string) {
    return { value: this.balances.get(account) || 0n };
  },

  getStaked(account: string) {
    return { value: this.staked.get(account) || 0n };
  },

  getTotalSupply() {
    return { value: this.totalSupply };
  },

  getCreditMetadata(creditId: bigint) {
    return {
      value: this.metadata.get(creditId) || { projectId: 0n, origin: "", issuanceDate: 0n },
    };
  },

  getEvent(eventId: bigint) {
    return {
      value: this.events.get(eventId) || { eventType: "", sender: "", amount: 0n, recipient: null, timestamp: 0n },
    };
  },
};

describe("NetZero Carbon Credit Token", () => {
  const user1 = "ST2CY5V39N7V71Z5DFMQXBFZY9661X1N96J7K3AMW";
  const user2 = "ST3NBRSFKX28FQ2ZJ1MAK3Y2G1EFV7B5B5K5KX7P";

  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.emergencyLock = false;
    mockContract.totalSupply = 0n;
    mockContract.metadataFrozen = false;
    mockContract.lastEventId = 0n;
    mockContract.balances = new Map();
    mockContract.staked = new Map();
    mockContract.metadata = new Map();
    mockContract.events = new Map();
  });

  it("should mint tokens with metadata when called by admin", () => {
    const result = mockContract.mint(mockContract.admin, user1, 1000n, 1n, "Reforestation Project", 1697059200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get(user1)).toBe(1000n);
    expect(mockContract.totalSupply).toBe(1000n);
    expect(mockContract.metadata.get(1000n)).toEqual({
      projectId: 1n,
      origin: "Reforestation Project",
      issuanceDate: 1697059200n,
    });
    expect(mockContract.getEvent(1n).value.eventType).toBe("mint");
  });

  it("should prevent minting over max supply", () => {
    const result = mockContract.mint(mockContract.admin, user1, 2_000_000_000_000n, 1n, "Reforestation", 1697059200n);
    expect(result).toEqual({ error: 103 });
  });

  it("should batch mint tokens", () => {
    const entries: BatchMintEntry[] = [
      { recipient: user1, amount: 500n, projectId: 1n, origin: "Solar Project", issuanceDate: 1697059200n },
      { recipient: user2, amount: 300n, projectId: 2n, origin: "Wind Project", issuanceDate: 1697059200n },
    ];
    const result = mockContract.batchMint(mockContract.admin, entries);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get(user1)).toBe(500n);
    expect(mockContract.balances.get(user2)).toBe(300n);
    expect(mockContract.totalSupply).toBe(800n);
    expect(mockContract.metadata.get(500n)?.projectId).toBe(1n);
    expect(mockContract.metadata.get(800n)?.projectId).toBe(2n);
  });

  it("should transfer tokens", () => {
    mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n);
    const result = mockContract.transfer(user1, user2, 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get(user1)).toBe(300n);
    expect(mockContract.balances.get(user2)).toBe(200n);
    expect(mockContract.getEvent(2n).value.eventType).toBe("transfer");
  });

  it("should batch transfer tokens", () => {
    mockContract.mint(mockContract.admin, user1, 1000n, 1n, "Reforestation", 1697059200n);
    const entries: BatchTransferEntry[] = [
      { recipient: user2, amount: 200n },
      { recipient: mockContract.admin, amount: 300n },
    ];
    const result = mockContract.batchTransfer(user1, entries);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get(user1)).toBe(500n);
    expect(mockContract.balances.get(user2)).toBe(200n);
    expect(mockContract.balances.get(mockContract.admin)).toBe(300n);
    expect(mockContract.getEvent(3n).value.eventType).toBe("batch-transfer");
  });

  it("should stake tokens", () => {
    mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n);
    const result = mockContract.stake(user1, 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get(user1)).toBe(300n);
    expect(mockContract.staked.get(user1)).toBe(200n);
    expect(mockContract.getEvent(2n).value.eventType).toBe("stake");
  });

  it("should unstake tokens", () => {
    mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n);
    mockContract.stake(user1, 200n);
    const result = mockContract.unstake(user1, 100n);
    expect(result).toEqual({ value: true });
    expect(mockContract.staked.get(user1)).toBe(100n);
    expect(mockContract.balances.get(user1)).toBe(400n);
    expect(mockContract.getEvent(3n).value.eventType).toBe("unstake");
  });

  it("should burn tokens", () => {
    mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n);
    const result = mockContract.burn(user1, 200n);
    expect(result).toEqual({ value: true });
    expect(mockContract.balances.get(user1)).toBe(300n);
    expect(mockContract.totalSupply).toBe(300n);
    expect(mockContract.getEvent(2n).value.eventType).toBe("burn");
  });

  it("should set credit metadata", () => {
    mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n);
    const result = mockContract.setCreditMetadata(mockContract.admin, 500n, 2n, "Wind Project", 1697059201n);
    expect(result).toEqual({ value: true });
    expect(mockContract.metadata.get(500n)).toEqual({
      projectId: 2n,
      origin: "Wind Project",
      issuanceDate: 1697059201n,
    });
    expect(mockContract.getEvent(2n).value.eventType).toBe("metadata-set");
  });

  it("should freeze metadata", () => {
    const result = mockContract.freezeMetadata(mockContract.admin);
    expect(result).toEqual({ value: true });
    expect(mockContract.metadataFrozen).toBe(true);
    expect(mockContract.getEvent(1n).value.eventType).toBe("metadata-frozen");
  });

  it("should prevent actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    expect(mockContract.transfer(user1, user2, 10n)).toEqual({ error: 104 });
    expect(mockContract.stake(user1, 10n)).toEqual({ error: 104 });
    expect(mockContract.burn(user1, 10n)).toEqual({ error: 104 });
  });

  it("should prevent actions when emergency locked", () => {
    mockContract.setEmergencyLock(mockContract.admin, true);
    expect(mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n)).toEqual({ error: 109 });
    expect(mockContract.transfer(user1, user2, 10n)).toEqual({ error: 109 });
    expect(mockContract.stake(user1, 10n)).toEqual({ error: 109 });
  });

  it("should prevent metadata changes when frozen", () => {
    mockContract.freezeMetadata(mockContract.admin);
    const result = mockContract.setCreditMetadata(mockContract.admin, 500n, 2n, "Wind Project", 1697059201n);
    expect(result).toEqual({ error: 108 });
  });

  it("should prevent invalid amounts", () => {
    expect(mockContract.mint(mockContract.admin, user1, 0n, 1n, "Reforestation", 1697059200n)).toEqual({ error: 106 });
    expect(mockContract.transfer(user1, user2, 0n)).toEqual({ error: 106 });
    expect(mockContract.stake(user1, 0n)).toEqual({ error: 106 });
  });

  it("should prevent transfers to zero address", () => {
    mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n);
    expect(mockContract.transfer(user1, "SP000000000000000000002Q6VF78", 200n)).toEqual({ error: 105 });
  });

  it("should retrieve balance and metadata correctly", () => {
    mockContract.mint(mockContract.admin, user1, 500n, 1n, "Reforestation", 1697059200n);
    expect(mockContract.getBalance(user1)).toEqual({ value: 500n });
    expect(mockContract.getStaked(user1)).toEqual({ value: 0n });
    expect(mockContract.getTotalSupply()).toEqual({ value: 500n });
    expect(mockContract.getCreditMetadata(500n)).toEqual({
      value: { projectId: 1n, origin: "Reforestation", issuanceDate: 1697059200n },
    });
  });
});